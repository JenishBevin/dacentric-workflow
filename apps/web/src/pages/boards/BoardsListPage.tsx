import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useBoards, useArchiveBoard, useDuplicateBoard, useDeleteBoard } from "../../api/boards";
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

export default function BoardsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  // Org-wide viewers (CEO/Director, System/Super Admin — anyone with VIEW_WORKFLOW:ALL)
  // default to seeing every board, not just ones they happen to be an explicit member of.
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

  const { data: boards, isLoading, isError, refetch } = useBoards({ search, scope });
  const archiveBoard = useArchiveBoard();
  const duplicateBoard = useDuplicateBoard();
  const deleteBoard = useDeleteBoard();

  const canCreate = can(user, "CREATE_BOARD");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Boards</h1>
          <p className="text-sm text-slate-500">
            {can(user, "VIEW_WORKFLOW", "ALL") ? "Every board across the organization." : "Every board you're a member of, in one place."}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setNewBoardOpen(true)}>
            <Plus className="h-4 w-4" /> New Board
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search boards, descriptions, linked records…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={scope} onChange={(e) => setScope(e.target.value)} className="sm:w-52">
          <option value="MY">My Boards</option>
          <option value="ALL">All Boards</option>
          <option value="LINKED">Linked Boards</option>
          <option value="ARCHIVED">Archived Boards</option>
        </Select>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}

      {isError && <ErrorState message="Could not load boards." onRetry={() => refetch()} />}

      {boards && boards.length === 0 && (
        <EmptyState
          icon={<LayoutGrid className="h-8 w-8" />}
          title="No boards found."
          description={scope === "MY" ? "You are not a member of any boards yet." : "Try a different search or filter."}
          action={canCreate ? <Button onClick={() => setNewBoardOpen(true)}>Create your first board</Button> : undefined}
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
                  push({ variant: "success", title: "Board duplicated." });
                } catch (err) {
                  push({ variant: "error", title: "Could not duplicate board", description: extractApiError(err).message });
                }
              }}
              onArchive={async () => {
                try {
                  await archiveBoard.mutateAsync({ boardId: board.id, archived: !board.isArchived });
                  push({ variant: "success", title: board.isArchived ? "Board unarchived." : "Board archived." });
                } catch (err) {
                  push({ variant: "error", title: "Could not update board", description: extractApiError(err).message });
                }
              }}
              onDelete={() => setPendingDelete(board)}
            />
          ))}
        </div>
      )}

      <NewBoardDrawer open={newBoardOpen} onClose={() => setNewBoardOpen(false)} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete board"
        message={
          <>
            Are you sure you want to delete the board <strong>&ldquo;{pendingDelete?.name}&rdquo;</strong>?
            {pendingDelete && pendingDelete.openTaskCount > 0 && (
              <span className="mt-2 block text-amber-700">
                This board has {pendingDelete.openTaskCount} open task(s). Confirming will delete the board and all of its tasks.
              </span>
            )}
            <span className="mt-2 block">This cannot be undone.</span>
          </>
        }
        confirmLabel="Delete board"
        loading={deleteBoard.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteBoard.mutateAsync({ boardId: pendingDelete.id, confirmCascade: true });
            push({ variant: "success", title: "Board deleted." });
            setPendingDelete(null);
          } catch (err) {
            push({ variant: "error", title: "Could not delete board", description: extractApiError(err).message });
          }
        }}
      />
    </div>
  );
}
