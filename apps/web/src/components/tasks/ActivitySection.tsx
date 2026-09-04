import React from "react";
import { format } from "date-fns";
import { History } from "lucide-react";
import { useTaskActivity } from "../../api/tasks";
import { AuditLogItem } from "../../lib/types";

const ACTION_LABEL: Record<string, string> = {
  CREATE: "created",
  UPDATE: "updated",
  DELETE: "deleted",
  MOVE: "moved",
  ASSIGN: "reassigned",
  APPROVE: "approved",
  REJECT: "rejected",
};

function describe(entry: AuditLogItem): string {
  const verb = ACTION_LABEL[entry.action] ?? entry.action.toLowerCase();
  if (entry.field) {
    const before = entry.beforeValue != null ? String(entry.beforeValue) : "—";
    const after = entry.afterValue != null ? String(entry.afterValue) : "—";
    return `${verb} ${entry.field}: ${before} → ${after}`;
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
