import "dotenv/config";
import app from "./app.js";
import { prisma } from "./shared/db/prisma.js";

const PORT = Number(process.env.PORT) || 4000;

const server = app.listen(PORT, () => {
  console.log(`TaskForge API running on http://localhost:${PORT}`);
});

// Fail fast with a clear message instead of an opaque EADDRINUSE stack
// (common when a previous dev server never exited).
server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${PORT} is already in use — is another TaskForge server running?`
      : `Server failed to start: ${error.message}`
  );
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — shutting down gracefully...`);

  // Hard deadline: lingering keep-alive sockets must not block exit forever.
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  server.closeIdleConnections?.();

  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error("Error while disconnecting Prisma:", error);
  }

  await closed;
  console.log("HTTP server closed");
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
