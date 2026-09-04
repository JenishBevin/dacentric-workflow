import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE_URL } from "../lib/apiClient";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TicketAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy?: { id: string; name: string };
  createdAt: string;
}

export interface Ticket {
  id: string;
  ticketId: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdById: string;
  createdBy?: { id: string; name: string; workEmail: string };
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments?: TicketAttachment[];
}

export function useMyTickets() {
  return useQuery({ queryKey: ["tickets", "mine"], queryFn: async () => (await api.get<{ data: Ticket[] }>("/tickets/mine")).data.data });
}

export function useAllTickets(status: TicketStatus | "" = "", opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["tickets", "all", status],
    queryFn: async () => (await api.get<{ data: Ticket[] }>("/tickets", { params: status ? { status } : {} })).data.data,
    enabled: opts.enabled ?? true,
  });
}

export function useTicket(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["tickets", "detail", ticketId],
    queryFn: async () => (await api.get<{ data: Ticket }>(`/tickets/${ticketId}`)).data.data,
    enabled: !!ticketId,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title: string; description: string; priority?: TicketPriority }) =>
      (await api.post<{ data: Ticket }>("/tickets", payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
  });
}

export function useUpdateTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, status, resolutionNote }: { ticketId: string; status: TicketStatus; resolutionNote?: string }) =>
      (await api.patch<{ data: Ticket }>(`/tickets/${ticketId}/status`, { status, resolutionNote })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
  });
}

export function useUploadTicketAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, file }: { ticketId: string; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      return api.post(`/tickets/${ticketId}/attachments`, form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (_res, { ticketId }) => qc.invalidateQueries({ queryKey: ["tickets", "detail", ticketId] }),
  });
}

export function useDeleteTicketAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, attachmentId }: { ticketId: string; attachmentId: string }) =>
      api.delete(`/tickets/${ticketId}/attachments/${attachmentId}`),
    onSuccess: (_res, { ticketId }) => qc.invalidateQueries({ queryKey: ["tickets", "detail", ticketId] }),
  });
}

export function ticketAttachmentUrl(ticketId: string, attachmentId: string): string {
  return `${API_BASE_URL}/tickets/${ticketId}/attachments/${attachmentId}/download`;
}
