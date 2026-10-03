import React from "react";
import { ListTodo, ShieldCheck, ThumbsDown, FileCheck2, Wallet } from "lucide-react";
import { useDashboardTaskList } from "../../api/misc";
import { Card, Skeleton, EmptyState, Badge, AvatarGroup } from "../../components/ui/primitives";
import { PriorityBadge, DueDateBadge } from "../../components/workflow/badges";
import { Modal } from "../../components/ui/Modal";
import clsx from "clsx";

// Stage names are board-defined (e.g. "Backlog", "In Progress", "Done"), so
// colors are assigned by position rather than a fixed status enum.
export const STATUS_PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#ec4899", "#8b5cf6", "#94a3b8"];

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

/** Simpler stat tile (icon + number + label, no decorative photo) for
 * dashboards that don't have themed background images available — CRM and
 * HRMS, unlike the Workflow dashboards above. */
export function MiniStatCard({
  icon: Icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      className={clsx(
        "p-3 text-left",
        onClick &&
          "group cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-500"
      )}
    >
      <div className={clsx("mb-2 flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-150", onClick && "group-hover:scale-110", tone)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </Card>
  );
}

const BANNER_BUTTON = "flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-medium backdrop-blur hover:bg-white/25";
const BANNER_BASE = "flex flex-col justify-between gap-4 rounded-xl bg-gradient-to-br p-5 text-white xl:flex-row xl:items-center";

/** The four approval banners (tasks, Lost requests, quotations, claims) shown
 *  on the Management dashboard and the Super Admin dashboard. Counts are
 *  already scoped server-side to whatever the viewer can see. */
export function ApprovalBanners({
  data,
  claimsCount,
  onOpenStat,
  onReviewClaims,
}: {
  data: { pendingApprovals: number; pendingLost: number; pendingQuotationApproval: number };
  claimsCount: number;
  onOpenStat: (kind: StatKind) => void;
  onReviewClaims: () => void;
}) {
  const idle = "Nothing waiting on your review right now.";
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className={clsx(BANNER_BASE, "from-brand-600 to-purple-700")}>
        <div>
          <p className="text-base font-semibold">Pending Approvals</p>
          <p className="text-sm text-white/80">{data.pendingApprovals > 0 ? `${data.pendingApprovals} task(s) waiting on your review.` : idle}</p>
        </div>
        <button onClick={() => onOpenStat("PENDING_APPROVAL")} className={BANNER_BUTTON}>
          <ShieldCheck className="h-4 w-4" /> Review Approvals
        </button>
      </div>

      <div className={clsx(BANNER_BASE, "from-red-500 to-rose-700")}>
        <div>
          <p className="text-base font-semibold">Review Lost Projects</p>
          <p className="text-sm text-white/80">{data.pendingLost > 0 ? `${data.pendingLost} enquiry(ies) requesting to be marked Lost.` : idle}</p>
        </div>
        <button onClick={() => onOpenStat("PENDING_LOST")} className={BANNER_BUTTON}>
          <ThumbsDown className="h-4 w-4" /> Review Lost Projects
        </button>
      </div>

      {/* Separate from the generic Pending Approvals above — see decideQuotation in tasks.service.ts. */}
      <div className={clsx(BANNER_BASE, "from-teal-500 to-cyan-700")}>
        <div>
          <p className="text-base font-semibold">Submit Quotation Approvals</p>
          <p className="text-sm text-white/80">{data.pendingQuotationApproval > 0 ? `${data.pendingQuotationApproval} quotation(s) waiting on your approval.` : idle}</p>
        </div>
        <button onClick={() => onOpenStat("PENDING_QUOTATION")} className={BANNER_BUTTON}>
          <FileCheck2 className="h-4 w-4" /> Review Quotations
        </button>
      </div>

      {/* Acted on from the Claim tab, not here (see claims.service.ts listActionableClaims). */}
      <div className={clsx(BANNER_BASE, "from-amber-500 to-orange-700")}>
        <div>
          <p className="text-base font-semibold">Claim Settlement Approvals</p>
          <p className="text-sm text-white/80">{claimsCount > 0 ? `${claimsCount} claim(s) waiting on your approval.` : idle}</p>
        </div>
        <button onClick={onReviewClaims} className={BANNER_BUTTON}>
          <Wallet className="h-4 w-4" /> Review Claims
        </button>
      </div>
    </div>
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

export type StatKind = "TOTAL_OPEN" | "OVERDUE" | "DUE_TODAY" | "DUE_THIS_WEEK" | "COMPLETED_THIS_MONTH" | "PENDING_APPROVAL" | "PENDING_LOST" | "PENDING_QUOTATION";

const STAT_MODAL_TITLES: Record<StatKind, { title: string; empty: string }> = {
  TOTAL_OPEN: { title: "Total Open Tasks", empty: "No open tasks." },
  OVERDUE: { title: "Overdue Tasks", empty: "Nothing overdue — you're all caught up." },
  DUE_TODAY: { title: "Due Today", empty: "Nothing due today." },
  DUE_THIS_WEEK: { title: "Due This Week", empty: "Nothing due this week." },
  COMPLETED_THIS_MONTH: { title: "Completed This Month", empty: "Nothing completed yet this month." },
  PENDING_APPROVAL: { title: "Pending Approvals", empty: "Nothing waiting on approval." },
  PENDING_LOST: { title: "Review Lost Projects", empty: "No Lost requests waiting on your review." },
  PENDING_QUOTATION: { title: "Submit Quotation Approvals", empty: "Nothing waiting on quotation approval." },
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
                "animate-fade-in-up flex w-full flex-col gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-brand-50/60",
                idx !== 0 && "border-t border-slate-100"
              )}
            >
              <div className="min-w-0">
                <span className="mr-1.5 text-xs text-slate-400">{t.taskId}</span>
                <span className="text-sm font-medium text-slate-800">{t.title}</span>
                {kind === "PENDING_LOST" && t.lostReason && <p className="mt-0.5 truncate text-xs text-slate-500">"{t.lostReason}"</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="slate">{t.boardName}</Badge>
                {t.assignees.length > 0 && <AvatarGroup names={t.assignees.map((a: any) => a.name)} max={3} />}
                <PriorityBadge priority={t.priority} />
                {t.dueDate && <DueDateBadge dueDate={t.dueDate} status={t.dueDateStatus} />}
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
