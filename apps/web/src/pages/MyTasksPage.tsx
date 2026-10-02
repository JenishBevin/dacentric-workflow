import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { List, LayoutGrid, Plus } from "lucide-react";
import { useMyTasks } from "../api/misc";
import { downloadExport } from "../api/misc";
import { useMoveTask, useBulkDeleteTasks, useBulkMoveTasks } from "../api/tasks";
import { useBoardDetail, useBoards, usePersonalTasksBoard } from "../api/boards";
import { Button, Checkbox, Skeleton, EmptyState, ErrorState, Badge } from "../components/ui/primitives";
import { BulkActionBar } from "../components/ui/BulkActionBar";
import { PriorityBadge, DueDateBadge, ChecklistProgress } from "../components/workflow/badges";
import { MoveToStageSheet, MovableTask } from "../components/kanban/MoveToStageSheet";
import { BulkMoveToStageSheet } from "../components/kanban/BulkMoveToStageSheet";
import { FollowUpMoveDialog, FollowUpChoice } from "../components/kanban/FollowUpMoveDialog";
import { NewTaskDrawer } from "../components/kanban/NewTaskDrawer";
import { TaskDetailDrawer } from "../components/tasks/TaskDetailDrawer";
import { Modal } from "../components/ui/Modal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useSelection } from "../hooks/useSelection";
import { useToast } from "../context/ToastContext";
import { extractApiError } from "../lib/apiClient";
import { can, isAdmin } from "../lib/permissions";
import { useAuth } from "../context/AuthContext";
import clsx from "clsx";

interface MyTaskItem {
  id: string;
  taskId: string;
  title: string;
  boardId: string;
  boardName: string;
  stageId: string;
  stageName: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate: string | null;
  dueDateStatus: "OVERDUE" | "DUE_SOON" | "ON_TRACK" | "NO_DUE_DATE";
  isCompleted: boolean;
  isPrimary: boolean;
  checklistProgress: { done: number; total: number };
}

const GROUP_ORDER: Array<{ key: string; label: string; hint: string }> = [
  { key: "OVERDUE", label: "Overdue", hint: "No overdue tasks." },
  { key: "DUE_TODAY", label: "Due Today", hint: "Nothing due today." },
  { key: "DUE_THIS_WEEK", label: "Due This Week", hint: "Nothing due this week." },
  { key: "UPCOMING", label: "Upcoming", hint: "No upcoming tasks." },
  { key: "NO_DUE_DATE", label: "No Due Date", hint: "Everything here has a due date." },
];

