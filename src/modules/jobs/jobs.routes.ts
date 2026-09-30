import { Router } from "express";
import { Role } from "@prisma/client";
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../../shared/middleware/auth.middleware.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import {
  createCategory,
  createSkill,
  deleteJobs,
  getJobs,
  getJobsByID,
  patchJobs,
  postJob,
} from "./jobs.controllers.js";
import {
  createCategorySchema,
  createJobSchema,
  createSkillSchema,
  jobIdParamSchema,
  querySchema,
  updateJobSchema,
} from "./jobs.validator.js";

const router = Router();

// ---------------------------------------------------------------- listings --
// Public. Optional auth lets an owner or admin still resolve their own draft.
router.get("/", validate({ query: querySchema }), asyncHandler(getJobs));
router.get(
  "/:id",
  optionalAuthenticate,
  validate({ params: jobIdParamSchema }),
  asyncHandler(getJobsByID)
);

// ------------------------------------------------------------------- writes --
// Publishing is restricted to clients (and admins for moderation/testing). The
// owner is always taken from the token, never from the request body.
router.post(
  "/",
  authenticate,
  authorize(Role.CLIENT, Role.ADMIN),
  validate({ body: createJobSchema }),
  asyncHandler(postJob)
);

// Update and delete are owner-or-admin; that is checked against the stored row
// in the service, so a valid id for someone else's job answers 403.
router.patch(
  "/:id",
  authenticate,
  validate({ params: jobIdParamSchema, body: updateJobSchema }),
  asyncHandler(patchJobs)
);
router.delete(
  "/:id",
  authenticate,
  validate({ params: jobIdParamSchema }),
  asyncHandler(deleteJobs)
);

// ------------------------------------------------------- taxonomy (admin) ----
router.post(
  "/skills",
  authenticate,
  authorize(Role.ADMIN),
  validate({ body: createSkillSchema }),
  asyncHandler(createSkill)
);
router.post(
  "/categories",
  authenticate,
  authorize(Role.ADMIN),
  validate({ body: createCategorySchema }),
  asyncHandler(createCategory)
);

export default router;