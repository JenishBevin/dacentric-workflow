import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { MoreVertical, Link2, LayoutGrid, AlertCircle } from "lucide-react";
import { Card, Badge, AvatarGroup } from "../ui/primitives";
import { Board } from "../../lib/types";

interface Props {
  board: Board;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onManageMembers: () => void;
  onDelete: () => void;
  canManage: boolean;
}

export const BoardCard: React.FC<Props> = ({ board, onEdit, onDuplicate, onArchive, onManageMembers, onDelete, canManage }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <Card className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/workflow/boards/${board.id}`} className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900 hover:text-brand-700">{board.name}</p>
          {board.description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{board.description}</p>}
        </Link>
        {canManage && (
          <div className="relative shrink-0" ref={ref}>
            <button onClick={() => setMenuOpen((o) => !o)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Board menu">
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
                <MenuItem onClick={() => { setMenuOpen(false); onEdit(); }}>Edit Board</MenuItem>
                <MenuItem onClick={() => { setMenuOpen(false); onDuplicate(); }}>Duplicate Board</MenuItem>
                <MenuItem onClick={() => { setMenuOpen(false); onArchive(); }}>{board.isArchived ? "Unarchive Board" : "Archive Board"}</MenuItem>
                <MenuItem onClick={() => { setMenuOpen(false); onManageMembers(); }}>Manage Members</MenuItem>
                <MenuItem onClick={() => { setMenuOpen(false); onDelete(); }} destructive>
                  Delete Board
                </MenuItem>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone={board.boardType === "LINKED" ? "indigo" : "slate"}>
          {board.boardType === "LINKED" ? (
            <>
              <Link2 className="h-3 w-3" /> Linked
            </>
          ) : (
            "Standalone"
          )}
        </Badge>
        <span className="inline-flex items-center gap-1">
          <LayoutGrid className="h-3 w-3" /> {board.stageCount} stages
        </span>
        <span>{board.openTaskCount} open</span>
        {board.overdueTaskCount > 0 && (
          <Badge tone="red">
            <AlertCircle className="h-3 w-3" /> {board.overdueTaskCount} overdue
          </Badge>
        )}
      </div>

      {board.linkedRecord && <p className="truncate text-xs text-slate-400">Linked to: {board.linkedRecord.name}</p>}

      <div className="mt-auto flex items-center justify-between pt-1">
        <AvatarGroup names={board.members.map((m) => m.name)} />
        <Link to={`/workflow/boards/${board.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">
          Open board →
        </Link>
      </div>
    </Card>
  );
};

const MenuItem: React.FC<{ onClick: () => void; destructive?: boolean; children: React.ReactNode }> = ({ onClick, destructive, children }) => (
  <button onClick={onClick} className={`block w-full px-3 py-1.5 text-left hover:bg-slate-50 ${destructive ? "text-red-600" : "text-slate-700"}`}>
    {children}
  </button>
);
