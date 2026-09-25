import type { Role, AccountStatus } from "@prisma/client";

export interface RequestUser {
  id: string;
  email: string;
  role: Role;
  accountStatus: AccountStatus;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface ApiResponseSuccess<T> {
  success: true;
  message?: string;
  data: T;
  meta?: PaginatedResult<unknown>["meta"];
}

export interface ApiResponseError {
  success: false;
  message: string;
  errors?: unknown;
  stack?: string;
}

export type ApiResponse<T> = ApiResponseSuccess<T> | ApiResponseError;

