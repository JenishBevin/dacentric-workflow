import { PermissionKey, RoleCode, PermissionScope, ModuleCode } from "@dacentric/types";

/**
 * Default RBAC matrix — Section 5 of the requirements document, transcribed
 * permission-by-permission, role-by-role. This is the seed data loaded into
 * role_permissions at first run; System Administrators can subsequently
 * change it from Settings -> Roles & Permissions (which edits the same
 * table), so this constant is the *default*, not a hard-coded ceiling.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleCode, Partial<Record<PermissionKey, PermissionScope>>> = {
  // Outranks System Admin: the only role that can manage the role/permission
  // matrix itself, or edit another Super Admin's account (the latter is
  // enforced in code, not by scope — see users.service.ts).
  [RoleCode.SUPER_ADMIN]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "ALL",
    [PermissionKey.CREATE_BOARD]: "ALL",
    [PermissionKey.EDIT_BOARD]: "ALL",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "ALL",
    [PermissionKey.CONFIGURE_STAGES]: "ALL",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "ALL",
    [PermissionKey.CREATE_TASK]: "ALL",
    [PermissionKey.EDIT_TASK]: "ALL",
    [PermissionKey.DELETE_TASK]: "ALL",
    [PermissionKey.ASSIGN_TASK]: "ALL",
    [PermissionKey.MOVE_TASK]: "ALL",
    [PermissionKey.MANAGE_TASK_COLLAB]: "ALL",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "ALL",
    [PermissionKey.APPROVE_TASK]: "ALL",
    [PermissionKey.CRM_ERP_LINKING]: "ALL",
    [PermissionKey.EXPORT]: "ALL",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "ALL",
    [PermissionKey.MANAGE_ROLES]: "ALL",
    [PermissionKey.MANAGE_USERS]: "ALL",
    [PermissionKey.VIEW_TIME_LOGS]: "ALL",
    [PermissionKey.MANAGE_TICKETS]: "ALL",
  },
  // Full day-to-day operational control, but cannot touch the role/permission
  // matrix or edit a Super Admin's account (both reserved for Super Admin).
  [RoleCode.SYSTEM_ADMIN]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "ALL",
    [PermissionKey.CREATE_BOARD]: "ALL",
    [PermissionKey.EDIT_BOARD]: "ALL",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "ALL",
    [PermissionKey.CONFIGURE_STAGES]: "ALL",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "ALL",
    [PermissionKey.CREATE_TASK]: "ALL",
    [PermissionKey.EDIT_TASK]: "ALL",
    [PermissionKey.DELETE_TASK]: "ALL",
    [PermissionKey.ASSIGN_TASK]: "ALL",
    [PermissionKey.MOVE_TASK]: "ALL",
    [PermissionKey.MANAGE_TASK_COLLAB]: "ALL",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "ALL",
    [PermissionKey.APPROVE_TASK]: "ALL",
    [PermissionKey.CRM_ERP_LINKING]: "ALL",
    [PermissionKey.EXPORT]: "ALL",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "ALL",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "ALL",
    [PermissionKey.VIEW_TIME_LOGS]: "ALL",
    [PermissionKey.MANAGE_TICKETS]: "ALL",
  },
  // Executive oversight: sees and approves everything, doesn't configure
  // boards or manage accounts. Not in the time-logs report audience per the
  // explicit role list given for that feature.
  [RoleCode.MANAGEMENT]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "ALL",
    [PermissionKey.CREATE_BOARD]: "NONE",
    [PermissionKey.EDIT_BOARD]: "NONE",
    // Mark Complete / Archive / Delete Project and Save-as-Template are all
    // gated by this one permission (assertIsBoardOwnerOrAdmin) — Management
    // otherwise had no way to close out a project themselves, even with
    // full org-wide visibility into it everywhere else.
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "ALL",
    [PermissionKey.CONFIGURE_STAGES]: "NONE",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "NONE",
    [PermissionKey.CREATE_TASK]: "NONE",
    [PermissionKey.EDIT_TASK]: "NONE",
    [PermissionKey.DELETE_TASK]: "NONE",
    [PermissionKey.ASSIGN_TASK]: "NONE",
    [PermissionKey.MOVE_TASK]: "NONE",
    [PermissionKey.MANAGE_TASK_COLLAB]: "NONE",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "ALL",
    [PermissionKey.APPROVE_TASK]: "ALL",
    // Can create/import Customer Master records now that every role has
    // been granted the CRM module — module access alone was letting them
    // view Customers with no way to add to it.
    [PermissionKey.CRM_ERP_LINKING]: "OWN",
    [PermissionKey.EXPORT]: "ALL",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "ALL",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "NONE",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // People-ops: same board-creating/team-managing Workflow authority as
  // Proj.Manager (create/edit boards, create/assign/move tasks), plus HR's
  // own broader org-wide workload/time visibility (kept at ALL, not
  // downgraded to TEAM).
  [RoleCode.HR]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "TEAM",
    [PermissionKey.CREATE_BOARD]: "ALL",
    [PermissionKey.EDIT_BOARD]: "OWN",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "OWN",
    [PermissionKey.CONFIGURE_STAGES]: "OWN",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "OWN",
    [PermissionKey.CREATE_TASK]: "ALL",
    [PermissionKey.EDIT_TASK]: "OWN",
    [PermissionKey.DELETE_TASK]: "OWN",
    [PermissionKey.ASSIGN_TASK]: "ALL",
    [PermissionKey.MOVE_TASK]: "ALL",
    [PermissionKey.MANAGE_TASK_COLLAB]: "ALL",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "ALL",
    [PermissionKey.APPROVE_TASK]: "OWN",
    [PermissionKey.CRM_ERP_LINKING]: "OWN",
    [PermissionKey.EXPORT]: "TEAM",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "OWN",
    [PermissionKey.VIEW_TIME_LOGS]: "ALL",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Finance: same operational Workflow authority as HR/Proj.Manager
  // (create/edit boards, create/assign/move tasks) so their menus and
  // features work the same as every other operational role, plus org-wide
  // visibility (VIEW_WORKFLOW/VIEW_TEAM_WORKLOAD at ALL, not TEAM) since
  // Accounts isn't a member of any board/team but still needs to see every
  // project for payroll/billing/reporting. A Super Admin can narrow any of
  // this per-permission from Settings -> Roles & Permissions.
  [RoleCode.ACCOUNTS]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "ALL",
    [PermissionKey.CREATE_BOARD]: "ALL",
    [PermissionKey.EDIT_BOARD]: "OWN",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "OWN",
    [PermissionKey.CONFIGURE_STAGES]: "OWN",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "OWN",
    [PermissionKey.CREATE_TASK]: "ALL",
    [PermissionKey.EDIT_TASK]: "OWN",
    [PermissionKey.DELETE_TASK]: "OWN",
    [PermissionKey.ASSIGN_TASK]: "ALL",
    [PermissionKey.MOVE_TASK]: "ALL",
    [PermissionKey.MANAGE_TASK_COLLAB]: "ALL",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "ALL",
    [PermissionKey.APPROVE_TASK]: "OWN",
    [PermissionKey.CRM_ERP_LINKING]: "OWN",
    [PermissionKey.EXPORT]: "ALL",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "OWN",
    [PermissionKey.VIEW_TIME_LOGS]: "ALL",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Admin and Finance — same permission matrix as Accounts (see above),
  // per an explicit request to align this role with Accounts' authority
  // and visibility rather than the cost-estimation-only defaults it used
  // to carry under its old "Estimation" label.
  [RoleCode.ESTIMATION]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "ALL",
    [PermissionKey.CREATE_BOARD]: "ALL",
    [PermissionKey.EDIT_BOARD]: "OWN",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "OWN",
    [PermissionKey.CONFIGURE_STAGES]: "OWN",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "OWN",
    [PermissionKey.CREATE_TASK]: "ALL",
    [PermissionKey.EDIT_TASK]: "OWN",
    [PermissionKey.DELETE_TASK]: "OWN",
    [PermissionKey.ASSIGN_TASK]: "ALL",
    [PermissionKey.MOVE_TASK]: "ALL",
    [PermissionKey.MANAGE_TASK_COLLAB]: "ALL",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "ALL",
    [PermissionKey.APPROVE_TASK]: "OWN",
    [PermissionKey.CRM_ERP_LINKING]: "OWN",
    [PermissionKey.EXPORT]: "ALL",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "OWN",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "ALL",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Works their own tasks and links them to CRM customer/lead records; no
  // board configuration or org-wide visibility.
  [RoleCode.SALES]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "OWN",
    [PermissionKey.CREATE_BOARD]: "NONE",
    [PermissionKey.EDIT_BOARD]: "NONE",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "NONE",
    [PermissionKey.CONFIGURE_STAGES]: "NONE",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "NONE",
    [PermissionKey.CREATE_TASK]: "OWN",
    [PermissionKey.EDIT_TASK]: "OWN",
    [PermissionKey.DELETE_TASK]: "NONE",
    [PermissionKey.ASSIGN_TASK]: "OWN",
    [PermissionKey.MOVE_TASK]: "OWN",
    [PermissionKey.MANAGE_TASK_COLLAB]: "OWN",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "NONE",
    [PermissionKey.APPROVE_TASK]: "NONE",
    [PermissionKey.CRM_ERP_LINKING]: "OWN",
    [PermissionKey.EXPORT]: "OWN",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "NONE",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "NONE",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Works their own tasks and links them to ERP purchase-order/vendor
  // records; no board configuration or org-wide visibility.
  [RoleCode.PROCUREMENT]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "OWN",
    [PermissionKey.CREATE_BOARD]: "NONE",
    [PermissionKey.EDIT_BOARD]: "NONE",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "NONE",
    [PermissionKey.CONFIGURE_STAGES]: "NONE",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "NONE",
    [PermissionKey.CREATE_TASK]: "OWN",
    [PermissionKey.EDIT_TASK]: "OWN",
    [PermissionKey.DELETE_TASK]: "NONE",
    [PermissionKey.ASSIGN_TASK]: "OWN",
    [PermissionKey.MOVE_TASK]: "OWN",
    [PermissionKey.MANAGE_TASK_COLLAB]: "OWN",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "NONE",
    [PermissionKey.APPROVE_TASK]: "NONE",
    [PermissionKey.CRM_ERP_LINKING]: "OWN",
    [PermissionKey.EXPORT]: "OWN",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "NONE",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "NONE",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Front-line staff: no Workflow access of any kind — the only thing this
  // role can do is log in and apply for/view their own leave, which isn't
  // gated by any of these permission keys (see hrms.routes.ts).
  [RoleCode.STAFF]: {
    [PermissionKey.LOGIN]: "ALL",
  },
  // Heads the Estimation team — same board-creating/team-managing authority
  // as Proj.Manager.
  [RoleCode.ESTIMATION_MANAGER]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "TEAM",
    [PermissionKey.CREATE_BOARD]: "ALL",
    [PermissionKey.EDIT_BOARD]: "OWN",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "OWN",
    [PermissionKey.CONFIGURE_STAGES]: "OWN",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "OWN",
    [PermissionKey.CREATE_TASK]: "ALL",
    [PermissionKey.EDIT_TASK]: "OWN",
    [PermissionKey.DELETE_TASK]: "OWN",
    [PermissionKey.ASSIGN_TASK]: "ALL",
    [PermissionKey.MOVE_TASK]: "ALL",
    [PermissionKey.MANAGE_TASK_COLLAB]: "ALL",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "TEAM",
    [PermissionKey.APPROVE_TASK]: "OWN",
    [PermissionKey.CRM_ERP_LINKING]: "NONE",
    [PermissionKey.EXPORT]: "TEAM",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "OWN",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "TEAM",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Coordinates the Estimation team's day-to-day work — assigns/moves tasks
  // across the team, but can't create or configure boards (Manager-only).
  [RoleCode.ESTIMATION_TEAM_LEAD]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "TEAM",
    [PermissionKey.CREATE_BOARD]: "NONE",
    [PermissionKey.EDIT_BOARD]: "NONE",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "NONE",
    [PermissionKey.CONFIGURE_STAGES]: "NONE",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "NONE",
    [PermissionKey.CREATE_TASK]: "OWN",
    [PermissionKey.EDIT_TASK]: "OWN",
    [PermissionKey.DELETE_TASK]: "NONE",
    [PermissionKey.ASSIGN_TASK]: "TEAM",
    [PermissionKey.MOVE_TASK]: "TEAM",
    [PermissionKey.MANAGE_TASK_COLLAB]: "TEAM",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "TEAM",
    [PermissionKey.APPROVE_TASK]: "NONE",
    [PermissionKey.CRM_ERP_LINKING]: "NONE",
    [PermissionKey.EXPORT]: "TEAM",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "NONE",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "TEAM",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Individual contributor — same shape as Estimation: works their own
  // tasks, no board configuration or org-wide visibility.
  [RoleCode.ESTIMATION_ENGINEER]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "OWN",
    [PermissionKey.CREATE_BOARD]: "NONE",
    [PermissionKey.EDIT_BOARD]: "NONE",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "NONE",
    [PermissionKey.CONFIGURE_STAGES]: "NONE",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "NONE",
    [PermissionKey.CREATE_TASK]: "OWN",
    [PermissionKey.EDIT_TASK]: "OWN",
    [PermissionKey.DELETE_TASK]: "NONE",
    [PermissionKey.ASSIGN_TASK]: "OWN",
    [PermissionKey.MOVE_TASK]: "OWN",
    [PermissionKey.MANAGE_TASK_COLLAB]: "OWN",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "NONE",
    [PermissionKey.APPROVE_TASK]: "NONE",
    [PermissionKey.CRM_ERP_LINKING]: "NONE",
    [PermissionKey.EXPORT]: "OWN",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "NONE",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "NONE",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Heads a project delivery team: board-creating/team-managing authority.
  [RoleCode.PROJ_MANAGER]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "TEAM",
    [PermissionKey.CREATE_BOARD]: "ALL",
    [PermissionKey.EDIT_BOARD]: "OWN",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "OWN",
    [PermissionKey.CONFIGURE_STAGES]: "OWN",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "OWN",
    [PermissionKey.CREATE_TASK]: "ALL",
    [PermissionKey.EDIT_TASK]: "OWN",
    [PermissionKey.DELETE_TASK]: "OWN",
    [PermissionKey.ASSIGN_TASK]: "ALL",
    [PermissionKey.MOVE_TASK]: "ALL",
    [PermissionKey.MANAGE_TASK_COLLAB]: "ALL",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "TEAM",
    [PermissionKey.APPROVE_TASK]: "OWN",
    // Can create/import Customer Master records now that every role has
    // been granted the CRM module — module access alone was letting them
    // view Customers with no way to add to it.
    [PermissionKey.CRM_ERP_LINKING]: "OWN",
    [PermissionKey.EXPORT]: "TEAM",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "OWN",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "TEAM",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Individual contributor working their own MEP tasks; no board
  // configuration or org-wide visibility.
  [RoleCode.MEP_ENGINEER]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "OWN",
    [PermissionKey.CREATE_BOARD]: "NONE",
    [PermissionKey.EDIT_BOARD]: "NONE",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "NONE",
    [PermissionKey.CONFIGURE_STAGES]: "NONE",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "NONE",
    [PermissionKey.CREATE_TASK]: "OWN",
    [PermissionKey.EDIT_TASK]: "OWN",
    [PermissionKey.DELETE_TASK]: "NONE",
    [PermissionKey.ASSIGN_TASK]: "OWN",
    [PermissionKey.MOVE_TASK]: "OWN",
    [PermissionKey.MANAGE_TASK_COLLAB]: "OWN",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "NONE",
    [PermissionKey.APPROVE_TASK]: "NONE",
    [PermissionKey.CRM_ERP_LINKING]: "NONE",
    [PermissionKey.EXPORT]: "OWN",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "NONE",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "NONE",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Individual contributor working their own site tasks; no board
  // configuration or org-wide visibility.
  [RoleCode.SITE_ENGINEER]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "OWN",
    [PermissionKey.CREATE_BOARD]: "NONE",
    [PermissionKey.EDIT_BOARD]: "NONE",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "NONE",
    [PermissionKey.CONFIGURE_STAGES]: "NONE",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "NONE",
    [PermissionKey.CREATE_TASK]: "OWN",
    [PermissionKey.EDIT_TASK]: "OWN",
    [PermissionKey.DELETE_TASK]: "NONE",
    [PermissionKey.ASSIGN_TASK]: "OWN",
    [PermissionKey.MOVE_TASK]: "OWN",
    [PermissionKey.MANAGE_TASK_COLLAB]: "OWN",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "NONE",
    [PermissionKey.APPROVE_TASK]: "NONE",
    [PermissionKey.CRM_ERP_LINKING]: "NONE",
    [PermissionKey.EXPORT]: "OWN",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "NONE",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "NONE",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Front-line execution: can see and update only what's assigned to them —
  // no task creation/assignment, board, or org-wide authority.
  [RoleCode.TECHNICIAN]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "OWN",
    [PermissionKey.CREATE_BOARD]: "NONE",
    [PermissionKey.EDIT_BOARD]: "NONE",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "NONE",
    [PermissionKey.CONFIGURE_STAGES]: "NONE",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "NONE",
    [PermissionKey.CREATE_TASK]: "NONE",
    [PermissionKey.EDIT_TASK]: "OWN",
    [PermissionKey.DELETE_TASK]: "NONE",
    [PermissionKey.ASSIGN_TASK]: "NONE",
    [PermissionKey.MOVE_TASK]: "OWN",
    [PermissionKey.MANAGE_TASK_COLLAB]: "NONE",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "NONE",
    [PermissionKey.APPROVE_TASK]: "NONE",
    [PermissionKey.CRM_ERP_LINKING]: "NONE",
    [PermissionKey.EXPORT]: "NONE",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "NONE",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "NONE",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
};

/** System Admin and Super Admin both get the "sees/can-touch everything"
 * override sprinkled through board/task/audit/workload access checks —
 * Super Admin outranks System Admin, so it always qualifies too. */
