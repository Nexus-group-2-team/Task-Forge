import type { Request, Response, NextFunction } from "express";
import { ProjectService } from "./project.service.js";
import type { ProjectStatus } from "@prisma/client";

export class ProjectController {
  static async getMyProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as ProjectStatus | undefined;
      const projects = await ProjectService.getUserProjects(req.user!.id, status);
      res.status(200).json({
        success: true,
        data: projects,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getProjectById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await ProjectService.getProjectById(req.params.id as string, req.user!.id);
      res.status(200).json({
        success: true,
        data: project,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateProjectStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await ProjectService.updateProjectStatus(
        req.params.id as string,
        req.user!.id,
        req.body.status
      );
      res.status(200).json({
        success: true,
        message: `Project status updated to ${req.body.status}`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}
