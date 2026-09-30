import React, { useEffect, useRef, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, closestCorners } from "@dnd-kit/core";
import { MoreVertical } from "lucide-react";
import clsx from "clsx";
import { BoardCard } from "./BoardCard";
import { ProjectActions } from "./ProjectsListView";
import { Board, ProjectStage } from "../../lib/types";

export type ProjectStageMenuAction = "rename" | "wip" | "color" | "moveLeft" | "moveRight" | "delete";

const DraggableProject: React.FC<{ board: Board; actions: ProjectActions }> = ({ board, actions }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: board.id, disabled: !actions.canMove(board) });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={clsx("touch-none", isDragging && "opacity-40")}>
      <BoardCard
        board={board}
        canManage={actions.canManage(board)}
        onEdit={() => actions.onEdit(board)}
        onManageMembers={() => actions.onManageMembers(board)}
        onDuplicate={() => actions.onDuplicate(board)}
        onArchive={() => actions.onArchive(board)}
        onDelete={() => actions.onDelete(board)}
        selected={actions.isSelected(board.id)}
        onToggleSelect={() => actions.onToggleSelect(board.id)}
      />
    </div>
  );
};

const StageMenu: React.FC<{ stage: ProjectStage; onAction: (a: ProjectStageMenuAction) => void }> = ({ stage, onAction }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const item = (label: string, action: ProjectStageMenuAction, destructive?: boolean) => (
    <button
      onClick={() => {
        setOpen(false);
        onAction(action);
      }}
      className={clsx("block w-full px-3 py-1.5 text-left hover:bg-slate-50", destructive && "text-red-600 hover:bg-red-50")}
    >
      {label}
    </button>
  );

  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="rounded p-1 text-slate-400 hover:bg-slate-200" aria-label={`${stage.name} stage menu`}>
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
          {item("Rename Stage", "rename")}
          {item("Set WIP Limit", "wip")}
          {item("Change Colour", "color")}
          {item("Move Left", "moveLeft")}
          {item("Move Right", "moveRight")}
          {item("Delete Stage", "delete", true)}
        </div>
      )}
    </div>
  );
};

const StageColumn: React.FC<{
  stage: ProjectStage;
  boards: Board[];
  actions: ProjectActions;
  canManageStages: boolean;
  onStageMenuAction: (stage: ProjectStage, action: ProjectStageMenuAction) => void;
}> = ({ stage, boards, actions, canManageStages, onStageMenuAction }) => {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const overLimit = stage.wipLimit ? boards.length >= stage.wipLimit : false;
  const nearLimit = stage.wipLimit ? boards.length >= stage.wipLimit - 1 && !overLimit : false;

  return (
    <div className="flex max-h-[70vh] w-72 shrink-0 flex-col rounded-xl bg-slate-100/70 sm:w-80">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stage.color }} />
          <p className="truncate text-sm font-semibold text-slate-800">{stage.name}</p>
          <span className="shrink-0 text-xs text-slate-400">{boards.length}</span>
          {stage.wipLimit && (
            <span
              className={clsx(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                overLimit ? "bg-red-100 text-red-700" : nearLimit ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"
              )}
            >
              {boards.length}/{stage.wipLimit}
            </span>
          )}
        </div>
        {canManageStages && <StageMenu stage={stage} onAction={(a) => onStageMenuAction(stage, a)} />}
      </div>
      <div ref={setNodeRef} className={clsx("flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-3 transition-colors", isOver && "bg-brand-50/60")}>
        {boards.map((board) => (
          <DraggableProject key={board.id} board={board} actions={actions} />
        ))}
        {boards.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No projects in this stage.</p>}
      </div>
    </div>
  );
};

/** Projects as a kanban, one column per project stage (Backlog, To Do, In Progress, Done by default —
 *  customisable). Owners/Editors drag a project between columns; the card itself still opens the project. */
export const ProjectsKanbanView: React.FC<{
  boards: Board[];
  stages: ProjectStage[];
  actions: ProjectActions;
  canManageStages: boolean;
  onStageMenuAction: (stage: ProjectStage, action: ProjectStageMenuAction) => void;
}> = ({ boards, stages, actions, canManageStages, onStageMenuAction }) => {
  // Shows the drop immediately instead of waiting for the list to refetch.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [active, setActive] = useState<Board | null>(null);

  useEffect(() => setOverrides({}), [boards]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }));
  const stageOf = (b: Board) => overrides[b.id] ?? b.projectStageId ?? stages[0]?.id;

  function handleDragStart(e: DragStartEvent) {
    setActive(boards.find((b) => b.id === e.active.id) ?? null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActive(null);
    const board = boards.find((b) => b.id === e.active.id);
    const target = stages.find((s) => s.id === e.over?.id)?.id;
    if (!board || !target || stageOf(board) === target) return;
    setOverrides((o) => ({ ...o, [board.id]: target }));
    actions.onStageChange(board, target);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            boards={boards.filter((b) => stageOf(b) === stage.id)}
            actions={actions}
            canManageStages={canManageStages}
            onStageMenuAction={onStageMenuAction}
          />
        ))}
      </div>
      <DragOverlay>
        {active && (
          <div className="w-72 sm:w-80">
            <BoardCard board={active} canManage={false} onEdit={() => undefined} onManageMembers={() => undefined} onDuplicate={() => undefined} onArchive={() => undefined} onDelete={() => undefined} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};
