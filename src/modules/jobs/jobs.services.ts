import { prisma } from "../../shared/db/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import type { RequestUser } from "../../shared/types/api.types.js";
import { paginated, parsePagination } from "./jobs.pagination.js";
import type {
  CreateCategoryInput,
  CreateJobInput,
  CreateSkillInput,
  JobListQuery,
  UpdateJobInput,
} from "./jobs.validator.js";

/** Every read of a job returns its attached skills in one round trip. */
const jobInclude = { jobSkills: { include: { skill: true } } } as const;

const assertAdmin = (actor: RequestUser, action: string): void => {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError(`Only administrators are allowed to ${action}`);
  }
};

const assertSkillsExist = async (skillIds: string[]): Promise<void> => {
  const count = await prisma.skill.count({ where: { id: { in: skillIds } } });
  if (count !== skillIds.length) {
    throw new BadRequestError("One or more skillIds do not exist");
  }
};

export async function GetJobs(query: JobListQuery) {
  // Drafts are a private owner state: they only surface when asked for by name.
  const where: Prisma.JobWhereInput = {
    status: query.status ?? { not: "DRAFT" },
  };

  if (query.title) {
    where.title = { contains: query.title, mode: "insensitive" };
  }
  if (query.description) {
    where.description = { contains: query.description, mode: "insensitive" };
  }
  if (query.minBudget !== undefined) {
    where.budgetMin = { gte: query.minBudget };
  }
  if (query.maxBudget !== undefined) {
    where.budgetMax = { lte: query.maxBudget };
  }

  const { page, limit, skip } = parsePagination(query);

  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      skip,
      take: limit,
      include: jobInclude,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return paginated(jobs, page, limit, total);
}

export async function GetJobByID(id: string, viewer?: RequestUser) {
  const job = await prisma.job.findUnique({ where: { id }, include: jobInclude });

  if (!job) {
    throw new NotFoundError("Job not found");
  }

  const isOwner = viewer?.id === job.ownerId;
  const isAdmin = viewer?.role === "ADMIN";
  // Answering 404 rather than 403 keeps drafts from leaking to strangers.
  if (job.status === "DRAFT" && !isOwner && !isAdmin) {
    throw new NotFoundError("Job not found");
  }

  return job;
}

export async function PostJob(body: CreateJobInput, ownerId: string) {
  const { skillIds, minBudget, maxBudget, deadline } = body;

  if (skillIds?.length) {
    await assertSkillsExist(skillIds);
  }

  return prisma.job.create({
    data: {
      ownerId,
      title: body.title,
      description: body.description,
      status: body.status,
      budgetMin: minBudget ?? null,
      budgetMax: maxBudget ?? null,
      deadline: deadline ?? null,
      ...(skillIds?.length && {
        jobSkills: { create: skillIds.map((skillId) => ({ skillId })) },
      }),
    },
    include: jobInclude,
  });
}

export async function PatchJobs(id: string, actor: RequestUser, body: UpdateJobInput) {
  const existing = await prisma.job.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });

  if (!existing) {
    throw new NotFoundError("Job not found");
  }
  if (actor.role !== "ADMIN" && existing.ownerId !== actor.id) {
    throw new ForbiddenError("Only the job owner or an administrator can update this job");
  }

  const { skillIds, deadline } = body;
  if (skillIds?.length) {
    await assertSkillsExist(skillIds);
  }

  // Fields are listed explicitly so no client-supplied key (ownerId above all)
  // can reach the update payload.
  return prisma.job.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.minBudget !== undefined && { budgetMin: body.minBudget }),
      ...(body.maxBudget !== undefined && { budgetMax: body.maxBudget }),
      ...(deadline !== undefined && { deadline }),
      ...(skillIds !== undefined && {
        jobSkills: {
          deleteMany: {},
          create: skillIds.map((skillId) => ({ skillId })),
        },
      }),
    },
    include: jobInclude,
  });
}

export async function DeleteJobs(id: string, actor: RequestUser): Promise<void> {
  const existing = await prisma.job.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });

  if (!existing) {
    throw new NotFoundError("Job not found");
  }
  if (actor.role !== "ADMIN" && existing.ownerId !== actor.id) {
    throw new ForbiddenError("Only the job owner or an administrator can delete this job");
  }

  await prisma.job.delete({ where: { id } });
}

export async function CreateSkill(body: CreateSkillInput, actor: RequestUser) {
  assertAdmin(actor, "create skills");

  const { name, categoryId } = body;

  if (categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundError("Category not found");
    }
  }

  const existing = await prisma.skill.findUnique({ where: { name }, select: { id: true } });
  if (existing) {
    throw new ConflictError("Skill already exists");
  }

  return prisma.skill.create({
    data: {
      name,
      ...(categoryId && { category: { connect: { id: categoryId } } }),
    },
    include: { category: true },
  });
}

export async function CreateCategory(body: CreateCategoryInput, actor: RequestUser) {
  assertAdmin(actor, "create categories");

  const { name, description } = body;

  const existing = await prisma.category.findUnique({ where: { name }, select: { id: true } });
  if (existing) {
    throw new ConflictError("Category already exists");
  }

  return prisma.category.create({
    data: { name, description: description ?? null },
  });
}