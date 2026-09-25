// src/shared/utils/tokens.ts
import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";
import { Role } from "@prisma/client";
import { env } from "../config/env.js";

export const REFRESH_COOKIE_NAME = "taskforge_refresh_token";

export interface AccessTokenPayload {
  id: string;
  email: string;
  role: Role;
  sessionId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function generateOpaqueRefreshToken(): string {
  return crypto.randomBytes(40).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const refreshCookieBaseOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/auth",
};

export function getRefreshCookieOptions(expiresAt: Date): CookieOptions {
  return {
    ...refreshCookieBaseOptions,
    expires: expiresAt,
  };
}
