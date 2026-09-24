import React from "react";
import { X } from "lucide-react";
import { Button } from "./primitives";

/** Sticky bar shown once one or more rows/cards are selected on a bulk-select
 * page (Customers, Tasks, Enquiry List, Estimation, Projects). Action buttons
 * are passed in as children since they differ per entity (delete/move/status/
 * archive/export). */
export const BulkActionBar: React.FC<{ count: number; onClear: () => void; children: React.ReactNode }> = ({ count, onClear, children }) => {
  if (count === 0) return null;
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
      <span className="font-medium text-brand-800">{count} selected</span>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      <Button variant="ghost" size="sm" onClick={onClear}>
        <X className="h-3.5 w-3.5" /> Clear
      </Button>
    </div>
  );
};
