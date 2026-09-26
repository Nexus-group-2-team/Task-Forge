import type { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service.js";
import {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
  refreshCookieBaseOptions,
} from "../../shared/utils/tokens.js";

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const context = {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      };
      const result = await AuthService.register(req.body, context);

      res.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        getRefreshCookieOptions(result.refreshTokenExpiresAt)
      );

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          user: result.user,
          token: result.accessToken,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const context = {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      };
      const result = await AuthService.login(req.body, context);

      res.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        getRefreshCookieOptions(result.refreshTokenExpiresAt)
      );

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          user: result.user,
          token: result.accessToken,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
      const context = {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      };

      const result = await AuthService.refresh(rawRefreshToken, context);

      res.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        getRefreshCookieOptions(result.refreshTokenExpiresAt)
      );

      res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        data: {
          token: result.accessToken,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieBaseOptions);
      next(error);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
      await AuthService.logout(rawRefreshToken, req.user?.sessionId);

      res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieBaseOptions);

      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  static async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.logoutAll(req.user!.id);
      res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieBaseOptions);

      res.status(200).json({
        success: true,
        message: "Logged out from all devices successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await AuthService.getMe(req.user!.id);
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateUserStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { status } = req.body;
      const result = await AuthService.updateUserStatus(id, status, req.user!.id);

      res.status(200).json({
        success: true,
        message: `User status successfully updated to ${status}`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}


