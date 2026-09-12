import { PrismaClient } from "@prisma/client";
import { RoleCode, ModuleCode, PermissionKey } from "@dacentric/types";
import { DEFAULT_ROLE_PERMISSIONS } from "../../common/permissions";

const ROLE_NAMES: Record<RoleCode, string> = {
  [RoleCode.SUPER_ADMIN]: "Super Admin",
  [RoleCode.SYSTEM_ADMIN]: "System Admin",
  [RoleCode.MANAGEMENT]: "Management",
  [RoleCode.PROJECT_MANAGER]: "Manager",
  [RoleCode.HR]: "HR",
  [RoleCode.ACCOUNTS]: "Accounts",
  [RoleCode.ESTIMATION]: "Estimation",
  [RoleCode.SALES]: "Sales",
  [RoleCode.PROCUREMENT]: "Procurement",
  [RoleCode.STAFF]: "Staff",
  [RoleCode.PROJECT_SALES_COORDINATOR]: "Project and Sales Coordinator",
};

const ROLE_DESCRIPTIONS: Record<RoleCode, string> = {
  [RoleCode.SUPER_ADMIN]: "Unrestricted control across every module, including the role/permission matrix and other admin accounts.",
  [RoleCode.SYSTEM_ADMIN]: "Full operational control across every module. Cannot edit the role/permission matrix or a Super Admin's account.",
  [RoleCode.MANAGEMENT]: "Executive oversight: full visibility, approval, and export rights without board/task configuration authority.",
  [RoleCode.PROJECT_MANAGER]: "Creates and configures boards, assigns and approves tasks for their team.",
  [RoleCode.HR]: "Same project/task authority as Manager, plus org-wide visibility into employee workload and time logs.",
  [RoleCode.ACCOUNTS]: "Same project/task authority as HR/Manager, plus org-wide visibility for payroll, billing, and financial reporting.",
  [RoleCode.ESTIMATION]: "Prepares cost and time estimates on their own tasks and exports them.",
  [RoleCode.SALES]: "Works their own tasks and links them to CRM customer/lead records.",
  [RoleCode.PROCUREMENT]: "Works their own tasks and links them to ERP purchase-order/vendor records.",
  [RoleCode.STAFF]: "Front-line staff — no Workflow access, can only apply for and track their own leave.",
  [RoleCode.PROJECT_SALES_COORDINATOR]: "Same project/task authority as Manager, plus org-wide CRM linking to coordinate delivery on deals sales has brought in.",
};

/**
 * Idempotently ensures the ten platform roles and their default Section-5
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
