import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, LayoutGrid, List as ListIcon, Trello, Settings as SettingsIcon } from "lucide-react";
import clsx from "clsx";
import { useBoards, useArchiveBoard, useDuplicateBoard, useDeleteBoard, useServices, useBulkDeleteBoards, useBulkArchiveBoards, useProjectStages, useSetProjectStage, useReorderProjectStages } from "../../api/boards";
import { downloadExport } from "../../api/misc";
import { Button, Input, Select, Checkbox, Skeleton, EmptyState, ErrorState } from "../../components/ui/primitives";
import { NewBoardDrawer } from "../../components/boards/NewBoardDrawer";
import { ProjectsListView, ProjectActions } from "../../components/boards/ProjectsListView";
import { ProjectsKanbanView, ProjectStageMenuAction } from "../../components/boards/ProjectsKanbanView";
import { ProjectStagesDrawer } from "../../components/boards/ProjectStagesDrawer";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { BulkActionBar } from "../../components/ui/BulkActionBar";
import { useSelection } from "../../hooks/useSelection";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { can, isAdmin, isSuperAdmin } from "../../lib/permissions";
import { extractApiError } from "../../lib/apiClient";
import { Board, ProjectStage } from "../../lib/types";

type ViewMode = "list" | "kanban";
type StatusFilter = "ALL" | "OVERDUE" | "OPEN" | "NO_OPEN";
type SortKey = "UPDATED" | "NAME" | "OPEN" | "OVERDUE";

const VIEW_STORAGE_KEY = "projects-view";

function readStoredView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "kanban" ? "kanban" : "list";
  } catch {
    return "list";
  }
}

/**
 * Projects: every project on one page — filter by service (dropdown), scope, status and
 * search, and switch between a list and a service-grouped kanban. Opening a project shows
 * its tasks as before. Awarded enquiries still land here via ?newBoard=1&serviceId=…&name=….
 */
