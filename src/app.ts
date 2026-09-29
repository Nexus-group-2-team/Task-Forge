import express from "express";
import cors from "cors";
import milestoneRoutes from "./modules/milestones/milestone.routes.js";
import { errorHandler } from "./shared/errors/error-handler.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "TaskForge API is running",
  });
});

app.use("/api/v1", milestoneRoutes);

// Must stay last so it catches errors forwarded by routes and middleware above.
app.use(errorHandler);

export default app;
