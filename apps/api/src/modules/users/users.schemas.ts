import { z } from "zod";
import { RoleCode, ModuleCode } from "@dacentric/types";
import { passwordSchema } from "../../common/passwordSchema";

export const createUserSchema = z.object({
  name: z.string().min(1, "Name is required.").max(150),
  workEmail: z.string().email("Enter a valid work email."),
  employeeId: z.string().uuid().optional().nullable(),
  roles: z.array(z.nativeEnum(RoleCode)).min(1, "Select at least one role."),
  moduleAccess: z.array(z.nativeEnum(ModuleCode)).min(1, "Select at least one module."),
  // When set, the account is created ACTIVE with this password and no
  // invitation email goes out — an admin-set alternative to the invite
  // flow, e.g. for a demo/self-hosted deployment with no SMTP wired up.
  password: passwordSchema.optional(),
});

export const bulkImportRowSchema = z.object({
  name: z.string().min(1),
  workEmail: z.string().email(),
  employeeCode: z.string().optional(),
  roles: z.array(z.nativeEnum(RoleCode)).min(1),
  moduleAccess: z.array(z.nativeEnum(ModuleCode)).min(1),
});

export const bulkImportSchema = z.object({
  users: z.array(bulkImportRowSchema).min(1),
});

export const adminActivateUserSchema = z.object({
  password: passwordSchema,
});

// Deliberately NOT passwordSchema here — one weak password must fail just
// that account (surfaced per-item by bulkAdminActivateUsers below), not
// reject the whole batch before any of it reaches the service layer. The
// real complexity check happens per-item, via passwordSchema, in
// adminActivateUser() itself.
export const bulkAdminActivateSchema = z.object({
  activations: z.array(z.object({ userId: z.string().uuid(), password: z.string().min(1, "Password is required.") })).min(1, "Select at least one account."),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  // Changing another user's sign-in email is Super Admin only — enforced in
  // users.service.ts#updateUser, not just by this schema.
  workEmail: z.string().email("Enter a valid work email.").optional(),
  roles: z.array(z.nativeEnum(RoleCode)).min(1).optional(),
  moduleAccess: z.array(z.nativeEnum(ModuleCode)).min(1).optional(),
  status: z.enum(["ACTIVE", "DEACTIVATED"]).optional(),
  // Links (or, with null, unlinks) an HRMS employee record after the user
  // already exists — e.g. a bulk-imported account whose employeeCode didn't
  // exist in HRMS yet at import time. The DB's unique constraint on
  // User.employeeId rejects linking an employee already claimed by someone else.
  employeeId: z.string().uuid().optional().nullable(),
});

export const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required.").max(200),
  workEmail: z.string().email("Enter a valid work email."),
  employeeCode: z.string().trim().min(1).max(50).optional(),
  jobTitle: z.string().trim().max(200).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  teamIds: z.array(z.string().uuid()).optional(),
});

export const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  // Changing an existing employee's code or work email is Super Admin
  // only — enforced in users.service.ts#updateEmployee, not just by this
  // schema, same tier as changing a User's sign-in email.
  employeeCode: z.string().trim().min(1).max(50).optional(),
  workEmail: z.string().trim().email("Enter a valid work email.").optional(),
  jobTitle: z.string().trim().max(200).optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  teamIds: z.array(z.string().uuid()).optional(),
  isActive: z.boolean().optional(),
});

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
});

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  departmentId: z.string().uuid().optional().nullable(),
  managerId: z.string().uuid().optional().nullable(),
});
