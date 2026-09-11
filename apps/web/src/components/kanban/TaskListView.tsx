import React from "react";
import { Badge } from "../ui/primitives";
import { PriorityBadge, DueDateBadge, ChecklistProgress } from "../workflow/badges";
import { BoardStage, TaskSummary } from "../../lib/types";
import clsx from "clsx";

/** Flat, stage-grouped alternative to the Kanban board — same tasks, same
 * data, just rows instead of columns. Currently only wired up for the
 * Enquiry List view (see BoardKanbanPage's `boardIdProp` check), not every
 * project board. */
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
                <button
                  key={task.id}
                  onClick={() => onOpenTask(task)}
                  className={clsx(
                    "flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left sm:flex-nowrap",
                    idx !== 0 && "border-t border-slate-100"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="mr-1.5 text-xs text-slate-400">{task.taskId}</span>
                    <span className="text-sm font-medium text-slate-800 hover:text-brand-700">{task.title}</span>
                  </span>
                  {task.assignees.length > 0 && (
                    <Badge tone="slate">
                      {task.assignees[0].name}
                      {task.assignees.length > 1 ? ` +${task.assignees.length - 1}` : ""}
                    </Badge>
                  )}
                  <PriorityBadge priority={task.priority} />
                  <ChecklistProgress done={task.checklistProgress.done} total={task.checklistProgress.total} />
                  <DueDateBadge dueDate={task.dueDate} status={task.dueDateStatus} />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
