import express from "express";
import cors from "cors";
import jobsRouter from "./Jobs/jobs.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "TaskForge API is running"
  });
});

app.use("/api/jobs", jobsRouter);

export default app;
