import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { AppError } from "./app-error.js";
import { ZodError } from "zod";

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
      ...(err.errors && { errors: err.errors }),
    });
    return;
  }

  if (err instanceof ZodError) {
    const formattedErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const field = issue.path.join(".") || "body";
      if (!formattedErrors[field]) {
        formattedErrors[field] = [];
      }
      formattedErrors[field].push(issue.message);
    }

    res.status(400).json({
      success: false,
      message: "Validation error",
      errors: formattedErrors,
    });
    return;
  }

  console.error("Unhandled Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};
