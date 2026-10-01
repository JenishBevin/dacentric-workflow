import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient";

export interface VendorContact {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  brands: string[];
  services: string[];
  contacts: VendorContact[];
  website: string | null;
  vatNumber: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorDetailsInput {
  website: string | null;
  vatNumber: string | null;
  address: string | null;
  notes: string | null;
}

export interface VendorFilterOptions {
  brands: string[];
  services: string[];
}

export function useVendors(filters: { search?: string; brand?: string; service?: string }) {
  return useQuery({
    queryKey: ["vendors", filters],
    queryFn: async () => (await api.get<{ data: Vendor[] }>("/vendors", { params: filters })).data.data,
  });
}

export function useVendorFilterOptions() {
  return useQuery({
    queryKey: ["vendor-filter-options"],
    queryFn: async () => (await api.get<{ data: VendorFilterOptions }>("/vendors/filter-options")).data.data,
  });
}

export interface ImportVendorsResult {
  vendorsCreated: number;
  vendorsUpdated: number;
  servicesFound: number;
  brandsFound: number;
  rowsSkipped: number;
}

export function useImportVendors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await api.post<{ data: ImportVendorsResult }>("/vendors/import", form, { headers: { "Content-Type": "multipart/form-data" } })).data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      qc.invalidateQueries({ queryKey: ["vendor-filter-options"] });
    },
  });
}

export function useUpdateVendorDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: VendorDetailsInput }) =>
      (await api.patch<{ data: Vendor }>(`/vendors/${id}`, input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/vendors/${id}`)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      qc.invalidateQueries({ queryKey: ["vendor-filter-options"] });
    },
  });
}
