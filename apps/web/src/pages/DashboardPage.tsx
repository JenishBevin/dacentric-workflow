import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  LayoutGrid,
  ListTodo,
  ShieldCheck,
  ArrowRight,
  Trello,
  ListChecks,
  Timer,
} from "lucide-react";
import { useDashboard, useDashboardTaskList, useMyTasks, useTeamWorkload, useNotifications } from "../api/misc";
import { useBoards } from "../api/boards";
import { useWorkTimeToday, useWorkTimeSummary } from "../api/workTime";
import { formatDuration } from "../hooks/useWorkTimer";
import { Card, Skeleton, ErrorState, Avatar, AvatarGroup, EmptyState, Badge } from "../components/ui/primitives";
import { PriorityBadge, DueDateBadge } from "../components/workflow/badges";
import { Modal } from "../components/ui/Modal";
import { TaskDetailDrawer } from "../components/tasks/TaskDetailDrawer";
import { formatDistanceToNow, format, differenceInCalendarDays } from "date-fns";
import { useAuth } from "../context/AuthContext";
import { can } from "../lib/permissions";
import { Board } from "../lib/types";
import clsx from "clsx";

// Stage names are board-defined (e.g. "Backlog", "In Progress", "Done"), so
// colors are assigned by position rather than a fixed status enum.
const STATUS_PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#ec4899", "#8b5cf6", "#94a3b8"];

const BOARD_GRADIENTS = [
  "from-indigo-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-blue-600",
  "from-pink-500 to-rose-600",
  "from-violet-500 to-fuchsia-600",
];
function gradientFor(id: string) {
  const idx = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % BOARD_GRADIENTS.length;
  return BOARD_GRADIENTS[idx];
}

