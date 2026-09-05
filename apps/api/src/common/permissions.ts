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
  [RoleCode.CEO_DIRECTOR]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "ALL",
    [PermissionKey.CREATE_BOARD]: "NONE",
    [PermissionKey.EDIT_BOARD]: "NONE",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "NONE",
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
    [PermissionKey.CRM_ERP_LINKING]: "NONE",
    [PermissionKey.EXPORT]: "ALL",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "ALL",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "NONE",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Creates/configures boards, assigns and approves tasks for their team.
  [RoleCode.MANAGER]: {
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
    [PermissionKey.CRM_ERP_LINKING]: "OWN",
    [PermissionKey.EXPORT]: "TEAM",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "OWN",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "TEAM",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // People-ops: org-wide workload/time visibility, no board/task authority.
  [RoleCode.HR]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "ALL",
    [PermissionKey.VIEW_TIME_LOGS]: "ALL",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Finance: org-wide time-log and export access for payroll/billing/reporting,
  // no board/task configuration authority and no workload visibility (that's
  // HR's/Manager's lane, not accounting's).
  [RoleCode.ACCOUNTANT]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_TIME_LOGS]: "ALL",
    [PermissionKey.EXPORT]: "ALL",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Leads a team day-to-day: manages and approves that team's tasks, no
  // board configuration or org-wide visibility.
  [RoleCode.TEAM_LEAD]: {
    [PermissionKey.LOGIN]: "ALL",
    [PermissionKey.VIEW_WORKFLOW]: "TEAM",
    [PermissionKey.CREATE_BOARD]: "NONE",
    [PermissionKey.EDIT_BOARD]: "NONE",
    [PermissionKey.ARCHIVE_DELETE_BOARD]: "NONE",
    [PermissionKey.CONFIGURE_STAGES]: "NONE",
    [PermissionKey.MANAGE_BOARD_MEMBERS]: "NONE",
    [PermissionKey.CREATE_TASK]: "TEAM",
    [PermissionKey.EDIT_TASK]: "TEAM",
    [PermissionKey.DELETE_TASK]: "NONE",
    [PermissionKey.ASSIGN_TASK]: "TEAM",
    [PermissionKey.MOVE_TASK]: "TEAM",
    [PermissionKey.MANAGE_TASK_COLLAB]: "TEAM",
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "TEAM",
    [PermissionKey.APPROVE_TASK]: "TEAM",
    [PermissionKey.CRM_ERP_LINKING]: "NONE",
    [PermissionKey.EXPORT]: "TEAM",
    [PermissionKey.VIEW_AUDIT_TRAIL]: "NONE",
    [PermissionKey.MANAGE_ROLES]: "NONE",
    [PermissionKey.MANAGE_USERS]: "NONE",
    [PermissionKey.VIEW_TIME_LOGS]: "TEAM",
    [PermissionKey.MANAGE_TICKETS]: "NONE",
  },
  // Does the work: moves tasks, ticks checklists, comments, attaches files.
  [RoleCode.TEAM_MEMBER]: {
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
    [PermissionKey.VIEW_TEAM_WORKLOAD]: "OWN",
    [PermissionKey.APPROVE_TASK]: "OWN",
    [PermissionKey.CRM_ERP_LINKING]: "NONE",
    [PermissionKey.EXPORT]: "OWN",
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
