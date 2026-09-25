import React, { useLayoutEffect, useRef, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, TouchSensor, useSensor, useSensors, closestCorners } from "@dnd-kit/core";
import { StageColumn } from "./StageColumn";
import { TaskCard } from "./TaskCard";
import { MoveToStageSheet } from "./MoveToStageSheet";
import { BoardStage, TaskSummary } from "../../lib/types";
import { useMoveTask } from "../../api/tasks";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../ui/ConfirmDialog";

interface Props {
  stages: BoardStage[];
  tasksByStage: Record<string, TaskSummary[]>;
  onAddTask: (stageId: string) => void;
  onOpenTask: (task: TaskSummary) => void;
  // "move" is fully handled inside this component (it opens MoveToStageSheet
  // below) and is never forwarded to the parent's callback.
  onTaskMenuAction: (task: TaskSummary, action: "duplicate" | "recurring" | "delete") => void;
  onStageMenuAction: (stage: BoardStage, action: "rename" | "wip" | "color" | "moveLeft" | "moveRight" | "delete") => void;
  canManageStages: boolean;
  canMoveTasks: boolean;
  isTaskSelected?: (taskId: string) => boolean;
  onToggleTaskSelect?: (taskId: string) => void;
}

export const KanbanBoard: React.FC<Props> = ({
  stages,
  tasksByStage,
  onAddTask,
  onOpenTask,
  onTaskMenuAction,
  onStageMenuAction,
  canManageStages,
  canMoveTasks,
  isTaskSelected,
  onToggleTaskSelect,
}) => {
  const { push } = useToast();
  const moveTask = useMoveTask();
  const [activeTask, setActiveTask] = useState<TaskSummary | null>(null);
  const [moveSheetTask, setMoveSheetTask] = useState<TaskSummary | null>(null);
  const [wipConfirm, setWipConfirm] = useState<{ taskId: string; stageId: string; message: string } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState<number>();

  // Measured, not guessed: a fixed "100vh minus N px" assumes a fixed header
  // height above this row, which varies by page (title length wrapping,
  // filter row wrapping on narrow windows, banners) and left blank space
  // when the guess ran high. Measuring this row's actual top and subtracting
  // from the real viewport height gets the exact remaining space regardless
  // of what's above it, and re-measures on resize since that can change.
  useLayoutEffect(() => {
    function measure() {
      if (!rowRef.current) return;
      const top = rowRef.current.getBoundingClientRect().top;
      setRowHeight(Math.max(240, window.innerHeight - top - 24));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  const allTasks = Object.values(tasksByStage).flat();

  function findStageOfDroppableId(id: string): string | null {
    if (stages.some((s) => s.id === id)) return id;
    const task = allTasks.find((t) => t.id === id);
    return task?.stageId ?? null;
  }

  async function performMove(taskId: string, stageId: string, confirmWipOverride = false) {
    try {
      await moveTask.mutateAsync({ taskId, stageId, confirmWipOverride });
    } catch (err) {
      const apiErr = extractApiError(err);
      if (apiErr.code === "CONFLICT" && /WIP limit/i.test(apiErr.message)) {
        setWipConfirm({ taskId, stageId, message: apiErr.message });
      } else {
        push({ variant: "error", title: "Could not move task", description: apiErr.message });
      }
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const task = allTasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over || !canMoveTasks) return;
    const targetStageId = findStageOfDroppableId(String(over.id));
    const task = allTasks.find((t) => t.id === active.id);
    if (!task || !targetStageId || targetStageId === task.stageId) return;
    performMove(task.id, targetStageId);
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Self-contained viewport bound (no ancestor height chain to break
            other pages, unlike an earlier attempt at this) — height is
            measured (see rowHeight above), not guessed, so short columns
            stretch to fill exactly the remaining space instead of leaving
            blank space below them; each column scrolls its own task list
            internally past that height. Falls back to a reasonable class
            cap before the first measurement lands. */}
        <div
          ref={rowRef}
          className="flex max-h-[70vh] gap-4 overflow-x-auto pb-4"
          style={rowHeight ? { height: rowHeight, maxHeight: "none" } : undefined}
        >
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              tasks={tasksByStage[stage.id] ?? []}
              onAddTask={() => onAddTask(stage.id)}
              onOpenTask={onOpenTask}
              onTaskMenuAction={(task, action) => (action === "move" ? setMoveSheetTask(task) : onTaskMenuAction(task, action))}
              onStageMenuAction={(action) => onStageMenuAction(stage, action)}
              canManageStage={canManageStages}
              dragDisabled={!canMoveTasks}
              isTaskSelected={isTaskSelected}
              onToggleTaskSelect={onToggleTaskSelect}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask && (
            <div className="w-72 sm:w-80">
              <TaskCard task={activeTask} onOpen={() => undefined} onMenuAction={() => undefined} dragDisabled />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <MoveToStageSheet
        open={!!moveSheetTask}
        onClose={() => setMoveSheetTask(null)}
        task={moveSheetTask}
        stages={stages}
        onSelect={(stageId) => {
          if (moveSheetTask) performMove(moveSheetTask.id, stageId);
          setMoveSheetTask(null);
        }}
      />

      <ConfirmDialog
        open={!!wipConfirm}
        title="WIP limit reached"
        message={wipConfirm?.message}
        confirmLabel="Move anyway"
        destructive={false}
        loading={moveTask.isPending}
        onCancel={() => setWipConfirm(null)}
        onConfirm={async () => {
          if (wipConfirm) await performMove(wipConfirm.taskId, wipConfirm.stageId, true);
          setWipConfirm(null);
        }}
      />
    </>
  );
};
