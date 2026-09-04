import { Request, Response, NextFunction } from "express";
import { AppError } from "../common/errors";
import { env } from "../lib/env";

/**
 * Central error handler — Section 44: professional error handling, no stack
 * traces leaked in production, consistent { error: { code, message } } shape
 * for every failure across the API.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, fieldErrors: err.fieldErrors },
    });
  }

  // Prisma "record not found" style errors, JSON parse errors, etc.
  const anyErr = err as any;
  if (anyErr?.code === "P2025") {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "The requested resource was not found." } });
  }
  if (anyErr?.code === "P2002") {
    return res.status(409).json({ error: { code: "CONFLICT", message: "A record with these details already exists." } });
  }

  // eslint-disable-next-line no-console
  console.error("[unhandled error]", err);

  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong on our side. Please try again.",
      ...(env.isProd ? {} : { debug: String(anyErr?.message ?? err) }),
    },
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "This endpoint does not exist." } });
}
