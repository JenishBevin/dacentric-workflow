import { PrismaClient } from "@prisma/client";
import { RoleCode, ModuleCode, PermissionKey } from "@dacentric/types";
import { DEFAULT_ROLE_PERMISSIONS } from "../../common/permissions";

const ROLE_NAMES: Record<RoleCode, string> = {
  [RoleCode.SUPER_ADMIN]: "Super Admin",
  [RoleCode.SYSTEM_ADMIN]: "System Admin",
  [RoleCode.CEO_DIRECTOR]: "CEO / Director",
  [RoleCode.MANAGER]: "Manager",
  [RoleCode.HR]: "HR",
  [RoleCode.TEAM_LEAD]: "Team Lead",
  [RoleCode.TEAM_MEMBER]: "Team Member",
  [RoleCode.ACCOUNTANT]: "Accountant",
};

const ROLE_DESCRIPTIONS: Record<RoleCode, string> = {
  [RoleCode.SUPER_ADMIN]: "Unrestricted control across every module, including the role/permission matrix and other admin accounts.",
  [RoleCode.SYSTEM_ADMIN]: "Full operational control across every module. Cannot edit the role/permission matrix or a Super Admin's account.",
  [RoleCode.CEO_DIRECTOR]: "Executive oversight: full visibility, approval, and export rights without board/task configuration authority.",
  [RoleCode.MANAGER]: "Creates and configures boards, assigns and approves tasks for their team.",
  [RoleCode.HR]: "Org-wide visibility into employee workload and time logs.",
  [RoleCode.TEAM_LEAD]: "Manages and approves their team's day-to-day tasks.",
  [RoleCode.TEAM_MEMBER]: "Does the work: moves tasks, ticks checklists, comments, attaches files.",
  [RoleCode.ACCOUNTANT]: "Org-wide time-log and export access for payroll, billing, and financial reporting.",
};

/**
 * Idempotently ensures the seven platform roles and their default Section-5
 * permission matrix exist. Shared by prisma/seed.ts and the API test suite
 * so tests never depend on the demo seed having been run first.
 */
export async function ensureRolesAndPermissions(prisma: PrismaClient) {
  for (const code of Object.values(RoleCode)) {
    const role = await prisma.role.upsert({
      where: { code },
      create: { code, name: ROLE_NAMES[code], description: ROLE_DESCRIPTIONS[code] },
      update: {},
    });

    const perms = DEFAULT_ROLE_PERMISSIONS[code] ?? {};
    for (const [permission, scope] of Object.entries(perms)) {
      await prisma.rolePermission.upsert({
        where: { roleId_module_permission: { roleId: role.id, module: ModuleCode.WORKFLOW, permission: permission as PermissionKey } },
        create: { roleId: role.id, module: ModuleCode.WORKFLOW, permission: permission as PermissionKey, scope: scope as any },
        update: { scope: scope as any },
      });
    }
  }
}
