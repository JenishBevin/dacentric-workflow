import { Request, Response, NextFunction } from "express";
import { Errors } from "../common/errors";
import { getPermissionScope, scopeAtLeast } from "../common/permissions";
import { PermissionKey, PermissionScope, ModuleCode } from "@dacentric/types";

/**
 * Route-level RBAC gate. Requires the caller's effective permission for
 * `permission` to be at least `minScope`. This is enforcement layer #2
 * (route) of the four required by Section 35 — UI, route, API (this file is
 * shared by every API route), and service/business-logic (each service also
 * re-checks scope against the specific resource; see e.g. boards.service.ts
 * assertBoardAccess).
 */
export function requirePermission(permission: PermissionKey, minScope: PermissionScope = "OWN", module: ModuleCode = ModuleCode.WORKFLOW) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Errors.unauthorized());
    const scope = getPermissionScope(req.user.permissions, permission, module);
    if (!scopeAtLeast(scope, minScope)) {
      return next(Errors.forbidden("You do not have permission to perform this action."));
    }
    next();
  };
}

export function requireAnyRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Errors.unauthorized());
    if (!roles.some((r) => req.user!.roles.includes(r as any))) {
      return next(Errors.forbidden());
    }
    next();
  };
}
