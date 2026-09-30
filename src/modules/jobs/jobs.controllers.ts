import type { Request, Response } from "express";
import {
  CreateCategory,
  CreateSkill,
  DeleteJobs,
<<<<<<< HEAD
  GetCategories,
  GetJobByID,
  GetJobs,
  GetSkillByID,
  GetSkills,
=======
  GetJobByID,
  GetJobs,
>>>>>>> df1f762 (fix(jobs): complete jobs module and e2e coverage)
  PatchJobs,
  PostJob,
} from "./jobs.services.js";
import type {
  CreateCategoryInput,
  CreateJobInput,
  CreateSkillInput,
  JobListQuery,
<<<<<<< HEAD
  SkillListQuery,
=======
>>>>>>> df1f762 (fix(jobs): complete jobs module and e2e coverage)
  UpdateJobInput,
} from "./jobs.validator.js";

export async function getJobs(req: Request, res: Response): Promise<void> {
  const { data, meta } = await GetJobs(req.query as unknown as JobListQuery);

  res.status(200).json({ success: true, data, meta });
}

export async function getJobsByID(req: Request, res: Response): Promise<void> {
  const job = await GetJobByID(req.params.id as string, req.user);

  res.status(200).json({ success: true, data: job });
}

export async function postJob(req: Request, res: Response): Promise<void> {
  const job = await PostJob(req.body as CreateJobInput, req.user!.id);

  res.status(201).json({ success: true, data: job });
}

export async function patchJobs(req: Request, res: Response): Promise<void> {
  const job = await PatchJobs(
    req.params.id as string,
    req.user!,
    req.body as UpdateJobInput
  );

  res.status(200).json({ success: true, message: "Job updated successfully", data: job });
}

export async function deleteJobs(req: Request, res: Response): Promise<void> {
  await DeleteJobs(req.params.id as string, req.user!);

  res.status(204).send();
}

export async function createSkill(req: Request, res: Response): Promise<void> {
  const skill = await CreateSkill(req.body as CreateSkillInput, req.user!);

  res.status(201).json({ success: true, data: skill });
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const category = await CreateCategory(req.body as CreateCategoryInput, req.user!);

  res.status(201).json({ success: true, data: category });
<<<<<<< HEAD
}

export async function getSkills(req: Request, res: Response): Promise<void> {
  const { data, meta } = await GetSkills(req.query as unknown as SkillListQuery);

  res.status(200).json({ success: true, data, meta });
}

export async function getSkillByID(req: Request, res: Response): Promise<void> {
  const skill = await GetSkillByID(req.params.id as string);

  res.status(200).json({ success: true, data: skill });
}

export async function getCategories(req: Request, res: Response): Promise<void> {
  const categories = await GetCategories();

  res.status(200).json({ success: true, data: categories });
=======
>>>>>>> df1f762 (fix(jobs): complete jobs module and e2e coverage)
}