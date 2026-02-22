import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";

/**
 * Validation middleware factory.
 *
 * Supports two schema shapes:
 * 1. Flat schema: validates only req.body (most common for POST endpoints)
 *    e.g. z.object({ email: z.string(), password: z.string() })
 *
 * 2. Nested schema: validates body, query, and/or params together
 *    e.g. z.object({ params: z.object({...}), query: z.object({...}), body: z.object({...}) })
 *
 * The middleware auto-detects which shape you pass based on whether the schema
 * has a "body", "query", or "params" key.
 */
export const validate =
  (schema: ZodSchema) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Try parsing as nested { body, query, params } first
      const result = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // If the schema had body/query/params keys, apply them back
      if (result.body) req.body = result.body;
      if (result.query) req.query = result.query;
      if (result.params) req.params = result.params;

      next();
    } catch (outerError) {
      // If nested parsing failed, try flat (body-only) parsing
      try {
        req.body = await schema.parseAsync(req.body);
        next();
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: error.flatten().fieldErrors,
          });
        }
        next(error);
      }
    }
  };
