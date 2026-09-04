import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Paperclip, MessageSquare, Link2, MoreVertical, GripVertical } from "lucide-react";
import clsx from "clsx";
import { TaskSummary } from "../../lib/types";
import { PriorityBadge, DueDateBadge, ApprovalStatusBadge, ChecklistProgress } from "../workflow/badges";
import { AvatarGroup, Badge, Checkbox, Tooltip } from "../ui/primitives";
import { useQuickComplete } from "../../api/tasks";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";

interface Props {
  task: TaskSummary;
  onOpen: () => void;
  onMenuAction: (action: "duplicate" | "move" | "recurring" | "delete") => void;
  dragDisabled?: boolean;
}

/**
 * Section 26 (Task Quick View): the inline complete checkbox lives directly
 * on the card for fast one-click completion — respecting the approval gate
 * server-side (an approval-controlled task lands in Pending Approval instead
 * of Done, reflected here via the ApprovalStatusBadge). Quick-editing
 * assignee/due-date/priority happens in the full Task Detail Panel (via
 * "Open task"), which already exposes every field for editing.
 */
export const TaskCard: React.FC<Props> = ({ task, onOpen, onMenuAction, dragDisabled }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: dragDisabled });
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { push } = useToast();
  const quickComplete = useQuickComplete();

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md",
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 hidden shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 sm:block"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Tooltip label={task.isCompleted ? "Completed" : task.requiresApproval ? "Complete (will require approval)" : "Mark complete"}>
          <span onClick={(e) => e.stopPropagation()} className="mt-0.5 shrink-0">
            <Checkbox
              checked={task.isCompleted}
              disabled={quickComplete.isPending || task.isCompleted}
              onChange={async () => {
                try {
                  await quickComplete.mutateAsync(task.id);
                } catch (err) {
                  push({ variant: "error", title: "Could not complete task", description: extractApiError(err).message });
                }
              }}
              aria-label={`Mark ${task.taskId} complete`}
            />
          </span>
        </Tooltip>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">{task.taskId}</div>
          <p className="mt-0.5 line-clamp-2 text-sm font-medium text-slate-900">{task.title}</p>
        </button>
        <div className="relative shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className="rounded p-0.5 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-500 group-hover:opacity-100"
            aria-label="Task menu"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg" onMouseLeave={() => setMenuOpen(false)}>
              <button onClick={() => { setMenuOpen(false); onMenuAction("move"); }} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">
                Move to Stage
              </button>
              <button onClick={() => { setMenuOpen(false); onMenuAction("duplicate"); }} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">
                Duplicate Task
              </button>
              <button onClick={() => { setMenuOpen(false); onMenuAction("recurring"); }} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">
                Convert to Recurring
              </button>
              <button onClick={() => { setMenuOpen(false); onMenuAction("delete"); }} className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50">
                Delete Task
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        {task.tags.slice(0, 2).map((t) => (
          <Badge key={t.id} tone="slate">
            {t.name}
          </Badge>
        ))}
        <ApprovalStatusBadge status={task.approvalStatus} />
      </div>

      {task.linkedRecord && (
        <div className="mt-1.5 flex items-center gap-1 truncate text-xs text-slate-400">
          <Link2 className="h-3 w-3 shrink-0" /> {task.linkedRecord.name}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <DueDateBadge dueDate={task.dueDate} status={task.dueDateStatus} />
        <AvatarGroup names={task.assignees.map((a) => a.name)} />
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
        <ChecklistProgress done={task.checklistProgress.done} total={task.checklistProgress.total} />
        {task.attachmentCount > 0 && (
          <span className="flex items-center gap-1">
            <Paperclip className="h-3 w-3" /> {task.attachmentCount}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> {task.commentCount}
          </span>
        )}
      </div>
    </div>
  );
};
