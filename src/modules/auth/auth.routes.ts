import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { registerSchema, loginSchema } from "./auth.schema.js";

const router = Router();

router.post("/register", validate({ body: registerSchema }), AuthController.register);
router.post("/login", validate({ body: loginSchema }), AuthController.login);
router.get("/me", authenticate, AuthController.me);

export default router;
