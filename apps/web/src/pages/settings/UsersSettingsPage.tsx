import React, { useState } from "react";
import { Plus, UploadCloud, RotateCcw, UserX, UserCheck } from "lucide-react";
import { useUsers, useCreateUser, useUpdateUser, useResendInvite, useBulkImportUsers, useUnlinkedEmployees } from "../../api/misc";
import { Button, Input, PasswordInput, Label, Select, Badge, Skeleton, ErrorState, EmptyState, Checkbox } from "../../components/ui/primitives";
import { Drawer } from "../../components/ui/Drawer";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { RoleCode, ModuleCode } from "../../lib/types";

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
const ALL_ROLES = Object.keys(ROLE_LABELS) as RoleCode[];
const ALL_MODULES: ModuleCode[] = ["WORKFLOW", "CRM", "ERP", "HRMS"];

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "slate"> = {
  ACTIVE: "green",
  PENDING_ACTIVATION: "amber",
  LOCKED: "red",
  DEACTIVATED: "slate",
};

interface UserRow {
  id: string;
  name: string;
  workEmail: string;
  status: string;
  moduleAccess: ModuleCode[];
  roles: Array<{ role: { code: RoleCode; name: string } }>;
  employee?: { fullName: string } | null;
}

/** Section 6/7: Settings → Users — invitation-only provisioning, bulk import, resend, deactivate. */
export default function UsersSettingsPage() {
  const { push } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { data: users, isLoading, isError, refetch } = useUsers({ search, status: statusFilter || undefined });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resendInvite = useResendInvite();
  const bulkImport = useBulkImportUsers();

  const [newOpen, setNewOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">Invite-only provisioning — people never self-register.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <UploadCloud className="h-4 w-4" /> Bulk Import
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New User
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:!w-48">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING_ACTIVATION">Pending Activation</option>
          <option value="LOCKED">Locked</option>
          <option value="DEACTIVATED">Deactivated</option>
        </Select>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {isError && <ErrorState message="Could not load users." onRetry={() => refetch()} />}
      {users && users.length === 0 && <EmptyState title="No users match these filters." />}

      {users && users.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Roles</th>
                <th className="px-4 py-2.5">Modules</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users as UserRow[]).map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-800">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.workEmail}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r.role.code} tone="slate">
                          {ROLE_LABELS[r.role.code] ?? r.role.name}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {u.moduleAccess.map((m) => (
                        <Badge key={m} tone="indigo">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONE[u.status] ?? "slate"}>{u.status.replace("_", " ")}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {u.status === "PENDING_ACTIVATION" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await resendInvite.mutateAsync(u.id);
                              push({ variant: "success", title: "Invitation resent." });
                            } catch (err) {
                              push({ variant: "error", title: "Could not resend invitation", description: extractApiError(err).message });
                            }
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Resend
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setEditUser(u)}>
                        Edit
                      </Button>
                      {u.status !== "DEACTIVATED" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await updateUser.mutateAsync({ userId: u.id, status: "DEACTIVATED" });
                              push({ variant: "success", title: `${u.name} deactivated.` });
                            } catch (err) {
                              push({ variant: "error", title: "Could not deactivate user", description: extractApiError(err).message });
                            }
                          }}
                        >
                          <UserX className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await updateUser.mutateAsync({ userId: u.id, status: "ACTIVE" });
                              push({ variant: "success", title: `${u.name} reactivated.` });
                            } catch (err) {
                              push({ variant: "error", title: "Could not reactivate user", description: extractApiError(err).message });
                            }
                          }}
                        >
                          <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewUserDrawer open={newOpen} onClose={() => setNewOpen(false)} onCreate={createUser} />
      {editUser && <EditUserDrawer user={editUser} onClose={() => setEditUser(null)} onUpdate={updateUser} />}
      <BulkImportModal open={bulkOpen} onClose={() => setBulkOpen(false)} onImport={bulkImport} />
    </div>
  );
}

