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

export const updateUserSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  roles: z.array(z.nativeEnum(RoleCode)).min(1).optional(),
  moduleAccess: z.array(z.nativeEnum(ModuleCode)).min(1).optional(),
  status: z.enum(["ACTIVE", "DEACTIVATED"]).optional(),
});

export const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required.").max(200),
  workEmail: z.string().email("Enter a valid work email."),
  employeeCode: z.string().trim().min(1).max(50).optional(),
  jobTitle: z.string().trim().max(200).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  teamId: z.string().uuid().optional().nullable(),
});

export const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  jobTitle: z.string().trim().max(200).optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  teamId: z.string().uuid().optional().nullable(),
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
