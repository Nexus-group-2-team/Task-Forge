import { Router } from "express";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { milestoneController } from "./milestone.controller.js";
import {
  createMilestoneBodySchema,
  milestoneIdParamSchema,
  projectIdParamSchema,
  updateMilestoneBodySchema,
} from "./milestone.schema.js";

const router = Router();

router.post(
  "/projects/:projectId/milestones",
  authenticate,
  validate({ params: projectIdParamSchema, body: createMilestoneBodySchema }),
  milestoneController.create
);

router.get(
  "/projects/:projectId/milestones",
  authenticate,
  validate({ params: projectIdParamSchema }),
  milestoneController.listByProject
);

router.get(
  "/milestones/:id",
  authenticate,
  validate({ params: milestoneIdParamSchema }),
  milestoneController.getById
);

router.patch(
  "/milestones/:id",
  authenticate,
  validate({ params: milestoneIdParamSchema, body: updateMilestoneBodySchema }),
  milestoneController.update
);

router.delete(
  "/milestones/:id",
  authenticate,
  validate({ params: milestoneIdParamSchema }),
  milestoneController.delete
);

export default router;
