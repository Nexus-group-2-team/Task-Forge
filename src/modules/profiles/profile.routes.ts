import { Router } from "express";
import { ProfileController } from "./profile.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { updateProfileSchema, updateSkillsSchema } from "./profile.schema.js";

const router = Router();

router.get("/me", authenticate, ProfileController.getMyProfile);
router.patch("/me", authenticate, validate({ body: updateProfileSchema }), ProfileController.updateMyProfile);
router.put("/me/skills", authenticate, validate({ body: updateSkillsSchema }), ProfileController.updateMySkills);

router.get("/freelancers", ProfileController.listFreelancers);
router.get("/:userId", ProfileController.getProfileById);

export default router;
