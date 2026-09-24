import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient";

export interface ChecklistTemplate {
  id: string;
  name: string;
  items: string[];
}

export function useChecklistTemplates() {
  return useQuery({
    queryKey: ["checklist-templates"],
    queryFn: async () => (await api.get<{ data: ChecklistTemplate[] }>("/checklist-templates")).data.data,
  });
}

export function useCreateChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; items: string[] }) =>
      (await api.post<{ data: ChecklistTemplate }>("/checklist-templates", payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-templates"] }),
  });
}
