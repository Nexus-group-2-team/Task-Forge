import { Router } from "express";
import { upload } from "../../shared/config/multer.js";
import { authenticate, authorize } from "../../shared/middleware/auth.middleware.js";
import { validateUploadedFile } from "../../shared/middleware/validate-file.middleware.js";
import { UploadController } from "./upload.controller.js";
import { attachmentFileSchema, resumeFileSchema, MAX_ATTACHMENT_COUNT } from "./upload.schema.js";

const router = Router();

router.use(authenticate, authorize("FREELANCER"));

router.post(
  "/resume",
  upload.single("resume"),
  validateUploadedFile(resumeFileSchema),
  UploadController.uploadResume
);

router.post(
  "/attachments",
  upload.array("attachments", MAX_ATTACHMENT_COUNT),
  validateUploadedFile(attachmentFileSchema, { multiple: true }),
  UploadController.uploadAttachments
);

export default router;
