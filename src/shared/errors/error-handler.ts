import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "./app-error.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors ? { errors: err.errors } : {}),
      ...(env.NODE_ENV === "development" ? { stack: err.stack } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    res.status(400).json({
      success: false,
      message: "Validation Error",
      errors: formattedErrors,
      ...(env.NODE_ENV === "development" ? { stack: err.stack } : {}),
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(", ") : "field";
      res.status(409).json({
        success: false,
        message: `Unique constraint failed on: ${target}`,
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({
        success: false,
        message: (err.meta?.cause as string) || "Record not found",
      });
      return;
    }
    res.status(400).json({
      success: false,
      message: `Database error: ${err.message}`,
    });
    return;
  }

  logger.error("Unhandled Error:", err);

  res.status(500).json({
    success: false,
    message: env.NODE_ENV === "production" ? "Internal Server Error" : err.message || "Internal Server Error",
    ...(env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
};