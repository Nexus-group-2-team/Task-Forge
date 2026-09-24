import { Role, AccountStatus } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
        accountStatus: AccountStatus;
      };
    }
  }
}

export {};
