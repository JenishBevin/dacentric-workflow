import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/apiClient";

export interface HistoryFilters {
  type?: "PROJECT" | "TASK";
  status?: "COMPLETED" | "IN_PROGRESS" | "LOST";
  dateFrom?: string;
  dateTo?: string;
}

export function useHistory(filters: HistoryFilters) {
  return useQuery({
    queryKey: ["history", filters],
    queryFn: async () => (await api.get("/history", { params: filters })).data.data,
  });
}
