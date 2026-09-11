import React from "react";
import { Link } from "react-router-dom";
import { ListTodo } from "lucide-react";
import { useDashboardTaskList } from "../../api/misc";
import { Card, Skeleton, EmptyState, Badge, AvatarGroup } from "../../components/ui/primitives";
import { PriorityBadge, DueDateBadge } from "../../components/workflow/badges";
import { Modal } from "../../components/ui/Modal";
import { Board } from "../../lib/types";
import clsx from "clsx";

// Stage names are board-defined (e.g. "Backlog", "In Progress", "Done"), so
// colors are assigned by position rather than a fixed status enum.
export const STATUS_PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#ec4899", "#8b5cf6", "#94a3b8"];

const BOARD_GRADIENTS = [
  "from-indigo-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-blue-600",
  "from-pink-500 to-rose-600",
  "from-violet-500 to-fuchsia-600",
];
export function gradientFor(id: string) {
  const idx = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % BOARD_GRADIENTS.length;
  return BOARD_GRADIENTS[idx];
}

export const WORKLOAD_BAR: Record<string, string> = { LOW: "bg-emerald-500", MEDIUM: "bg-amber-500", HIGH: "bg-red-500" };

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function StatCard({
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

export function BoardOverviewCard({ board }: { board: Board }) {
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

export function DonutCenter({ total }: { total: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <span className="text-xl font-semibold text-slate-900">{total}</span>
      <span className="text-[11px] text-slate-400">Total</span>
    </div>
  );
}

export type StatKind = "TOTAL_OPEN" | "OVERDUE" | "DUE_TODAY" | "DUE_THIS_WEEK" | "COMPLETED_THIS_MONTH" | "PENDING_APPROVAL";

const STAT_MODAL_TITLES: Record<StatKind, { title: string; empty: string }> = {
  TOTAL_OPEN: { title: "Total Open Tasks", empty: "No open tasks." },
  OVERDUE: { title: "Overdue Tasks", empty: "Nothing overdue — you're all caught up." },
  DUE_TODAY: { title: "Due Today", empty: "Nothing due today." },
  DUE_THIS_WEEK: { title: "Due This Week", empty: "Nothing due this week." },
  COMPLETED_THIS_MONTH: { title: "Completed This Month", empty: "Nothing completed yet this month." },
  PENDING_APPROVAL: { title: "Pending Approvals", empty: "Nothing waiting on approval." },
};

/** Drill-down list for a clickable dashboard stat card — opens a task on click. */
export function StatDrillDownModal({ kind, onClose, onOpenTask }: { kind: StatKind | null; onClose: () => void; onOpenTask: (taskId: string) => void }) {
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
