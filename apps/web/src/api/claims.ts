import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient";

export const CLAIM_CURRENCIES = ["AED", "USD", "INR", "GBP", "EUR", "SAR"] as const;

export function useMyClaims() {
  return useQuery({ queryKey: ["my-claims"], queryFn: async () => (await api.get("/claims/mine")).data.data });
}

export function useActionableClaims(enabled: boolean) {
  return useQuery({
    queryKey: ["actionable-claims"],
    queryFn: async () => (await api.get("/claims")).data.data,
    enabled,
  });
}

export interface SettledClaimsFilters {
  dateFrom?: string;
  dateTo?: string;
}

export function useSettledClaims(filters: SettledClaimsFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["settled-claims", filters],
    queryFn: async () => (await api.get("/claims/settled", { params: filters })).data.data,
    enabled,
  });
}

export function useSubmitClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      amount,
      currency,
      reason,
      expenseDate,
      files,
    }: {
      amount: number;
      currency: string;
      reason: string;
      expenseDate: string;
      files: File[];
    }) => {
      const form = new FormData();
      form.append("amount", String(amount));
      form.append("currency", currency);
      form.append("reason", reason);
      form.append("expenseDate", expenseDate);
      files.forEach((f) => form.append("files", f));
      return (await api.post("/claims", form, { headers: { "Content-Type": "multipart/form-data" } })).data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-claims"] });
      qc.invalidateQueries({ queryKey: ["actionable-claims"] });
    },
  });
}

export function useVerifyClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision, reason }: { id: string; decision: "APPROVED" | "REJECTED"; reason?: string }) =>
      (await api.post(`/claims/${id}/verify`, { decision, reason })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["actionable-claims"] }),
  });
}

export function useDecideClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision, reason }: { id: string; decision: "APPROVED" | "REJECTED"; reason?: string }) =>
      (await api.post(`/claims/${id}/decision`, { decision, reason })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["actionable-claims"] }),
  });
}

export function useSettleClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post(`/claims/${id}/settle`)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["actionable-claims"] });
      qc.invalidateQueries({ queryKey: ["settled-claims"] });
    },
  });
}

export async function downloadClaimAttachment(attachmentId: string, fileName: string) {
  const res = await api.get(`/claims/attachments/${attachmentId}/download`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
