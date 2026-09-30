import type { Request, Response } from "express";
import { ApiResponse } from "../../shared/utils/api-response.js";
import { ReportService } from "./report.service.js";
import type { CreateReportInput, ReportListQuery, ResolveReportInput } from "./report.schema.js";

export const createReport = async (req: Request, res: Response): Promise<void> => {
  // The reporter is always taken from the authenticated context, never the body.
  const report = await ReportService.createReport({
    reporterId: req.user!.id,
    data: req.body as CreateReportInput,
  });

  ApiResponse.created(res, report, "Report submitted successfully");
};

export const getReports = async (req: Request, res: Response): Promise<void> => {
  const result = await ReportService.getReports(req.query as ReportListQuery);

  ApiResponse.success(res, result.data, "Reports retrieved successfully", 200, result.meta);
};

export const getReportById = async (req: Request, res: Response): Promise<void> => {
  const report = await ReportService.getReportById(req.params.id as string, req.user!.id, req.user!.role);

  ApiResponse.success(res, report, "Report retrieved successfully");
};

export const resolveReport = async (req: Request, res: Response): Promise<void> => {
  const report = await ReportService.resolveReport({
    reportId: req.params.id as string,
    adminId: req.user!.id,
    data: req.body as ResolveReportInput,
  });

  ApiResponse.success(res, report, "Report resolved successfully");
};