const WORKLOAD_BAR: Record<string, string> = { LOW: "bg-emerald-500", MEDIUM: "bg-amber-500", HIGH: "bg-red-500" };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function StatCard({
  icon: Icon,
  image,
  label,
  value,
  tone,
  hint,
  onClick,
}: {
  icon: React.ElementType;
  image: string;
  label: string;
  value: number | string;
  tone: string;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      className={clsx(
        "group relative overflow-hidden p-2 text-left",
        onClick &&
          "cursor-pointer text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.97] active:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      )}
    >
      {/* Mild decorative background photo, faded so the number/label on top stay easily readable. */}
      <img src={image} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.28] grayscale" />
      <div className="pointer-events-none absolute inset-0 bg-white/30" />
      <div className={`relative mb-1 flex h-5 w-5 items-center justify-center rounded-md transition-transform duration-150 ${onClick ? "group-hover:scale-110" : ""} ${tone}`}>
        <Icon className="h-3 w-3" />
      </div>
      <p className="relative text-base font-semibold text-slate-900">{value}</p>
      <p className="relative text-[10px] font-medium leading-tight text-slate-500">{label}</p>
      {hint && <p className="relative mt-0.5 text-[9px] text-slate-400">{hint}</p>}
    </Card>
  );
}

function BoardOverviewCard({ board }: { board: Board }) {
  const status =
    board.overdueTaskCount > 0
      ? { label: "At Risk", tone: "bg-red-500/90" }
      : board.openTaskCount === 0
      ? { label: "Complete", tone: "bg-emerald-500/90" }
      : { label: "In Progress", tone: "bg-blue-500/90" };

  return (
    <Link
      to={`/workflow/boards/${board.id}`}
      className={clsx("relative flex h-32 w-64 shrink-0 flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br p-4 text-white shadow-sm transition-transform hover:scale-[1.02]", gradientFor(board.id))}
    >
      <div>
        <span className={clsx("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", status.tone)}>{status.label}</span>
        <p className="mt-2 truncate text-sm font-semibold">{board.name}</p>
      </div>
      <div className="flex items-center justify-between text-xs text-white/90">
        <span>
          {board.openTaskCount} open{board.overdueTaskCount > 0 ? ` · ${board.overdueTaskCount} overdue` : ""}
        </span>
        <AvatarGroup names={board.members.map((m) => m.name)} max={3} />
      </div>
    </Link>
  );
}

function DonutCenter({ total }: { total: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <span className="text-xl font-semibold text-slate-900">{total}</span>
      <span className="text-[11px] text-slate-400">Total</span>
    </div>
  );
}

type StatKind = "TOTAL_OPEN" | "OVERDUE" | "DUE_TODAY" | "DUE_THIS_WEEK" | "COMPLETED_THIS_MONTH" | "PENDING_APPROVAL";

const STAT_MODAL_TITLES: Record<StatKind, { title: string; empty: string }> = {
  TOTAL_OPEN: { title: "Total Open Tasks", empty: "No open tasks." },
  OVERDUE: { title: "Overdue Tasks", empty: "Nothing overdue — you're all caught up." },
  DUE_TODAY: { title: "Due Today", empty: "Nothing due today." },
  DUE_THIS_WEEK: { title: "Due This Week", empty: "Nothing due this week." },
  COMPLETED_THIS_MONTH: { title: "Completed This Month", empty: "Nothing completed yet this month." },
  PENDING_APPROVAL: { title: "Pending Approvals", empty: "Nothing waiting on approval." },
};

/** Drill-down list for a clickable dashboard stat card — opens a task on click. */
function StatDrillDownModal({ kind, onClose, onOpenTask }: { kind: StatKind | null; onClose: () => void; onOpenTask: (taskId: string) => void }) {
  const { data: tasks, isLoading } = useDashboardTaskList(kind);
  if (!kind) return null;
  const meta = STAT_MODAL_TITLES[kind];

  return (
    <Modal open={!!kind} onClose={onClose} title={meta.title} size="lg">
      {isLoading && (
        // Same bordered/max-height footprint as the loaded list below, so the
        // box doesn't visibly jump in size the moment real data arrives.
        <div className="max-h-[60vh] space-y-2 overflow-hidden rounded-xl border border-slate-200 p-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}
      {!isLoading && (!tasks || tasks.length === 0) && <EmptyState icon={<ListTodo className="h-8 w-8" />} title={meta.empty} />}
      {!isLoading && tasks && tasks.length > 0 && (
        <div className="max-h-[60vh] overflow-y-auto overflow-x-auto rounded-xl border border-slate-200">
          {tasks.map((t: any, idx: number) => (
            <button
              key={t.id}
              onClick={() => onOpenTask(t.id)}
              style={{ animationDelay: `${Math.min(idx, 12) * 25}ms` }}
              className={clsx(
                "animate-fade-in-up flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-brand-50/60 sm:flex-nowrap",
                idx !== 0 && "border-t border-slate-100"
              )}
            >
              <div className="min-w-0 flex-1">
                <span className="mr-1.5 text-xs text-slate-400">{t.taskId}</span>
                <span className="text-sm font-medium text-slate-800">{t.title}</span>
              </div>
              <Badge tone="slate">{t.boardName}</Badge>
              {t.assignees.length > 0 && <AvatarGroup names={t.assignees.map((a: any) => a.name)} max={3} />}
              <PriorityBadge priority={t.priority} />
              {t.dueDate && <DueDateBadge dueDate={t.dueDate} status={t.dueDateStatus} />}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useDashboard({});
  // Org-wide viewers (CEO/Director, System/Super Admin) see every board here,
  // not just ones they happen to be an explicit member of.
  const { data: boards } = useBoards({ scope: can(user, "VIEW_WORKFLOW", "ALL") ? "ALL" : "MY" });
  const canViewWorkload = can(user, "VIEW_TEAM_WORKLOAD");
  const { data: workload } = useTeamWorkload({});
  const { data: myTaskGroups } = useMyTasks();
  const { data: notifications } = useNotifications();
  const { data: todayTime } = useWorkTimeToday();
  const { data: weekTime } = useWorkTimeSummary("week");
  const { data: monthTime } = useWorkTimeSummary("month");
  const [openStat, setOpenStat] = React.useState<StatKind | null>(null);
  const [drillDownTaskId, setDrillDownTaskId] = React.useState<string | null>(null);

  const deadlines = React.useMemo(() => {
    if (!myTaskGroups) return [];
    const combined = [...(myTaskGroups.OVERDUE ?? []), ...(myTaskGroups.DUE_TODAY ?? []), ...(myTaskGroups.DUE_THIS_WEEK ?? [])];
    return combined.sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 5);
  }, [myTaskGroups]);

  function dueLabel(dueDate: string) {
    const days = differenceInCalendarDays(new Date(dueDate), new Date());
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    return format(new Date(dueDate), "d MMM");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          {greeting()}, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-sm text-slate-500">Here's what's happening across your Workflow boards.</p>
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
              <StatCard icon={LayoutGrid} image="/images/dashboard/active-boards.jpg" label="Active Boards" value={data.activeBoards} tone="bg-purple-100 text-purple-700" onClick={() => navigate("/workflow/boards")} />
              <StatCard icon={ShieldCheck} image="/images/dashboard/pending-approvals.jpg" label="Pending Approvals" value={data.pendingApprovals} tone="bg-orange-100 text-orange-700" onClick={() => setOpenStat("PENDING_APPROVAL")} />
              <StatCard icon={CalendarClock} image="/images/dashboard/due-this-week.jpg" label="Due This Week" value={data.dueThisWeek} tone="bg-blue-100 text-blue-700" onClick={() => setOpenStat("DUE_THIS_WEEK")} />

              {/* My Work Time — fills the leftover grid cell next to the chart */}
              <Card className="relative overflow-hidden p-2 text-left">
                <img src="/images/dashboard/work-time.jpg" alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.28] grayscale" />
                <div className="pointer-events-none absolute inset-0 bg-white/30" />
                <div className="relative mb-1 flex items-center justify-between">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-100 text-teal-700">
                    <Timer className="h-3 w-3" />
                  </div>
                  <span
                    className={clsx(
                      "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                      todayTime?.isRunning ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    <span className={clsx("h-1 w-1 rounded-full", todayTime?.isRunning ? "bg-emerald-500" : "bg-slate-400")} />
                    {todayTime?.isRunning ? "Tracking" : "Paused"}
                  </span>
                </div>
                <p className="relative text-base font-semibold text-slate-900">{formatDuration(todayTime?.todaySeconds ?? 0)}</p>
                <p className="relative text-[10px] font-medium leading-tight text-slate-500">My Work Time Today</p>
                <p className="relative mt-0.5 text-[9px] text-slate-400">
                  {formatDuration(weekTime?.totalSeconds ?? 0)} this week · {formatDuration(monthTime?.totalSeconds ?? 0)} this month
                </p>
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

          {/* My Boards Overview */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">My Boards Overview</p>
              <Link to="/workflow/boards" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                View All Boards <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {boards && boards.length === 0 && <p className="py-6 text-center text-sm text-slate-400">You're not a member of any boards yet.</p>}
            {boards && boards.length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {boards.map((b) => (
                  <BoardOverviewCard key={b.id} board={b} />
                ))}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Team Workload (compact) */}
            {canViewWorkload && (
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
                  {workload?.slice(0, 5).map((row) => (
                    <div key={row.employeeId} className="flex items-center gap-2.5">
                      <Avatar name={row.name} size="xs" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-slate-700">{row.name}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">{row.openTasks} open</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={clsx("h-full rounded-full", WORKLOAD_BAR[row.workloadIndicator])}
                            style={{ width: `${Math.min(100, row.workloadScore)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Upcoming Deadlines + Recent Notifications */}
            <div className="space-y-4">
              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Upcoming Deadlines</p>
                  <Link to="/workflow/my-tasks" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                    View All <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                {deadlines.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Nothing due soon.</p>}
                <ul className="space-y-2.5">
                  {deadlines.map((t: any) => (
                    <li key={t.id} className="flex items-start justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">{t.title}</p>
                        <p className="truncate text-xs text-slate-400">{t.boardName}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <PriorityBadge priority={t.priority} />
                        <span className={clsx("text-[11px] font-medium", t.dueDateStatus === "OVERDUE" ? "text-red-600" : "text-slate-400")}>
                          {dueLabel(t.dueDate)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Recent Notifications</p>
                  <Link to="/settings/notifications" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                    Manage <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                {(!notifications || notifications.data.items.length === 0) && <p className="py-4 text-center text-sm text-slate-400">You're all caught up.</p>}
                <ul className="space-y-3">
                  {notifications?.data.items.slice(0, 4).map((n: any) => (
                    <li key={n.id} className="flex items-start gap-2">
                      <span className={clsx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-brand-500")} />
                      <div className="min-w-0">
                        <p className="truncate text-xs text-slate-700">{n.title}</p>
                        <p className="text-[11px] text-slate-400">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>

          {/* Quick Create */}
          <div className="flex flex-col gap-4 rounded-xl bg-gradient-to-br from-brand-600 to-purple-700 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold">Quick Create</p>
              <p className="text-sm text-white/80">Jump straight into a new task or board.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/workflow/my-tasks?newTask=1"
                className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-medium backdrop-blur hover:bg-white/25"
              >
                <ListChecks className="h-4 w-4" /> New Task
              </Link>
              <Link
                to="/workflow/boards?newBoard=1"
                className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-medium backdrop-blur hover:bg-white/25"
              >
                <Trello className="h-4 w-4" /> New Board
              </Link>
            </div>
          </div>

          <StatDrillDownModal kind={openStat} onClose={() => setOpenStat(null)} onOpenTask={setDrillDownTaskId} />
          <TaskDetailDrawer taskId={drillDownTaskId} onClose={() => setDrillDownTaskId(null)} onDeleted={() => setDrillDownTaskId(null)} />
        </>
      )}
    </div>
  );
}