function RoleModuleCheckboxes({
  roles,
  setRoles,
  modules,
  setModules,
  showModules = true,
}: {
  roles: RoleCode[];
  setRoles: (r: RoleCode[]) => void;
  modules: ModuleCode[];
  setModules: (m: ModuleCode[]) => void;
  showModules?: boolean;
}) {
  return (
    <>
      <div>
        <Label required>Roles</Label>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {ALL_ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
              <Checkbox checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} />
              {ROLE_LABELS[r]}
            </label>
          ))}
        </div>
      </div>
      {showModules && (
        <div>
          <Label required>Module Access</Label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MODULES.map((m) => (
              <label key={m} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
                <Checkbox checked={modules.includes(m)} onChange={(e) => setModules(e.target.checked ? [...modules, m] : modules.filter((x) => x !== m))} />
                {m}
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const NewUserDrawer: React.FC<{ open: boolean; onClose: () => void; onCreate: ReturnType<typeof useCreateUser> }> = ({ open, onClose, onCreate }) => {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<RoleCode[]>([]);
  // Module Access isn't exposed at creation time — every new user gets
  // Workflow access by default. An admin can still grant CRM/ERP/HRMS access
  // afterward by editing the user.
  const [modules] = useState<ModuleCode[]>(["WORKFLOW"]);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const { data: unlinked } = useUnlinkedEmployees(employeeQuery);

  const [provisioning, setProvisioning] = useState<"invite" | "password">("invite");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function reset() {
    setName("");
    setEmail("");
    setRoles([]);
    setEmployeeQuery("");
    setEmployeeId(null);
    setProvisioning("invite");
    setPassword("");
    setConfirmPassword("");
  }

  async function submit() {
    if (!name.trim() || !email.trim() || roles.length === 0) {
      push({ variant: "error", title: "Name, work email and at least one role are required." });
      return;
    }
    if (provisioning === "password") {
      if (!password) {
        push({ variant: "error", title: "Enter a password." });
        return;
      }
      if (password !== confirmPassword) {
        push({ variant: "error", title: "Passwords don't match." });
        return;
      }
    }
    try {
      await onCreate.mutateAsync({
        name: name.trim(),
        workEmail: email.trim(),
        roles,
        moduleAccess: modules,
        employeeId: employeeId ?? undefined,
        password: provisioning === "password" ? password : undefined,
      });
      push(
        provisioning === "password"
          ? { variant: "success", title: "User created.", description: `${name} can sign in immediately with the password you set.` }
          : { variant: "success", title: "Invitation sent.", description: `${name} has 72 hours to activate their account.` }
      );
      reset();
      onClose();
    } catch (err) {
      push({ variant: "error", title: "Could not create user", description: extractApiError(err).message });
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="New user"
      subtitle={provisioning === "invite" ? "An invitation email is sent immediately and expires in 72 hours." : "The account is active immediately with the password you set below."}
      footer={
        <>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>
            Cancel
          </Button>
          <Button onClick={submit} loading={onCreate.isPending}>
            {provisioning === "invite" ? "Send Invitation" : "Create User"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label required>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label required>Work Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>HRMS Employee Link (optional)</Label>
          <Input placeholder="Search unlinked employee records…" value={employeeQuery} onChange={(e) => setEmployeeQuery(e.target.value)} />
          {employeeQuery && unlinked && unlinked.length > 0 && (
            <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200">
              {unlinked.map((e: any) => (
                <button
                  key={e.id}
                  onClick={() => {
                    setEmployeeId(e.id);
                    setEmployeeQuery(`${e.name} (${e.employeeCode})`);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  {e.name} <span className="text-xs text-slate-400">{e.department}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <RoleModuleCheckboxes roles={roles} setRoles={setRoles} modules={modules} setModules={() => undefined} showModules={false} />

        <div>
          <Label>Password</Label>
          <div className="flex rounded-lg border border-slate-300 p-0.5">
            <button
              type="button"
              onClick={() => setProvisioning("invite")}
              className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${provisioning === "invite" ? "bg-brand-600 text-white" : "text-slate-500"}`}
            >
              Send invite email
            </button>
            <button
              type="button"
              onClick={() => setProvisioning("password")}
              className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${provisioning === "password" ? "bg-brand-600 text-white" : "text-slate-500"}`}
            >
              Set password now
            </button>
          </div>
          {provisioning === "password" && (
            <div className="mt-3 space-y-3">
              <div>
                <Label required>Password</Label>
                <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
                <p className="mt-1 text-xs text-slate-400">8+ characters, with upper, lower, digit and symbol.</p>
              </div>
              <div>
                <Label required>Confirm password</Label>
                <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
};

const EditUserDrawer: React.FC<{ user: UserRow; onClose: () => void; onUpdate: ReturnType<typeof useUpdateUser> }> = ({ user, onClose, onUpdate }) => {
  const { push } = useToast();
  const [roles, setRoles] = useState<RoleCode[]>(user.roles.map((r) => r.role.code));
  const [modules, setModules] = useState<ModuleCode[]>(user.moduleAccess);

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Edit ${user.name}`}
      subtitle={user.workEmail}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={onUpdate.isPending}
            onClick={async () => {
              try {
                await onUpdate.mutateAsync({ userId: user.id, roles, moduleAccess: modules });
                push({ variant: "success", title: "User updated." });
                onClose();
              } catch (err) {
                push({ variant: "error", title: "Could not update user", description: extractApiError(err).message });
              }
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <RoleModuleCheckboxes roles={roles} setRoles={setRoles} modules={modules} setModules={setModules} />
      </div>
    </Drawer>
  );
};

const BulkImportModal: React.FC<{ open: boolean; onClose: () => void; onImport: ReturnType<typeof useBulkImportUsers> }> = ({ open, onClose, onImport }) => {
  const { push } = useToast();
  const [csv, setCsv] = useState("name,workEmail,roles,moduleAccess\nJane Doe,jane.doe@example.com,TEAM_MEMBER,WORKFLOW");

  async function submit() {
    const lines = csv.trim().split("\n").filter(Boolean);
    const [header, ...rows] = lines;
    const cols = header.split(",").map((c) => c.trim());
    const users = rows.map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      cols.forEach((c, i) => (row[c] = values[i] ?? ""));
      return {
        name: row.name,
        workEmail: row.workEmail,
        roles: (row.roles ?? "").split("|").filter(Boolean),
        moduleAccess: (row.moduleAccess ?? "").split("|").filter(Boolean),
      };
    });
    try {
      const results: Array<{ email: string; status: "invited" | "skipped"; reason?: string }> = await onImport.mutateAsync(users);
      const invited = results.filter((r) => r.status === "invited").length;
      const skipped = results.filter((r) => r.status === "skipped");
      push({
        variant: skipped.length ? "warning" : "success",
        title: `Invited ${invited} of ${results.length} user(s).`,
        description: skipped.length ? `Skipped: ${skipped.map((s) => `${s.email} (${s.reason})`).join(", ")}` : undefined,
      });
      onClose();
    } catch (err) {
      push({ variant: "error", title: "Bulk import failed", description: extractApiError(err).message });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bulk import users" description="One row per user. roles and moduleAccess are pipe-separated (e.g. TEAM_MEMBER|VIEWER)." size="lg">
      <textarea
        rows={10}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus-visible:focus-ring"
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} loading={onImport.isPending}>
          Import
        </Button>
      </div>
    </Modal>
  );
};
