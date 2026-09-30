import { prisma } from "../../shared/db/prisma.js";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from "../../shared/errors/app-error.js";
import { ProjectService } from "../projects/project.service.js";
import type { Role } from "@prisma/client";
import type { CreateApplicationInput, ListApplicationsQuery } from "./application.schema.js";

export class ApplicationService {
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

    const existingApplication = await prisma.application.findUnique({
      where: {
        jobId_freelancerId: {
          jobId: input.jobId,
          freelancerId,
        },
      },
    });

    if (existingApplication) {
      throw new ConflictError("You have already applied to this job");
    }

    const application = await prisma.application.create({
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

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { status: "WITHDRAWN" },
      include: {
        job: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    return updated;
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

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { status: "REJECTED" },
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
      const acceptedApp = await tx.application.update({
        where: { id: applicationId },
        data: { status: "ACCEPTED" },
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

      // Transition job state to IN_PROGRESS
      await tx.job.update({
        where: { id: application.jobId },
        data: { status: "IN_PROGRESS" },
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
