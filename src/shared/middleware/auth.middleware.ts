import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { UnauthorizedError, ForbiddenError } from "../errors/app-error.js";
import { prisma } from "../db/prisma.js";
import { verifyAccessToken } from "../utils/tokens.js";

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authentication token is missing");
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, accountStatus: true },
    });

    if (!user || user.accountStatus !== "ACTIVE") {
      throw new UnauthorizedError("User account is inactive or not found");
    }

    if (decoded.sessionId) {
      const session = await prisma.authSession.findUnique({
        where: { id: decoded.sessionId },
        select: { revokedAt: true, expiresAt: true },
      });

      if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
        throw new UnauthorizedError("Session has been revoked or expired");
      }
    }

    req.user = {
      ...user,
      sessionId: decoded.sessionId,
    };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError("Invalid or expired authentication token"));
      return;
    }
    next(error);
  }
};

export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, accountStatus: true },
    });

    if (user && user.accountStatus === "ACTIVE") {
      if (decoded.sessionId) {
        const session = await prisma.authSession.findUnique({
          where: { id: decoded.sessionId },
          select: { revokedAt: true, expiresAt: true },
        });
        if (session && session.revokedAt === null && session.expiresAt > new Date()) {
          req.user = {
            ...user,
            sessionId: decoded.sessionId,
          };
        }
      } else {
        req.user = user;
      }
    }
    next();
  } catch {
    // Optional auth silently continues if token is invalid or expired
    next();
  }
};

export const authorize = (...allowedRoles: Role[]) => {

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError("Authentication required"));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError("Access denied for user role"));
      return;
    }

    next();
  };
};
