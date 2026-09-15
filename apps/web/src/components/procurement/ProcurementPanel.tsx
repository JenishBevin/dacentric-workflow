import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useProcurementRecord, useUpdateProcurementRecord } from "../../api/boards";
import { Button, Input, Label, Select, Textarea, Skeleton, ErrorState, Badge } from "../ui/primitives";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { format } from "date-fns";

interface LineItem {
  description: string;
  quantity: number;
  unitCost: number;
}

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "ORDERED", label: "Ordered" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

function toDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

/** Manually-filled Procurement details for a Project — the page the
 * Project/Procurement toggle at the top of BoardKanbanPage switches to.
 * Same project, same id, just a different form instead of the Kanban board. */
export function ProcurementPanel({ boardId }: { boardId: string }) {
  const { data: record, isLoading, isError, error, refetch } = useProcurementRecord(boardId);
  const update = useUpdateProcurementRecord(boardId);
  const { push } = useToast();

  const [vendorName, setVendorName] = useState("");
  const [vendorContact, setVendorContact] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [actualDeliveryDate, setActualDeliveryDate] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!record) return;
    setVendorName(record.vendorName ?? "");
    setVendorContact(record.vendorContact ?? "");
    setVendorAddress(record.vendorAddress ?? "");
    setPoNumber(record.poNumber ?? "");
    setOrderDate(toDateInput(record.orderDate));
    setLineItems(record.lineItems && record.lineItems.length > 0 ? record.lineItems : []);
    setExpectedDeliveryDate(toDateInput(record.expectedDeliveryDate));
    setActualDeliveryDate(toDateInput(record.actualDeliveryDate));
    setStatus(record.status);
    setNotes(record.notes ?? "");
  }, [record?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateLineItem(idx: number, patch: Partial<LineItem>) {
    setLineItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeLineItem(idx: number) {
    setLineItems((items) => items.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    try {
      await update.mutateAsync({
        vendorName: vendorName.trim() || null,
        vendorContact: vendorContact.trim() || null,
        vendorAddress: vendorAddress.trim() || null,
        poNumber: poNumber.trim() || null,
        orderDate: orderDate || null,
        lineItems: lineItems.filter((it) => it.description.trim()),
        expectedDeliveryDate: expectedDeliveryDate || null,
        actualDeliveryDate: actualDeliveryDate || null,
        status: status as any,
        notes: notes.trim() || null,
      } as any);
      push({ variant: "success", title: "Procurement details saved." });
    } catch (err) {
      push({ variant: "error", title: "Could not save", description: extractApiError(err).message });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !record) {
    return <ErrorState message={extractApiError(error).message || "Could not load procurement details."} onRetry={() => refetch()} />;
  }

  const total = lineItems.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitCost) || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">{record.procurementId}</span>
          <Badge tone={record.status === "DELIVERED" ? "green" : record.status === "CANCELLED" ? "red" : record.status === "ORDERED" ? "indigo" : "amber"}>
            {STATUS_OPTIONS.find((o) => o.value === record.status)?.label ?? record.status}
          </Badge>
        </div>
        <p className="text-xs text-slate-400">Last updated {format(new Date(record.updatedAt), "d MMM yyyy, h:mm a")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
        <div>
          <Label>Vendor name</Label>
          <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor / supplier name" />
        </div>
        <div>
          <Label>Vendor contact</Label>
          <Input value={vendorContact} onChange={(e) => setVendorContact(e.target.value)} placeholder="Phone or email" />
        </div>
        <div>
          <Label>Vendor address</Label>
          <Input value={vendorAddress} onChange={(e) => setVendorAddress(e.target.value)} placeholder="Address" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
        <div>
          <Label>PO number</Label>
          <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="Purchase order number" />
        </div>
        <div>
          <Label>Order date</Label>
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-2 flex items-center justify-between">
          <Label className="!mb-0">Items / materials</Label>
          <Button variant="outline" size="sm" onClick={() => setLineItems((items) => [...items, { description: "", quantity: 1, unitCost: 0 }])}>
            <Plus className="h-3.5 w-3.5" /> Add item
          </Button>
        </div>
        {lineItems.length === 0 && <p className="text-xs text-slate-400">No items added yet.</p>}
        {lineItems.length > 0 && (
          <div className="space-y-2">
            {lineItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={item.description}
                  onChange={(e) => updateLineItem(idx, { description: e.target.value })}
                  placeholder="Description"
                />
                <Input
                  type="number"
                  min={0}
                  className="w-24"
                  value={item.quantity}
                  onChange={(e) => updateLineItem(idx, { quantity: Number(e.target.value) })}
                  placeholder="Qty"
                />
                <Input
                  type="number"
                  min={0}
                  className="w-28"
                  value={item.unitCost}
                  onChange={(e) => updateLineItem(idx, { unitCost: Number(e.target.value) })}
                  placeholder="Unit cost"
                />
                <button onClick={() => removeLineItem(idx)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500" aria-label="Remove item">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <p className="text-right text-xs font-medium text-slate-500">Total: {total.toLocaleString(undefined, { style: "currency", currency: "USD" })}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
        <div>
          <Label>Expected delivery date</Label>
          <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
        </div>
        <div>
          <Label>Actual delivery date</Label>
          <Input type="date" value={actualDeliveryDate} onChange={(e) => setActualDeliveryDate(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any other procurement notes…" />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={update.isPending}>
          Save procurement details
        </Button>
      </div>
    </div>
  );
}
