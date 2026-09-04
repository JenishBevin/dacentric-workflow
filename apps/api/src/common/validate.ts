import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { Errors } from "./errors";

type Part = "body" | "query" | "params";

/**
 * Zod-based request validation middleware. This is the backend-enforced
 * validation layer — the frontend also validates with the same rules via
 * React Hook Form + Zod, but the API never trusts the client (Section 15,
 * Section 44).
 */
export function validate(schema: ZodSchema, part: Part = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        fieldErrors[issue.path.join(".") || "_"] = issue.message;
      }
      return next(Errors.validation("Please correct the highlighted fields.", fieldErrors));
    }
    (req as any)[`validated${part[0].toUpperCase()}${part.slice(1)}`] = result.data;
    next();
  };
}
