import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { globalRateLimiter, authRateLimiter } from "./shared/middleware/rate-limiter.js";
import authRoutes from "./modules/auth/auth.routes.js";
import profileRoutes from "./modules/profiles/profile.routes.js";
import projectRoutes from "./modules/projects/project.routes.js";
import { errorHandler } from "./shared/errors/error-handler.js";

const app = express();

app.use(helmet());
app.use(globalRateLimiter);
app.use(cors({ origin: true, credentials: true }));
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

app.use(errorHandler);

export default app;

