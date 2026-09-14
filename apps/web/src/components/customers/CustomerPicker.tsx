import React, { useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useCustomerSearch } from "../../api/customers";
import { Input } from "../ui/primitives";
import { CustomerRef } from "../../lib/types";

/** Search-as-you-type Customer Master picker — used wherever an Enquiry,
 * Estimation task, or Project is created/edited, so the customer already on
 * file in CRM is one search away instead of retyped as free text. */
export const CustomerPicker: React.FC<{
  value: CustomerRef | null | undefined;
  onChange: (customer: CustomerRef | null) => void;
  placeholder?: string;
  /** Shows a link to the Customer 360 page next to the selected value — only
   * meaningful once the customer (and this record) already exist. */
  linkToDetail?: boolean;
}> = ({ value, onChange, placeholder, linkToDetail }) => {
  const [query, setQuery] = useState("");
  const { data: matches } = useCustomerSearch(query);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        {linkToDetail ? (
          <Link to={`/workflow/customers/${value.id}`} className="truncate text-brand-700 hover:underline">
            {value.name} <span className="text-slate-400">· {value.customerId}</span>
          </Link>
        ) : (
          <span className="truncate text-slate-700">
            {value.name} <span className="text-slate-400">· {value.customerId}</span>
          </span>
        )}
        <button type="button" onClick={() => onChange(null)} className="shrink-0 text-slate-400 hover:text-red-500" aria-label="Clear customer">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input placeholder={placeholder ?? "Search customers by name or ID…"} value={query} onChange={(e) => setQuery(e.target.value)} />
      {query && (matches?.length ?? 0) > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches!.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                onChange(c);
                setQuery("");
              }}
            >
              <span>{c.name}</span>
              <span className="text-xs text-slate-400">{c.customerId}</span>
            </button>
          ))}
        </div>
      )}
      {query && (matches?.length ?? 0) === 0 && <p className="mt-1 text-[11px] text-slate-400">No matching customer — check Customer Master or leave blank.</p>}
    </div>
  );
};
