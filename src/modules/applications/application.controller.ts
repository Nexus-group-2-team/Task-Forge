import type { Request, Response, NextFunction } from "express";
import { ApplicationService } from "./application.service.js";

export class ApplicationController {
  static async createApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const application = await ApplicationService.createApplication(req.user!.id, req.body);
      res.status(201).json({
        success: true,
        message: "Application submitted successfully",
        data: application,
      });
    } catch (error) {
      next(error);
    }
  }

  static async listApplications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const applications = await ApplicationService.listApplications(
        req.user!.id,
        req.user!.role,
        req.query as any
      );
      res.status(200).json({
        success: true,
        data: applications,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getApplicationById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = req.params.id as string;
      const application = await ApplicationService.getApplicationById(
        applicationId,
        req.user!.id,
        req.user!.role
      );
      res.status(200).json({
        success: true,
        data: application,
      });
    } catch (error) {
      next(error);
    }
  }

  static async withdrawApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = req.params.id as string;
      const updated = await ApplicationService.withdrawApplication(
        applicationId,
        req.user!.id,
        req.user!.role
      );
      res.status(200).json({
        success: true,
        message: "Application withdrawn successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async rejectApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = req.params.id as string;
      const updated = await ApplicationService.rejectApplication(
        applicationId,
        req.user!.id,
        req.user!.role
      );
      res.status(200).json({
        success: true,
        message: "Application rejected successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async acceptApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = req.params.id as string;
      const result = await ApplicationService.acceptApplication(
        applicationId,
        req.user!.id,
        req.user!.role
      );
      res.status(200).json({
        success: true,
        message: "Application accepted and project created successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
