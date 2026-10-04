import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { AccountStatus, Role } from "../../src/generated/prisma/enums.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../../src/shared/config/env.js";

/**
 * Dedicated client for test fixtures. The shared app-level Prisma client is left
 * untouched so tests exercise the exact same database connection as production
 * code paths.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
export const testPrisma = new PrismaClient({ adapter });

export interface TestUser {
  id: string;
  email: string;
  role: Role;
  token: string;
  authHeader: string;
}

const uniqueEmail = (prefix: string): string =>
  `${prefix}.${randomUUID().replace(/-/g, "").slice(0, 12)}@taskforge.test`;

export const createUser = async (role: Role = Role.FREELANCER, fullName?: string): Promise<TestUser> => {
  const email = uniqueEmail(role.toLowerCase());

  const user = await testPrisma.user.create({
    data: {
      email,
      // Not a real credential hash: these accounts are never used to sign in.
      passwordHash: "test-hash-not-a-real-credential",
      role,
      accountStatus: AccountStatus.ACTIVE,
      ...(fullName
        ? { profile: { create: { fullName } } }
        : { profile: { create: { fullName: `Test ${role}` } } }),
    },
    select: { id: true, email: true, role: true },
  });

  return { ...user, ...authHeadersFor(user.id, user.email, user.role) };
};

const authHeadersFor = (id: string, email: string, role: Role) => {
  const token = jwt.sign({ id, email, role }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
  return { token, authHeader: `Bearer ${token}` };
};

export const createProject = async (opts: { clientId: string; freelancerId: string }) => {
  const application = await testPrisma.application.create({
    data: {
      jobId: await createJobFor(opts.clientId),
      freelancerId: opts.freelancerId,
      coverLetter: "Test application cover letter",
    },
    select: { id: true },
  });

  return testPrisma.project.create({
    data: {
      applicationId: application.id,
      clientId: opts.clientId,
      freelancerId: opts.freelancerId,
      title: `Test project ${randomUUID().slice(0, 8)}`,
    },
    select: { id: true },
  });
};

const createJobFor = async (ownerId: string): Promise<string> => {
  const job = await testPrisma.job.create({
    data: {
      ownerId,
      title: `Test job ${randomUUID().slice(0, 8)}`,
      description: "Test job description for integration tests",
    },
    select: { id: true },
  });

  return job.id;
};

/** Removes every row this helper created, honouring schema cascades. */
export const cleanup = async (userIds: string[]): Promise<void> => {
  if (userIds.length === 0) return;
  await testPrisma.user.deleteMany({ where: { id: { in: userIds } } });
};

export const disconnect = async (): Promise<void> => {
  await testPrisma.$disconnect();
};

export const errorMessages = (body: { message?: string }): string => body?.message ?? "";
