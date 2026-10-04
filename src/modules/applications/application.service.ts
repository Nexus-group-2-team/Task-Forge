import { prisma } from "../../shared/db/prisma.js";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from "../../shared/errors/app-error.js";
import { env } from "../../shared/config/env.js";
import { ProjectService } from "../projects/project.service.js";
import type { Role } from "../../generated/prisma/client.js";
import type { CreateApplicationInput, ListApplicationsQuery } from "./application.schema.js";

export class ApplicationService {
  private static assertStorageOrigin(input: CreateApplicationInput) {
    if (!env.STRICT_UPLOAD_URLS) return;

    const bucketPrefix = env.SUPABASE_URL
      ? `${env.SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(
        env.SUPABASE_STORAGE_BUCKET
      )}/`
      : null;
    const urls: Array<{ field: string; url: string }> = [
      ...(input.resumeUrl ? [{ field: "resumeUrl", url: input.resumeUrl }] : []),
      ...(input.attachmentUrls ?? []).map((url, index) => ({
        field: `attachmentUrls.${index}`,
        url,
      })),
    ];
    if (urls.length === 0) return;

    const foreign = bucketPrefix
      ? urls.filter((entry) => !entry.url.startsWith(bucketPrefix))
      : urls;
    if (foreign.length > 0) {
      const reason = bucketPrefix
        ? "must point to the project's storage bucket"
        : "cannot be verified because storage is not configured (set SUPABASE_URL)";
      throw new BadRequestError(
        `File URLs ${reason} when STRICT_UPLOAD_URLS is enabled (offending: ${foreign
          .map((entry) => entry.field)
          .join(", ")})`
      );
    }
  }

