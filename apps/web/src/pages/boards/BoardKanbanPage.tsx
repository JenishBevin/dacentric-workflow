import React, { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useBoardDetail, useReorderStages } from "../../api/boards";
import { useBoardTasks, useDuplicateTask, useDeleteTask } from "../../api/tasks";
import { downloadExport } from "../../api/misc";
import { KanbanToolbar } from "../../components/kanban/KanbanToolbar";
import { KanbanBoard } from "../../components/kanban/KanbanBoard";
import { NewTaskDrawer } from "../../components/kanban/NewTaskDrawer";
import { TaskDetailDrawer } from "../../components/tasks/TaskDetailDrawer";
import { BoardSettingsDrawer } from "../../components/boards/BoardSettingsDrawer";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Button, Skeleton, ErrorState, Badge } from "../../components/ui/primitives";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { can, isAdmin } from "../../lib/permissions";
import { extractApiError } from "../../lib/apiClient";
import { TaskSummary, BoardStage } from "../../lib/types";

interface Filters {
  search: string;
  assigneeUserId?: string;
  priority?: string;
  sortBy?: string;
  groupBy?: string;
}

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function sortTasks(tasks: TaskSummary[], key?: string): TaskSummary[] {
  if (!key || key === "none") return tasks;
  const list = [...tasks];
  if (key === "dueDate") list.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  else if (key === "priority") list.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  else if (key === "title") list.sort((a, b) => a.title.localeCompare(b.title));
  else if (key === "assignee") list.sort((a, b) => (a.assignees[0]?.name ?? "").localeCompare(b.assignees[0]?.name ?? ""));
  return list;
}

