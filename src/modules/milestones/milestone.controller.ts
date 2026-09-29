import type { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/api-response.js";
import { milestoneService } from "./milestone.service.js";

export const milestoneController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = req.user!;
    const milestone = await milestoneService.create(
      req.params.projectId as string,
      req.body,
      userId,
      role
    );
    ApiResponse.created(res, milestone);
  }),

  listByProject: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = req.user!;
    const milestones = await milestoneService.listByProject(
      req.params.projectId as string,
      userId,
      role
    );
    ApiResponse.success(res, milestones);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = req.user!;
    const milestone = await milestoneService.getById(req.params.id as string, userId, role);
    ApiResponse.success(res, milestone);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = req.user!;
    const milestone = await milestoneService.update(
      req.params.id as string,
      req.body,
      userId,
      role
    );
    ApiResponse.success(res, milestone);
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = req.user!;
    await milestoneService.delete(req.params.id as string, userId, role);
    ApiResponse.noContent(res);
  }),
};
