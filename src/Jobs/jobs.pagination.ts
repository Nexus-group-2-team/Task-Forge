import { BadRequestError } from '../errors/app-error';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

const MAX_LIMIT = 100;

/** Parse & bound pagination query params (server-side maximum of 100). */
export function parsePagination(query: { page?: unknown; limit?: unknown }): PaginationParams {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;

  if (page < 1 || limit < 1) {
    throw new BadRequestError('page and limit must be positive integers');
  }
  const boundedLimit = Math.min(limit, MAX_LIMIT);

  return { page, limit: boundedLimit, skip: (page - 1) * boundedLimit };
}

/** Build the standard paginated response envelope. */
export function paginated<T>(data: T[], page: number, limit: number, total: number) {
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 } };
}