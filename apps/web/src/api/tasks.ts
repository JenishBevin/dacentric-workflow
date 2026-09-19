import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient";
import { TaskSummary } from "../lib/types";

export function useBoardTasks(boardId: string | undefined, filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ["board-tasks", boardId, filters],
    queryFn: async () => (await api.get<{ data: TaskSummary[] }>(`/tasks/board/${boardId}`, { params: filters })).data.data,
    enabled: !!boardId,
    refetchInterval: 15000,
  });
}

export function useTask(taskId: string | undefined) {
  return useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => (await api.get<{ data: TaskSummary }>(`/tasks/${taskId}`)).data.data,
    enabled: !!taskId,
  });
}

export function useTaskActivity(taskId: string | undefined) {
  return useQuery({
    queryKey: ["task-activity", taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}/activity`)).data.data,
    enabled: !!taskId,
  });
}

export function useTaskStatusHistory(taskId: string | undefined) {
  return useQuery({
    queryKey: ["task-status-history", taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}/status-history`)).data.data,
    enabled: !!taskId,
  });
}

export function useTaskComments(taskId: string | undefined) {
  return useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}/comments`)).data.data,
    enabled: !!taskId,
  });
}

export function useTaskAttachments(taskId: string | undefined) {
  return useQuery({
    queryKey: ["task-attachments", taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}/attachments`)).data.data,
    enabled: !!taskId,
  });
}

function invalidateTaskEverywhere(qc: ReturnType<typeof useQueryClient>, taskId?: string, boardId?: string) {
  qc.invalidateQueries({ queryKey: ["board-tasks"] });
  qc.invalidateQueries({ queryKey: ["my-tasks"] });
  qc.invalidateQueries({ queryKey: ["team-workload"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["dashboard-tasks"] });
  qc.invalidateQueries({ queryKey: ["boards"] });
  if (taskId) {
    qc.invalidateQueries({ queryKey: ["task", taskId] });
    qc.invalidateQueries({ queryKey: ["task-activity", taskId] });
  }
  if (boardId) qc.invalidateQueries({ queryKey: ["board", boardId] });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: unknown) => (await api.post<{ data: TaskSummary }>("/tasks", payload)).data.data,
    onSuccess: (task) => invalidateTaskEverywhere(qc, task.id, task.boardId),
  });
}

export function useUpdateTask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.patch<{ data: TaskSummary }>(`/tasks/${taskId}`, payload)).data.data,
    onSuccess: (task) => invalidateTaskEverywhere(qc, taskId, task.boardId),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => api.delete(`/tasks/${taskId}`),
    onSuccess: () => invalidateTaskEverywhere(qc),
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, stageId, confirmWipOverride, version }: { taskId: string; stageId: string; confirmWipOverride?: boolean; version?: number }) =>
      (await api.post<{ data: TaskSummary }>(`/tasks/${taskId}/move`, { stageId, confirmWipOverride, version })).data.data,
    onSuccess: (task) => invalidateTaskEverywhere(qc, task.id, task.boardId),
  });
}

export interface AwardTaskResult {
  kind: "moved-to-estimation" | "project-created-pending-approval" | "project-created";
  id: string;
  name: string;
}

/** "Awarded" is a two-stage pipeline: from Enquiry List it moves the task
 * onto Estimation; from Estimation it immediately creates the Project (and
 * a ProcurementRecord alongside it) under the task's Service, moving the
 * task onto it — gated behind Accounts sign-off (accountsApprovalStatus on
 * the new board) rather than a separate hand-off stage. `project-created` is
 * only returned by the legacy path (a task still on the old Accounts
 * board). The `kind` on the result tells the caller which one just
 * happened. */
export function useAwardTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => (await api.post<{ data: AwardTaskResult }>(`/tasks/${taskId}/award`)).data.data,
    onSuccess: (result, taskId) => {
      invalidateTaskEverywhere(qc, taskId, result.id);
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["estimation-board"] });
      qc.invalidateQueries({ queryKey: ["accounts-pending-boards"] });
      qc.invalidateQueries({ queryKey: ["procurement-boards"] });
      qc.invalidateQueries({ queryKey: ["boards"] });
    },
  });
}

