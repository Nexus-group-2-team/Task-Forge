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
<<<<<<< HEAD
  getCategories,
  getJobs,
  getJobsByID,
  getSkillByID,
  getSkills,
=======
  getJobs,
  getJobsByID,
>>>>>>> df1f762 (fix(jobs): complete jobs module and e2e coverage)
  patchJobs,
  postJob,
} from "./jobs.controllers.js";
import {
  createCategorySchema,
  createJobSchema,
  createSkillSchema,
  jobIdParamSchema,
  querySchema,
<<<<<<< HEAD
  skillIdParamSchema,
  skillsQuerySchema,
=======
>>>>>>> df1f762 (fix(jobs): complete jobs module and e2e coverage)
  updateJobSchema,
} from "./jobs.validator.js";

const router = Router();

<<<<<<< HEAD
// ------------------------------------------------- taxonomy (public reads) ---
// Declared before "/:id" on purpose: Express matches in registration order, so
// a literal segment registered later would be swallowed by the id param and
// answer with a misleading 404 instead of the catalog.
router.get("/skills", validate({ query: skillsQuerySchema }), asyncHandler(getSkills));
router.get(
  "/skills/:id",
  validate({ params: skillIdParamSchema }),
  asyncHandler(getSkillByID)
);
router.get("/categories", asyncHandler(getCategories));

=======
>>>>>>> df1f762 (fix(jobs): complete jobs module and e2e coverage)
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

<<<<<<< HEAD
/**
 * The catalog is additionally reachable at /api/skills, the path the documented
 * API scope advertises. Same controllers, mounted separately in app.ts, so a
 * client built from the README stops 404ing on the read endpoints.
 */
export const skillsRouter = Router();

skillsRouter.get("/", validate({ query: skillsQuerySchema }), asyncHandler(getSkills));
skillsRouter.get(
  "/:id",
  validate({ params: skillIdParamSchema }),
  asyncHandler(getSkillByID)
);

=======
>>>>>>> df1f762 (fix(jobs): complete jobs module and e2e coverage)
export default router;