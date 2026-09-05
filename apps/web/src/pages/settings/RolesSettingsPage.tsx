import React from "react";
import { useRoles, useUpdateRolePermission } from "../../api/misc";
import { Select, Skeleton, ErrorState, Badge } from "../../components/ui/primitives";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { PermissionKey, PermissionScope, RoleCode } from "../../lib/types";

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  LOGIN: "Login",
  VIEW_WORKFLOW: "View Workflow",
  CREATE_BOARD: "Create Board",
  EDIT_BOARD: "Edit Board",
  ARCHIVE_DELETE_BOARD: "Archive / Delete Board",
  CONFIGURE_STAGES: "Configure Stages",
  MANAGE_BOARD_MEMBERS: "Manage Board Members",
  CREATE_TASK: "Create Task",
  EDIT_TASK: "Edit Task",
  DELETE_TASK: "Delete Task",
  ASSIGN_TASK: "Assign Task",
  MOVE_TASK: "Move Task",
  MANAGE_TASK_COLLAB: "Checklist / Comments / Attachments",
  VIEW_TEAM_WORKLOAD: "Team Workload",
  APPROVE_TASK: "Approvals",
  CRM_ERP_LINKING: "CRM/ERP Linking",
  EXPORT: "Export",
  VIEW_AUDIT_TRAIL: "Audit Trail",
  MANAGE_ROLES: "Manage Roles",
  MANAGE_USERS: "User Management",
  VIEW_TIME_LOGS: "Time Log Reports",
  MANAGE_TICKETS: "Support Tickets (view/manage all)",
};
const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as PermissionKey[];
const SCOPES: PermissionScope[] = ["NONE", "OWN", "TEAM", "ALL"];
const ROLE_LABELS: Record<RoleCode, string> = {
  SUPER_ADMIN: "Super Admin",
  SYSTEM_ADMIN: "System Admin",
  CEO_DIRECTOR: "CEO / Director",
  MANAGER: "Manager",
  HR: "HR",
  TEAM_LEAD: "Team Lead",
  TEAM_MEMBER: "Team Member",
  ACCOUNTANT: "Accountant",
};

interface RoleRow {
  id: string;
  code: RoleCode;
  name: string;
  rolePermissions: Array<{ module: string; permission: PermissionKey; scope: PermissionScope }>;
}

/** Section 35: centralized Settings → Roles & Permissions — the RBAC matrix from the source doc, editable live. */
export default function RolesSettingsPage() {
  const { push } = useToast();
  const { data: roles, isLoading, isError, refetch } = useRoles();
  const updatePermission = useUpdateRolePermission();

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !roles) return <ErrorState message="Could not load roles." onRetry={() => refetch()} />;

  const roleList = roles as RoleRow[];

  function scopeFor(role: RoleRow, permission: PermissionKey): PermissionScope {
    return (role.rolePermissions.find((rp) => rp.permission === permission && rp.module === "WORKFLOW")?.scope as PermissionScope) ?? "NONE";
  }

  async function handleChange(role: RoleRow, permission: PermissionKey, scope: string) {
    try {
      await updatePermission.mutateAsync({ roleId: role.id, module: "WORKFLOW", permission, scope });
    } catch (err) {
      push({ variant: "error", title: "Could not update permission", description: extractApiError(err).message });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Roles &amp; Permissions</h1>
        <p className="text-sm text-slate-500">
          Effective permissions are the union (widest scope) of every role a user holds. Enforced at the UI, route, API and
          service layers — this screen only controls what each role is granted.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5">Permission</th>
              {roleList.map((r) => (
                <th key={r.id} className="min-w-[160px] px-3 py-2.5">
                  {ROLE_LABELS[r.code] ?? r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_PERMISSIONS.map((perm) => (
              <tr key={perm} className="border-b border-slate-100 last:border-0">
                <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium text-slate-700">{PERMISSION_LABELS[perm]}</td>
                {roleList.map((role) => {
                  const scope = scopeFor(role, perm);
                  // Only Super Admin can even reach this page (System Admin's
                  // MANAGE_ROLES is NONE), so it's Super Admin's own row that
                  // must stay locked to avoid accidentally locking themselves out.
                  const isAdminRole = role.code === "SUPER_ADMIN";
                  return (
                    <td key={role.id} className="px-3 py-1.5">
                      <Select
                        value={scope}
                        disabled={isAdminRole}
                        onChange={(e) => handleChange(role, perm, e.target.value)}
                        className="!py-1 !text-xs"
                      >
                        {SCOPES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        <Badge tone="slate">NONE</Badge> no access · <Badge tone="slate">OWN</Badge> own records only · <Badge tone="slate">TEAM</Badge> managed
        team · <Badge tone="slate">ALL</Badge> everything. Super Admin is fixed at ALL and cannot be narrowed.
      </p>
    </div>
  );
}
