import { ReportStatus, Role } from "../../generated/prisma/enums.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../shared/db/prisma.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import { createPaginatedResponse, getPaginationOptions } from "../../shared/utils/pagination.js";
import type { CreateReportInput, ReportListQuery, ReportTargetType, ResolveReportInput } from "./report.schema.js";

/**
 * Only non-sensitive identity fields are projected for the parties attached to a
 * report; credentials and account state stay server-side.
 */
const reportUserSelect = {
  id: true,
  role: true,
  profile: {
    select: {
      fullName: true,
    },
  },
} satisfies Prisma.UserSelect;

const reportInclude = {
  reporter: { select: reportUserSelect },
  resolver: { select: reportUserSelect },
} satisfies Prisma.ReportInclude;

type ReportWithUsers = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

/** Maps an application-level target type onto its Prisma model for existence checks. */
const targetDelegate: Record<ReportTargetType, (id: string) => Promise<unknown>> = {
  USER: (id) => prisma.user.findUnique({ where: { id }, select: { id: true } }),
  JOB: (id) => prisma.job.findUnique({ where: { id }, select: { id: true } }),
  PROJECT: (id) => prisma.project.findUnique({ where: { id }, select: { id: true } }),
  APPLICATION: (id) => prisma.application.findUnique({ where: { id }, select: { id: true } }),
  MILESTONE: (id) => prisma.milestone.findUnique({ where: { id }, select: { id: true } }),
  REVIEW: (id) => prisma.reviews.findUnique({ where: { id }, select: { id: true } }),
};

export interface CreateReportParams {
  reporterId: string;
  data: CreateReportInput;
}

export interface ResolveReportParams {
  reportId: string;
  adminId: string;
  data: ResolveReportInput;
}

export class ReportService {
  static async createReport({ reporterId, data }: CreateReportParams): Promise<ReportWithUsers> {
    const { targetType, targetId, reason, description } = data;

    if (targetType === "USER" && targetId === reporterId) {
      throw new BadRequestError("You cannot report yourself");
    }

    const target = await targetDelegate[targetType](targetId);
    if (!target) {
      throw new NotFoundError(`${targetType} not found`);
    }

    const existing = await prisma.report.findFirst({
      where: { reporterId, targetType, targetId, status: ReportStatus.PENDING },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError("You already have a pending report for this target");
    }

    try {
      return await prisma.report.create({
        data: {
          reporterId,
          targetType,
          targetId,
          reason,
          description: description ?? null,
          status: ReportStatus.PENDING,
        },
        include: reportInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new NotFoundError(`${targetType} not found`);
      }
      throw error;
    }
  }

  static async getReports(query: ReportListQuery) {
    const { page, limit, skip } = getPaginationOptions(query as Record<string, unknown>);

    const where: Prisma.ReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
    };

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: reportInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);

    return createPaginatedResponse(reports, total, page, limit);
  }

  static async getReportById(
    reportId: string,
    requesterId: string,
    requesterRole: Role
  ): Promise<ReportWithUsers> {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: reportInclude,
    });

    if (!report) {
      throw new NotFoundError("Report not found");
    }

    // Admins moderate every report; a reporter may only follow their own.
    const isAdmin = requesterRole === Role.ADMIN;
    if (!isAdmin && report.reporterId !== requesterId) {
      throw new ForbiddenError("You do not have access to this report");
    }

    return report;
  }

  static async resolveReport({ reportId, adminId, data }: ResolveReportParams): Promise<ReportWithUsers> {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, status: true },
    });

    if (!report) {
      throw new NotFoundError("Report not found");
    }

    if (report.status !== ReportStatus.PENDING) {
      throw new ConflictError(`Report has already been ${report.status.toLowerCase()}`);
    }

    return prisma.report.update({
      where: { id: reportId },
      data: {
        status: data.status,
        resolvedById: adminId,
        resolutionNote: data.resolutionNote ?? null,
      },
      include: reportInclude,
    });
  }
}
