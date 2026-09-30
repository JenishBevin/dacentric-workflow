import React from "react";
import { Link } from "react-router-dom";
import { Badge, Checkbox } from "../ui/primitives";
import { PriorityBadge, DueDateBadge, ChecklistProgress } from "../workflow/badges";
import { BoardStage, TaskSummary } from "../../lib/types";
import clsx from "clsx";

/** Flat table alternative to the Kanban board — same tasks, same data, just
 * rows instead of columns. Used as the "List" view toggle for every board
 * (Enquiry List, Estimation, Projects, ...), not just one. Column layout
 * mirrors the top-level Projects list (ProjectsListView) for a consistent
 * look across every list-style table in the app. */
export const TaskListView: React.FC<{
  stages: BoardStage[];
  tasksByStage: Record<string, TaskSummary[]>;
  onOpenTask: (task: TaskSummary) => void;
  isTaskSelected?: (taskId: string) => boolean;
  onToggleTaskSelect?: (taskId: string) => void;
}> = ({ stages, tasksByStage, onOpenTask, isTaskSelected, onToggleTaskSelect }) => {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const rows = stages.flatMap((stage) => tasksByStage[stage.id] ?? []);

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">No tasks match the current filters.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            {onToggleTaskSelect && <th className="w-10 px-3 py-2.5" />}
            <th className="px-3 py-2.5">Task</th>
            <th className="px-3 py-2.5">Stage</th>
            <th className="hidden px-3 py-2.5 sm:table-cell">Service</th>
            <th className="hidden px-3 py-2.5 md:table-cell">Customer</th>
            <th className="px-3 py-2.5">Priority</th>
            <th className="hidden px-3 py-2.5 lg:table-cell">Assignees</th>
            <th className="px-3 py-2.5">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((task) => {
            const stage = stageById.get(task.stageId);
            return (
              <tr
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenTask(task)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpenTask(task)}
                className={clsx("cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50", task.isHighlighted && "bg-amber-50")}
              >
                {onToggleTaskSelect && (
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={!!isTaskSelected?.(task.id)} onChange={() => onToggleTaskSelect(task.id)} aria-label={`Select ${task.taskId}`} />
                  </td>
                )}
                <td className="max-w-[22rem] px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900">{task.title}</span>
                    {task.isHighlighted && (
                      <span className="shrink-0 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">New</span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-slate-400">
                    {task.taskId}
                    {task.enquiryId && <span className="text-brand-500">{task.enquiryId}</span>}
                    {task.estimationId && <span className="text-indigo-500">{task.estimationId}</span>}
                    {task.checklistProgress.total > 0 && <ChecklistProgress done={task.checklistProgress.done} total={task.checklistProgress.total} />}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {stage && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                      {stage.name}
                    </span>
                  )}
                </td>
                <td className="hidden px-3 py-2.5 text-slate-600 sm:table-cell">{task.service?.name ?? <span className="text-slate-400">—</span>}</td>
                <td className="hidden max-w-[14rem] truncate px-3 py-2.5 text-slate-600 md:table-cell">
                  {task.customer ? (
                    <Link to={`/workflow/customers/${task.customer.id}`} onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline">
                      {task.customer.name}
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <PriorityBadge priority={task.priority} />
                </td>
                <td className="hidden px-3 py-2.5 lg:table-cell">
                  {task.assignees.length > 0 ? (
                    <Badge tone="slate">
                      {task.assignees[0].name}
                      {task.assignees.length > 1 ? ` +${task.assignees.length - 1}` : ""}
                    </Badge>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <DueDateBadge dueDate={task.dueDate} status={task.dueDateStatus} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