export default function BoardKanbanPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: board, isLoading, isError, refetch } = useBoardDetail(boardId);
  const [filters, setFilters] = useState<Filters>({ search: "" });
  const { data: tasks, isLoading: tasksLoading } = useBoardTasks(boardId, {
    search: filters.search || undefined,
    assigneeUserId: filters.assigneeUserId,
    priority: filters.priority,
  });

  const [newTaskStageId, setNewTaskStageId] = useState<string | null>(null);
  const [recurringPrefill, setRecurringPrefill] = useState<any>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<TaskSummary | null>(null);

  const reorderStages = useReorderStages(boardId ?? "");
  const duplicateTask = useDuplicateTask();
  const deleteTask = useDeleteTask();

  const settingsTab = searchParams.get("settings") as "general" | "stages" | "members" | "templates" | null;
  const openTaskId = searchParams.get("task");

  function closeSettings() {
    const next = new URLSearchParams(searchParams);
    next.delete("settings");
    setSearchParams(next, { replace: true });
  }
  function openSettings(tab: "general" | "stages" | "members" | "templates") {
    const next = new URLSearchParams(searchParams);
    next.set("settings", tab);
    setSearchParams(next, { replace: true });
  }
  function openTask(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set("task", id);
    setSearchParams(next, { replace: true });
  }
  function closeTask() {
    const next = new URLSearchParams(searchParams);
    next.delete("task");
    setSearchParams(next, { replace: true });
  }

  const canManageBoard = isAdmin(user) || board?.members.some((m: any) => m.userId === user?.id && m.role === "OWNER") || can(user, "EDIT_BOARD");
  const canCreateTask = can(user, "CREATE_TASK");
  const canMoveTasks = can(user, "MOVE_TASK");
  const canExport = can(user, "EXPORT");

  const stages: BoardStage[] = useMemo(() => [...(board?.stages ?? [])].sort((a: any, b: any) => a.position - b.position), [board]);

  const tasksByStage = useMemo(() => {
    const map: Record<string, TaskSummary[]> = {};
    for (const stage of stages) map[stage.id] = [];
    for (const task of tasks ?? []) {
      if (!map[task.stageId]) map[task.stageId] = [];
      map[task.stageId].push(task);
    }
    const key = filters.groupBy && filters.groupBy !== "none" ? filters.groupBy : filters.sortBy;
    for (const stageId of Object.keys(map)) map[stageId] = sortTasks(map[stageId], key);
    return map;
  }, [tasks, stages, filters.groupBy, filters.sortBy]);

  async function handleStageMenuAction(stage: BoardStage, action: "rename" | "wip" | "color" | "moveLeft" | "moveRight" | "delete") {
    if (action === "moveLeft" || action === "moveRight") {
      const ids = stages.map((s) => s.id);
      const idx = ids.indexOf(stage.id);
      const swapWith = action === "moveLeft" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= ids.length) return;
      [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
      try {
        await reorderStages.mutateAsync(ids);
      } catch (err) {
        push({ variant: "error", title: "Could not reorder stages", description: extractApiError(err).message });
      }
      return;
    }
    // Rename/WIP/colour/delete all live in Board Settings → Stages, where the
    // full stage editor (and its delete confirmation) is already built out.
    openSettings("stages");
  }

  async function handleTaskMenuAction(task: TaskSummary, action: "duplicate" | "recurring" | "delete") {
    if (action === "duplicate") {
      try {
        await duplicateTask.mutateAsync(task.id);
        push({ variant: "success", title: "Task duplicated." });
      } catch (err) {
        push({ variant: "error", title: "Could not duplicate task", description: extractApiError(err).message });
      }
    } else if (action === "recurring") {
      setRecurringPrefill({
        title: `${task.title} (recurring)`,
        description: task.description ?? undefined,
        priority: task.priority,
        assignees: task.assignees.map((a) => ({ userId: a.userId, name: a.name })),
        checklist: task.checklist.map((c) => c.text),
        tagIds: task.tags.map((t) => t.id),
        defaultRecurring: true,
      });
      setNewTaskStageId(task.stageId);
    } else if (action === "delete") {
      setPendingDeleteTask(task);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4 overflow-x-auto">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-72" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !board) {
    return <ErrorState message="Could not load this board. You may not have access to it." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={() => navigate("/workflow/boards")} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Back to boards">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-900">{board.name}</h1>
            {board.description && <p className="truncate text-xs text-slate-500">{board.description}</p>}
          </div>
          {board.isArchived && <Badge tone="slate">Archived</Badge>}
        </div>
        {canCreateTask && !board.isArchived && (
          <Button onClick={() => { setRecurringPrefill(null); setNewTaskStageId(stages[0]?.id ?? null); }} disabled={stages.length === 0}>
            Add Task
          </Button>
        )}
      </div>

      <KanbanToolbar
        board={board}
        employees={board.members.map((m: any) => ({ employeeId: m.userId, userId: m.userId, name: m.name, email: "" }))}
        filters={filters}
        onChange={setFilters}
        onExport={() => downloadExport(`/exports/board/${boardId}`, filters, `${board.name.replace(/\s+/g, "-").toLowerCase()}-export.xlsx`).catch((err) => push({ variant: "error", title: "Export failed", description: extractApiError(err).message }))}
        onOpenMembers={() => openSettings("members")}
        onOpenSettings={() => openSettings("general")}
        onAddStage={() => openSettings("stages")}
        canManage={canManageBoard}
        canExport={canExport}
      />

      {tasksLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((s) => (
            <Skeleton key={s.id} className="h-96 w-72 shrink-0" />
          ))}
        </div>
      ) : stages.length === 0 ? (
        <ErrorState message="This board has no stages yet. Add one from Board Settings." onRetry={() => openSettings("stages")} />
      ) : (
        <KanbanBoard
          stages={stages}
          tasksByStage={tasksByStage}
          onAddTask={(stageId) => { setRecurringPrefill(null); setNewTaskStageId(stageId); }}
          onOpenTask={(task) => openTask(task.id)}
          onTaskMenuAction={handleTaskMenuAction}
          onStageMenuAction={handleStageMenuAction}
          canManageStages={canManageBoard}
          canMoveTasks={canMoveTasks}
        />
      )}

      {newTaskStageId && (
        <NewTaskDrawer
          open={!!newTaskStageId}
          onClose={() => { setNewTaskStageId(null); setRecurringPrefill(null); }}
          board={board}
          initialStageId={newTaskStageId}
          prefill={recurringPrefill ?? undefined}
        />
      )}

      <TaskDetailDrawer taskId={openTaskId} onClose={closeTask} onDeleted={closeTask} />

      {settingsTab && <BoardSettingsDrawer open={!!settingsTab} onClose={closeSettings} board={board} initialTab={settingsTab} />}

      <ConfirmDialog
        open={!!pendingDeleteTask}
        title="Delete task"
        message={
          pendingDeleteTask && (
            <>
              Are you sure you want to delete <strong>&ldquo;{pendingDeleteTask.title}&rdquo;</strong> ({pendingDeleteTask.taskId})? This cannot be undone.
            </>
          )
        }
        confirmLabel="Delete task"
        loading={deleteTask.isPending}
        onCancel={() => setPendingDeleteTask(null)}
        onConfirm={async () => {
          if (!pendingDeleteTask) return;
          try {
            await deleteTask.mutateAsync(pendingDeleteTask.id);
            push({ variant: "success", title: "Task deleted." });
          } catch (err) {
            push({ variant: "error", title: "Could not delete task", description: extractApiError(err).message });
          }
          setPendingDeleteTask(null);
        }}
      />
    </div>
  );
}
