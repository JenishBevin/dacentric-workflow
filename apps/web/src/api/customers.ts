import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient";
import { CustomerSummary, CustomerDetail, CustomerRef } from "../lib/types";

export function useCustomers(params: { search?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ["customers", params],
    queryFn: async () => (await api.get<{ data: CustomerSummary[] }>("/customers", { params })).data.data,
  });
}

export function useCustomerDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["customer", id],
    queryFn: async () => (await api.get<{ data: CustomerDetail }>(`/customers/${id}`)).data.data,
    enabled: !!id,
  });
}

/** Debounced-by-caller name/ID search for the Customer picker embedded in
 * New Enquiry / New Project. */
export function useCustomerSearch(q: string) {
  return useQuery({
    queryKey: ["customer-search", q],
    queryFn: async () => (await api.get<{ data: CustomerRef[] }>("/customers/search/lookup", { params: { q } })).data.data,
    enabled: q.trim().length > 0,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: unknown) => (await api.post("/customers", payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useUpdateCustomer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: unknown) => (await api.patch(`/customers/${id}`, payload)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer", id] });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/customers/${id}`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useAddContact(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: unknown) => (await api.post(`/customers/${customerId}/contacts`, payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer", customerId] }),
  });
}

export function useUpdateContact(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, ...payload }: { contactId: string; [key: string]: unknown }) =>
      (await api.patch(`/customers/${customerId}/contacts/${contactId}`, payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer", customerId] }),
  });
}

export function useDeleteContact(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) => (await api.delete(`/customers/${customerId}/contacts/${contactId}`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer", customerId] }),
  });
}

export function useUploadCustomerDocument(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await api.post(`/customers/${customerId}/documents`, form, { headers: { "Content-Type": "multipart/form-data" } })).data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer", customerId] }),
  });
}

export function useDeleteCustomerDocument(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => (await api.delete(`/customers/${customerId}/documents/${documentId}`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer", customerId] }),
  });
}

export function useDownloadCustomerDocumentUrl(customerId: string, documentId: string) {
  return `${api.defaults.baseURL}/customers/${customerId}/documents/${documentId}/download`;
}
