export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: unknown;

  constructor(message: string, statusCode = 500, errors?: unknown, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad Request", errors?: unknown) {
    super(message, 400, errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", errors?: unknown) {
    super(message, 401, errors);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", errors?: unknown) {
    super(message, 403, errors);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource Not Found", errors?: unknown) {
    super(message, 404, errors);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", errors?: unknown) {
    super(message, 409, errors);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = "Unprocessable Entity", errors?: unknown) {
    super(message, 422, errors);
  }
}

export class InternalServerError extends AppError {
  constructor(message = "Internal Server Error", errors?: unknown) {
    super(message, 500, errors);
  }
}