export interface QuotationLineItemInput {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export interface EstimationQuote {
  currency: string;
  title: string | null;
  quotationRef: string | null;
  recipientName: string | null;
  recipientCompany: string | null;
  recipientLocation: string | null;
  lineItems: QuotationLineItemInput[];
  subtotal: number;
  vatRate: number;
  vatAmount: number | null;
  totalAmount: number | null;
  validityDays: number | null;
  paymentTerms: string | null;
  notes: string | null;
  generalTerms: string | null;
  preparerName: string | null;
  preparerDesignation: string | null;
  preparerMobile: string | null;
  quotedAt: string | null;
}

export interface SaveEstimationQuoteInput {
  taskId: string;
  currency: string;
  title?: string;
  quotationRef?: string;
  recipientName?: string;
  recipientCompany?: string;
  recipientLocation?: string;
  lineItems: QuotationLineItemInput[];
  vatRate: number;
  validityDays?: number;
  paymentTerms?: string;
  notes?: string;
  generalTerms?: string;
  preparerName?: string;
  preparerDesignation?: string;
  preparerMobile?: string;
}

/** The "Create Quotation" popup on an Estimation-board task. */
export function useSaveEstimationQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, ...body }: SaveEstimationQuoteInput) =>
      (await api.put<{ data: EstimationQuote }>(`/tasks/${taskId}/quotation`, body)).data.data,
    onSuccess: (_result, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["task-activity", taskId] });
    },
  });
}

export function useMarkTaskLost() {
  const qc = useQueryClient();
  return useMutation({
    // reason is only actually required server-side for an Enquiry List task
    // (it starts the approval request there); every other board ignores it
    // and moves straight to Lost, same as before.
    mutationFn: async ({ taskId, reason }: { taskId: string; reason?: string }) =>
      (await api.post(`/tasks/${taskId}/lost`, { reason })).data.data,
    onSuccess: (task: any, { taskId }) => {
      invalidateTaskEverywhere(qc, taskId, task.boardId);
      qc.invalidateQueries({ queryKey: ["history"] });
    },
  });
}

/** Undoes a Lost or Completed enquiry from Project/Task History — sends it
 * back to whichever stage it was on beforehand, on the same board. */
export function useRestoreTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => (await api.post<{ data: TaskSummary }>(`/tasks/${taskId}/restore`)).data.data,
    onSuccess: (task) => {
      invalidateTaskEverywhere(qc, task.id, task.boardId);
      qc.invalidateQueries({ queryKey: ["history"] });
    },
  });
}

/** The "Reject" action on an Accounts-board task — Approve reuses
 * useAwardTask() like every other board's Awarded button. */
export function useRejectAccountsTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, reason }: { taskId: string; reason: string }) =>
      (await api.post<{ data: TaskSummary }>(`/tasks/${taskId}/accounts/reject`, { reason })).data.data,
    onSuccess: (task) => invalidateTaskEverywhere(qc, task.id, task.boardId),
  });
}

/** Management's decision on a pending Lost request (Enquiry List only —
 * see requestLostApproval on the backend). Approving lands the task on the
 * board's Lost stage, same as useMarkTaskLost. */
export function useLostApprovalMutations(taskId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    invalidateTaskEverywhere(qc, taskId);
    qc.invalidateQueries({ queryKey: ["history"] });
  };
  const approve = useMutation({ mutationFn: async () => api.post(`/tasks/${taskId}/lost/approve`), onSuccess: invalidate });
  const reject = useMutation({ mutationFn: async (reason: string) => api.post(`/tasks/${taskId}/lost/reject`, { reason }), onSuccess: invalidate });
  return { approve, reject };
}

export function useQuickComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => (await api.post<{ data: TaskSummary }>(`/tasks/${taskId}/complete`)).data.data,
    onSuccess: (task) => invalidateTaskEverywhere(qc, task.id, task.boardId),
  });
}

export function useQuickEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, ...payload }: { taskId: string; priority?: string; dueDate?: string | null }) =>
      (await api.patch<{ data: TaskSummary }>(`/tasks/${taskId}/quick-edit`, payload)).data.data,
    onSuccess: (task) => invalidateTaskEverywhere(qc, task.id, task.boardId),
  });
}

export function useSetAssignees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, assigneeUserIds }: { taskId: string; assigneeUserIds: string[] }) =>
      (await api.put<{ data: TaskSummary }>(`/tasks/${taskId}/assignees`, { assigneeUserIds })).data.data,
    onSuccess: (task) => invalidateTaskEverywhere(qc, task.id, task.boardId),
  });
}

