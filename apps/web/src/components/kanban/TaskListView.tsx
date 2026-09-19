import React from "react";
import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Badge } from "../ui/primitives";
import { PriorityBadge, DueDateBadge, ChecklistProgress } from "../workflow/badges";
import { BoardStage, TaskSummary } from "../../lib/types";
import clsx from "clsx";

/** Flat, stage-grouped alternative to the Kanban board — same tasks, same
 * data, just rows instead of columns. Used as the "List" view toggle for
 * every board (Enquiry List, Estimation, Projects, ...), not just one. */
export const TaskListView: React.FC<{
  stages: BoardStage[];
  tasksByStage: Record<string, TaskSummary[]>;
  onOpenTask: (task: TaskSummary) => void;
}> = ({ stages, tasksByStage, onOpenTask }) => {
  const totalCount = stages.reduce((sum, s) => sum + (tasksByStage[s.id]?.length ?? 0), 0);

  if (totalCount === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">No enquiries match the current filters.</p>;
  }

  return (
    <div className="space-y-5 overflow-y-auto pb-4">
      {stages.map((stage) => {
        const items = tasksByStage[stage.id] ?? [];
        if (items.length === 0) return null;
        return (
          <div key={stage.id}>
            <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
              {stage.name} <Badge tone="slate">{items.length}</Badge>
            </p>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {items.map((task, idx) => (
                <div
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenTask(task)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpenTask(task)}
                  className={clsx(
                    // Below sm: title and badges are two separate stacked
                    // rows (flex-col). At sm+: the badges row becomes
                    // `contents` so its children rejoin this flex row
                    // directly, restoring the original single-line layout.
                    "flex w-full flex-col gap-2 px-3 py-2.5 text-left sm:flex-row sm:flex-nowrap sm:items-center sm:gap-3",
                    idx !== 0 && "border-t border-slate-100",
                    task.isHighlighted && "bg-amber-50"
                  )}
                >
                  <span className="min-w-0 sm:flex-1">
                    <span className="mr-1.5 text-xs text-slate-400">{task.taskId}</span>
                    {task.enquiryId && <span className="mr-1.5 text-xs text-brand-500">{task.enquiryId}</span>}
                    {task.estimationId && <span className="mr-1.5 text-xs text-indigo-500">{task.estimationId}</span>}
                    <span className="text-sm font-medium text-slate-800 hover:text-brand-700">{task.title}</span>
                    {task.isHighlighted && (
                      <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                        New
                      </span>
                    )}
                    {task.customer && (
                      <Link
                        to={`/workflow/customers/${task.customer.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="ml-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                      >
                        <Building2 className="h-3 w-3" /> {task.customer.name}
                      </Link>
                    )}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 sm:contents">
                    {task.assignees.length > 0 && (
                      <Badge tone="slate">
                        {task.assignees[0].name}
                        {task.assignees.length > 1 ? ` +${task.assignees.length - 1}` : ""}
                      </Badge>
                    )}
                    <PriorityBadge priority={task.priority} />
                    <ChecklistProgress done={task.checklistProgress.done} total={task.checklistProgress.total} />
                    <DueDateBadge dueDate={task.dueDate} status={task.dueDateStatus} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
