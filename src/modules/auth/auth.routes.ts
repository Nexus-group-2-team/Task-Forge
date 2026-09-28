import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { authenticate, authorize } from "../../shared/middleware/auth.middleware.js";
import { registerSchema, loginSchema, refreshTokenSchema, updateUserStatusSchema, forgotPasswordSchema, resetPasswordSchema } from "./auth.schema.js";
import { forgotPasswordRateLimiter } from "../../shared/middleware/rate-limiter.js";
import { Role } from "@prisma/client";

const router = Router();

router.post("/register", validate({ body: registerSchema }), AuthController.register);
router.post("/login", validate({ body: loginSchema }), AuthController.login);
router.post("/refresh", validate({ body: refreshTokenSchema }), AuthController.refresh);
router.post("/logout", AuthController.logout);
router.post("/logout/all", authenticate, AuthController.logoutAll);
router.post("/logout-all", authenticate, AuthController.logoutAll);
router.get("/me", authenticate, AuthController.me);

// Password reset flow
router.post(
  "/forgot-password",
  forgotPasswordRateLimiter,
  validate({ body: forgotPasswordSchema }),
  AuthController.forgotPassword
);
router.post("/reset-password", validate({ body: resetPasswordSchema }), AuthController.resetPassword);

// Admin user lifecycle management (ban / suspend / activate)
router.patch(
  "/users/:id/status",
  authenticate,
  authorize(Role.ADMIN),
  validate({ body: updateUserStatusSchema }),
  AuthController.updateUserStatus
);

export default router;


