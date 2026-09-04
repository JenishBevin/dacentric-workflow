import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { generateSecureToken, hashPassword } from "../../lib/hash";
import { getEmailAdapter } from "../../lib/email";
import { invitationEmail } from "../../lib/email/templates";
import { env } from "../../lib/env";
import { writeAudit } from "../../common/audit";
import { AuditAction, AccountStatus, RoleCode, ModuleCode } from "@dacentric/types";
import { AuthedUser } from "../../middleware/authenticate";

export interface CreateUserInput {
  name: string;
  workEmail: string;
  employeeId?: string | null;
  roles: RoleCode[];
  moduleAccess: ModuleCode[];
  /** Admin-set alternative to the invite flow — see users.schemas.ts. */
  password?: string;
}

// Never let a User row reach an HTTP response un-narrowed — passwordHash,
// failedLoginAttempts and lockedUntil have no business leaving this service.
const SAFE_USER_SELECT = {
  id: true,
  name: true,
  workEmail: true,
  status: true,
  employeeId: true,
  moduleAccess: true,
  avatarStorageKey: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: { include: { role: true } },
  employee: true,
} as const;

async function sendInvite(userId: string, name: string, email: string, invitedById?: string) {
  const { raw, hash } = generateSecureToken();
  await prisma.invitation.create({
    data: {
      userId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + env.invitationTtlHours * 60 * 60 * 1000),
      invitedById,
    },
  });
  const activationUrl = `${env.webPublicUrl}/activate?token=${raw}`;
  await getEmailAdapter().send({ to: email, ...invitationEmail(name, activationUrl) });
}

export async function createUser(input: CreateUserInput, actor: AuthedUser) {
  if (input.roles.includes(RoleCode.SUPER_ADMIN) && !actor.roles.includes(RoleCode.SUPER_ADMIN)) {
    throw Errors.forbidden("Only a Super Admin can grant the Super Admin role.");
  }

  const existing = await prisma.user.findUnique({ where: { workEmail: input.workEmail.toLowerCase() } });
  if (existing) {
    throw Errors.conflict(
      `A user with this email already exists (status: ${existing.status}). Use "Resend invite" instead of creating a duplicate.`
    );
  }

  const roles = await prisma.role.findMany({ where: { code: { in: input.roles } } });
  if (roles.length !== input.roles.length) throw Errors.badRequest("One or more roles are invalid.");

  const passwordHash = input.password ? await hashPassword(input.password) : undefined;

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        workEmail: input.workEmail.toLowerCase(),
        employeeId: input.employeeId ?? null,
        moduleAccess: input.moduleAccess as any,
        // Admin-set password → account is usable immediately, no invite
        // needed. Otherwise the normal invite-and-activate flow.
        status: (passwordHash ? AccountStatus.ACTIVE : AccountStatus.PENDING_ACTIVATION) as any,
        passwordHash,
        createdById: actor.id,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      select: SAFE_USER_SELECT,
    });
    return created;
  });

  if (!passwordHash) {
    await sendInvite(user.id, user.name, user.workEmail, actor.id);
  }
  await writeAudit({
    actor,
    action: AuditAction.CREATE,
    entityType: "User",
    entityId: user.id,
    afterValue: { name: user.name, workEmail: user.workEmail, roles: input.roles, moduleAccess: input.moduleAccess, activatedDirectly: !!passwordHash },
  });

  return user;
}

export async function bulkImportUsers(
  rows: Array<CreateUserInput & { employeeCode?: string }>,
  actor: AuthedUser
) {
  const results: Array<{ email: string; status: "invited" | "skipped"; reason?: string }> = [];
  for (const row of rows) {
    const existing = await prisma.user.findUnique({ where: { workEmail: row.workEmail.toLowerCase() } });
    if (existing) {
      results.push({ email: row.workEmail, status: "skipped", reason: "Duplicate email" });
      continue;
    }
    let employeeId = row.employeeId ?? null;
    if (!employeeId && row.employeeCode) {
      const emp = await prisma.employee.findUnique({ where: { employeeCode: row.employeeCode } });
      employeeId = emp?.id ?? null;
    }
    await createUser({ ...row, employeeId }, actor);
    results.push({ email: row.workEmail, status: "invited" });
  }
  return results;
}

export async function resendInvite(userId: string, actor: AuthedUser) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound("User");
  if (user.status !== AccountStatus.PENDING_ACTIVATION) {
    throw Errors.badRequest("Only pending-activation accounts can be re-invited.");
  }
  await prisma.invitation.updateMany({ where: { userId, acceptedAt: null }, data: { expiresAt: new Date(0) } });
  await sendInvite(user.id, user.name, user.workEmail, actor.id);
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "User", entityId: user.id, field: "invitation", metadata: { resent: true } });
}

