import type { PaginationParams, PaginatedResult } from "../types/api.types.js";

export const getPaginationOptions = (
  query: Record<string, unknown>,
  defaultLimit = 10,
  maxLimit = 100
): { page: number; limit: number; skip: number; sortBy?: string; sortOrder: "asc" | "desc" } => {
  const pageNumber = Math.max(1, Number(query.page) || 1);
  const rawLimit = Number(query.limit) || defaultLimit;
  const limit = Math.min(Math.max(1, rawLimit), maxLimit);
  const skip = (pageNumber - 1) * limit;

  const sortBy = typeof query.sortBy === "string" && query.sortBy.trim() ? query.sortBy.trim() : undefined;
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  return {
    page: pageNumber,
    limit,
    skip,
    sortBy,
    sortOrder,
  };
};

export const createPaginatedResponse = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> => {
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

