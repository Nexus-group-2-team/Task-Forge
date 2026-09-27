import { prisma } from "../../shared/db/prisma.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/app-error.js";
import type { Prisma, ProjectStatus, Role } from "@prisma/client";
import type { UpdateProjectInput } from "./project.schema.js";

export interface CreateProjectFromApplicationInput {
  applicationId: string;
  clientId: string;
  freelancerId: string;
  title: string;
}

export class ProjectService {
  /**
   * Domain service method to instantiate a Project when an Application is accepted.
   * Can be invoked within an existing Prisma transaction or standalone.
   */
  static async createProjectFromApplication(
    input: CreateProjectFromApplicationInput,
    tx: Prisma.TransactionClient | typeof prisma = prisma
  ) {
    return tx.project.create({
      data: {
        applicationId: input.applicationId,
        clientId: input.clientId,
        freelancerId: input.freelancerId,
        title: input.title,
        status: "ACTIVE",
      },
      include: {
        milestones: true,
        client: {
          select: { id: true, email: true, profile: { select: { fullName: true } } },
        },
        freelancer: {
          select: { id: true, email: true, profile: { select: { fullName: true } } },
        },
      },
    });
  }

  static async getUserProjects(userId: string, role: Role, status?: ProjectStatus) {
    const isAdmin = role === "ADMIN";

    const projects = await prisma.project.findMany({
      where: {
        ...(isAdmin ? {} : { OR: [{ clientId: userId }, { freelancerId: userId }] }),
        ...(status && { status }),
      },
      include: {
        client: {
          select: { id: true, email: true, profile: { select: { fullName: true } } },
        },
        freelancer: {
          select: { id: true, email: true, profile: { select: { fullName: true } } },
        },
        milestones: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return projects;
  }

  static async getProjectById(projectId: string, userId: string, role: Role) {
    const isAdmin = role === "ADMIN";

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: {
          select: { id: true, email: true, profile: { select: { fullName: true } } },
        },
        freelancer: {
          select: { id: true, email: true, profile: { select: { fullName: true } } },
        },
        milestones: true,
        reviews: true,
      },
    });

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    const isParticipant = project.clientId === userId || project.freelancerId === userId;
    if (!isParticipant && !isAdmin) {
      // Return 404 to prevent resource enumeration/IDOR probes on other users' private resources
      throw new NotFoundError("Project not found");
    }

    return project;
  }

  static async updateProject(projectId: string, userId: string, role: Role, input: UpdateProjectInput) {
    const isAdmin = role === "ADMIN";

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    const isParticipant = project.clientId === userId || project.freelancerId === userId;
    if (!isParticipant && !isAdmin) {
      throw new NotFoundError("Project not found");
    }

    if (!isAdmin && project.clientId !== userId) {
      throw new ForbiddenError("Only the client or an administrator can update project details");
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(input.title && { title: input.title }),
      },
      include: {
        milestones: true,
      },
    });

    return updated;
  }

  static async updateProjectStatus(projectId: string, userId: string, role: Role, status: ProjectStatus) {
    const isAdmin = role === "ADMIN";

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    const isParticipant = project.clientId === userId || project.freelancerId === userId;
    if (!isParticipant && !isAdmin) {
      throw new NotFoundError("Project not found");
    }

    // Role-based status lifecycle transitions:
    // Only the client owner or an admin may complete or cancel a project.
    if (!isAdmin && project.clientId !== userId) {
      throw new ForbiddenError("Only the client or an administrator can update the project lifecycle status");
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { status },
      include: {
        milestones: true,
      },
    });

    return updated;
  }
}


