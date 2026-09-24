import { prisma } from "../../shared/db/prisma.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/app-error.js";
import type { ProjectStatus } from "@prisma/client";

export class ProjectService {
  static async getUserProjects(userId: string, status?: ProjectStatus) {
    const projects = await prisma.project.findMany({
      where: {
        OR: [{ clientId: userId }, { freelancerId: userId }],
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

  static async getProjectById(projectId: string, userId: string) {
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

    if (project.clientId !== userId && project.freelancerId !== userId) {
      throw new ForbiddenError("Not authorized to access this project");
    }

    return project;
  }

  static async updateProjectStatus(projectId: string, userId: string, status: ProjectStatus) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (project.clientId !== userId && project.freelancerId !== userId) {
      throw new ForbiddenError("Not authorized to update this project");
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
