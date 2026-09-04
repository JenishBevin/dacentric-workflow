import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient";

export interface WorkTimeToday {
  todaySeconds: number;
  isRunning: boolean;
  currentSegmentStartedAt: string | null;
}

export interface WorkTimeSummary {
  totalSeconds: number;
  days: Array<{ date: string; seconds: number }>;
}

export interface WorkTimeReportRow {
  employeeId: string;
  userId: string;
  name: string;
  department: string | null;
  team: string | null;
  todaySeconds: number;
  isRunning: boolean;
  rangeSeconds: number;
  days: Array<{ date: string; seconds: number }>;
}

export function useWorkTimeToday() {
  return useQuery({
    queryKey: ["work-time", "today"],
    queryFn: async () => (await api.get<{ data: WorkTimeToday }>("/work-time/today")).data.data,
    refetchInterval: 60000,
  });
}

export function useWorkTimeSummary(range: "week" | "month") {
  return useQuery({
    queryKey: ["work-time", "summary", range],
    queryFn: async () => (await api.get<{ data: WorkTimeSummary }>("/work-time/summary", { params: { range } })).data.data,
    refetchInterval: 60000,
  });
}

export function useWorkTimeReport(range: "week" | "month") {
  return useQuery({
    queryKey: ["work-time", "reports", range],
    queryFn: async () => (await api.get<{ data: WorkTimeReportRow[] }>("/work-time/reports", { params: { range } })).data.data,
  });
}

export function useStartWorkTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<{ data: WorkTimeToday }>("/work-time/start")).data.data,
    onSuccess: (data) => {
      qc.setQueryData(["work-time", "today"], data);
      qc.invalidateQueries({ queryKey: ["work-time", "summary"] });
    },
  });
}

export function useHeartbeatWorkTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<{ data: WorkTimeToday }>("/work-time/heartbeat")).data.data,
    onSuccess: (data) => {
      qc.setQueryData(["work-time", "today"], data);
      qc.invalidateQueries({ queryKey: ["work-time", "summary"] });
    },
  });
}

export function usePauseWorkTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<{ data: WorkTimeToday }>("/work-time/pause")).data.data,
    onSuccess: (data) => {
      qc.setQueryData(["work-time", "today"], data);
      qc.invalidateQueries({ queryKey: ["work-time", "summary"] });
    },
  });
}
