import React, { useState } from "react";
import { X } from "lucide-react";
import { Input, Avatar, Badge } from "../ui/primitives";
import { useEmployeeDirectory } from "../../api/misc";

interface Person {
  userId: string;
  name: string;
}

interface Props {
  selected: Person[];
  onChange: (people: Person[]) => void;
  placeholder?: string;
  primaryUserId?: string;
  disabled?: boolean;
  excludeUserIds?: string[];
}

/**
 * Reusable multi-select employee picker used for Assignees and Watchers
 * (Sections 14/17/24). Only active employees with Workflow access are
 * returned by /users/employees (enforced server-side), matching Section 15's
 * "only active employees with Workflow access can be assigned" rule.
 */
export const PeoplePicker: React.FC<Props> = ({ selected, onChange, placeholder, primaryUserId, disabled, excludeUserIds = [] }) => {
  const [query, setQuery] = useState("");
  const { data: employees } = useEmployeeDirectory(query);

  return (
    <div>
      {!disabled && (
        <Input placeholder={placeholder ?? "Search people…"} value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      {query && employees && employees.length > 0 && (
        <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-200">
          {employees
            .filter((e) => !selected.some((s) => s.userId === e.userId) && !excludeUserIds.includes(e.userId))
            .map((e) => (
              <button
                key={e.userId}
                type="button"
                onClick={() => {
                  onChange([...selected, { userId: e.userId, name: e.name }]);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span>{e.name}</span>
                <span className="text-xs text-slate-400">{e.department}</span>
              </button>
            ))}
        </div>
      )}
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span key={p.userId} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 text-xs">
              <Avatar name={p.name} size="xs" />
              {p.name}
              {primaryUserId === p.userId && <Badge tone="indigo">Primary</Badge>}
              {!disabled && (
                <button onClick={() => onChange(selected.filter((s) => s.userId !== p.userId))} className="text-slate-400 hover:text-red-500" aria-label={`Remove ${p.name}`}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
