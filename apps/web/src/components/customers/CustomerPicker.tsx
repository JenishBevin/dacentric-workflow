import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { useCustomerSearch, useCreateCustomer } from "../../api/customers";
import { Button, Input, Label } from "../ui/primitives";
import { CustomerRef } from "../../lib/types";
import { extractApiError } from "../../lib/apiClient";

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
  /** Offers a quick inline "+ New Customer" form for when the customer isn't
   * on file yet, so the caller doesn't have to leave this form to add one. */
  allowCreate?: boolean;
}> = ({ value, onChange, placeholder, linkToDetail, allowCreate }) => {
  const [query, setQuery] = useState("");
  const { data: matches } = useCustomerSearch(query);
  const [creating, setCreating] = useState(false);
  const createCustomer = useCreateCustomer();
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  function cancelCreate() {
    setCreating(false);
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setCreateError(null);
  }

  async function submitCreate() {
    if (!newName.trim()) {
      setCreateError("Customer name is required.");
      return;
    }
    setCreateError(null);
    try {
      const created = await createCustomer.mutateAsync({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        email: newEmail.trim() || undefined,
      });
      onChange(created);
      cancelCreate();
      setQuery("");
    } catch (err) {
      setCreateError(extractApiError(err).message);
    }
  }

  if (allowCreate && creating) {
    return (
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div>
          <Label required>Company / Customer Name</Label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. ABC Technologies" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Phone</Label>
            <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
        </div>
        {createError && <p className="text-xs text-red-600">{createError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={cancelCreate}>
            Cancel
          </Button>
          <Button type="button" size="sm" loading={createCustomer.isPending} onClick={submitCreate}>
            Create Customer
          </Button>
        </div>
      </div>
    );
  }

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
      {allowCreate && (
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setNewName(query);
          }}
          className="mt-1.5 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus className="h-3.5 w-3.5" /> New Customer
        </button>
      )}
    </div>
  );
};
