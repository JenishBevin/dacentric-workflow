import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, LayoutGrid, ListTodo, ShieldCheck, ArrowRight, Flag } from "lucide-react";
import { useDashboard, useDashboardTaskList, useTeamWorkload } from "../../api/misc";
import { useBoards } from "../../api/boards";
import { Card, Skeleton, ErrorState, Avatar, AvatarGroup, Badge } from "../../components/ui/primitives";
import { PriorityBadge, DueDateBadge } from "../../components/workflow/badges";
import { TaskDetailDrawer } from "../../components/tasks/TaskDetailDrawer";
import { useAuth } from "../../context/AuthContext";
import clsx from "clsx";
import { StatCard, BoardOverviewCard, DonutCenter, StatDrillDownModal, StatKind, STATUS_PALETTE, WORKLOAD_BAR, greeting } from "./shared";

const PRIORITY_ORDER = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
const PRIORITY_DOT: Record<string, string> = { URGENT: "bg-red-500", HIGH: "bg-orange-500", MEDIUM: "bg-amber-500", LOW: "bg-slate-400" };

/**
 * Org-wide oversight dashboard for the Management role — read/approve/export
 * across everything, no create/edit authority of their own (Section 5 RBAC),
 * so this swaps the personal-productivity widgets (My Work Time, My Tasks,
 * Quick Create) for org-wide ones: every project regardless of membership,
 * full team workload, and a Pending Approvals action instead of task/project
 * creation shortcuts they don't have.
 */