export default function BoardsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: services } = useServices();

  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [serviceFilter, setServiceFilter] = useState(() => searchParams.get("service") ?? "");
  const [scope, setScope] = useState(() => (searchParams.get("search") || can(user, "VIEW_WORKFLOW", "ALL") ? "ALL" : "MY"));
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("UPDATED");
  const [view, setView] = useState<ViewMode>(readStoredView);
  const [newBoardOpen, setNewBoardOpen] = useState(() => searchParams.get("newBoard") === "1");
  const [pendingDelete, setPendingDelete] = useState<Board | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const prefillServiceId = searchParams.get("serviceId") ?? undefined;
  const prefillName = searchParams.get("name") ?? undefined;

  useEffect(() => {
    const transient = ["search", "service", "newBoard", "serviceId", "name"];
    if (transient.some((k) => searchParams.get(k))) {
      const next = new URLSearchParams(searchParams);
      transient.forEach((k) => next.delete(k));
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeView(next: ViewMode) {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* private mode etc. — the toggle still works for this visit */
    }
  }

  const { data: boards, isLoading, isError, refetch } = useBoards({ search, scope, serviceId: serviceFilter || undefined, projectsOnly: true });
  const archiveBoard = useArchiveBoard();
  const duplicateBoard = useDuplicateBoard();
  const deleteBoard = useDeleteBoard();
  const bulkDeleteBoards = useBulkDeleteBoards();
  const bulkArchiveBoards = useBulkArchiveBoards();
  const { data: projectStages } = useProjectStages();
  const setProjectStage = useSetProjectStage();
  const reorderProjectStages = useReorderProjectStages();
  const [stagesDrawerOpen, setStagesDrawerOpen] = useState(false);
  const [wipConfirm, setWipConfirm] = useState<{ boardId: string; stageId: string; message: string } | null>(null);
  const stages: ProjectStage[] = useMemo(() => [...(projectStages ?? [])].sort((a, b) => a.position - b.position), [projectStages]);
  // Company-wide columns: an admin edits them; adding a stage is Super Admin only (same as project boards).
  const canManageStages = isAdmin(user);
  const canAddStage = isSuperAdmin(user);

  async function moveProjectToStage(boardId: string, stageId: string, confirmWipOverride = false) {
    try {
      await setProjectStage.mutateAsync({ boardId, stageId, confirmWipOverride });
      setWipConfirm(null);
    } catch (err) {
      const apiErr = extractApiError(err);
      if (apiErr.code === "CONFLICT" && /WIP limit/i.test(apiErr.message)) {
        setWipConfirm({ boardId, stageId, message: apiErr.message });
      } else {
        push({ variant: "error", title: "Could not move project", description: apiErr.message });
      }
    }
  }

  async function handleStageMenuAction(stage: ProjectStage, action: ProjectStageMenuAction) {
    if (action === "moveLeft" || action === "moveRight") {
      const ids = stages.map((s) => s.id);
      const idx = ids.indexOf(stage.id);
      const swapWith = action === "moveLeft" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= ids.length) return;
      [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
      try {
        await reorderProjectStages.mutateAsync(ids);
      } catch (err) {
        push({ variant: "error", title: "Could not reorder stages", description: extractApiError(err).message });
      }
      return;
    }
    // Rename / WIP / colour / delete all live in the stage editor, as they do in a project's Settings → Stages.
    setStagesDrawerOpen(true);
  }

  const canCreate = can(user, "CREATE_BOARD");
  const canExport = can(user, "EXPORT");

  const visible = useMemo(() => {
    let rows = boards ?? [];
    if (status === "OVERDUE") rows = rows.filter((b) => b.overdueTaskCount > 0);
    if (status === "OPEN") rows = rows.filter((b) => b.openTaskCount > 0);
    if (status === "NO_OPEN") rows = rows.filter((b) => b.openTaskCount === 0);
    const sorted = [...rows];
    if (sort === "NAME") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "OPEN") sorted.sort((a, b) => b.openTaskCount - a.openTaskCount);
    else if (sort === "OVERDUE") sorted.sort((a, b) => b.overdueTaskCount - a.overdueTaskCount);
    else sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return sorted;
  }, [boards, status, sort]);

  const selection = useSelection(visible.map((b) => b.id));

  function reportBulkResult(result: { succeeded: string[]; failed: { id: string; error: string }[] }, verb: string) {
    if (result.failed.length === 0) {
      push({ variant: "success", title: `${result.succeeded.length} project${result.succeeded.length === 1 ? "" : "s"} ${verb}.` });
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
      const result = await bulkDeleteBoards.mutateAsync({ boardIds: [...selection.selectedIds], confirmCascade: true });
      reportBulkResult(result, "deleted");
      selection.clear();
      setBulkDeleteOpen(false);
    } catch (err) {
      push({ variant: "error", title: "Could not delete projects", description: extractApiError(err).message });
    }
  }

  async function handleBulkArchive(archived: boolean) {
    try {
      const result = await bulkArchiveBoards.mutateAsync({ boardIds: [...selection.selectedIds], archived });
      reportBulkResult(result, archived ? "archived" : "unarchived");
      selection.clear();
    } catch (err) {
      push({ variant: "error", title: "Could not update projects", description: extractApiError(err).message });
    }
  }

  const actions: ProjectActions = {
    canManage: (b) => b.members.find((m) => m.userId === user?.id)?.role === "OWNER" || isAdmin(user) || false,
    onEdit: (b) => navigate(`/workflow/boards/${b.id}?settings=general`),
    onManageMembers: (b) => navigate(`/workflow/boards/${b.id}?settings=members`),
    onDuplicate: async (b) => {
      try {
        await duplicateBoard.mutateAsync(b.id);
        push({ variant: "success", title: "Project duplicated." });
      } catch (err) {
        push({ variant: "error", title: "Could not duplicate project", description: extractApiError(err).message });
      }
    },
    onArchive: async (b) => {
      try {
        await archiveBoard.mutateAsync({ boardId: b.id, archived: !b.isArchived });
        push({ variant: "success", title: b.isArchived ? "Project unarchived." : "Project archived." });
      } catch (err) {
        push({ variant: "error", title: "Could not update project", description: extractApiError(err).message });
      }
    },
    canMove: (b) => isAdmin(user) || ["OWNER", "EDITOR"].includes(b.members.find((m) => m.userId === user?.id)?.role ?? ""),
    onStageChange: (b, stageId) => moveProjectToStage(b.id, stageId),
    onDelete: (b) => setPendingDelete(b),
    isSelected: selection.isSelected,
    onToggleSelect: selection.toggle,
    isAllSelected: selection.isAllSelected,
    onToggleAll: selection.toggleAll,
  };

  const filtersActive = !!serviceFilter || status !== "ALL" || !!search;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Projects</h1>
          <p className="text-sm text-slate-500">
            {can(user, "VIEW_WORKFLOW", "ALL") ? "Every project, across all services." : "Every project you're a member of, across all services."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white" role="group" aria-label="Projects view">
            {(
              [
                { key: "list", label: "List", icon: ListIcon },
                { key: "kanban", label: "Kanban", icon: Trello },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => changeView(key)}
                aria-pressed={view === key}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium",
                  view === key ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          {view === "kanban" && canAddStage && (
            <Button variant="outline" onClick={() => setStagesDrawerOpen(true)}>
              <Plus className="h-4 w-4" /> Add Stage
            </Button>
          )}
          {view === "kanban" && canManageStages && (
            <Button variant="ghost" onClick={() => setStagesDrawerOpen(true)} aria-label="Project stages">
              <SettingsIcon className="h-4 w-4" />
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setNewBoardOpen(true)}>
              <Plus className="h-4 w-4" /> New Project
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search projects, descriptions, linked records…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:flex">
          <Select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="lg:w-48" aria-label="Service">
            <option value="">All services</option>
            {services?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.projectCount})
              </option>
            ))}
          </Select>
          <Select value={scope} onChange={(e) => setScope(e.target.value)} className="lg:w-44" aria-label="Scope">
            <option value="MY">My Projects</option>
            <option value="ALL">All Projects</option>
            <option value="LINKED">Linked Projects</option>
            <option value="ARCHIVED">Archived Projects</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="lg:w-44" aria-label="Status">
            <option value="ALL">Any status</option>
            <option value="OVERDUE">Has overdue tasks</option>
            <option value="OPEN">Has open tasks</option>
            <option value="NO_OPEN">No open tasks</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="lg:w-44" aria-label="Sort">
            <option value="UPDATED">Recently updated</option>
            <option value="NAME">Name (A–Z)</option>
            <option value="OPEN">Most open tasks</option>
            <option value="OVERDUE">Most overdue tasks</option>
          </Select>
        </div>
      </div>

      {visible.length > 0 && view === "kanban" && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Checkbox checked={selection.isAllSelected} onChange={selection.toggleAll} aria-label="Select all projects" />
          Select all ({visible.length})
        </div>
      )}

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <Button variant="danger" size="sm" onClick={() => setBulkDeleteOpen(true)}>
          Delete selected
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleBulkArchive(scope !== "ARCHIVED")}>
          {scope === "ARCHIVED" ? "Unarchive selected" : "Archive selected"}
        </Button>
        {canExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadExport("/exports/boards", { ids: [...selection.selectedIds].join(",") }, `projects-export-${Date.now()}.xlsx`).catch((err) =>
                push({ variant: "error", title: "Export failed", description: extractApiError(err).message })
              )
            }
          >
            Export selected
          </Button>
        )}
      </BulkActionBar>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      )}

      {isError && <ErrorState message="Could not load projects." onRetry={() => refetch()} />}

      {!isLoading && !isError && visible.length === 0 && view === "list" && (
        <EmptyState
          icon={<LayoutGrid className="h-8 w-8" />}
          title="No projects found."
          description={
            filtersActive ? "Try clearing the search or filters." : scope === "MY" ? "You are not a member of any projects yet." : "Nothing here yet."
          }
          action={canCreate ? <Button onClick={() => setNewBoardOpen(true)}>Create your first project</Button> : undefined}
        />
      )}

      {visible.length > 0 && view === "list" && <ProjectsListView boards={visible} stages={stages} actions={actions} />}
      {/* Rendered even with zero projects so the stage columns can still be configured. */}
      {view === "kanban" && !isLoading && !isError && stages.length > 0 && (
        <ProjectsKanbanView boards={visible} stages={stages} actions={actions} canManageStages={canManageStages} onStageMenuAction={handleStageMenuAction} />
      )}

      <ProjectStagesDrawer open={stagesDrawerOpen} onClose={() => setStagesDrawerOpen(false)} stages={stages} canAddStage={canAddStage} />

      <ConfirmDialog
        open={!!wipConfirm}
        title="WIP limit reached"
        message={wipConfirm?.message}
        confirmLabel="Move anyway"
        destructive={false}
        loading={setProjectStage.isPending}
        onCancel={() => setWipConfirm(null)}
        onConfirm={() => wipConfirm && moveProjectToStage(wipConfirm.boardId, wipConfirm.stageId, true)}
      />

      <NewBoardDrawer
        open={newBoardOpen}
        onClose={() => setNewBoardOpen(false)}
        initialServiceId={prefillServiceId ?? (serviceFilter || undefined)}
        initialName={prefillName}
        onCreated={(board) => navigate(`/workflow/boards/${board.id}`)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete project"
        message={
          <>
            Are you sure you want to delete the project <strong>&ldquo;{pendingDelete?.name}&rdquo;</strong>?
            {pendingDelete && pendingDelete.openTaskCount > 0 && (
              <span className="mt-2 block text-amber-700">
                This project has {pendingDelete.openTaskCount} open task(s). Confirming will delete the project and all of its tasks.
              </span>
            )}
            <span className="mt-2 block">This cannot be undone.</span>
          </>
        }
        confirmLabel="Delete project"
        loading={deleteBoard.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteBoard.mutateAsync({ boardId: pendingDelete.id, confirmCascade: true });
            push({ variant: "success", title: "Project deleted." });
            setPendingDelete(null);
          } catch (err) {
            push({ variant: "error", title: "Could not delete project", description: extractApiError(err).message });
          }
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="Delete projects"
        message={`Are you sure you want to delete ${selection.count} project${selection.count === 1 ? "" : "s"}? This cannot be undone.`}
        confirmLabel="Delete projects"
        loading={bulkDeleteBoards.isPending}
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
      />
    </div>
  );
}
