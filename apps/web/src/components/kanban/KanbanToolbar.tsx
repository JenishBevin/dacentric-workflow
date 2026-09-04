import React, { useState } from "react";
import { Search, SlidersHorizontal, Download, Users, Settings as SettingsIcon, Plus } from "lucide-react";
import { Input, Select, Button, AvatarGroup } from "../ui/primitives";
import { Board, EmployeeDirectoryEntry } from "../../lib/types";

interface Filters {
  search: string;
  assigneeUserId?: string;
  priority?: string;
  sortBy?: string;
  groupBy?: string;
}

interface Props {
  board: Board;
  employees: EmployeeDirectoryEntry[];
  filters: Filters;
  onChange: (f: Filters) => void;
  onExport: () => void;
  onOpenMembers: () => void;
  onOpenSettings: () => void;
  onAddStage: () => void;
  canManage: boolean;
  canExport: boolean;
}

export const KanbanToolbar: React.FC<Props> = ({ board, employees, filters, onChange, onExport, onOpenMembers, onOpenSettings, onAddStage, canManage, canExport }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="sticky top-14 z-10 -mx-4 mb-3 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-3 sm:py-2 sm:shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search this board…"
            className="pl-8"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setExpanded((e) => !e)} className="sm:hidden">
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </Button>

        <div className="hidden items-center gap-2 sm:flex">
          <FilterControls filters={filters} onChange={onChange} employees={employees} />
        </div>

        <button onClick={onOpenMembers} className="ml-1 hidden sm:block" aria-label="Board members">
          <AvatarGroup names={board.members.map((m) => m.name)} max={4} />
        </button>

        {canManage && (
          <Button variant="outline" size="sm" onClick={onAddStage} className="hidden sm:inline-flex">
            <Plus className="h-3.5 w-3.5" /> Add Stage
          </Button>
        )}
        {canExport && (
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        )}
        {canManage && (
          <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-label="Board settings">
            <SettingsIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2 sm:hidden">
          <FilterControls filters={filters} onChange={onChange} employees={employees} />
          <button onClick={onOpenMembers} className="flex items-center gap-2 text-sm text-slate-500">
            <Users className="h-4 w-4" /> {board.members.length} members
          </button>
        </div>
      )}
    </div>
  );
};

const FilterControls: React.FC<{ filters: Filters; onChange: (f: Filters) => void; employees?: EmployeeDirectoryEntry[] }> = ({ filters, onChange, employees }) => (
  <>
    {employees && employees.length > 0 && (
      <Select value={filters.assigneeUserId ?? ""} onChange={(e) => onChange({ ...filters, assigneeUserId: e.target.value || undefined })} className="!w-36">
        <option value="">All assignees</option>
        {employees.map((e) => (
          <option key={e.userId} value={e.userId}>
            {e.name}
          </option>
        ))}
      </Select>
    )}
    <Select value={filters.priority ?? ""} onChange={(e) => onChange({ ...filters, priority: e.target.value || undefined })} className="!w-32">
      <option value="">All priorities</option>
      <option value="LOW">Low</option>
      <option value="MEDIUM">Medium</option>
      <option value="HIGH">High</option>
      <option value="URGENT">Urgent</option>
    </Select>
    <Select value={filters.sortBy ?? ""} onChange={(e) => onChange({ ...filters, sortBy: e.target.value || undefined })} className="!w-40">
      <option value="">Sort: Default</option>
      <option value="dueDate">Sort: Due date</option>
      <option value="priority">Sort: Priority</option>
      <option value="title">Sort: Title</option>
    </Select>
    <Select value={filters.groupBy ?? "none"} onChange={(e) => onChange({ ...filters, groupBy: e.target.value })} className="!w-40">
      <option value="none">Group: None</option>
      <option value="assignee">Group: Assignee</option>
      <option value="priority">Group: Priority</option>
    </Select>
  </>
);
