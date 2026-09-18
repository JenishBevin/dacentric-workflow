import React, { useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, List, LayoutGrid, Upload, Trello, PackageSearch, Building2, Landmark } from "lucide-react";
import { useBoardDetail, useReorderStages, useSetBoardCompleted } from "../../api/boards";
import { useBoardTasks, useDuplicateTask, useDeleteTask, useImportEnquiries } from "../../api/tasks";
import { downloadExport } from "../../api/misc";
import { KanbanToolbar } from "../../components/kanban/KanbanToolbar";
import { KanbanBoard } from "../../components/kanban/KanbanBoard";
import { TaskListView } from "../../components/kanban/TaskListView";
import { NewTaskDrawer } from "../../components/kanban/NewTaskDrawer";
import { TaskDetailDrawer } from "../../components/tasks/TaskDetailDrawer";
import { BoardSettingsDrawer } from "../../components/boards/BoardSettingsDrawer";
import { ProcurementPanel } from "../../components/procurement/ProcurementPanel";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Button, Skeleton, ErrorState, Badge } from "../../components/ui/primitives";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { can, isAdmin } from "../../lib/permissions";
import { extractApiError } from "../../lib/apiClient";
import { TaskSummary, BoardStage } from "../../lib/types";
import clsx from "clsx";

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

/**
 * `boardId` is normally taken from the `/workflow/boards/:boardId` route
 * param, but this page doubles as the Enquiry List view: EnquiryListPage
 * renders it directly with an explicit `boardId` so the URL stays at
 * `/workflow/enquiries` — redirecting to `/workflow/boards/:id` would make
 * the sidebar's "Projects" link light up instead of "Enquiry List", since
 * NavLink matches any URL starting with its own path.
 */
