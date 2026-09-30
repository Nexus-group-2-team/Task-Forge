import { prisma } from "../../shared/db/prisma.js";
import { env } from "../../shared/config/env.js";
import crypto from "crypto";
import { EmailService } from "../../shared/services/email.service.js";
import { PasswordBreachService } from "../../shared/services/password-breach.service.js";
import type { RegisterInput, LoginInput, ResetPasswordInput } from "./auth.schema.js";

import { ConflictError, UnauthorizedError, NotFoundError, BadRequestError } from "../../shared/errors/app-error.js";
import { hashPassword, verifyPassword } from "../../shared/utils/password.js";
import {
  signAccessToken,
  generateOpaqueRefreshToken,
  hashRefreshToken,
} from "../../shared/utils/tokens.js";
import type { AccountStatus, Prisma } from "../../generated/prisma/client.js";

// Login timing protection: verifying against this decoy hash spends the same
// argon2 time as a real wrong-password attempt, so response latency cannot
// disclose whether an email is registered. Computed once, in the background,
// at module load (not awaited, so startup is not blocked).
const TIMING_DECOY_HASH_PROMISE = hashPassword(crypto.randomBytes(32).toString("hex")).catch(
  (error: unknown) => {
    // Never let this background promise become an unhandled rejection: with no
    // handler attached until the first unknown-email login, an argon2 failure
    // here would kill the whole process before any request ever awaited it.
    // Degrading to "no decoy" only weakens timing uniformity in an already
    // broken (argon2-unusable) environment — availability wins over the probe.
    console.error("[Auth] Failed to precompute timing decoy hash:", error);
    return null;
  }
);

export interface SessionContext {
  userAgent?: string;
  ipAddress?: string;
}

export class AuthService {
  static async register(input: RegisterInput, context?: SessionContext) {
    const normalizedEmail = input.email.toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictError("User with this email already exists");
    }

