export class AppError extends Error {
  status: number;
  code: string;
  fieldErrors?: Record<string, string>;

  constructor(status: number, code: string, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const Errors = {
  unauthorized: (message = "You must be signed in to do that.") =>
    new AppError(401, "UNAUTHORIZED", message),
  forbidden: (message = "You do not have permission to do that.") =>
    new AppError(403, "FORBIDDEN", message),
  notFound: (entity: string, message?: string) =>
    new AppError(404, "NOT_FOUND", message ?? `${entity} not found.`),
  conflict: (message: string) => new AppError(409, "CONFLICT", message),
  validation: (message: string, fieldErrors?: Record<string, string>) =>
    new AppError(422, "VALIDATION_ERROR", message, fieldErrors),
  badRequest: (message: string) => new AppError(400, "BAD_REQUEST", message),
  locked: (message: string) => new AppError(423, "ACCOUNT_LOCKED", message),
  tooManyRequests: (message = "Too many requests. Please try again shortly.") =>
    new AppError(429, "RATE_LIMITED", message),
};
