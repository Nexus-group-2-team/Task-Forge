import { MilestoneStatus } from "../../generated/prisma/enums.js";
import type { Prisma, Role } from "../../generated/prisma/client.js";
import { prisma } from "../../shared/db/prisma.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/app-error.js";

export interface CreateMilestoneInput {
  title: string;
  description?: string;
  dueDate?: string;
  status?: MilestoneStatus;
}

export type UpdateMilestoneInput = Partial<CreateMilestoneInput>;

async function requireProjectAccess(projectId: string, userId: string, userRole: Role): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true, freelancerId: true },
  });

  if (!project) throw new NotFoundError("Project not found");
  if (userRole === "ADMIN") return;
  if (project.clientId !== userId && project.freelancerId !== userId) {
    throw new ForbiddenError("You do not have access to this project");
  }
}

async function findMilestoneOrThrow(id: string) {
  const milestone = await prisma.milestone.findUnique({ where: { id } });
  if (!milestone) throw new NotFoundError("Milestone not found");
  return milestone;
}

export const milestoneService = {
  async create(projectId: string, data: CreateMilestoneInput, userId: string, userRole: Role) {
    await requireProjectAccess(projectId, userId, userRole);

    return prisma.milestone.create({
      data: {
        projectId,
        title: data.title,
        description: data.description ?? null,
        status: data.status ?? "PENDING",
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });
  },

  async listByProject(projectId: string, userId: string, userRole: Role) {
    await requireProjectAccess(projectId, userId, userRole);

    return prisma.milestone.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(id: string, userId: string, userRole: Role) {
    const milestone = await findMilestoneOrThrow(id);
    await requireProjectAccess(milestone.projectId, userId, userRole);
    return milestone;
  },

  async update(id: string, data: UpdateMilestoneInput, userId: string, userRole: Role) {
    const milestone = await findMilestoneOrThrow(id);
    await requireProjectAccess(milestone.projectId, userId, userRole);

    const updateData: Prisma.MilestoneUpdateInput = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.status !== undefined) updateData.status = data.status;

    return prisma.milestone.update({ where: { id }, data: updateData });
  },

  async delete(id: string, userId: string, userRole: Role) {
    const milestone = await findMilestoneOrThrow(id);
    await requireProjectAccess(milestone.projectId, userId, userRole);
    return prisma.milestone.delete({ where: { id } });
  },
};
