import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { env } from "./shared/config/env.js";
import {
  globalRateLimiter,
  authRateLimiter,
} from "./shared/middleware/rate-limiter.js";

import authRoutes from "./modules/auth/auth.routes.js";
import profileRoutes from "./modules/profiles/profile.routes.js";
import projectRoutes from "./modules/projects/project.routes.js";
import milestoneRoutes from "./modules/milestones/milestone.routes.js";
import reviewRoutes from "./modules/reviews/review.routes.js";
import reportRoutes from "./modules/reports/report.routes.js";
import { errorHandler } from "./shared/errors/error-handler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import jobsRouter from "./Jobs/jobs.routes.js";

const app = express();

// Security headers via Helmet, with a tailored Content-Security-Policy for the static frontend in public/.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "font-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "frame-ancestors": ["'none'"],
        "connect-src": ["'self'"],
        "upgrade-insecure-requests":
          env.NODE_ENV === "production" ? [] : null,
      },
    },
    frameguard: { action: "deny" },
  })
);

app.use(globalRateLimiter);
// In production pin the origin to FRONTEND_URL (credentialed requests + refresh
// cookies must never be reflected for arbitrary origins); development keeps the
// permissive default for convenience.
app.use(
  cors({
    origin: env.NODE_ENV === "production" ? env.FRONTEND_URL : true,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "TaskForge API is running",
  });
});

app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/reports", reportRoutes);

// Milestones module (teammates'): its router paths are mount-relative
// (/projects/:projectId/milestones, /milestones/:id) and its e2e suite targets
// /api/v1/..., so the /api/v1 prefix is required here.
app.use("/api/v1", milestoneRoutes);

// Static frontend pages (login / forgot-password / reset-password).
// /reset-password and /forgot-password resolve to their .html files.
app.use(
  express.static(path.join(__dirname, "..", "public"), {
    extensions: ["html"],
  })
);

app.use(errorHandler);

app.use("/api/jobs", jobsRouter);

export default app;
