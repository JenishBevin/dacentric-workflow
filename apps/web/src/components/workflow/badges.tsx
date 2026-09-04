import React from "react";
import { Badge } from "../ui/primitives";
import { TaskPriority, DueDateStatus, TaskApprovalStatus } from "../../lib/types";
import { Flag } from "lucide-react";
import { format } from "date-fns";
import clsx from "clsx";

const PRIORITY_TONE: Record<TaskPriority, { tone: "slate" | "amber" | "red" | "blue"; label: string }> = {
  LOW: { tone: "slate", label: "Low" },
  MEDIUM: { tone: "blue", label: "Medium" },
  HIGH: { tone: "amber", label: "High" },
  URGENT: { tone: "red", label: "Urgent" },
};

export const PriorityBadge: React.FC<{ priority: TaskPriority }> = ({ priority }) => {
  const cfg = PRIORITY_TONE[priority];
  return (
    <Badge tone={cfg.tone}>
      <Flag className="h-3 w-3" /> {cfg.label}
    </Badge>
  );
};

/**
 * Due-date badge — Section 12: red = overdue, amber = due within 48h, green
 * = on track, grey = no due date. Colour is always paired with text/icon so
 * status is never communicated by colour alone (Section 38).
 */
export const DueDateBadge: React.FC<{ dueDate: string | null; status: DueDateStatus }> = ({ dueDate, status }) => {
  const label = dueDate ? format(new Date(dueDate), "d MMM") : "No due date";
  const dot = {
    OVERDUE: "bg-red-500",
    DUE_SOON: "bg-amber-500",
    ON_TRACK: "bg-emerald-500",
    NO_DUE_DATE: "bg-slate-300",
  }[status];
  const text = {
    OVERDUE: "text-red-700",
    DUE_SOON: "text-amber-700",
    ON_TRACK: "text-slate-600",
    NO_DUE_DATE: "text-slate-400",
  }[status];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-medium", text)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
      {status === "OVERDUE" && " (overdue)"}
      {status === "DUE_SOON" && " (due soon)"}
    </span>
  );
};

export const ApprovalStatusBadge: React.FC<{ status: TaskApprovalStatus }> = ({ status }) => {
  if (status === "NONE") return null;
  const map: Record<TaskApprovalStatus, { tone: "amber" | "green" | "red" | "slate"; label: string }> = {
    NONE: { tone: "slate", label: "" },
    PENDING_APPROVAL: { tone: "amber", label: "Pending Approval" },
    APPROVED: { tone: "green", label: "Approved" },
    REJECTED: { tone: "red", label: "Rejected" },
  };
  const cfg = map[status];
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
};

export const ChecklistProgress: React.FC<{ done: number; total: number }> = ({ done, total }) => {
  if (total === 0) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500">
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      {done}/{total}
    </div>
  );
};
