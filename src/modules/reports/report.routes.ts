import { Router } from "express";
import { Role } from "../../generated/prisma/enums.js";
import { authenticate, authorize } from "../../shared/middleware/auth.middleware.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { createReport, getReportById, getReports, resolveReport } from "./report.controller.js";
import {
  createReportSchema,
  reportIdParamSchema,
  reportListQuerySchema,
  resolveReportSchema,
} from "./report.schema.js";

const router = Router();

router.post(
  "/",
  authenticate,
  validate({ body: createReportSchema }),
  asyncHandler(createReport)
);

// Global moderation queue is restricted to administrators.
router.get(
  "/",
  authenticate,
  authorize(Role.ADMIN),
  validate({ query: reportListQuerySchema }),
  asyncHandler(getReports)
);

// Admins may inspect any report; a reporter may only read their own.
router.get(
  "/:id",
  authenticate,
  validate({ params: reportIdParamSchema }),
  asyncHandler(getReportById)
);

router.patch(
  "/:id/resolve",
  authenticate,
  authorize(Role.ADMIN),
  validate({ params: reportIdParamSchema, body: resolveReportSchema }),
  asyncHandler(resolveReport)
);

export default router;