export async function listUsers(filters: { status?: string; search?: string }) {
  return prisma.user.findMany({
    where: {
      status: filters.status ? (filters.status as any) : undefined,
      OR: filters.search
        ? [
            { name: { contains: filters.search, mode: "insensitive" } },
            { workEmail: { contains: filters.search, mode: "insensitive" } },
          ]
        : undefined,
    },
    select: SAFE_USER_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

export async function updateUser(
  userId: string,
  input: { name?: string; roles?: RoleCode[]; moduleAccess?: ModuleCode[]; status?: "ACTIVE" | "DEACTIVATED" },
  actor: AuthedUser
) {
  const existing = await prisma.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
  if (!existing) throw Errors.notFound("User");

  // Super Admin is the only role that can edit another Super Admin's account,
  // or grant the Super Admin role to anyone — both reserved so System Admin
  // (or below) can never escalate itself or tamper with the top tier.
  const actorIsSuperAdmin = actor.roles.includes(RoleCode.SUPER_ADMIN);
  const targetIsSuperAdmin = existing.roles.some((r) => r.role.code === RoleCode.SUPER_ADMIN);
  if ((targetIsSuperAdmin || input.roles?.includes(RoleCode.SUPER_ADMIN)) && !actorIsSuperAdmin) {
    throw Errors.forbidden("Only a Super Admin can modify a Super Admin account or grant the Super Admin role.");
  }

  const data: any = {};
  if (input.name) data.name = input.name;
  if (input.moduleAccess) data.moduleAccess = input.moduleAccess;
  if (input.status) data.status = input.status;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) {
      await tx.user.update({ where: { id: userId }, data });
    }
    if (input.roles) {
      const roles = await tx.role.findMany({ where: { code: { in: input.roles } } });
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId, roleId: r.id })) });
    }
    if (input.status === "DEACTIVATED") {
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
  });

  await writeAudit({
    actor,
    action: input.status === "DEACTIVATED" ? AuditAction.DEACTIVATE : input.status === "ACTIVE" ? AuditAction.ACTIVATE : AuditAction.EDIT,
    entityType: "User",
    entityId: userId,
    beforeValue: { status: existing.status, roles: existing.roles.map((r) => r.roleId) },
    afterValue: input,
  });

  return prisma.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT });
}

// ---------------------------------------------------------------------------
// HRMS employee records. This build has no real external HRMS to sync from
// (Section 31 scopes that module out), so — unlike the rest of the app,
// which only ever reads Employee rows — these are the one place the app
// itself creates them, standing in for that sync.
// ---------------------------------------------------------------------------

export interface CreateEmployeeInput {
  fullName: string;
  workEmail: string;
  employeeCode?: string;
  jobTitle?: string;
  departmentId?: string | null;
  teamId?: string | null;
}

async function nextEmployeeCode(): Promise<string> {
  const count = await prisma.employee.count();
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `EMP-${String(count + 1 + attempt).padStart(4, "0")}`;
    const exists = await prisma.employee.findUnique({ where: { employeeCode: candidate } });
    if (!exists) return candidate;
  }
  // Astronomically unlikely fallback if 20 sequential codes are all somehow taken.
  return `EMP-${Date.now()}`;
}

export async function listAllEmployees(filters: { search?: string } = {}) {
  return prisma.employee.findMany({
    where: filters.search
      ? {
          OR: [
            { fullName: { contains: filters.search, mode: "insensitive" } },
            { workEmail: { contains: filters.search, mode: "insensitive" } },
            { employeeCode: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { department: true, team: true, user: { select: { id: true, name: true, status: true } } },
    orderBy: { fullName: "asc" },
  });
}

export async function createEmployee(input: CreateEmployeeInput, actor: AuthedUser) {
  const existing = await prisma.employee.findUnique({ where: { workEmail: input.workEmail.toLowerCase() } });
  if (existing) throw Errors.conflict("An employee with this work email already exists.");

  if (input.employeeCode) {
    const codeTaken = await prisma.employee.findUnique({ where: { employeeCode: input.employeeCode } });
    if (codeTaken) throw Errors.conflict("That employee code is already in use.");
  }

  const employee = await prisma.employee.create({
    data: {
      employeeCode: input.employeeCode ?? (await nextEmployeeCode()),
      fullName: input.fullName,
      workEmail: input.workEmail.toLowerCase(),
      jobTitle: input.jobTitle || null,
      departmentId: input.departmentId || null,
      teamId: input.teamId || null,
    },
    include: { department: true, team: true },
  });

  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "Employee", entityId: employee.id, afterValue: { fullName: employee.fullName, workEmail: employee.workEmail } });
  return employee;
}

export async function updateEmployee(
  employeeId: string,
  input: { fullName?: string; jobTitle?: string | null; departmentId?: string | null; teamId?: string | null; isActive?: boolean },
  actor: AuthedUser
) {
  const existing = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!existing) throw Errors.notFound("Employee");

  const employee = await prisma.employee.update({
    where: { id: employeeId },
    data: input,
    include: { department: true, team: true },
  });

  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Employee", entityId: employeeId, beforeValue: existing, afterValue: input });
  return employee;
}

export async function createDepartment(name: string, actor: AuthedUser) {
  const existing = await prisma.department.findUnique({ where: { name } });
  if (existing) throw Errors.conflict("A department with this name already exists.");
  const department = await prisma.department.create({ data: { name } });
  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "Department", entityId: department.id, afterValue: { name } });
  return department;
}

export async function createTeam(input: { name: string; departmentId?: string | null; managerId?: string | null }, actor: AuthedUser) {
  const team = await prisma.team.create({ data: { name: input.name, departmentId: input.departmentId || null, managerId: input.managerId || null } });
  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "Team", entityId: team.id, afterValue: input });
  return team;
}
