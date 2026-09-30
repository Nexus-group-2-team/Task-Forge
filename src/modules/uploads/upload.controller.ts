import type { Request, Response, NextFunction } from "express";
import { StorageService, toObjectPath } from "../../shared/services/storage.service.js";
import { MAX_ATTACHMENT_COUNT } from "./upload.schema.js";

export class UploadController {
  static async uploadResume(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file!; // validated by validateUploadedFile before this runs

      const url = await StorageService.uploadFile(file, "resumes");

      res.status(201).json({
        success: true,
        message: "Resume uploaded successfully",
        data: {
          fileName: file.originalname,
          fileSize: file.size,
          mimetype: file.mimetype,
          url,
          objectPath: toObjectPath(url),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async uploadAttachments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[]; // validated by middleware

      if (files.length > MAX_ATTACHMENT_COUNT) {
        res.status(400).json({
          success: false,
          message: `Too many files: maximum of ${MAX_ATTACHMENT_COUNT} attachments per request`,
        });
        return;
      }

      const uploaded = await Promise.all(
        files.map(async (file) => {
          const url = await StorageService.uploadFile(file, "attachments");
          return {
            fileName: file.originalname,
            fileSize: file.size,
            mimetype: file.mimetype,
            url,
            objectPath: toObjectPath(url),
          };
        })
      );

      res.status(201).json({
        success: true,
        message: "Attachments uploaded successfully",
        data: { files: uploaded },
      });
    } catch (error) {
      next(error);
    }
  }
}
