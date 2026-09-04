import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { Errors } from "../common/errors";
import { computeEffectivePermissions, EffectivePermissions } from "../common/permissions";
import { RoleCode, AccountStatus, ModuleCode } from "@dacentric/types";

export interface AuthedUser {
  id: string;
  name: string;
  workEmail: string;
  status: AccountStatus;
  roles: RoleCode[];
  moduleAccess: ModuleCode[];
  permissions: EffectivePermissions;
  employeeId: string | null;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.accessToken;
    if (!token) return next(Errors.unauthorized());

    const payload = verifyAccessToken(token);

    const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });
    if (!session || session.revokedAt) return next(Errors.unauthorized("Your session has ended. Please sign in again."));

    const idleLimitMs = 1000 * 60 * 60 * 24; // hard ceiling; idle timeout enforced at login/refresh layer too
    if (Date.now() - session.lastActiveAt.getTime() > idleLimitMs) {
      return next(Errors.unauthorized("Your session has expired due to inactivity."));
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: { include: { role: { include: { rolePermissions: true } } } },
      },
    });

    if (!user) return next(Errors.unauthorized());
    if (user.status === AccountStatus.DEACTIVATED) {
      return next(Errors.forbidden("This account has been deactivated. Contact your administrator."));
    }
    if (user.status === AccountStatus.LOCKED) {
      return next(Errors.locked("This account is temporarily locked. Try again later."));
    }

    const permissionRows = user.roles.flatMap((ur) =>
      ur.role.rolePermissions.map((rp) => ({
        module: rp.module as ModuleCode,
        permission: rp.permission as any,
        scope: rp.scope as any,
      }))
    );

    req.user = {
      id: user.id,
      name: user.name,
      workEmail: user.workEmail,
      status: user.status as AccountStatus,
      roles: user.roles.map((ur) => ur.role.code as RoleCode),
      moduleAccess: user.moduleAccess as ModuleCode[],
      permissions: computeEffectivePermissions(permissionRows),
      employeeId: user.employeeId,
      sessionId: session.id,
    };

    prisma.session.update({ where: { id: session.id }, data: { lastActiveAt: new Date() } }).catch(() => undefined);

    next();
  } catch (err) {
    next(Errors.unauthorized("Your session is invalid or has expired."));
  }
}

/** Use on routes that work whether or not the caller is authenticated. */
export async function optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header && !req.cookies?.accessToken) return next();
  return authenticate(req, res, next);
}
