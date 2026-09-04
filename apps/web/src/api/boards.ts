import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient";
import { Board, BoardStage } from "../lib/types";

export function useBoards(params: { search?: string; scope?: string }) {
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