export function isSystemLevelAdmin(roles: RoleCode[]): boolean {
  return roles.includes(RoleCode.SYSTEM_ADMIN) || roles.includes(RoleCode.SUPER_ADMIN);
}

/** Full-database backup/restore is deliberately narrower than the general
 * "system admin" override above — it bypasses the whole app's data, not
 * just its access rules, so it stays hardcoded to Super Admin regardless of
 * how Roles & Permissions gets configured from Settings. */
export function isSuperAdmin(roles: RoleCode[]): boolean {
  return roles.includes(RoleCode.SUPER_ADMIN);
}

const SCOPE_RANK: Record<PermissionScope, number> = { NONE: 0, OWN: 1, TEAM: 2, ALL: 3 };

export function scopeAtLeast(scope: PermissionScope, required: PermissionScope): boolean {
  return SCOPE_RANK[scope] >= SCOPE_RANK[required];
}

export function widestScope(scopes: PermissionScope[]): PermissionScope {
  return scopes.reduce<PermissionScope>((acc, s) => (SCOPE_RANK[s] > SCOPE_RANK[acc] ? s : acc), "NONE");
}

export interface EffectivePermissions {
  [key: string]: PermissionScope; // key = `${module}:${permission}`
}

/**
 * Effective permission = the union (widest scope) across every role the
 * user holds (Section 5 / Business Rule: "effective permission is the union
 * of all assigned roles").
 */
export function computeEffectivePermissions(
  rows: Array<{ module: ModuleCode; permission: PermissionKey; scope: PermissionScope }>
): EffectivePermissions {
  const result: EffectivePermissions = {};
  for (const row of rows) {
    const key = `${row.module}:${row.permission}`;
    const current = result[key] ?? "NONE";
    result[key] = widestScope([current, row.scope]);
  }
  return result;
}

export function getPermissionScope(
  effective: EffectivePermissions,
  permission: PermissionKey,
  module: ModuleCode = ModuleCode.WORKFLOW
): PermissionScope {
  return effective[`${module}:${permission}`] ?? "NONE";
}
