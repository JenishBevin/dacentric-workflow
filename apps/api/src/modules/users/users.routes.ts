import { Router } from "express";
import { asyncHandler, ok, created, parsePagination } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import {
  createUserSchema,
  bulkImportSchema,
  updateUserSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  createDepartmentSchema,
  createTeamSchema,
} from "./users.schemas";
import * as usersService from "./users.service";
import { prisma } from "../../lib/prisma";
import { PermissionKey, ModuleCode } from "@dacentric/types";
import { Errors } from "../../common/errors";

export const usersRouter = Router();
usersRouter.use(authenticate);

// Viewing the Employee directory only needs the HRMS module grant (like ERP's
// own module-only gate); creating/editing/deactivating an employee still
// requires Manage Users: All (see the routes below), since that permission
// also controls logins, not just this read-only listing.
function requireModuleAccess(module: ModuleCode) {
  return (req: any, _res: any, next: any) => {
    if (!req.user?.moduleAccess.includes(module)) {
      return next(Errors.forbidden(`You need ${module} module access to do that.`));
    }
    next();
  };
}

usersRouter.get(
  "/",
  requirePermission(PermissionKey.MANAGE_USERS, "ALL"),
  asyncHandler(async (req, res) => {
    const { status, search } = req.query as Record<string, string>;
    const users = await usersService.listUsers({ status, search });
    return ok(res, users);
  })
);

usersRouter.get(
  "/employees",
  asyncHandler(async (req, res) => {
    // Used by the assignee/watcher/approver directory pickers — only active
    // employees with Workflow access are ever offered (Section 15/17).
    const search = (req.query.search as string) ?? "";
    const employees = await prisma.employee.findMany({
      where: {
        isActive: true,
        user: { status: "ACTIVE", moduleAccess: { has: "WORKFLOW" } },
        OR: search
          ? [
              { fullName: { contains: search, mode: "insensitive" } },
              { workEmail: { contains: search, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: { user: true, department: true, teams: true },
      take: 50,
      orderBy: { fullName: "asc" },
    });
    return ok(
      res,
      employees.map((e) => ({
        employeeId: e.id,
        userId: e.user!.id,
        name: e.fullName,
        email: e.workEmail,
        jobTitle: e.jobTitle,
        department: e.department?.name ?? null,
        team: e.teams.map((t) => t.name).join(", ") || null,
      }))
    );
  })
);

usersRouter.get(
  "/employees/unlinked",
  requirePermission(PermissionKey.MANAGE_USERS, "ALL"),
  asyncHandler(async (req, res) => {
    // Employees not yet associated with a platform account — used by the
    // "New User" form's optional HRMS Employee Link field (Section 6).
    const search = (req.query.search as string) ?? "";
    const employees = await prisma.employee.findMany({
      where: {
        user: { is: null },
        OR: search
          ? [
              { fullName: { contains: search, mode: "insensitive" } },
              { workEmail: { contains: search, mode: "insensitive" } },
              { employeeCode: { contains: search, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: { department: true },
      take: 30,
      orderBy: { fullName: "asc" },
    });
    return ok(
      res,
      employees.map((e) => ({ id: e.id, name: e.fullName, email: e.workEmail, employeeCode: e.employeeCode, department: e.department?.name ?? null }))
    );
  })
);

// --- Employees (HRMS records) — admin management, since there's no real
// external HRMS in this build to sync them in from (Section 31). ---
usersRouter.get(
  "/employees/all",
  requireModuleAccess(ModuleCode.HRMS),
  asyncHandler(async (req, res) => {
    const search = req.query.search as string | undefined;
    return ok(res, await usersService.listAllEmployees({ search }));
  })
);

usersRouter.post(
  "/employees",
  requirePermission(PermissionKey.MANAGE_USERS, "ALL"),
  validate(createEmployeeSchema),
  asyncHandler(async (req, res) => created(res, await usersService.createEmployee((req as any).validatedBody, req.user!)))
);

usersRouter.patch(
  "/employees/:id",
  requirePermission(PermissionKey.MANAGE_USERS, "ALL"),
  validate(updateEmployeeSchema),
  asyncHandler(async (req, res) => ok(res, await usersService.updateEmployee(req.params.id, (req as any).validatedBody, req.user!)))
);

usersRouter.delete(
  "/employees/:id",
  requirePermission(PermissionKey.MANAGE_USERS, "ALL"),
  asyncHandler(async (req, res) => {
    await usersService.deleteEmployee(req.params.id, req.user!);
    return ok(res, { success: true });
  })
);

// --- Departments / Teams — used by Team Workload's filter controls (Section 30) ---
usersRouter.get(
  "/departments",
  asyncHandler(async (_req, res) => {
    const departments = await prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
    return ok(res, departments);
  })
);

usersRouter.post(
  "/departments",
  requirePermission(PermissionKey.MANAGE_USERS, "ALL"),
  validate(createDepartmentSchema),
  asyncHandler(async (req, res) => created(res, await usersService.createDepartment((req as any).validatedBody.name, req.user!)))
);

usersRouter.get(
  "/teams",
  asyncHandler(async (req, res) => {
    const departmentId = req.query.departmentId as string | undefined;
    const teams = await prisma.team.findMany({
      where: departmentId ? { departmentId } : undefined,
      orderBy: { name: "asc" },
      select: { id: true, name: true, departmentId: true },
    });
    return ok(res, teams);
  })
);

usersRouter.post(
  "/teams",
  requirePermission(PermissionKey.MANAGE_USERS, "ALL"),
  validate(createTeamSchema),
  asyncHandler(async (req, res) => created(res, await usersService.createTeam((req as any).validatedBody, req.user!)))
);

usersRouter.post(
  "/",
  requirePermission(PermissionKey.MANAGE_USERS, "ALL"),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const user = await usersService.createUser((req as any).validatedBody, req.user!);
    return created(res, user);
  })
);

usersRouter.post(
  "/bulk-import",
  requirePermission(PermissionKey.MANAGE_USERS, "ALL"),
  validate(bulkImportSchema),
  asyncHandler(async (req, res) => {
    const results = await usersService.bulkImportUsers((req as any).validatedBody.users, req.user!);
    return ok(res, results);
  })
);

usersRouter.post(
  "/:id/resend-invite",
  requirePermission(PermissionKey.MANAGE_USERS, "ALL"),
  asyncHandler(async (req, res) => {
    await usersService.resendInvite(req.params.id, req.user!);
    return ok(res, { message: "Invitation resent." });
  })
);

usersRouter.patch(
  "/:id",
  requirePermission(PermissionKey.MANAGE_USERS, "ALL"),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const user = await usersService.updateUser(req.params.id, (req as any).validatedBody, req.user!);
    return ok(res, user);
  })
);

// Permanent, irreversible delete — Super Admin only, enforced in
// users.service.ts#deleteUserPermanently regardless of this route's own
// (broader) permission gate.
usersRouter.delete(
  "/:id",
  requirePermission(PermissionKey.MANAGE_USERS, "ALL"),
  asyncHandler(async (req, res) => {
    const result = await usersService.deleteUserPermanently(req.params.id, req.user!);
    return ok(res, result);
  })
);
