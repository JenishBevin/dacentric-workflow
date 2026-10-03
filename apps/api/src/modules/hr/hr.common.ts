import { Request, Response, NextFunction } from "express";
import { ModuleCode, PermissionKey, RoleCode } from "@dacentric/types";
import { AuthedUser } from "../../middleware/authenticate";
import { getPermissionScope } from "../../common/permissions";
import { Errors } from "../../common/errors";
import { prisma } from "../../lib/prisma";

/** HR staff, admins, or anyone granted company-wide Manage Users — and only with HRMS module access. */
export function canManageHr(user: AuthedUser): boolean {
  if (!user.moduleAccess.includes(ModuleCode.HRMS)) return false;
  if (user.roles.some((r) => r === RoleCode.HR || r === RoleCode.SYSTEM_ADMIN || r === RoleCode.SUPER_ADMIN)) return true;
  return getPermissionScope(user.permissions, PermissionKey.MANAGE_USERS) === "ALL";
}

export function requireHrManage(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !canManageHr(req.user)) {
    return next(Errors.forbidden("You need HR access to do that."));
  }
  next();
}

// Day/month boundaries are UAE time (UTC+4, no DST), matching workTime.service.ts.
export const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function parseMonth(month: string): { start: Date; end: Date; year: number; monthIndex: number; daysInMonth: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw Errors.badRequest("Month must be in YYYY-MM format.");
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw Errors.badRequest("Month must be in YYYY-MM format.");
  const start = new Date(Date.UTC(year, monthIndex, 1) - UAE_OFFSET_MS);
  const end = new Date(Date.UTC(year, monthIndex + 1, 1) - UAE_OFFSET_MS);
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  return { start, end, year, monthIndex, daysInMonth };
}

export function currentMonthKey(now = new Date()): string {
  const w = new Date(now.getTime() + UAE_OFFSET_MS);
  return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function uaeDateKey(d: Date): string {
  const w = new Date(d.getTime() + UAE_OFFSET_MS);
  return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, "0")}-${String(w.getUTCDate()).padStart(2, "0")}`;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** e.g. OL/2026/0007 — yearly counter per prefix, derived from existing rows. */
export async function nextRefNo(prefix: string, source: "letter" | "offer"): Promise<string> {
  const year = new Date().getFullYear();
  const like = `${prefix}/${year}/`;
  const count =
    source === "letter"
      ? await prisma.hrLetter.count({ where: { refNo: { startsWith: like } } })
      : await prisma.candidate.count({ where: { offerRefNo: { startsWith: like } } });
  for (let i = 1; i <= 50; i++) {
    const candidate = `${like}${String(count + i).padStart(4, "0")}`;
    const taken =
      source === "letter"
        ? await prisma.hrLetter.findFirst({ where: { refNo: candidate }, select: { id: true } })
        : await prisma.candidate.findFirst({ where: { offerRefNo: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${like}${Date.now()}`;
}