/** Section 29 / UC-11: consolidated cross-board My Tasks, with list and personal-Kanban views. */
export default function MyTasksPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: groups, isLoading, isError, refetch } = useMyTasks();
  const moveTask = useMoveTask();
  const bulkDeleteTasks = useBulkDeleteTasks();
  const bulkMoveTasks = useBulkMoveTasks();
  const [view, setView] = useState<"list" | "kanban">("list");
  const [moveItem, setMoveItem] = useState<MyTaskItem | null>(null);
  const { data: moveBoard } = useBoardDetail(moveItem?.boardId);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [followUpPrompt, setFollowUpPrompt] = useState<{ scope: "single" | "bulk"; stageId: string } | null>(null);

  const allItems = useMemo(() => (groups ? Object.values(groups).flat() : []) as MyTaskItem[], [groups]);
  const itemById = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);
  const selection = useSelection(allItems.map((i) => i.id));
  const selectedItems = useMemo(() => [...selection.selectedIds].map((id) => itemById.get(id)!).filter(Boolean), [selection.selectedIds, itemById]);
  const selectedBoardId = selectedItems.length > 0 && selectedItems.every((i) => i.boardId === selectedItems[0].boardId) ? selectedItems[0].boardId : null;
  const { data: bulkMoveBoard } = useBoardDetail(bulkMoveOpen ? selectedBoardId ?? undefined : undefined);

  function reportBulkResult(result: { succeeded: string[]; failed: { id: string; error: string }[] }, verb: string) {
    if (result.failed.length === 0) {
      push({ variant: "success", title: `${result.succeeded.length} task${result.succeeded.length === 1 ? "" : "s"} ${verb}.` });
    } else {
      push({
        variant: result.succeeded.length ? "success" : "error",
        title: `${result.succeeded.length} ${verb}, ${result.failed.length} failed.`,
        description: result.failed[0].error,
      });
    }
  }

  async function confirmBulkDelete() {
    try {
      const result = await bulkDeleteTasks.mutateAsync([...selection.selectedIds]);
      reportBulkResult(result, "deleted");
      selection.clear();
      setBulkDeleteOpen(false);
    } catch (err) {
      push({ variant: "error", title: "Could not delete tasks", description: extractApiError(err).message });
    }
  }

  async function performBulkMove(stageId: string, followUp?: FollowUpChoice) {
    // Follow-up stages need a date (and optionally an owner) first — ask, then move.
    if (!followUp && bulkMoveBoard?.stages.find((s: any) => s.id === stageId)?.isFollowUpStage) {
      setFollowUpPrompt({ scope: "bulk", stageId });
      return;
    }
    try {
      const result = await bulkMoveTasks.mutateAsync({ taskIds: [...selection.selectedIds], stageId, ...followUp });
      reportBulkResult(result, "moved");
      selection.clear();
      setBulkMoveOpen(false);
      setFollowUpPrompt(null);
    } catch (err) {
      push({ variant: "error", title: "Could not move tasks", description: extractApiError(err).message });
    }
  }
  const [boardPickerOpen, setBoardPickerOpen] = useState(() => searchParams.get("newTask") === "1");
  const [newTaskBoardId, setNewTaskBoardId] = useState<string | null>(null);
  const { data: myBoards } = useBoards({ scope: "MY" });
  const { data: newTaskBoard } = useBoardDetail(newTaskBoardId ?? undefined);
  const { data: personalBoard } = usePersonalTasksBoard(boardPickerOpen);

  useEffect(() => {
    if (searchParams.get("newTask")) {
      const next = new URLSearchParams(searchParams);
      next.delete("newTask");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openTaskId = searchParams.get("task");
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

  const canCreateTask = can(user, "CREATE_TASK");
  // This page only ever lists tasks the viewer is assigned to, so
  // assertCanDeleteTask's board-Owner path can't be evaluated here (tasks
  // span many boards, each with its own membership) — only Admin or an
  // org-wide DELETE_TASK:ALL grant (e.g. Management) qualifies for bulk
  // delete from this view. See the matching comment in TaskDetailDrawer.tsx.
  const canDeleteTasks = isAdmin(user) || can(user, "DELETE_TASK", "ALL");
  // moveTask is gated by assertCanEditTask, which every task listed here
  // already satisfies via isAssignee (this page only shows the viewer's own
  // assigned tasks) — so this is unconditionally true, not permission-gated.
  const canMoveTasks = true;
  const canExport = can(user, "EXPORT");
  const totalCount = useMemo(() => (groups ? Object.values(groups).reduce((sum: number, arr: any) => sum + arr.length, 0) : 0), [groups]);

  async function performMove(stageId: string, followUp?: FollowUpChoice) {
    if (!moveItem) return;
    if (!followUp && moveBoard?.stages.find((s: any) => s.id === stageId)?.isFollowUpStage) {
      setFollowUpPrompt({ scope: "single", stageId });
      return;
    }
    try {
      await moveTask.mutateAsync({ taskId: moveItem.id, stageId, ...followUp });
      setMoveItem(null);
      setFollowUpPrompt(null);
    } catch (err) {
      push({ variant: "error", title: "Could not move task", description: extractApiError(err).message });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !groups) {
    return <ErrorState message="Could not load your tasks." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">My Tasks</h1>
          <p className="text-sm text-slate-500">Every task assigned to you, across all projects ({totalCount} open).</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5">
            <button onClick={() => setView("list")} className={clsx("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", view === "list" ? "bg-brand-600 text-white" : "text-slate-500")}>
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button onClick={() => setView("kanban")} className={clsx("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", view === "kanban" ? "bg-brand-600 text-white" : "text-slate-500")}>
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
          </div>
          {canCreateTask && (
            <Button onClick={() => setBoardPickerOpen(true)}>
              <Plus className="h-4 w-4" /> New Task
            </Button>
          )}
        </div>
      </div>

      {totalCount === 0 && <EmptyState icon={<List className="h-8 w-8" />} title="No tasks assigned to you." description="When you're assigned a task on any board, it will show up here." />}

      {totalCount > 0 && view === "list" && (
        <BulkActionBar count={selection.count} onClear={selection.clear}>
          {canDeleteTasks && (
            <Button variant="danger" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              Delete selected
            </Button>
          )}
          {canMoveTasks && (
            <Button variant="outline" size="sm" disabled={!selectedBoardId} title={!selectedBoardId ? "Select tasks from a single project to move them together." : undefined} onClick={() => setBulkMoveOpen(true)}>
              Move to stage
            </Button>
          )}
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadExport("/exports/tasks", { ids: [...selection.selectedIds].join(",") }, `tasks-export-${Date.now()}.xlsx`).catch((err) =>
                  push({ variant: "error", title: "Export failed", description: extractApiError(err).message })
                )
              }
            >
              Export selected
            </Button>
          )}
        </BulkActionBar>
      )}

      {totalCount > 0 && view === "list" && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Checkbox checked={selection.isAllSelected} onChange={selection.toggleAll} aria-label="Select all tasks" />
            Select all ({allItems.length})
          </div>
          {GROUP_ORDER.map(({ key, label, hint }) => {
            const items: MyTaskItem[] = groups[key] ?? [];
            if (items.length === 0) return null;
            return (
              <div key={key}>
                <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  {label} <Badge tone={key === "OVERDUE" ? "red" : "slate"}>{items.length}</Badge>
                </p>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {items.map((item, idx) => (
                    <div key={item.id} className={clsx("flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap", idx !== 0 && "border-t border-slate-100")}>
                      <Checkbox checked={selection.isSelected(item.id)} onChange={() => selection.toggle(item.id)} aria-label={`Select ${item.taskId}`} />
                      <button onClick={() => openTask(item.id)} className="min-w-0 flex-1 text-left">
                        <span className="mr-1.5 text-xs text-slate-400">{item.taskId}</span>
                        <span className="text-sm font-medium text-slate-800 hover:text-brand-700">{item.title}</span>
                        {item.isPrimary && <Badge tone="indigo" className="ml-1.5">Primary</Badge>}
                      </button>
                      <Badge tone="slate">{item.boardName}</Badge>
                      <button onClick={() => setMoveItem(item)} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-200">
                        {item.stageName}
                      </button>
                      <PriorityBadge priority={item.priority} />
                      <ChecklistProgress done={item.checklistProgress.done} total={item.checklistProgress.total} />
                      <DueDateBadge dueDate={item.dueDate} status={item.dueDateStatus} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalCount > 0 && view === "kanban" && (
        // Self-contained viewport bound, same technique as the Estimation/
        // Enquiry List Kanban board — 260px covers Header + page title +
        // view toggle above this row (shorter than a project board's own
        // toolbar), so it only clips in once columns would truly overflow.
        <div className="flex max-h-[calc(100vh-260px)] gap-4 overflow-x-auto pb-4">
          {GROUP_ORDER.map(({ key, label, hint }) => {
            const items: MyTaskItem[] = groups[key] ?? [];
            return (
              <div key={key} className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100/70">
                <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  <span className="text-xs text-slate-400">{items.length}</span>
                </div>
                <div className="flex min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto p-3">
                  {items.map((item) => (
                    <button key={item.id} onClick={() => openTask(item.id)} className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm hover:shadow-md">
                      <p className="text-[11px] font-medium text-slate-400">{item.taskId}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm font-medium text-slate-900">{item.title}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <PriorityBadge priority={item.priority} />
                        <DueDateBadge dueDate={item.dueDate} status={item.dueDateStatus} />
                      </div>
                    </button>
                  ))}
                  {items.length === 0 && <p className="py-6 text-center text-xs text-slate-400">{hint}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MoveToStageSheet
        open={!!moveItem}
        onClose={() => setMoveItem(null)}
        task={moveItem as MovableTask | null}
        stages={[...(moveBoard?.stages ?? [])].sort((a: any, b: any) => a.position - b.position)}
        onSelect={(stageId) => performMove(stageId)}
      />

      <BulkMoveToStageSheet
        open={bulkMoveOpen}
        onClose={() => setBulkMoveOpen(false)}
        count={selection.count}
        stages={[...(bulkMoveBoard?.stages ?? [])].sort((a: any, b: any) => a.position - b.position)}
        onSelect={(stageId) => performBulkMove(stageId)}
      />

      <FollowUpMoveDialog
        open={!!followUpPrompt}
        stageName={
          ((followUpPrompt?.scope === "bulk" ? bulkMoveBoard : moveBoard)?.stages.find((s: any) => s.id === followUpPrompt?.stageId)?.name as string | undefined) ??
          "follow-up stage"
        }
        count={followUpPrompt?.scope === "bulk" ? selection.count : 1}
        loading={moveTask.isPending || bulkMoveTasks.isPending}
        onCancel={() => setFollowUpPrompt(null)}
        onConfirm={(choice) => {
          if (!followUpPrompt) return;
          if (followUpPrompt.scope === "bulk") performBulkMove(followUpPrompt.stageId, choice);
          else performMove(followUpPrompt.stageId, choice);
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="Delete tasks"
        message={`Are you sure you want to delete ${selection.count} task${selection.count === 1 ? "" : "s"}? This cannot be undone.`}
        confirmLabel="Delete tasks"
        loading={bulkDeleteTasks.isPending}
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
      />

      <Modal open={boardPickerOpen} onClose={() => setBoardPickerOpen(false)} title="Create task on which project?">
        <div className="max-h-64 space-y-1 overflow-y-auto">
          <button
            onClick={() => {
              if (!personalBoard) return;
              setNewTaskBoardId(personalBoard.id);
              setBoardPickerOpen(false);
            }}
            disabled={!personalBoard}
            className="mb-1 flex w-full items-center justify-between rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60"
          >
            No project — personal task
            <span className="text-xs font-normal text-slate-400">Just for you</span>
          </button>
          {(() => {
            const otherBoards = myBoards?.filter((b) => b.id !== personalBoard?.id) ?? [];
            return otherBoards.length > 0 ? (
              otherBoards.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setNewTaskBoardId(b.id);
                    setBoardPickerOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  {b.name}
                  <span className="text-xs text-slate-400">{b.stageCount} stages</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-1 text-sm text-slate-400">You aren't a member of any other projects yet.</p>
            );
          })()}
        </div>
      </Modal>

      {newTaskBoard && (
        <NewTaskDrawer open={!!newTaskBoardId} onClose={() => setNewTaskBoardId(null)} board={newTaskBoard} initialStageId={newTaskBoard.stages?.[0]?.id} />
      )}

      <TaskDetailDrawer taskId={openTaskId} onClose={closeTask} onDeleted={closeTask} />
    </div>
  );
}
