import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient";

const CONVERSATIONS_POLL_MS = 15000;
const MESSAGES_POLL_MS = 4000;

export function useMessageableUsers(search: string, enabled: boolean) {
  return useQuery({
    queryKey: ["chat-users", search],
    queryFn: async () => (await api.get("/chat/users", { params: { search } })).data.data,
    enabled,
  });
}

export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: ["chat-conversations"],
    queryFn: async () => (await api.get("/chat/conversations")).data.data,
    enabled,
    refetchInterval: enabled ? CONVERSATIONS_POLL_MS : false,
  });
}

export function useUnreadChatCount() {
  return useQuery({
    queryKey: ["chat-unread-count"],
    queryFn: async () => (await api.get("/chat/conversations/unread-count")).data.data.count as number,
    refetchInterval: CONVERSATIONS_POLL_MS,
  });
}

export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => (await api.post("/chat/conversations", { userId })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-conversations"] }),
  });
}

export function useConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["chat-messages", conversationId],
    queryFn: async () => (await api.get(`/chat/conversations/${conversationId}/messages`)).data.data,
    enabled: !!conversationId,
    refetchInterval: conversationId ? MESSAGES_POLL_MS : false,
  });
}

export function useSendChatMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, files }: { body?: string; files?: File[] }) => {
      const form = new FormData();
      if (body) form.append("body", body);
      files?.forEach((f) => form.append("files", f));
      return (await api.post(`/chat/conversations/${conversationId}/messages`, form, { headers: { "Content-Type": "multipart/form-data" } })).data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      qc.invalidateQueries({ queryKey: ["chat-unread-count"] });
    },
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => api.post(`/chat/conversations/${conversationId}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      qc.invalidateQueries({ queryKey: ["chat-unread-count"] });
    },
  });
}

export function useEditChatMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, body }: { messageId: string; body: string }) =>
      (await api.patch(`/chat/conversations/${conversationId}/messages/${messageId}`, { body })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
  });
}

export function useDeleteChatMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => api.delete(`/chat/conversations/${conversationId}/messages/${messageId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => api.delete(`/chat/conversations/${conversationId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      qc.invalidateQueries({ queryKey: ["chat-unread-count"] });
    },
  });
}

export async function downloadChatAttachment(attachmentId: string, fileName: string) {
  const res = await api.get(`/chat/attachments/${attachmentId}/download`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
