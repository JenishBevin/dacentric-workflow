import React, { useState } from "react";
import { Clock3 } from "lucide-react";
import { useWorkTimeReport } from "../api/workTime";
import { formatDuration } from "../hooks/useWorkTimer";
import { Badge, Avatar, Select, Skeleton, EmptyState, ErrorState } from "../components/ui/primitives";
import clsx from "clsx";

/** Time-log report for Team Lead, HR, Manager, System Admin and Super Admin
 * (VIEW_TIME_LOGS) — per-employee Today / This Week / This Month totals,
 * scoped server-side exactly like Team Workload (own team, or everyone for
 * HR/Admin tiers). */
export default function TimeLogsPage() {
  const [range, setRange] = useState<"week" | "month">("week");
  const { data: rows, isLoading, isError, refetch } = useWorkTimeReport(range);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Time Logs</h1>
          <p className="text-sm text-slate-500">Work-time report for your team, from the sleep/shutdown-aware timer.</p>
        </div>
        <Select value={range} onChange={(e) => setRange(e.target.value as "week" | "month")} className="!w-40">
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </Select>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {isError && <ErrorState message="Could not load time logs." onRetry={() => refetch()} />}
      {rows && rows.length === 0 && <EmptyState icon={<Clock3 className="h-8 w-8" />} title="No employees to report on." description="Nobody in your scope has a linked employee record yet." />}

      {rows && rows.length > 0 && (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Today</th>
                  <th className="px-4 py-2.5">{range === "week" ? "This Week" : "This Month"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employeeId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={r.name} size="sm" />
                        <div>
                          <p className="font-medium text-slate-800">{r.name}</p>
                          <p className="text-xs text-slate-400">{[r.department, r.team].filter(Boolean).join(" · ")}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={clsx("flex items-center gap-1.5 text-xs font-medium", r.isRunning ? "text-emerald-700" : "text-slate-400")}>
                        <span className={clsx("h-1.5 w-1.5 rounded-full", r.isRunning ? "bg-emerald-500" : "bg-slate-300")} />
                        {r.isRunning ? "Tracking" : "Paused"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{formatDuration(r.todaySeconds)}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{formatDuration(r.rangeSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {rows.map((r) => (
              <div key={r.employeeId} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar name={r.name} size="sm" />
                    <p className="font-medium text-slate-800">{r.name}</p>
                  </div>
                  <Badge tone={r.isRunning ? "green" : "slate"}>{r.isRunning ? "Tracking" : "Paused"}</Badge>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>Today: {formatDuration(r.todaySeconds)}</span>
                  <span>{range === "week" ? "This week" : "This month"}: {formatDuration(r.rangeSeconds)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
