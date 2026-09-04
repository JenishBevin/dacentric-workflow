import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient";
import { EmployeeDirectoryEntry, WorkloadRow } from "../lib/types";

// --- Employee directory (assignee/watcher/approver pickers) ---
export function useEmployeeDirectory(search = "") {
  return useQuery({
    queryKey: ["employees", search],
    queryFn: async () => (await api.get<{ data: EmployeeDirectoryEntry[] }>("/users/employees", { params: { search } })).data.data,
  });
}

// --- Departments / Teams (Team Workload filters — Section 30) ---
export function useDepartments() {
  return useQuery({ queryKey: ["departments"], queryFn: async () => (await api.get("/users/departments")).data.data });
}
export function useTeams(departmentId?: string) {
  return useQuery({ queryKey: ["teams", departmentId], queryFn: async () => (await api.get("/users/teams", { params: { departmentId } })).data.data });
}

export function useUnlinkedEmployees(search = "") {
  return useQuery({
    queryKey: ["unlinked-employees", search],
    queryFn: async () => (await api.get("/users/employees/unlinked", { params: { search } })).data.data,
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => (await api.post("/users/departments", { name })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; departmentId?: string | null }) => (await api.post("/users/teams", payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

// --- Employees (HRMS records) — admin management (Section 31: this build
// creates them itself since there's no real external HRMS to sync from) ---
export function useAllEmployees(search = "") {
  return useQuery({
    queryKey: ["all-employees", search],
    queryFn: async () => (await api.get("/users/employees/all", { params: { search } })).data.data,
  });
}

export interface CreateEmployeeInput {
  fullName: string;
  workEmail: string;
  employeeCode?: string;
  jobTitle?: string;
  departmentId?: string | null;
  teamId?: string | null;
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateEmployeeInput) => (await api.post("/users/employees", payload)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-employees"] });
      qc.invalidateQueries({ queryKey: ["unlinked-employees"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, ...payload }: { employeeId: string; fullName?: string; jobTitle?: string | null; departmentId?: string | null; teamId?: string | null; isActive?: boolean }) =>
      (await api.patch(`/users/employees/${employeeId}`, payload)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-employees"] });
      qc.invalidateQueries({ queryKey: ["unlinked-employees"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

// --- Users (admin) ---
export function useUsers(filters: { status?: string; search?: string } = {}) {
  return useQuery({ queryKey: ["users", filters], queryFn: async () => (await api.get("/users", { params: filters })).data.data });
}
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (payload: unknown) => (await api.post("/users", payload)).data.data, onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }) });
}
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, ...payload }: { userId: string } & Record<string, unknown>) => (await api.patch(`/users/${userId}`, payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}
export function useResendInvite() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (userId: string) => api.post(`/users/${userId}/resend-invite`), onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }) });
}
export function useBulkImportUsers() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (users: unknown[]) => (await api.post("/users/bulk-import", { users })).data.data, onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }) });
}

// --- Roles & permissions ---
export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: async () => (await api.get("/roles")).data.data });
}
export function useUpdateRolePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { roleId: string; module: string; permission: string; scope: string }) =>
      (await api.patch(`/roles/${payload.roleId}/permissions`, payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

// --- Tags ---
export function useTags(search = "") {
  return useQuery({ queryKey: ["tags", search], queryFn: async () => (await api.get("/tags", { params: { search } })).data.data });
}
export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (payload: { name: string; color?: string }) => (await api.post("/tags", payload)).data.data, onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }) });
}
export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tagId, ...payload }: { tagId: string; name?: string; color?: string }) => (await api.patch(`/tags/${tagId}`, payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}
export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (tagId: string) => api.delete(`/tags/${tagId}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }) });
}

// --- My Tasks ---
export function useMyTasks() {
  return useQuery({ queryKey: ["my-tasks"], queryFn: async () => (await api.get("/my-tasks")).data.data, refetchInterval: 20000 });
}

// --- Team workload ---
export function useTeamWorkload(filters: Record<string, unknown> = {}) {
  return useQuery({ queryKey: ["team-workload", filters], queryFn: async () => (await api.get<{ data: WorkloadRow[] }>("/team-workload", { params: filters })).data.data });
}
export function useEmployeeWorkloadDetail(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-workload", employeeId],
    queryFn: async () => (await api.get(`/team-workload/employee/${employeeId}`)).data.data,
    enabled: !!employeeId,
  });
}

// --- Dashboard ---
export function useDashboard(filters: Record<string, unknown> = {}) {
  return useQuery({ queryKey: ["dashboard", filters], queryFn: async () => (await api.get("/dashboard", { params: filters })).data.data });
}
export function useDashboardTaskList(kind: string | null) {
  return useQuery({
    queryKey: ["dashboard-tasks", kind],
    queryFn: async () => (await api.get("/dashboard/tasks", { params: { kind } })).data.data,
    enabled: !!kind,
  });
}

// --- Notifications ---
export function useNotifications(page = 1) {
  return useQuery({ queryKey: ["notifications", page], queryFn: async () => (await api.get("/notifications", { params: { page } })).data, refetchInterval: 15000 });
}
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (id: string) => api.post(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
}
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async () => api.post("/notifications/mark-all-read"), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
}
export function useNotificationPreferences() {
  return useQuery({ queryKey: ["notification-preferences"], queryFn: async () => (await api.get("/notifications/preferences")).data.data });
}
export function useUpdateNotificationPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ event, ...payload }: { event: string; inApp: boolean; email: boolean }) => api.put(`/notifications/preferences/${event}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });
}

// --- Audit ---
export function useAuditLog(filters: Record<string, unknown> = {}) {
  return useQuery({ queryKey: ["audit", filters], queryFn: async () => (await api.get("/audit", { params: filters })).data });
}

// --- CRM/ERP linked records ---
export function useLinkedRecordSearch(query: string, type?: string) {
  return useQuery({
    queryKey: ["linked-records", query, type],
    queryFn: async () => (await api.get("/integrations/crm/records", { params: { q: query, type } })).data.data,
    enabled: query.length > 0,
  });
}

// --- HRMS integration ---
export function useHrmsLeaveRequests(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["hrms-leave-requests"],
    queryFn: async () => (await api.get("/integrations/hrms/leave-requests")).data.data,
    enabled: opts.enabled ?? true,
  });
}
export function useHrmsWorkload(leaveRequestId: string | undefined) {
  return useQuery({
    queryKey: ["hrms-workload", leaveRequestId],
    queryFn: async () => (await api.get(`/integrations/hrms/leave-requests/${leaveRequestId}/workload`)).data.data,
    enabled: !!leaveRequestId,
  });
}
export function useDecideLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "APPROVED" | "REJECTED" }) => api.post(`/integrations/hrms/leave-requests/${id}/decision`, { decision }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hrms-leave-requests"] }),
  });
}

// --- My own leave applications (self-service) ---
export function useMyLeaveRequests() {
  return useQuery({ queryKey: ["my-leave-requests"], queryFn: async () => (await api.get("/integrations/hrms/leave-requests/mine")).data.data });
}
export function useApplyForLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { startDate: string; endDate: string; reason?: string }) =>
      (await api.post("/integrations/hrms/leave-requests", payload)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
      qc.invalidateQueries({ queryKey: ["hrms-leave-requests"] });
    },
  });
}

// --- Exports (trigger file download) ---
export function buildExportUrl(path: string, params: Record<string, unknown> = {}) {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return `${api.defaults.baseURL}${path}${qs ? `?${qs}` : ""}`;
}

export async function downloadExport(path: string, params: Record<string, unknown>, filename: string) {
  const res = await api.get(path, { params, responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
}
