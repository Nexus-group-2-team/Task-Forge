import type { Response } from "express";
import type { ApiResponseSuccess, PaginatedResult } from "../types/api.types.js";

export class ApiResponse {
  static success<T>(
    res: Response,
    data: T,
    message?: string,
    statusCode = 200,
    meta?: PaginatedResult<unknown>["meta"]
  ): Response {
    const payload: ApiResponseSuccess<T> = {
      success: true,
      ...(message ? { message } : {}),
      data,
      ...(meta ? { meta } : {}),
    };
    return res.status(statusCode).json(payload);
  }

  static created<T>(res: Response, data: T, message = "Created successfully"): Response {
    return this.success(res, data, message, 201);
  }

  static noContent(res: Response): Response {
    return res.status(204).send();
  }
}