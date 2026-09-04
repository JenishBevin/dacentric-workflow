import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
import { useTeamWorkload, useEmployeeWorkloadDetail } from "../api/misc";
import { useDepartments, useTeams } from "../api/misc";
import { useBoards } from "../api/boards";
import { Select, Input, Badge, Avatar, Skeleton, EmptyState, ErrorState, Label } from "../components/ui/primitives";
import { PriorityBadge } from "../components/workflow/badges";
import { Drawer } from "../components/ui/Drawer";
import { format } from "date-fns";
import { Users } from "lucide-react";

interface WorkloadRow {
  employeeId: string;
  userId: string;
  name: string;
  department: string | null;
  team: string | null;
  openTasks: number;
  overdue: number;
  dueThisWeek: number;
  estimatedEffortHours: number;
  workloadScore: number;
  workloadIndicator: "LOW" | "MEDIUM" | "HIGH";
}

const INDICATOR_TONE: Record<string, "green" | "amber" | "red"> = { LOW: "green", MEDIUM: "amber", HIGH: "red" };

/** Section 30 / UC-10: Team Workload — the critical cross-board management screen. */
export default function TeamWorkloadPage() {
  const [departmentId, setDepartmentId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<"workload" | "overdue">("workload");
  const [drillDownId, setDrillDownId] = useState<string | null>(null);

  const { data: departments } = useDepartments();
  const { data: teams } = useTeams(departmentId || undefined);
  const { data: boards } = useBoards({ scope: "ALL" });
  const { data: rows, isLoading, isError, refetch } = useTeamWorkload({
    departmentId: departmentId || undefined,
    teamId: teamId || undefined,
    boardId: boardId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sort,
  });
  const { data: detail, isLoading: detailLoading } = useEmployeeWorkloadDetail(drillDownId ?? undefined);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Team Workload</h1>
        <p className="text-sm text-slate-500">Aggregated open-task load per employee, across every board they're on.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <Label className="!mb-0.5 !text-xs">Department</Label>
          <Select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setTeamId(""); }} className="!py-1.5 !text-xs">
            <option value="">All</option>
            {departments?.map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="!mb-0.5 !text-xs">Team</Label>
          <Select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="!py-1.5 !text-xs">
            <option value="">All</option>
            {teams?.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="!mb-0.5 !text-xs">Board</Label>
          <Select value={boardId} onChange={(e) => setBoardId(e.target.value)} className="!py-1.5 !text-xs">
            <option value="">All</option>
            {boards?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="!mb-0.5 !text-xs">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="!py-1.5 !text-xs" />
        </div>
        <div>
          <Label className="!mb-0.5 !text-xs">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="!py-1.5 !text-xs" />
        </div>
        <div>
          <Label className="!mb-0.5 !text-xs">Sort by</Label>
          <Select value={sort} onChange={(e) => setSort(e.target.value as any)} className="!py-1.5 !text-xs">
            <option value="workload">Highest Workload</option>
            <option value="overdue">Highest Overdue Count</option>
          </Select>
        </div>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {isError && <ErrorState message="Could not load team workload." onRetry={() => refetch()} />}
      {rows && rows.length === 0 && <EmptyState icon={<Users className="h-8 w-8" />} title="No employees match these filters." />}

      {rows && rows.length > 0 && (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Open Tasks</th>
                  <th className="px-4 py-2.5">Overdue</th>
                  <th className="px-4 py-2.5">Due This Week</th>
                  <th className="px-4 py-2.5">Workload</th>
                  <th className="px-4 py-2.5">Indicator</th>
                </tr>
              </thead>
              <tbody>
                {(rows as WorkloadRow[]).map((r) => (
                  <tr key={r.employeeId} onClick={() => setDrillDownId(r.employeeId)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={r.name} size="sm" />
                        <div>
                          <p className="font-medium text-slate-800">{r.name}</p>
                          <p className="text-xs text-slate-400">{[r.department, r.team].filter(Boolean).join(" · ")}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{r.openTasks}</td>
                    <td className="px-4 py-2.5">
                      {r.overdue > 0 ? (
                        <Badge tone="red">
                          <AlertCircle className="h-3 w-3" /> {r.overdue}
                        </Badge>
                      ) : (
                        r.overdue
                      )}
                    </td>
                    <td className="px-4 py-2.5">{r.dueThisWeek}</td>
                    <td className="px-4 py-2.5">
                      {r.openTasks} tasks · {r.estimatedEffortHours}h
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={INDICATOR_TONE[r.workloadIndicator]}>{r.workloadIndicator}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {(rows as WorkloadRow[]).map((r) => (
              <button key={r.employeeId} onClick={() => setDrillDownId(r.employeeId)} className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar name={r.name} size="sm" />
                    <p className="font-medium text-slate-800">{r.name}</p>
                  </div>
                  <Badge tone={INDICATOR_TONE[r.workloadIndicator]}>{r.workloadIndicator}</Badge>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{r.openTasks} open</span>
                  <span className={r.overdue > 0 ? "font-medium text-red-600" : ""}>{r.overdue} overdue</span>
                  <span>{r.dueThisWeek} due this week</span>
                  <span>{r.estimatedEffortHours}h effort</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <Drawer open={!!drillDownId} onClose={() => setDrillDownId(null)} title={detail?.employee?.name ?? "Workload"} subtitle="Tasks across every board">
        {detailLoading && <Skeleton className="h-40 w-full" />}
        {detail && (
          <div className="space-y-2">
            {detail.tasks.length === 0 && <p className="text-sm text-slate-400">No open tasks.</p>}
            {detail.tasks.map((t: any) => (
              <div key={t.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800">{t.title}</p>
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{t.board}</span>
                  <Badge tone="slate">{t.stage}</Badge>
                  {t.dueDate && <span>Due {format(new Date(t.dueDate), "d MMM")}</span>}
                  {t.estimatedEffortHours != null && <span>{t.estimatedEffortHours}h</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
