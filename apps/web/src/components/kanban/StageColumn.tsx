import React, { useState, useRef, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, MoreVertical } from "lucide-react";
import clsx from "clsx";
import { BoardStage, TaskSummary } from "../../lib/types";
import { TaskCard } from "./TaskCard";
import { EmptyState } from "../ui/primitives";

interface Props {
  stage: BoardStage;
  tasks: TaskSummary[];
  onAddTask: () => void;
  onOpenTask: (task: TaskSummary) => void;
  onTaskMenuAction: (task: TaskSummary, action: "duplicate" | "move" | "recurring" | "delete") => void;
  onStageMenuAction: (action: "rename" | "wip" | "color" | "moveLeft" | "moveRight" | "delete") => void;
  canManageStage: boolean;
  dragDisabled?: boolean;
}

export const StageColumn: React.FC<Props> = ({ stage, tasks, onAddTask, onOpenTask, onTaskMenuAction, onStageMenuAction, canManageStage, dragDisabled }) => {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const openCount = tasks.filter((t) => !t.isCompleted).length;
  const overLimit = stage.wipLimit ? openCount >= stage.wipLimit : false;
  const nearLimit = stage.wipLimit ? openCount >= stage.wipLimit - 1 && !overLimit : false;

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100/70 sm:w-80">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stage.color }} />
          <p className="truncate text-sm font-semibold text-slate-800">{stage.name}</p>
          <span className="shrink-0 text-xs text-slate-400">{openCount}</span>
          {stage.wipLimit && (
            <span
              className={clsx(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                overLimit ? "bg-red-100 text-red-700" : nearLimit ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"
              )}
            >
              {openCount}/{stage.wipLimit}
            </span>
          )}
        </div>
        {canManageStage && (
          <div className="relative shrink-0" ref={ref}>
            <button onClick={() => setMenuOpen((o) => !o)} className="rounded p-1 text-slate-400 hover:bg-slate-200" aria-label={`${stage.name} stage menu`}>
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
                <button onClick={() => { setMenuOpen(false); onStageMenuAction("rename"); }} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">Rename Stage</button>
                <button onClick={() => { setMenuOpen(false); onStageMenuAction("wip"); }} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">Set WIP Limit</button>
                <button onClick={() => { setMenuOpen(false); onStageMenuAction("color"); }} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">Change Colour</button>
                <button onClick={() => { setMenuOpen(false); onStageMenuAction("moveLeft"); }} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">Move Left</button>
                <button onClick={() => { setMenuOpen(false); onStageMenuAction("moveRight"); }} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">Move Right</button>
                <button onClick={() => { setMenuOpen(false); onStageMenuAction("delete"); }} className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50">Delete Stage</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={clsx("flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-3 transition-colors", isOver && "bg-brand-50/60")}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={() => onOpenTask(task)} onMenuAction={(a) => onTaskMenuAction(task, a)} dragDisabled={dragDisabled} />
          ))}
        </SortableContext>
        {tasks.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No tasks in this stage.</p>}
      </div>

      <button
        onClick={onAddTask}
        className="mx-3 mb-3 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 hover:border-brand-400 hover:text-brand-600"
      >
        <Plus className="h-3.5 w-3.5" /> Add Task
      </button>
    </div>
  );
};