export default function BoardKanbanPage({ boardId: boardIdProp }: { boardId?: string } = {}) {
  const { boardId: boardIdParam } = useParams<{ boardId: string }>();
  const boardId = boardIdProp ?? boardIdParam;
  const navigate = useNavigate();
  const location = useLocation();
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
  const [confirmComplete, setConfirmComplete] = useState(false);
  // List/Kanban toggle is only offered on the Enquiry List embed (identified
  // the same way the back-button and "Mark Completed" banner already are —
  // by whether this page was handed an explicit boardId prop), not on every
  // ordinary project board.
  const [view, setView] = useState<"kanban" | "list">("kanban");
  // Project/Procurement toggle — only relevant once this board has a
  // ProcurementRecord (awarded from Accounts). Driven by the URL path
  // itself (not local state), so the sidebar highlight ("Projects" vs
  // "Procurement", NavLink matches by prefix) always agrees with what's on
  // screen: the Procurement list links here via /workflow/procurement/:id,
  // everywhere else (Projects list, awardTask, etc.) via
  // /workflow/boards/:id. It only changes when the toggle button itself is
  // clicked — never as a side effect of just opening the page.
  const panelView: "project" | "procurement" = boardIdProp ? "project" : location.pathname.startsWith("/workflow/procurement/") ? "procurement" : "project";
  function setPanel(next: "project" | "procurement") {
    if (next === panelView || !boardId) return;
    const base = next === "procurement" ? "/workflow/procurement" : "/workflow/boards";
    navigate({ pathname: `${base}/${boardId}`, search: searchParams.toString() ? `?${searchParams.toString()}` : "" }, { replace: true });
  }

  const reorderStages = useReorderStages(boardId ?? "");
  const duplicateTask = useDuplicateTask();
  const deleteTask = useDeleteTask();
  const setBoardCompleted = useSetBoardCompleted();
  const importEnquiries = useImportEnquiries();
  const importFileInputRef = useRef<HTMLInputElement>(null);

  async function handleImportEnquiriesFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const result = await importEnquiries.mutateAsync(file);
      push({
        variant: "success",
        title: `Imported ${result.created} enquir${result.created === 1 ? "y" : "ies"}.`,
        description: result.skipped.length ? `${result.skipped.length} row(s) skipped — see console for details.` : undefined,
      });
      if (result.skipped.length) console.warn("Enquiry import — skipped rows:", result.skipped);
    } catch (err) {
      push({ variant: "error", title: "Import failed", description: extractApiError(err).message });
    }
  }

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
    return <ErrorState message="Could not load this project. You may not have access to it." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {!boardIdProp && (
            <button
              onClick={() => navigate(panelView === "procurement" ? "/workflow/procurement" : "/workflow/boards")}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label={panelView === "procurement" ? "Back to Procurement" : "Back to projects"}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-slate-900">{board.name}</h1>
              <span className="shrink-0 text-xs font-medium text-slate-400">{board.boardId}</span>
            </div>
            {board.description && <p className="truncate text-xs text-slate-500">{board.description}</p>}
            {board.customer && (
              <Link to={`/workflow/customers/${board.customer.id}`} className="mt-0.5 flex items-center gap-1 truncate text-xs text-brand-600 hover:underline">
                <Building2 className="h-3 w-3 shrink-0" /> {board.customer.name}
              </Link>
            )}
          </div>
          {board.isArchived && <Badge tone="slate">Archived</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {board.procurementRecord && (
            <div className="flex rounded-lg border border-slate-300 p-0.5">
              <button
                onClick={() => setPanel("project")}
                className={clsx("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", panelView === "project" ? "bg-brand-600 text-white" : "text-slate-500")}
              >
                <Trello className="h-3.5 w-3.5" /> Project
              </button>
              <button
                onClick={() => setPanel("procurement")}
                className={clsx("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", panelView === "procurement" ? "bg-brand-600 text-white" : "text-slate-500")}
              >
                <PackageSearch className="h-3.5 w-3.5" /> Procurement
              </button>
            </div>
          )}
          {boardIdProp && panelView === "project" && (
            <div className="flex rounded-lg border border-slate-300 p-0.5">
              <button
                onClick={() => setView("list")}
                className={clsx("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", view === "list" ? "bg-brand-600 text-white" : "text-slate-500")}
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button
                onClick={() => setView("kanban")}
                className={clsx("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", view === "kanban" ? "bg-brand-600 text-white" : "text-slate-500")}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Kanban
              </button>
            </div>
          )}
          {panelView === "project" && canCreateTask && !board.isArchived && board.name === "Enquiry List" && (
            <>
              <input ref={importFileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportEnquiriesFile} />
              <Button variant="outline" onClick={() => importFileInputRef.current?.click()} loading={importEnquiries.isPending}>
                <Upload className="h-4 w-4" /> Import from Excel
              </Button>
            </>
          )}
          {panelView === "project" && canCreateTask && !board.isArchived && (
            <Button onClick={() => { setRecurringPrefill(null); setNewTaskStageId(stages[0]?.id ?? null); }} disabled={stages.length === 0}>
              Add Task
            </Button>
          )}
        </div>
      </div>

      {board.accountsApprovalStatus === "PENDING" && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Landmark className="h-4 w-4 shrink-0" />
          Waiting for approval from the Accounts department — tasks here can't be marked Lost or Completed until then.
        </div>
      )}

      {board.accountsApprovalStatus === "REJECTED" && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <Landmark className="h-4 w-4 shrink-0" />
          Rejected by Accounts — this project moved to Lost in Project/Task History. Restore it from there to reopen.
        </div>
      )}

      {panelView === "procurement" ? (
        <ProcurementPanel boardId={boardId!} />
      ) : (
        <>
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
        <ErrorState message="This project has no stages yet. Add one from Project Settings." onRetry={() => openSettings("stages")} />
      ) : view === "list" ? (
        <TaskListView stages={stages} tasksByStage={tasksByStage} onOpenTask={(task) => openTask(task.id)} />
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

      {canManageBoard && board.name !== "Enquiry List" && board.name !== "Estimation" && board.name !== "Accounts" && !board.isCompleted && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Once every task on this project is done, mark it Completed to move it into Project/Task History.</p>
          <Button variant="outline" size="sm" onClick={() => setConfirmComplete(true)}>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Mark as Completed
          </Button>
        </div>
      )}
        </>
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

      <ConfirmDialog
        open={confirmComplete}
        title="Mark project as completed"
        message={
          <>
            <strong>&ldquo;{board.name}&rdquo;</strong> will move to Project/Task History and no longer show up in your active Projects list. You can restore it from there afterward.
          </>
        }
        confirmLabel="Mark as Completed"
        destructive={false}
        loading={setBoardCompleted.isPending}
        onCancel={() => setConfirmComplete(false)}
        onConfirm={async () => {
          try {
            await setBoardCompleted.mutateAsync({ boardId: boardId!, completed: true });
            push({ variant: "success", title: "Project marked as completed.", description: `${board.name} has moved to Project/Task History.` });
            setConfirmComplete(false);
            navigate(`/workflow/history?highlight=${boardId}`);
          } catch (err) {
            push({ variant: "error", title: "Could not mark project as completed", description: extractApiError(err).message });
          }
        }}
      />
    </div>
  );
}
