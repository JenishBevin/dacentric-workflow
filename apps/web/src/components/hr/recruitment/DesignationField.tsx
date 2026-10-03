import React, { useState } from "react";
import { X } from "lucide-react";
import { Input, Select } from "../../ui/primitives";

const NEW_OPTION = "__new__";

/**
 * Designation picker: choose an existing designation, or "+ New designation…"
 * to type one. A new designation becomes available everywhere (CV bank,
 * filters, other forms) as soon as a candidate is saved with it.
 */
export function DesignationField({
  value,
  onChange,
  designations,
  error,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  designations: string[];
  error?: string;
  autoFocus?: boolean;
}) {
  const known = designations.some((d) => d.toLowerCase() === value.trim().toLowerCase());
  // Typing a new name is a mode of its own — it must not flip back to the dropdown mid-keystroke.
  const [creating, setCreating] = useState(false);
  const options = value && !known && !creating ? [...designations, value] : designations;

  if (creating) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            error={error}
            maxLength={200}
            placeholder="Type the new designation"
            autoFocus
            aria-label="New designation"
          />
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              onChange("");
            }}
            className="mt-px shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            aria-label="Choose from the list instead"
            title="Choose from the list instead"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">New designation — it will be added to the list when you save.</p>
      </div>
    );
  }

  return (
    <Select
      value={value}
      error={error}
      autoFocus={autoFocus}
      onChange={(e) => {
        if (e.target.value === NEW_OPTION) {
          setCreating(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
    >
      <option value="">Select a designation…</option>
      {options.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
      <option value={NEW_OPTION}>＋ New designation…</option>
    </Select>
  );
}
