import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

export const validate = (schema: {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        req.query = (await schema.query.parseAsync(req.query)) as typeof req.query;
      }
      if (schema.params) {
        req.params = (await schema.params.parseAsync(req.params)) as typeof req.params;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
