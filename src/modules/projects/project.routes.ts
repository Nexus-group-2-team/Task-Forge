import { Router } from "express";
import { ProjectController } from "./project.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { updateProjectSchema, updateProjectStatusSchema } from "./project.schema.js";

const router = Router();

router.use(authenticate);

router.get("/", ProjectController.getMyProjects);
router.get("/:id", ProjectController.getProjectById);
router.patch("/:id", validate({ body: updateProjectSchema }), ProjectController.updateProject);
router.patch("/:id/status", validate({ body: updateProjectStatusSchema }), ProjectController.updateProjectStatus);

export default router;
