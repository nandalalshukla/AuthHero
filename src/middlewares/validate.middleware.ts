import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";
import { AppErrorCode } from "../lib/AppError";
import { BAD_REQUEST } from "../config/http";

/**
 * Validation middleware factory.
 *
 * Validates req.body against the provided Zod schema.
 * On success, replaces req.body with the parsed (and potentially
 * transformed) data. On failure, returns a structured 400 response.
 *
 * For routes that also need query/params validation, use a nested schema:
 *   z.object({ body: z.object({...}), query: z.object({...}) })
 */
export const validate =
  (schema: ZodSchema, source: "body" | "nested" = "body") =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (source === "nested") {
        const result = (await schema.parseAsync({
          body: req.body,
          query: req.query,
          params: req.params,
        })) as Record<string, unknown>;

        if (result.body) req.body = result.body;
        if (result.query) req.query = result.query as Record<string, any>;
        if (result.params) req.params = result.params as Record<string, any>;
      } else {
        req.body = await schema.parseAsync(req.body);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(BAD_REQUEST).json({
          success: false,
          message: "Validation failed",
          errorCode: AppErrorCode.ValidationFailed,
          errors: error.flatten().fieldErrors,
        });
      }
      next(error);
    }
  };
