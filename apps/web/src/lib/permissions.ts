import { PermissionKey, PermissionScope, CurrentUser } from "./types";

const RANK: Record<PermissionScope, number> = { NONE: 0, OWN: 1, TEAM: 2, ALL: 3 };

/**
 * Enforcement layer #1 (UI) of the four required by Section 35. This never
 * stands alone — every mutation is re-checked by the API (route + service
 * layers), so hiding a control here is a UX courtesy, not the security
 * boundary.
 */
export function can(user: CurrentUser | null | undefined, permission: PermissionKey, minScope: PermissionScope = "OWN", module = "WORKFLOW"): boolean {
  if (!user) return false;
  const scope = user.permissions[`${module}:${permission}`] ?? "NONE";
  return RANK[scope] >= RANK[minScope];
}

export function isAdmin(user: CurrentUser | null | undefined): boolean {
  return !!user?.roles.some((r) => r === "SYSTEM_ADMIN" || r === "SUPER_ADMIN");
}

export function isSuperAdmin(user: CurrentUser | null | undefined): boolean {
  return !!user?.roles.includes("SUPER_ADMIN");
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  SYSTEM_ADMIN: "System Admin",
  CEO_DIRECTOR: "CEO / Director",
  MANAGER: "Manager",
  HR: "HR",
  TEAM_LEAD: "Team Lead",
  TEAM_MEMBER: "Team Member",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
