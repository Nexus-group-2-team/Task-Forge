import { Router } from "express";
import { ApplicationController } from "./application.controller.js";
import { authenticate, authorize } from "../../shared/middleware/auth.middleware.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { createApplicationSchema, listApplicationsQuerySchema } from "./application.schema.js";

const router = Router();

// All application routes require authentication
router.use(authenticate);

router.post(
  "/",
  authorize("FREELANCER"),
  validate({ body: createApplicationSchema }),
  ApplicationController.createApplication
);

router.get(
  "/",
  validate({ query: listApplicationsQuerySchema }),
  ApplicationController.listApplications
);

router.get("/:id", ApplicationController.getApplicationById);

router.patch("/:id/withdraw", authorize("FREELANCER"), ApplicationController.withdrawApplication);
router.patch("/:id/reject", authorize("CLIENT", "ADMIN"), ApplicationController.rejectApplication);
router.patch("/:id/accept", authorize("CLIENT", "ADMIN"), ApplicationController.acceptApplication);

export default router;
