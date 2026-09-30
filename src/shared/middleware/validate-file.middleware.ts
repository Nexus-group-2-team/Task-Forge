import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { BadRequestError } from "../errors/app-error.js";

interface UploadedFileLike {
  size: number;
  mimetype: string;
}

export const validateUploadedFile =
  (schema: ZodType, options: { multiple?: boolean } = {}) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const files = options.multiple
      ? (req.files as Express.Multer.File[] | undefined)
      : req.file
        ? [req.file]
        : undefined;

    if (!files || files.length === 0) {
      next(
        new BadRequestError(
          "File is required. Please attach the file in multipart/form-data."
        )
      );
      return;
    }

    for (const file of files) {
      const result = schema.safeParse({
        size: (file as UploadedFileLike).size,
        mimetype: (file as UploadedFileLike).mimetype,
      } satisfies UploadedFileLike);

      if (!result.success) {
        next(
          new BadRequestError(
            `File validation failed for '${(file as Express.Multer.File).originalname}'`,
            result.error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            }))
          )
        );
        return;
      }
    }

    next();
  };
