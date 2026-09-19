import React from "react";
import { format } from "date-fns";
import { History } from "lucide-react";
import { useTaskActivity } from "../../api/tasks";
import { AuditLogItem } from "../../lib/types";

const ACTION_LABEL: Record<string, string> = {
  CREATE: "created",
  EDIT: "updated",
  UPDATE: "updated",
  DELETE: "deleted",
  MOVE: "moved",
  ASSIGN: "reassigned",
  APPROVE: "approved",
  REJECT: "rejected",
};

const FIELD_LABEL: Record<string, string> = {
  customerId: "customer",
  approverUserId: "approver",
  assignees: "assignees",
  stage: "stage",
  priority: "priority",
  dueDate: "due date",
  startDate: "start date",
  estimatedEffortHours: "estimated effort",
  dependencyEnforced: "dependency enforcement",
  requiresApproval: "approval requirement",
  approvalStatus: "approval status",
  description: "description",
  title: "title",
};

function formatValue(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  return String(value);
}

function describe(entry: AuditLogItem): string {
  const verb = ACTION_LABEL[entry.action] ?? entry.action.toLowerCase();
  const after = entry.afterValue as Record<string, unknown> | undefined;
  const before = entry.beforeValue as Record<string, unknown> | undefined;

  // Sub-entity actions (comments/attachments/checklist/watchers/dependencies)
  // don't carry a `field`, so describe them from their entityType instead.
  switch (entry.entityType) {
    case "Comment":
      return "added a comment";
    case "TaskAttachment":
      return entry.action === "DELETE" ? `removed attachment "${before?.fileName ?? ""}"` : `uploaded attachment "${after?.fileName ?? ""}"`;
    case "ChecklistItem":
      if (entry.action === "DELETE") return `removed checklist item "${(before?.text as string) ?? ""}"`;
      if (entry.action === "CREATE") return `added checklist item "${(after?.text as string) ?? ""}"`;
      if (after?.isComplete === true) return "completed a checklist item";
      if (after?.isComplete === false) return "reopened a checklist item";
      return "updated a checklist item";
    case "TaskWatcher":
      return entry.action === "DELETE" ? "stopped watching" : "started watching";
    case "TaskDependency":
      return entry.action === "DELETE" ? "removed a dependency" : "added a dependency";
  }

  if (entry.field) {
    const label = FIELD_LABEL[entry.field] ?? entry.field;
    return `${verb} ${label}: ${formatValue(entry.beforeValue)} → ${formatValue(entry.afterValue)}`;
  }
  return verb;
}

/** Section 28: every relevant action generates an activity entry, rendered oldest-action-context-first here (newest on top). */
export const ActivitySection: React.FC<{ taskId: string }> = ({ taskId }) => {
  const { data: entries, isLoading } = useTaskActivity(taskId);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-500">Activity Log</p>
      {isLoading && <p className="text-xs text-slate-400">Loading activity…</p>}
      {entries?.length === 0 && <p className="text-xs text-slate-400">No activity recorded yet.</p>}
      <div className="space-y-0">
        {entries?.map((entry: AuditLogItem, idx: number) => (
          <div key={entry.id} className="relative flex gap-3 pb-3 pl-1">
            {idx !== entries.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" />}
            <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
            <div className="min-w-0 flex-1 text-xs">
              <span className="font-medium text-slate-700">{entry.actorName}</span>{" "}
              <span className="text-slate-500">{describe(entry)}</span>
              <p className="mt-0.5 text-[11px] text-slate-400">{format(new Date(entry.createdAt), "d MMM yyyy, HH:mm")}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