  static async createApplication(freelancerId: string, input: CreateApplicationInput) {
    const job = await prisma.job.findUnique({
      where: { id: input.jobId },
    });

    if (!job) {
      throw new NotFoundError("Job not found");
    }

    if (job.status !== "OPEN") {
      throw new BadRequestError("Cannot apply to a job that is not open");
    }

    if (job.ownerId === freelancerId) {
      throw new ForbiddenError("You cannot apply to your own job posting");
    }

    this.assertStorageOrigin(input);

    const existingApplication = await prisma.application.findUnique({
      where: {
        jobId_freelancerId: {
          jobId: input.jobId,
          freelancerId,
        },
      },
    });

    if (existingApplication && existingApplication.status !== "WITHDRAWN") {
      throw new ConflictError("You have already applied to this job");
    }

    const application = await prisma.$transaction(async (tx) => {
      if (existingApplication) {
        await tx.application.deleteMany({
          where: { id: existingApplication.id, status: "WITHDRAWN" },
        });
      }

      return tx.application.create({
        data: {
          jobId: input.jobId,
          freelancerId,
          coverLetter: input.coverLetter,
          proposedBid: input.proposedBid ?? null,
          estimatedDays: input.estimatedDays ?? null,
          resumeUrl: input.resumeUrl ?? null,
          attachmentUrls: input.attachmentUrls ?? [],
          status: "PENDING",
        },
        include: {
          job: {
            select: { id: true, title: true, status: true, ownerId: true },
          },
          freelancer: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true, headline: true } },
            },
          },
        },
      });
    });

    return application;
  }

  static async listApplications(userId: string, role: Role, query: ListApplicationsQuery) {
    const isAdmin = role === "ADMIN";

    let roleFilter: object = {};
    if (!isAdmin) {
      if (role === "FREELANCER") {
        roleFilter = { freelancerId: userId };
      } else if (role === "CLIENT") {
        roleFilter = { job: { ownerId: userId } };
      }
    }

    const applications = await prisma.application.findMany({
      where: {
        ...roleFilter,
        ...(query.status && { status: query.status }),
        ...(query.jobId && { jobId: query.jobId }),
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            status: true,
            budgetMin: true,
            budgetMax: true,
            ownerId: true,
          },
        },
        freelancer: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true, headline: true } },
          },
        },
        project: {
          select: { id: true, status: true, title: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return applications;
  }

  static async getApplicationById(applicationId: string, userId: string, role: Role) {
    const isAdmin = role === "ADMIN";

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            status: true,
            ownerId: true,
            owner: {
              select: { id: true, email: true, profile: { select: { fullName: true } } },
            },
          },
        },
        freelancer: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true, headline: true } },
          },
        },
        project: true,
      },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    const isApplicant = application.freelancerId === userId;
    const isJobOwner = application.job.ownerId === userId;

    if (!isApplicant && !isJobOwner && !isAdmin) {
      // IDOR Protection: Return 404 to prevent resource enumeration
      throw new NotFoundError("Application not found");
    }

    return application;
  }

  static async withdrawApplication(applicationId: string, userId: string, role: Role) {
    const isAdmin = role === "ADMIN";

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: { select: { id: true, title: true, status: true } },
      },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (application.freelancerId !== userId && !isAdmin) {
      throw new NotFoundError("Application not found");
    }

    if (application.status !== "PENDING") {
      throw new BadRequestError("Only pending applications can be withdrawn");
    }

    const { count } = await prisma.application.deleteMany({
      where: { id: applicationId, status: "PENDING" },
    });

    if (count === 0) {
      // The record changed state (or vanished) between our read and the delete.
      throw new ConflictError(
        "Application was updated concurrently; refresh and try again"
      );
    }

    // contract (status: "WITHDRAWN") stays stable for API consumers.
    return { ...application, status: "WITHDRAWN" as const };
  }

  static async rejectApplication(applicationId: string, userId: string, role: Role) {
    const isAdmin = role === "ADMIN";

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (application.job.ownerId !== userId && !isAdmin) {
      throw new ForbiddenError("Only the job owner or an administrator can reject applications");
    }

    if (application.status !== "PENDING") {
      throw new BadRequestError("Only pending applications can be rejected");
    }

    const { count } = await prisma.application.updateMany({
      where: { id: applicationId, status: "PENDING" },
      data: { status: "REJECTED" },
    });

    if (count === 0) {
      throw new ConflictError(
        "Application was updated concurrently; refresh and try again"
      );
    }

    const updated = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: {
        job: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    return updated;
  }

  static async acceptApplication(applicationId: string, userId: string, role: Role) {
    const isAdmin = role === "ADMIN";

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (application.job.ownerId !== userId && !isAdmin) {
      throw new ForbiddenError("Only the job owner or an administrator can accept applications");
    }

    if (application.job.status !== "OPEN") {
      throw new BadRequestError("Cannot accept an application for a job that is not open");
    }

    if (application.status !== "PENDING") {
      throw new BadRequestError("Only pending applications can be accepted");
    }

    // Atomic transaction: accept application, reject competing pending applications, transition job, create project contract
    const result = await prisma.$transaction(async (tx) => {
      const jobTransitioned = await tx.job.updateMany({
        where: { id: application.jobId, status: "OPEN" },
        data: { status: "IN_PROGRESS" },
      });
      if (jobTransitioned.count === 0) {
        throw new BadRequestError("Cannot accept an application for a job that is not open");
      }

      const appTransitioned = await tx.application.updateMany({
        where: { id: applicationId, status: "PENDING" },
        data: { status: "ACCEPTED" },
      });
      if (appTransitioned.count === 0) {
        throw new ConflictError(
          "Application was updated concurrently; refresh and try again"
        );
      }

      const acceptedApp = await tx.application.findUniqueOrThrow({
        where: { id: applicationId },
      });

      // Reject all other pending applications for this job
      await tx.application.updateMany({
        where: {
          jobId: application.jobId,
          id: { not: applicationId },
          status: "PENDING",
        },
        data: { status: "REJECTED" },
      });
      // Domain factory method creating the Project contract
      const project = await ProjectService.createProjectFromApplication(
        {
          applicationId: acceptedApp.id,
          clientId: application.job.ownerId,
          freelancerId: acceptedApp.freelancerId,
          title: application.job.title,
        },
        tx
      );

      return {
        application: acceptedApp,
        project,
      };
    });

    return result;
  }
}
