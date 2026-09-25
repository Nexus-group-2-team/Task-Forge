import type { RequestUser } from "./api.types.js";

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export {};