export default function DashboardManagementPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useDashboard({});
  const { data: boardsRaw } = useBoards({ scope: "ALL" });
  // Enquiry List is a distinct feature from "Projects" (its own nav item,
  // not filed under any Service) — excluded so this list matches what the
  // Projects page actually shows.
  const boards = React.useMemo(() => boardsRaw?.filter((b) => b.name !== "Enquiry List"), [boardsRaw]);
  const { data: workload } = useTeamWorkload({});
  const { data: dueThisWeek } = useDashboardTaskList("DUE_THIS_WEEK");
  const [openStat, setOpenStat] = React.useState<StatKind | null>(null);
  const [drillDownTaskId, setDrillDownTaskId] = React.useState<string | null>(null);

  const priorityCounts = React.useMemo(() => {
    const map = new Map<string, number>((data?.priorityDistribution ?? []).map((p: any) => [p.priority as string, p.count as number]));
    return PRIORITY_ORDER.map((p) => ({ priority: p, count: map.get(p) ?? 0 }));
  }, [data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          {greeting()}, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-sm text-slate-500">Organization-wide overview — every project, every team.</p>
      </div>

      {isError && <ErrorState message="Could not load dashboard data." onRetry={() => refetch()} />}

      {isLoading && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:flex-1">
              <StatCard icon={ListTodo} image="/images/dashboard/total-open-tasks.jpg" label="Total Open Tasks" value={data.totalOpenTasks} tone="bg-brand-100 text-brand-700" onClick={() => setOpenStat("TOTAL_OPEN")} />
              <StatCard icon={AlertTriangle} image="/images/dashboard/overdue-tasks.jpg" label="Overdue Tasks" value={data.overdueTasks} tone="bg-red-100 text-red-700" onClick={() => setOpenStat("OVERDUE")} />
              <StatCard
                icon={Clock}
                image="/images/dashboard/due-today.jpg"
                label="Due Today"
                value={data.dueToday}
                tone="bg-amber-100 text-amber-700"
                hint={`${data.dueThisWeek} due this week`}
                onClick={() => setOpenStat("DUE_TODAY")}
              />
              <StatCard icon={CheckCircle2} image="/images/dashboard/completed-this-month.jpg" label="Completed This Month" value={data.completedThisMonth} tone="bg-emerald-100 text-emerald-700" onClick={() => setOpenStat("COMPLETED_THIS_MONTH")} />
              <StatCard icon={LayoutGrid} image="/images/dashboard/active-boards.jpg" label="Active Projects" value={data.activeBoards} tone="bg-purple-100 text-purple-700" onClick={() => navigate("/workflow/boards")} />
              <StatCard icon={ShieldCheck} image="/images/dashboard/pending-approvals.jpg" label="Pending Approvals" value={data.pendingApprovals} tone="bg-orange-100 text-orange-700" onClick={() => setOpenStat("PENDING_APPROVAL")} />
              <StatCard icon={CalendarClock} image="/images/dashboard/due-this-week.jpg" label="Due This Week" value={data.dueThisWeek} tone="bg-blue-100 text-blue-700" onClick={() => setOpenStat("DUE_THIS_WEEK")} />

              {/* Priority Breakdown — fills the leftover grid cell next to the chart */}
              <Card className="p-2 text-left">
                <div className="mb-1 flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                  <Flag className="h-3 w-3" />
                </div>
                <p className="text-[10px] font-medium leading-tight text-slate-500">Open Tasks by Priority</p>
                <div className="mt-1.5 space-y-1">
                  {priorityCounts.map((p) => (
                    <div key={p.priority} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="flex items-center gap-1 text-slate-500">
                        <span className={clsx("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[p.priority])} />
                        {p.priority[0] + p.priority.slice(1).toLowerCase()}
                      </span>
                      <span className="font-semibold text-slate-800">{p.count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Tasks by Status donut */}
            <Card className="p-3 lg:w-64 lg:shrink-0">
              <p className="mb-1 text-xs font-semibold text-slate-800">Tasks by Status</p>
              <div className="relative">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={data.statusDistribution} dataKey="count" nameKey="stage" innerRadius={42} outerRadius={62} paddingAngle={2}>
                      {data.statusDistribution.map((entry: any, idx: number) => (
                        <Cell key={idx} fill={STATUS_PALETTE[idx % STATUS_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <DonutCenter total={data.statusDistribution.reduce((s: number, e: any) => s + e.count, 0)} />
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {data.statusDistribution.map((s: any, idx: number) => (
                  <div key={`${s.stage}-${idx}`} className="flex items-center gap-1 text-[10px] text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_PALETTE[idx % STATUS_PALETTE.length] }} />
                    {s.stage} ({s.count})
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* All Projects Overview */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">All Projects Overview</p>
              <Link to="/workflow/boards" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                View All Projects <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {boards && boards.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No projects yet.</p>}
            {boards && boards.length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {boards.map((b) => (
                  <BoardOverviewCard key={b.id} board={b} />
                ))}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Team Workload — full org, top 8 */}
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Team Workload</p>
                <Link to="/workflow/team" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                  View Full Workload <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {!workload && <Skeleton className="h-40" />}
              {workload && workload.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No team members to show.</p>}
              <div className="space-y-3">
                {workload?.slice(0, 8).map((row) => (
                  <div key={row.employeeId} className="flex items-center gap-2.5">
                    <Avatar name={row.name} size="xs" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-slate-700">{row.name}</span>
                        <span className="shrink-0 text-[11px] text-slate-400">{row.openTasks} open</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className={clsx("h-full rounded-full", WORKLOAD_BAR[row.workloadIndicator])} style={{ width: `${Math.min(100, row.workloadScore)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Due This Week — org-wide, not just "my" tasks */}
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Due This Week — All Projects</p>
                <button onClick={() => setOpenStat("DUE_THIS_WEEK")} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                  View All <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              {(!dueThisWeek || dueThisWeek.length === 0) && <p className="py-4 text-center text-sm text-slate-400">Nothing due this week.</p>}
              {dueThisWeek && dueThisWeek.length > 0 && (
                <ul className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                  {dueThisWeek.map((t: any) => (
                    <li key={t.id}>
                      <button onClick={() => setDrillDownTaskId(t.id)} className="flex w-full items-start justify-between gap-2 text-left text-sm hover:opacity-80">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{t.title}</p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <Badge tone="slate">{t.boardName}</Badge>
                            {t.assignees.length > 0 && <AvatarGroup names={t.assignees.map((a: any) => a.name)} max={3} />}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <PriorityBadge priority={t.priority} />
                          {t.dueDate && <DueDateBadge dueDate={t.dueDate} status={t.dueDateStatus} />}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Pending Approvals — the one action Management actually takes here */}
          <div className="flex flex-col gap-4 rounded-xl bg-gradient-to-br from-brand-600 to-purple-700 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold">Pending Approvals</p>
              <p className="text-sm text-white/80">
                {data.pendingApprovals > 0 ? `${data.pendingApprovals} task(s) waiting on your review.` : "Nothing waiting on your review right now."}
              </p>
            </div>
            <button
              onClick={() => setOpenStat("PENDING_APPROVAL")}
              className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-medium backdrop-blur hover:bg-white/25"
            >
              <ShieldCheck className="h-4 w-4" /> Review Approvals
            </button>
          </div>

          <StatDrillDownModal kind={openStat} onClose={() => setOpenStat(null)} onOpenTask={setDrillDownTaskId} />
          <TaskDetailDrawer taskId={drillDownTaskId} onClose={() => setDrillDownTaskId(null)} onDeleted={() => setDrillDownTaskId(null)} />
        </>
      )}
    </div>
  );
}
