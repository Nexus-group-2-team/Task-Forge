import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.js";

// Prisma 7 requires a driver adapter. The configured DATABASE_URL points at a
// transaction-pooling proxy, which silently reaps idle sockets; recycle them
// client-side and enable TCP keepalives so we never hand out a dead connection.
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
  query_timeout: 20_000,
  statement_timeout: 20_000,
});

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.prismaGlobal ??
  new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export default prisma;

