import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";

export const validate =
  (schema: ZodSchema) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // parseAsync is still preferred for future-proofing
      const validatedData = await schema.parseAsync(req.body);

      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation failed",
          errors: error.flatten().fieldErrors,
        });
      }

      // Sends unexpected errors to Express's global error handler
      next(error);
    }
  };