    await this.enforcePasswordPolicy(input.password, { email: normalizedEmail });

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        role: input.role,
        profile: {
          create: {
            fullName: input.fullName,
          },
        },
      },
      include: {
        profile: true,
      },
    });

    const sessionData = await this.createSession(user.id, context);

    const accessToken = signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      sessionId: sessionData.sessionId,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        createdAt: user.createdAt,
        profile: user.profile,
      },
      token: accessToken,
      accessToken,
      refreshToken: sessionData.refreshToken,
      refreshTokenExpiresAt: sessionData.expiresAt,
    };
  }

  static async login(input: LoginInput, context?: SessionContext) {
    const normalizedEmail = input.email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Constant work: run the same argon2 verification as the wrong-password
      // path (against a decoy hash) so unknown-email logins take the same time
      // as registered-email ones — closes the timing-based enumeration channel.
      const decoyHash = await TIMING_DECOY_HASH_PROMISE;
      if (decoyHash) {
        await verifyPassword(decoyHash, input.password);
      }
      throw new UnauthorizedError("Invalid email or password");
    }

    // Verify the password BEFORE the account-status check: failed logins for
    // existing accounts must do exactly the same work as unknown-email logins
    // (same single user query + one argon2 verify), and the distinct
    // "inactive or suspended" message must only ever be revealed to someone
    // who already proved they know the password.
    const isPasswordValid = await verifyPassword(user.passwordHash, input.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.accountStatus !== "ACTIVE") {
      throw new UnauthorizedError("Account is inactive or suspended");
    }

    // Profile is intentionally fetched only after a successful verification:
    // including it in the user lookup added a database round trip to the
    // wrong-password path that the unknown-email path did not pay — a remote
    // RTT-sized timing oracle for account existence.
    const profile = await prisma.profile.findUnique({ where: { userId: user.id } });

    const sessionData = await this.createSession(user.id, context);

    const accessToken = signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      sessionId: sessionData.sessionId,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        createdAt: user.createdAt,
        profile,
      },
      token: accessToken,
      accessToken,
      refreshToken: sessionData.refreshToken,
      refreshTokenExpiresAt: sessionData.expiresAt,
    };
  }


  static async refresh(rawRefreshToken: string, context?: SessionContext) {
    if (!rawRefreshToken) {
      throw new UnauthorizedError("Refresh token is required");
    }

    const incomingDigest = hashRefreshToken(rawRefreshToken);
    const now = new Date();

    const outcome = await prisma.$transaction(async (tx) => {
      const session = await tx.authSession.findFirst({
        where: {
          refreshTokenDigest: incomingDigest,
        },
        include: {
          user: true,
        },
      });

      if (!session) {
        return { kind: "invalid" as const };
      }

      if (session.revokedAt || session.expiresAt <= now || session.user.accountStatus !== "ACTIVE") {
        return { kind: "invalid" as const };
      }

      const nextRawToken = generateOpaqueRefreshToken();
      const nextDigest = hashRefreshToken(nextRawToken);
      const nextExpiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

      const updated = await tx.authSession.updateMany({
        where: {
          id: session.id,
          refreshTokenDigest: incomingDigest,
          revokedAt: null,
        },
        data: {
          refreshTokenDigest: nextDigest,
          expiresAt: nextExpiresAt,
          userAgent: context?.userAgent ?? session.userAgent,
          ipAddress: context?.ipAddress ?? session.ipAddress,
        },
      });

      if (updated.count !== 1) {
        return { kind: "conflict" as const };
      }

      const accessToken = signAccessToken({
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        sessionId: session.id,
      });

      return {
        kind: "ok" as const,
        accessToken,
        nextRefreshToken: nextRawToken,
        expiresAt: nextExpiresAt,
      };
    });

    if (outcome.kind === "conflict") {
      throw new ConflictError("Refresh token already used concurrently");
    }

    if (outcome.kind !== "ok") {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    return {
      accessToken: outcome.accessToken,
      refreshToken: outcome.nextRefreshToken,
      refreshTokenExpiresAt: outcome.expiresAt,
    };
  }

  static async logout(rawRefreshToken?: string, sessionId?: string) {
    if (rawRefreshToken) {
      const digest = hashRefreshToken(rawRefreshToken);
      await prisma.authSession.updateMany({
        where: {
          refreshTokenDigest: digest,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } else if (sessionId) {
      await prisma.authSession.updateMany({
        where: {
          id: sessionId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }
  }

  static async logoutAll(userId: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
    const result = await client.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      revokedSessionsCount: result.count,
    };
  }

  static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        accountStatus: true,
        createdAt: true,
        profile: true,
        userSkills: {
          include: {
            skill: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }

  static async updateUserStatus(targetUserId: string, newStatus: AccountStatus, adminUserId: string) {
    if (targetUserId === adminUserId && newStatus !== "ACTIVE") {
      throw new BadRequestError("Administrators cannot suspend or deactivate their own account");
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, role: true, accountStatus: true },
    });

    if (!existingUser) {
      throw new NotFoundError("User not found");
    }

    return prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: targetUserId },
        data: { accountStatus: newStatus },
        select: {
          id: true,
          email: true,
          role: true,
          accountStatus: true,
          updatedAt: true,
        },
      });

      // If user is suspended or deactivated (banned), revoke ALL active sessions immediately.
      // Pass `tx` so the revocation commits atomically with the status change —
      // a crash between the two statements must never leave a banned account
      // with live sessions (and a rollback must never leave sessions revoked
      // for a user whose status change didn't happen).
      let revokedCount = 0;
      if (newStatus !== "ACTIVE") {
        const result = await this.logoutAll(targetUserId, tx);
        revokedCount = result.revokedSessionsCount;
      }

      return {
        user: updatedUser,
        revokedSessionsCount: revokedCount,
      };
    });
  }
  static async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });

    // Prevent account enumeration: return silently if user not found or inactive.
    if (!user || user.accountStatus !== "ACTIVE") {
      // Timing equalization: the known-account path below performs 3 database
      // round trips beyond the point unknown accounts reach (the profile read
      // folded into findUnique, deleteMany, create). Mirror them here with
      // zero-effect statements — indexed lookups/updates that match no rows —
      // so the generic 200 response has the same latency whether or not the
      // account exists. Without this, the gap equals ~3 remote DB round trips,
      // which statistical averaging could turn into an enumeration oracle
      // despite the rate limiter.
      const phantomUserId = "00000000-0000-0000-0000-000000000000";
      await prisma.passwordResetToken.findUnique({
        where: { tokenHash: crypto.randomBytes(32).toString("hex") },
      });
      await prisma.passwordResetToken.deleteMany({ where: { userId: phantomUserId } });
      await prisma.passwordResetToken.updateMany({
        where: { userId: phantomUserId },
        data: { expiresAt: new Date() },
      });
      return;
    }

    // Invalidate existing unused reset tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Generate random raw token and its SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // Token expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // Fragment (#token=) keeps the secret out of server/proxy access logs —
    // the browser never transmits it. The API still receives it via POST body.
    const resetLink = `${env.FRONTEND_URL}/reset-password#token=${rawToken}`;

    // Dev convenience: print the reset link so the flow can be tested
    // locally without opening the inbox. Never logged in production.
    if (env.NODE_ENV !== "production") {
      console.log(`[PasswordReset] Reset link for ${user.email}: ${resetLink}`);
    }

    // Send email using Resend — deliberately NOT awaited (fire-and-forget):
    // awaiting delivery made responses for existing accounts ~2.5s slower than
    // for unknown ones, a timing oracle that defeated the generic-200
    // anti-enumeration contract (response latency disclosed account existence).
    // Delivery failures must not fail the request either — a 500 here would
    // also reveal the account exists — so they are only logged below. The link
    // is logged above in non-production environments for debuggability.
    void EmailService.sendPasswordResetEmail(
      user.email,
      resetLink,
      user.profile?.fullName
    ).catch((error: unknown) => {
      console.error(`[PasswordReset] Failed to send reset email to ${user.email}:`, error);
    });
  }

  static async resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt !== null || record.expiresAt < new Date()) {
      throw new BadRequestError("Invalid or expired password reset link");
    }

    if (record.user.accountStatus !== "ACTIVE") {
      throw new UnauthorizedError("Account is inactive or suspended");
    }

    await this.enforcePasswordPolicy(input.newPassword, {
      email: record.user.email,
      currentPasswordHash: record.user.passwordHash,
    });

    const passwordHash = await hashPassword(input.newPassword);

    // Atomically update password, mark token as used, and terminate all active
    // sessions. The token is consumed FIRST via an updateMany guarded by
    // `usedAt: null`: two concurrent requests carrying the same token race on
    // that row, only the winner's transaction sees `usedAt IS NULL`, and the
    // loser gets `count === 0` and is rejected — closing the check-then-consume
    // window the previous form allowed (TOCTOU double-spend of one token).
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new BadRequestError("Invalid or expired password reset link");
      }

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });

      await tx.authSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  /**
   * Password policy beyond the Zod length check (NIST SP 800-63B / OWASP):
   *  - must not be (or contain) the account email
   *  - must differ from the current password (when one exists)
   *  - must not appear in known breach corpora (k-anonymity range API — the
   *    full password never leaves this server, see PasswordBreachService)
   * Local checks run first so the network call is only made when needed.
   * Throws BadRequestError.
   */
  private static async enforcePasswordPolicy(
    password: string,
    opts: { email: string; currentPasswordHash?: string }
  ): Promise<void> {
    const email = opts.email.toLowerCase();
    const localPart = email.split("@")[0] ?? "";
    const candidate = password.toLowerCase();

    // Short local parts (e.g. "ab@x.co") would over-block normal passwords.
    const containsEmail =
      candidate.includes(email) || (localPart.length >= 3 && candidate.includes(localPart));
    if (containsEmail) {
      throw new BadRequestError("Password must not contain your email address");
    }

    if (
      opts.currentPasswordHash &&
      (await verifyPassword(opts.currentPasswordHash, password))
    ) {
      throw new BadRequestError("New password must be different from your current password");
    }

    if (await PasswordBreachService.isBreached(password)) {
      throw new BadRequestError(
        "This password has appeared in a known data breach. Please choose a different one"
      );
    }
  }

  private static async createSession(userId: string, context?: SessionContext) {
    const rawRefreshToken = generateOpaqueRefreshToken();
    const digest = hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

    const session = await prisma.authSession.create({
      data: {
        userId,
        refreshTokenDigest: digest,
        expiresAt,
        userAgent: context?.userAgent?.slice(0, 500) ?? null,
        ipAddress: context?.ipAddress ?? null,
      },
    });

    return {
      sessionId: session.id,
      refreshToken: rawRefreshToken,
      expiresAt,
    };
  }
}
