import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

interface RequestValidationSchema {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export const validate = (schema: RequestValidationSchema | ZodType) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if ("parseAsync" in schema && typeof schema.parseAsync === "function") {
        req.body = await schema.parseAsync(req.body);
        return next();
      }

      const compositeSchema = schema as RequestValidationSchema;

      if (compositeSchema.body) {
        req.body = await compositeSchema.body.parseAsync(req.body);
      }
      if (compositeSchema.query) {
        Object.defineProperty(req, "query", {
          value: await compositeSchema.query.parseAsync(req.query),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (compositeSchema.params) {
        req.params = (await compositeSchema.params.parseAsync(req.params)) as Request["params"];
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};


