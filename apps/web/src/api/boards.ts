import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient";
import { Board, BoardStage } from "../lib/types";

export function useBoards(params: { search?: string; scope?: string; serviceId?: string }) {
  return useQuery({
    queryKey: ["boards", params],
    queryFn: async () => (await api.get<{ data: Board[] }>("/boards", { params })).data.data,
  });
}

export function useBoardDetail(boardId: string | undefined) {
  return useQuery({
    queryKey: ["board", boardId],
    queryFn: async () => (await api.get(`/boards/${boardId}`)).data.data,
    enabled: !!boardId,
  });
}

export function useBoardTemplates() {
  return useQuery({
    queryKey: ["board-templates"],
    queryFn: async () => (await api.get("/boards/templates")).data.data,
  });
}

/** Resolves (and lazily provisions, on first-ever visit) the single
 * company-wide Enquiry List board. Callers redirect to `/workflow/boards/:id`
 * with the returned id rather than rendering anything from this response. */
export function useEnquiryListBoard() {
  return useQuery({
    queryKey: ["enquiry-list-board"],
    queryFn: async () => (await api.get<{ data: { id: string; name: string } }>("/boards/enquiry-list")).data.data,
    retry: false,
  });
}

/** Same lazy-provisioning pattern as useEnquiryListBoard, for the Estimation
 * board that sits between Enquiry List and Projects. */
export function useEstimationBoard() {
  return useQuery({
    queryKey: ["estimation-board"],
    queryFn: async () => (await api.get<{ data: { id: string; name: string } }>("/boards/estimation")).data.data,
    retry: false,
  });
}

/** Same lazy-provisioning pattern, for the Accounts board that sits between
 * Estimation and Projects. */
export function useAccountsBoard() {
  return useQuery({
    queryKey: ["accounts-board"],
    queryFn: async () => (await api.get<{ data: { id: string; name: string } }>("/boards/accounts")).data.data,
    retry: false,
  });
}

export interface ProcurementRecord {
  id: string;
  boardId: string;
  procurementId: string;
  vendorName: string | null;
  vendorContact: string | null;
  vendorAddress: string | null;
  poNumber: string | null;
  orderDate: string | null;
  lineItems: Array<{ description: string; quantity: number; unitCost: number }> | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  status: "PENDING" | "ORDERED" | "DELIVERED" | "CANCELLED";
  notes: string | null;
  updatedAt: string;
  createdAt: string;
}

/** Every Project board that has been awarded from Accounts — the
 * "Procurement" nav lists these. */
export function useProcurementBoards(search?: string) {
  return useQuery({
    queryKey: ["procurement-boards", search],
    queryFn: async () => (await api.get("/boards/procurement", { params: { search: search || undefined } })).data.data,
  });
}

export function useProcurementRecord(boardId: string | undefined) {
  return useQuery({
    queryKey: ["procurement", boardId],
    queryFn: async () => (await api.get<{ data: ProcurementRecord }>(`/boards/${boardId}/procurement`)).data.data,
    enabled: !!boardId,
    retry: false,
  });
}

export function useUpdateProcurementRecord(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ProcurementRecord>) => (await api.patch<{ data: ProcurementRecord }>(`/boards/${boardId}/procurement`, payload)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["procurement", boardId] });
      qc.invalidateQueries({ queryKey: ["procurement-boards"] });
      qc.invalidateQueries({ queryKey: ["board", boardId] });
    },
  });
}

export interface Service {
  id: string;
  name: string;
  projectCount: number;
}

/** The fixed company Service catalog. "Projects" nav shows this list first;
 * picking one shows the projects filed under it (useBoards({ serviceId })). */
export function useServices() {
  return useQuery({
    queryKey: ["services"],
    queryFn: async () => (await api.get<{ data: Service[] }>("/boards/services")).data.data,
  });
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: unknown) => (await api.post("/boards", payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards"] }),
  });
}

export function useUpdateBoard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: unknown) => (await api.patch(`/boards/${boardId}`, payload)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boards"] });
      qc.invalidateQueries({ queryKey: ["board", boardId] });
    },
  });
}

export function useArchiveBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ boardId, archived }: { boardId: string; archived: boolean }) =>
      (await api.post(`/boards/${boardId}/archive`, { archived })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards"] }),
  });
}

export function useSetBoardCompleted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ boardId, completed }: { boardId: string; completed: boolean }) =>
      (await api.post(`/boards/${boardId}/complete`, { completed })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boards"] });
      qc.invalidateQueries({ queryKey: ["history"] });
    },
  });
}

export function useDuplicateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (boardId: string) => (await api.post(`/boards/${boardId}/duplicate`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards"] }),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ boardId, confirmCascade }: { boardId: string; confirmCascade?: boolean }) =>
      api.delete(`/boards/${boardId}`, { params: { confirmCascade } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards"] }),
  });
}

export function useAddStage(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; color?: string; wipLimit?: number | null }) =>
      (await api.post(`/boards/${boardId}/stages`, payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });
}

export function useUpdateStage(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stageId, ...payload }: { stageId: string } & Partial<BoardStage>) =>
      (await api.patch(`/boards/${boardId}/stages/${stageId}`, payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });
}

export function useDeleteStage(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stageId: string) => api.delete(`/boards/${boardId}/stages/${stageId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });
}

export function useReorderStages(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedStageIds: string[]) => api.post(`/boards/${boardId}/stages/reorder`, { orderedStageIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });
}

export function useAddBoardMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { userId: string; role: string }) => (await api.post(`/boards/${boardId}/members`, payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });
}

export function useUpdateBoardMemberRole(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) =>
      (await api.patch(`/boards/${boardId}/members/${userId}`, { role })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });
}

export function useRemoveBoardMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => api.delete(`/boards/${boardId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });
}