export function useDuplicateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => (await api.post(`/tasks/${taskId}/duplicate`)).data.data,
    onSuccess: () => invalidateTaskEverywhere(qc),
  });
}

// --- Checklist / comments / attachments / watchers / dependencies / approval ---

export function useChecklistMutations(taskId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["task", taskId] });
    qc.invalidateQueries({ queryKey: ["task-activity", taskId] });
  };
  const add = useMutation({ mutationFn: async (payload: { text: string; ownerId?: string }) => api.post(`/tasks/${taskId}/checklist`, payload), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: async ({ itemId, ...payload }: { itemId: string; text?: string; isComplete?: boolean; ownerId?: string | null }) =>
      api.patch(`/tasks/${taskId}/checklist/${itemId}`, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: async (itemId: string) => api.delete(`/tasks/${taskId}/checklist/${itemId}`), onSuccess: invalidate });
  return { add, update, remove };
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { body: string; mentionedUserIds?: string[] }) => api.post(`/tasks/${taskId}/comments`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-comments", taskId] });
      qc.invalidateQueries({ queryKey: ["task-activity", taskId] });
      qc.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });
}

export function useUploadAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post(`/tasks/${taskId}/attachments`, form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-attachments", taskId] });
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["task-activity", taskId] });
    },
  });
}

export function useDeleteAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachmentId: string) => api.delete(`/tasks/${taskId}/attachments/${attachmentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-attachments", taskId] });
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["task-activity", taskId] });
    },
  });
}

export function useDownloadAttachmentUrl(taskId: string, attachmentId: string) {
  return `${api.defaults.baseURL}/tasks/${taskId}/attachments/${attachmentId}/download`;
}

// --- Secret Attachments (Estimation only — Super Admin/Accounts/Procurement/Management) ---
export function useTaskSecretAttachments(taskId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["task-secret-attachments", taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}/secret-attachments`)).data.data,
    enabled: !!taskId && enabled,
  });
}

export function useUploadSecretAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post(`/tasks/${taskId}/secret-attachments`, form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-secret-attachments", taskId] }),
  });
}

export function useDeleteSecretAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachmentId: string) => api.delete(`/tasks/${taskId}/secret-attachments/${attachmentId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-secret-attachments", taskId] }),
  });
}

export interface ImportEnquiriesResult {
  created: number;
  skipped: Array<{ row: number; reason: string }>;
}

export function useImportEnquiries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await api.post<{ data: ImportEnquiriesResult }>("/tasks/import-enquiries", form, { headers: { "Content-Type": "multipart/form-data" } }))
        .data.data;
    },
    onSuccess: () => invalidateTaskEverywhere(qc),
  });
}

export function useWatcherMutations(taskId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["task", taskId] });
    qc.invalidateQueries({ queryKey: ["task-activity", taskId] });
  };
  const add = useMutation({ mutationFn: async (userId: string) => api.post(`/tasks/${taskId}/watchers`, { userId }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: async (userId: string) => api.delete(`/tasks/${taskId}/watchers/${userId}`), onSuccess: invalidate });
  return { add, remove };
}

export function useDependencyMutations(taskId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["task", taskId] });
    qc.invalidateQueries({ queryKey: ["task-activity", taskId] });
  };
  const add = useMutation({ mutationFn: async (payload: { type: string; taskId: string }) => api.post(`/tasks/${taskId}/dependencies`, payload), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: async (dependencyId: string) => api.delete(`/tasks/${taskId}/dependencies/${dependencyId}`), onSuccess: invalidate });
  return { add, remove };
}

export function useSetTaskTags(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tagIds: string[]) => api.put(`/tasks/${taskId}/tags`, { tagIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["task-activity", taskId] });
    },
  });
}

export function useApprovalMutations(taskId: string) {
  const qc = useQueryClient();
  const invalidate = () => invalidateTaskEverywhere(qc, taskId);
  const approve = useMutation({ mutationFn: async () => api.post(`/tasks/${taskId}/approval/approve`), onSuccess: invalidate });
  const reject = useMutation({ mutationFn: async (reason: string) => api.post(`/tasks/${taskId}/approval/reject`, { reason }), onSuccess: invalidate });
  return { approve, reject };
}

export function useTaskSearch(query: string) {
  return useQuery({
    queryKey: ["task-search", query],
    queryFn: async () => (await api.get("/tasks/search/lookup", { params: { q: query } })).data.data,
    enabled: query.length > 1,
  });
}
