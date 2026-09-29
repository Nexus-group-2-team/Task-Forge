import type { Request, Response, NextFunction } from "express";
import { ProfileService } from "./profile.service.js";

export class ProfileController {
  static async getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await ProfileService.getProfileByUserId(req.user!.id, true);
      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getProfileById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetUserId = req.params.userId as string;
      const isOwnerOrAdmin = Boolean(
        req.user && (req.user.id === targetUserId || req.user.role === "ADMIN")
      );
      const profile = await ProfileService.getProfileByUserId(targetUserId, isOwnerOrAdmin);
      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }


  static async updateMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await ProfileService.updateProfile(req.user!.id, req.body);
      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateMySkills(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updatedUser = await ProfileService.updateSkills(req.user!.id, req.body);
      res.status(200).json({
        success: true,
        message: "Skills updated successfully",
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }

  static async listFreelancers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query.search as string | undefined;
      const freelancers = await ProfileService.listFreelancers(search);
      res.status(200).json({
        success: true,
        data: freelancers,
      });
    } catch (error) {
      next(error);
    }
  }
}
