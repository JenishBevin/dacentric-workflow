import React, { useState } from "react";
import { Plus, Users } from "lucide-react";
import {
  useAllEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDepartments,
  useTeams,
  useCreateDepartment,
  useCreateTeam,
  CreateEmployeeInput,
} from "../../api/misc";
import { Button, Input, Label, Select, Badge, Skeleton, ErrorState, EmptyState } from "../../components/ui/primitives";
import { Drawer } from "../../components/ui/Drawer";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { can } from "../../lib/permissions";

interface EmployeeRow {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string;
  jobTitle: string | null;
  isActive: boolean;
  department: { id: string; name: string } | null;
  teams: Array<{ id: string; name: string }>;
  user: { id: string; name: string; status: string } | null;
}

/** Section 31: this build has no real external HRMS to sync employee
 * records from, so — unlike everywhere else in the app, which only ever
 * reads them — this is the one screen that creates and edits them directly. */
export default function EmployeesSettingsPage() {
  const { user } = useAuth();
  const canManage = can(user, "MANAGE_USERS", "ALL");
  const { push } = useToast();
  const [search, setSearch] = useState("");
  const { data: employees, isLoading, isError, refetch } = useAllEmployees(search);
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();

  const [newOpen, setNewOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<EmployeeRow | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500">
            {canManage
              ? "HR records — job title, department, team. Link one to a login from Settings → Users."
              : "HR directory — job title, department, team."}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New Employee
          </Button>
        )}
      </div>

      <Input placeholder="Search by name, email or employee code…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />

      {isLoading && <Skeleton className="h-64 w-full" />}
      {isError && <ErrorState message="Could not load employees." onRetry={() => refetch()} />}
      {employees && employees.length === 0 && (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No employees yet."
          description={canManage ? "Create one to start linking logins to HR records." : "No HR records to show yet."}
        />
      )}

      {employees && employees.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Job Title</th>
                <th className="px-4 py-2.5">Department / Team</th>
                <th className="px-4 py-2.5">Linked Login</th>
                <th className="px-4 py-2.5">Status</th>
                {canManage && <th className="px-4 py-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {(employees as EmployeeRow[]).map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-800">{e.fullName}</p>
                    <p className="text-xs text-slate-400">{e.workEmail}</p>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{e.employeeCode}</td>
                  <td className="px-4 py-2.5 text-slate-600">{e.jobTitle ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {[e.department?.name, e.teams.map((t) => t.name).join(", ")].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {e.user ? <Badge tone="green">{e.user.name}</Badge> : <span className="text-xs text-slate-400">Not linked</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={e.isActive ? "green" : "slate"}>{e.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditEmployee(e)}>
                        Edit
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewEmployeeDrawer open={newOpen} onClose={() => setNewOpen(false)} onCreate={createEmployee} onError={(err) => push({ variant: "error", title: "Could not create employee", description: err })} onSuccess={() => push({ variant: "success", title: "Employee created." })} />
      {editEmployee && (
        <EditEmployeeDrawer
          employee={editEmployee}
          onClose={() => setEditEmployee(null)}
          onUpdate={updateEmployee}
          onError={(err) => push({ variant: "error", title: "Could not update employee", description: err })}
          onSuccess={() => push({ variant: "success", title: "Employee updated." })}
        />
      )}
    </div>
  );
}

function DepartmentTeamPicker({
  departmentId,
  setDepartmentId,
  teamIds,
  setTeamIds,
}: {
  departmentId: string | null;
  setDepartmentId: (id: string | null) => void;
  teamIds: string[];
  setTeamIds: (ids: string[]) => void;
}) {
  const { data: departments } = useDepartments();
  const { data: teams } = useTeams(departmentId ?? undefined);
  const createDepartment = useCreateDepartment();
  const createTeam = useCreateTeam();
  const [newDept, setNewDept] = useState("");
  const [newTeam, setNewTeam] = useState("");
  const [showNewDept, setShowNewDept] = useState(false);
  const [showNewTeam, setShowNewTeam] = useState(false);

  async function addDepartment() {
    if (!newDept.trim()) return;
    const dept = await createDepartment.mutateAsync(newDept.trim());
    setDepartmentId(dept.id);
    setNewDept("");
    setShowNewDept(false);
  }

  async function addTeam() {
    if (!newTeam.trim()) return;
    const team = await createTeam.mutateAsync({ name: newTeam.trim(), departmentId });
    setTeamIds([...teamIds, team.id]);
    setNewTeam("");
    setShowNewTeam(false);
  }

  function toggleTeam(id: string) {
    setTeamIds(teamIds.includes(id) ? teamIds.filter((t) => t !== id) : [...teamIds, id]);
  }

  return (
    <>
      <div>
        <Label>Department</Label>
        <div className="flex gap-2">
          <Select
            value={departmentId ?? ""}
            onChange={(e) => {
              setDepartmentId(e.target.value || null);
              setTeamIds([]);
            }}
          >
            <option value="">None</option>
            {departments?.map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowNewDept((v) => !v)}>
            + New
          </Button>
        </div>
        {showNewDept && (
          <div className="mt-2 flex gap-2">
            <Input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="Department name" />
            <Button type="button" size="sm" loading={createDepartment.isPending} onClick={addDepartment}>
              Add
            </Button>
          </div>
        )}
      </div>
      <div>
        <Label>Teams</Label>
        <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2.5">
          {teams && teams.length > 0 ? (
            teams.map((t: any) => (
              <label key={t.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={teamIds.includes(t.id)}
                  onChange={() => toggleTeam(t.id)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus-visible:focus-ring"
                />
                {t.name}
              </label>
            ))
          ) : (
            <p className="px-0.5 py-0.5 text-xs text-slate-400">No teams yet.</p>
          )}
        </div>
        <div className="mt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowNewTeam((v) => !v)}>
            + New team
          </Button>
        </div>
        {showNewTeam && (
          <div className="mt-2 flex gap-2">
            <Input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Team name" />
            <Button type="button" size="sm" loading={createTeam.isPending} onClick={addTeam}>
              Add
            </Button>
          </div>
        )}
        <p className="mt-1 text-xs text-slate-400">An employee can belong to multiple teams. A team can optionally belong to the selected department.</p>
      </div>
    </>
  );
}

const NewEmployeeDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreate: ReturnType<typeof useCreateEmployee>;
  onError: (message: string) => void;
  onSuccess: () => void;
}> = ({ open, onClose, onCreate, onError, onSuccess }) => {
  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [teamIds, setTeamIds] = useState<string[]>([]);

  function reset() {
    setFullName("");
    setWorkEmail("");
    setEmployeeCode("");
    setJobTitle("");
    setDepartmentId(null);
    setTeamIds([]);
  }

  async function submit() {
    if (!fullName.trim() || !workEmail.trim()) {
      onError("Name and work email are required.");
      return;
    }
    try {
      const payload: CreateEmployeeInput = {
        fullName: fullName.trim(),
        workEmail: workEmail.trim(),
        employeeCode: employeeCode.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        departmentId,
        teamIds,
      };
      await onCreate.mutateAsync(payload);
      onSuccess();
      reset();
      onClose();
    } catch (err) {
      onError(extractApiError(err).message);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="New Employee"
      subtitle="Creates an HR record — link it to a login afterward from Settings → Users."
      footer={
        <>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>
            Cancel
          </Button>
          <Button onClick={submit} loading={onCreate.isPending}>
            Create Employee
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label required>Full Name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label required>Work Email</Label>
          <Input type="email" value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} />
        </div>
        <div>
          <Label>Employee Code</Label>
          <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="Auto-generated if left blank" />
        </div>
        <div>
          <Label>Job Title</Label>
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>
        <DepartmentTeamPicker departmentId={departmentId} setDepartmentId={setDepartmentId} teamIds={teamIds} setTeamIds={setTeamIds} />
      </div>
    </Drawer>
  );
};

const EditEmployeeDrawer: React.FC<{
  employee: EmployeeRow;
  onClose: () => void;
  onUpdate: ReturnType<typeof useUpdateEmployee>;
  onError: (message: string) => void;
  onSuccess: () => void;
}> = ({ employee, onClose, onUpdate, onError, onSuccess }) => {
  const [fullName, setFullName] = useState(employee.fullName);
  const [jobTitle, setJobTitle] = useState(employee.jobTitle ?? "");
  const [departmentId, setDepartmentId] = useState<string | null>(employee.department?.id ?? null);
  const [teamIds, setTeamIds] = useState<string[]>(employee.teams.map((t) => t.id));
  const [isActive, setIsActive] = useState(employee.isActive);

  async function submit() {
    try {
      await onUpdate.mutateAsync({ employeeId: employee.id, fullName: fullName.trim(), jobTitle: jobTitle.trim() || null, departmentId, teamIds, isActive });
      onSuccess();
      onClose();
    } catch (err) {
      onError(extractApiError(err).message);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Edit ${employee.fullName}`}
      subtitle={employee.workEmail}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={onUpdate.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label required>Full Name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label>Job Title</Label>
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>
        <DepartmentTeamPicker departmentId={departmentId} setDepartmentId={setDepartmentId} teamIds={teamIds} setTeamIds={setTeamIds} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus-visible:focus-ring" />
          Active
        </label>
      </div>
    </Drawer>
  );
};
