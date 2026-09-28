import React, { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { AlertCircle, PhoneCall } from "lucide-react";
import { useFollowUpWorkload, useEmployeeFollowUpDetail, useDepartments, useTeams } from "../api/misc";
import { Select, Badge, Avatar, Skeleton, EmptyState, ErrorState, Label } from "../components/ui/primitives";
import { PriorityBadge } from "../components/workflow/badges";
import { Drawer } from "../components/ui/Drawer";
import { boardPath } from "../lib/boardPath";
import { FollowUpWorkloadRow } from "../lib/types";

/** Follow-up workload — tasks parked on a follow-up stage (e.g. Submitted), counted against whoever is
 *  chasing the client. Kept apart from Team Workload, which only counts active work. */
export default function FollowUpWorkloadPage() {
  const [departmentId, setDepartmentId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [drillDownId, setDrillDownId] = useState<string | null>(null);

  const { data: departments } = useDepartments();
  const { data: teams } = useTeams(departmentId || undefined);
  const { data: rows, isLoading, isError, refetch } = useFollowUpWorkload({
    departmentId: departmentId || undefined,
    teamId: teamId || undefined,
  });
  const { data: detail, isLoading: detailLoading } = useEmployeeFollowUpDetail(drillDownId ?? undefined);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Follow-up Workload</h1>
        <p className="text-sm text-slate-500">
          Tasks waiting on a client, counted against whoever is following up — separate from regular Team Workload.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:max-w-md">
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
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {isError && <ErrorState message="Could not load follow-up workload." onRetry={() => refetch()} />}
      {rows && rows.length === 0 && <EmptyState icon={<PhoneCall className="h-8 w-8" />} title="No follow-ups pending." description="Tasks moved to a follow-up stage will show up here." />}

      {rows && rows.length > 0 && (
        <>
          <div className="hidden max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Open Follow-ups</th>
                  <th className="px-4 py-2.5">Overdue</th>
                  <th className="px-4 py-2.5">Due Today</th>
                  <th className="px-4 py-2.5">Due This Week</th>
                  <th className="px-4 py-2.5">No Date</th>
                </tr>
              </thead>
              <tbody>
                {(rows as FollowUpWorkloadRow[]).map((r) => (
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
                    <td className="px-4 py-2.5 font-medium">{r.openFollowUps}</td>
                    <td className="px-4 py-2.5">
                      {r.overdue > 0 ? (
                        <Badge tone="red">
                          <AlertCircle className="h-3 w-3" /> {r.overdue}
                        </Badge>
                      ) : (
                        r.overdue
                      )}
                    </td>
                    <td className="px-4 py-2.5">{r.dueToday}</td>
                    <td className="px-4 py-2.5">{r.dueThisWeek}</td>
                    <td className="px-4 py-2.5">{r.noDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 sm:hidden">
            {(rows as FollowUpWorkloadRow[]).map((r) => (
              <button key={r.employeeId} onClick={() => setDrillDownId(r.employeeId)} className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left">
                <div className="flex items-center gap-2">
                  <Avatar name={r.name} size="sm" />
                  <p className="font-medium text-slate-800">{r.name}</p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{r.openFollowUps} open</span>
                  <span className={r.overdue > 0 ? "font-medium text-red-600" : ""}>{r.overdue} overdue</span>
                  <span>{r.dueToday} due today</span>
                  <span>{r.dueThisWeek} due this week</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <Drawer open={!!drillDownId} onClose={() => setDrillDownId(null)} title={detail?.employee?.name ?? "Follow-ups"} subtitle="Tasks waiting on a client follow-up">
        {detailLoading && <Skeleton className="h-40 w-full" />}
        {detail && (
          <div className="space-y-2">
            {detail.tasks.length === 0 && <p className="text-sm text-slate-400">No open follow-ups.</p>}
            {detail.tasks.map((t: any) => {
              const overdue = t.followUpDate && new Date(t.followUpDate) < new Date(new Date().setHours(0, 0, 0, 0));
              return (
                <Link
                  key={t.id}
                  to={`${boardPath(t.board, t.boardId)}?task=${t.id}`}
                  className="block rounded-lg border border-slate-200 p-3 text-sm hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-800">{t.title}</p>
                    <PriorityBadge priority={t.priority} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>{t.taskId}</span>
                    {t.customer && <span>{t.customer}</span>}
                    <Badge tone="slate">{t.stage}</Badge>
                    {t.followUpDate ? (
                      <span className={overdue ? "font-medium text-red-600" : ""}>Follow up {format(new Date(t.followUpDate), "d MMM yyyy")}</span>
                    ) : (
                      <span className="text-amber-600">No follow-up date</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Drawer>
    </div>
  );
}
