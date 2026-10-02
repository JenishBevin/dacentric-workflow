import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MoreVertical, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Badge, AvatarGroup, Checkbox } from "../ui/primitives";
import { Board, ProjectStage } from "../../lib/types";

export interface ProjectActions {
  canManage: (board: Board) => boolean;
  /** Board Owner/Editor (or admin) — may move the project between stages. */
  canMove: (board: Board) => boolean;
  onStageChange: (board: Board, stageId: string) => void;
  onEdit: (board: Board) => void;
  onDuplicate: (board: Board) => void;
  onArchive: (board: Board) => void;
  onManageMembers: (board: Board) => void;
  onDelete: (board: Board) => void;
  isSelected: (id: string) => boolean;
  onToggleSelect: (id: string) => void;
  isAllSelected: boolean;
  onToggleAll: () => void;
}

const RowMenu: React.FC<{ board: Board; actions: ProjectActions }> = ({ board, actions }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const item = (label: string, run: () => void, destructive?: boolean) => (
    <button
      onClick={() => {
        setOpen(false);
        run();
      }}
      className={`block w-full px-3 py-1.5 text-left hover:bg-slate-50 ${destructive ? "text-red-600" : "text-slate-700"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="relative inline-block" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Project menu">
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 text-left text-sm shadow-lg">
          {item("Edit Project", () => actions.onEdit(board))}
          {item("Duplicate Project", () => actions.onDuplicate(board))}
          {item(board.isArchived ? "Unarchive Project" : "Archive Project", () => actions.onArchive(board))}
          {item("Manage Members", () => actions.onManageMembers(board))}
          {item("Delete Project", () => actions.onDelete(board), true)}
        </div>
      )}
    </div>
  );
};

/** All projects as one table — each row opens the project (its tasks, in list or kanban view). */
export const ProjectsListView: React.FC<{ boards: Board[]; stages: ProjectStage[]; actions: ProjectActions }> = ({ boards, stages, actions }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
    <table className="w-full text-sm">
      <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
        <tr>
          <th className="w-10 px-3 py-2.5">
            <Checkbox checked={actions.isAllSelected} onChange={actions.onToggleAll} aria-label="Select all projects" />
          </th>
          <th className="px-3 py-2.5">Project</th>
          <th className="px-3 py-2.5">Stage</th>
          <th className="px-3 py-2.5">Service</th>
          <th className="hidden px-3 py-2.5 md:table-cell">Customer</th>
          <th className="px-3 py-2.5">Open</th>
          <th className="px-3 py-2.5">Overdue</th>
          <th className="hidden px-3 py-2.5 lg:table-cell">Assignee</th>
          <th className="hidden px-3 py-2.5 lg:table-cell">Updated</th>
          <th className="w-10 px-3 py-2.5" />
        </tr>
      </thead>
      <tbody>
        {boards.map((b) => (
          <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
            <td className="px-3 py-2.5">
              <Checkbox checked={actions.isSelected(b.id)} onChange={() => actions.onToggleSelect(b.id)} aria-label={`Select ${b.name}`} />
            </td>
            <td className="max-w-[22rem] px-3 py-2.5">
              <Link to={`/workflow/boards/${b.id}`} className="block">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-900 hover:text-brand-700">{b.name}</span>
                  {b.isHighlighted && <span className="shrink-0 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">New</span>}
                  {b.isArchived && <Badge tone="slate">Archived</Badge>}
                </span>
                <span className="text-[11px] font-medium text-slate-400">{b.boardId}</span>
              </Link>
            </td>
            <td className="px-3 py-2.5">
              {actions.canMove(b) ? (
                <select
                  value={b.projectStageId ?? ""}
                  onChange={(e) => actions.onStageChange(b, e.target.value)}
                  aria-label={`Stage of ${b.name}`}
                  className="rounded-md border border-slate-200 bg-white py-1 pl-2 pr-6 text-xs text-slate-700"
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge tone="slate">{stages.find((s) => s.id === b.projectStageId)?.name ?? "—"}</Badge>
              )}
            </td>
            <td className="px-3 py-2.5 text-slate-600">{b.service?.name ?? <span className="text-slate-400">—</span>}</td>
            <td className="hidden max-w-[14rem] truncate px-3 py-2.5 text-slate-600 md:table-cell">{b.customer?.name ?? <span className="text-slate-400">—</span>}</td>
            <td className="px-3 py-2.5">{b.openTaskCount}</td>
            <td className="px-3 py-2.5">
              {b.overdueTaskCount > 0 ? (
                <div className="flex flex-col gap-0.5">
                  <Badge tone="red">
                    <AlertCircle className="h-3 w-3" /> {b.overdueTaskCount}
                  </Badge>
                  {b.overdueDueDate && <span className="whitespace-nowrap text-[11px] text-slate-400">Due {format(new Date(b.overdueDueDate), "d MMM yyyy")}</span>}
                </div>
              ) : (
                b.overdueTaskCount
              )}
            </td>
            <td className="hidden px-3 py-2.5 lg:table-cell">
              <AvatarGroup names={b.members.map((m) => m.name)} />
            </td>
            <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-slate-500 lg:table-cell">{format(new Date(b.updatedAt), "d MMM yyyy")}</td>
            <td className="px-3 py-2.5 text-right">{actions.canManage(b) && <RowMenu board={b} actions={actions} />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
