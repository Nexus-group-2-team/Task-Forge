import { prisma } from "../../shared/db/prisma.js";
import { env } from "../../shared/config/env.js";
import { ConflictError, UnauthorizedError, NotFoundError, BadRequestError } from "../../shared/errors/app-error.js";
import { hashPassword, verifyPassword } from "../../shared/utils/password.js";
import {
  signAccessToken,
  generateOpaqueRefreshToken,
  hashRefreshToken,
} from "../../shared/utils/tokens.js";
import type { RegisterInput, LoginInput } from "./auth.schema.js";
import type { AccountStatus } from "@prisma/client";

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
      include: {
        profile: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.accountStatus !== "ACTIVE") {
      throw new UnauthorizedError("Account is inactive or suspended");
    }

    const isPasswordValid = await verifyPassword(user.passwordHash, input.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

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

  static async logoutAll(userId: string) {
    const result = await prisma.authSession.updateMany({
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

      // If user is suspended or deactivated (banned), revoke ALL active sessions immediately
      let revokedCount = 0;
      if (newStatus !== "ACTIVE") {
        const result = await tx.authSession.updateMany({
          where: {
            userId: targetUserId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
        revokedCount = result.count;
      }

      return {
        user: updatedUser,
        revokedSessionsCount: revokedCount,
      };
    });
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
