import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { useBoards, useArchiveBoard, useDuplicateBoard, useDeleteBoard, useServices } from "../../api/boards";
import { Button, Input, Select, Skeleton, EmptyState, ErrorState } from "../../components/ui/primitives";
import { BoardCard } from "../../components/boards/BoardCard";
import { NewBoardDrawer } from "../../components/boards/NewBoardDrawer";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { can, isAdmin } from "../../lib/permissions";
import { LayoutGrid } from "lucide-react";
import { extractApiError } from "../../lib/apiClient";
import { Board } from "../../lib/types";

/** The projects filed under one service (e.g. MEP) — same board grid, search,
 * filters and New Project flow as the old flat Projects list, just scoped. */
export default function ServiceProjectsPage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const { data: services } = useServices();
  const service = services?.find((s) => s.id === serviceId);

  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [scope, setScope] = useState(() => (searchParams.get("search") || can(user, "VIEW_WORKFLOW", "ALL") ? "ALL" : "MY"));
  const [newBoardOpen, setNewBoardOpen] = useState(() => searchParams.get("newBoard") === "1");
  const [pendingDelete, setPendingDelete] = useState<Board | null>(null);

  useEffect(() => {
    if (searchParams.get("search") || searchParams.get("newBoard")) {
      const next = new URLSearchParams(searchParams);
      next.delete("newBoard");
      next.delete("search");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: boards, isLoading, isError, refetch } = useBoards({ search, scope, serviceId });
  const archiveBoard = useArchiveBoard();
  const duplicateBoard = useDuplicateBoard();
  const deleteBoard = useDeleteBoard();

  const canCreate = can(user, "CREATE_BOARD");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => navigate("/workflow/boards")}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Back to services"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-900">{service?.name ?? "Projects"}</h1>
            <p className="text-sm text-slate-500">
              {can(user, "VIEW_WORKFLOW", "ALL") ? "Every project under this service." : "Every project you're a member of, under this service."}
            </p>
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => setNewBoardOpen(true)}>
            <Plus className="h-4 w-4" /> New Project
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search projects, descriptions, linked records…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={scope} onChange={(e) => setScope(e.target.value)} className="sm:w-52">
          <option value="MY">My Projects</option>
          <option value="ALL">All Projects</option>
          <option value="LINKED">Linked Projects</option>
          <option value="ARCHIVED">Archived Projects</option>
        </Select>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}

      {isError && <ErrorState message="Could not load projects." onRetry={() => refetch()} />}

      {boards && boards.length === 0 && (
        <EmptyState
          icon={<LayoutGrid className="h-8 w-8" />}
          title="No projects found."
          description={scope === "MY" ? "You are not a member of any projects under this service yet." : "Try a different search or filter."}
          action={canCreate ? <Button onClick={() => setNewBoardOpen(true)}>Create your first project</Button> : undefined}
        />
      )}

      {boards && boards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              canManage={board.members.find((m) => m.userId === user?.id)?.role === "OWNER" || isAdmin(user) || false}
              onEdit={() => navigate(`/workflow/boards/${board.id}?settings=general`)}
              onManageMembers={() => navigate(`/workflow/boards/${board.id}?settings=members`)}
              onDuplicate={async () => {
                try {
                  await duplicateBoard.mutateAsync(board.id);
                  push({ variant: "success", title: "Project duplicated." });
                } catch (err) {
                  push({ variant: "error", title: "Could not duplicate project", description: extractApiError(err).message });
                }
              }}
              onArchive={async () => {
                try {
                  await archiveBoard.mutateAsync({ boardId: board.id, archived: !board.isArchived });
                  push({ variant: "success", title: board.isArchived ? "Project unarchived." : "Project archived." });
                } catch (err) {
                  push({ variant: "error", title: "Could not update project", description: extractApiError(err).message });
                }
              }}
              onDelete={() => setPendingDelete(board)}
            />
          ))}
        </div>
      )}

      <NewBoardDrawer open={newBoardOpen} onClose={() => setNewBoardOpen(false)} serviceId={serviceId} />

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
    </div>
  );
}
