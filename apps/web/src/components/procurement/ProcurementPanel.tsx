import React, { useEffect, useState } from "react";
import { Plus, Trash2, Eye, Download, FileText, Receipt, ChevronDown, ChevronRight, ClipboardList, FileDown } from "lucide-react";
import { useProcurementRecord, useUpdateProcurementRecord, useBoardDetail, useMaterialRequests } from "../../api/boards";
import { Button, Input, Label, Select, Textarea, Skeleton, ErrorState, Badge } from "../ui/primitives";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { generateDeliveryNotePdf, DeliveryNoteLineItem } from "../../lib/deliveryNotePdf";
import { generatePurchaseOrderPdf, DEFAULT_PO_COMMENTS } from "../../lib/purchaseOrderPdf";
import { generateMaterialRequestPdf } from "../../lib/materialRequestPdf";
import { format } from "date-fns";

interface LineItem {
  description: string;
  quantity: number;
  unitCost: number;
  unit?: string;
}

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "ORDERED", label: "Ordered" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "NA", label: "N/A" },
];

function toDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

/** Collapsed-by-default header for the Delivery Note / Purchase Order
 * blocks — just the label until the arrow is clicked, so these don't push
 * the whole page down when they're not the thing being worked on. */
const SectionHeader: React.FC<{ icon: React.ReactNode; label: string; open: boolean; onToggle: () => void }> = ({ icon, label, open, onToggle }) => (
  <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-1.5 text-left">
    <span className="flex items-center gap-1.5">
      {icon}
      <Label className="!mb-0">{label}</Label>
    </span>
    {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
  </button>
);

/** Manually-filled Procurement details for a Project — the page the
 * Project/Procurement toggle at the top of BoardKanbanPage switches to.
 * Same project, same id, just a different form instead of the Kanban board. */
export function ProcurementPanel({ boardId }: { boardId: string }) {
  const { data: record, isLoading, isError, error, refetch } = useProcurementRecord(boardId);
  const { data: board } = useBoardDetail(boardId);
  const { data: materialRequests } = useMaterialRequests(boardId);
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

  const [deliveryNoteNo, setDeliveryNoteNo] = useState("");
  const [deliverySite, setDeliverySite] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryItems, setDeliveryItems] = useState<DeliveryNoteLineItem[]>([]);
  const [receiverName, setReceiverName] = useState("");
  const [receiverDesignation, setReceiverDesignation] = useState("");
  const [generatingNote, setGeneratingNote] = useState<"preview" | "download" | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);

  const [poRequestedBy, setPoRequestedBy] = useState("");
  const [poCustomerId, setPoCustomerId] = useState("");
  const [poProjectName, setPoProjectName] = useState("");
  const [poGeneralComments, setPoGeneralComments] = useState(DEFAULT_PO_COMMENTS);
  const [poQuoteRefNo, setPoQuoteRefNo] = useState("");
  const [poPreparerName, setPoPreparerName] = useState("");
  const [generatingPo, setGeneratingPo] = useState<"preview" | "download" | null>(null);
  const [poOpen, setPoOpen] = useState(false);
  const [mrOpen, setMrOpen] = useState(false);
  const [generatingMrKey, setGeneratingMrKey] = useState<string | null>(null);
  const [importedMrId, setImportedMrId] = useState("");

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
    setDeliveryNoteNo(record.deliveryNoteNo ?? "");
    setDeliverySite(record.deliverySite ?? "");
    setDeliveryLocation(record.deliveryLocation ?? "");
    setDeliveryDate(toDateInput(record.deliveryDate));
    setDeliveryItems(record.deliveryItems && record.deliveryItems.length > 0 ? record.deliveryItems : []);
    setReceiverName(record.receiverName ?? "");
    setReceiverDesignation(record.receiverDesignation ?? "");
    setPoRequestedBy(record.poRequestedBy ?? "");
    setPoCustomerId(record.poCustomerId ?? "");
    setPoGeneralComments(record.poGeneralComments ?? DEFAULT_PO_COMMENTS);
    setPoQuoteRefNo(record.poQuoteRefNo ?? "");
    setPoPreparerName(record.poPreparerName ?? "");
  }, [record?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Separate from the effect above — the board name often loads after the
  // procurement record does, and this shouldn't reset any in-progress edits
  // to the other fields when it arrives.
  useEffect(() => {
    if (!record) return;
    setPoProjectName(record.poProjectName || board?.name || "");
  }, [record?.id, board?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateLineItem(idx: number, patch: Partial<LineItem>) {
    setLineItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeLineItem(idx: number) {
    setLineItems((items) => items.filter((_, i) => i !== idx));
  }

  function updateDeliveryItem(idx: number, patch: Partial<DeliveryNoteLineItem>) {
    setDeliveryItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeDeliveryItem(idx: number) {
    setDeliveryItems((items) => items.filter((_, i) => i !== idx));
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
        deliveryNoteNo: deliveryNoteNo.trim() || null,
        deliverySite: deliverySite.trim() || null,
        deliveryLocation: deliveryLocation.trim() || null,
        deliveryDate: deliveryDate || null,
        deliveryItems: deliveryItems.filter((it) => it.description.trim()),
        receiverName: receiverName.trim() || null,
        receiverDesignation: receiverDesignation.trim() || null,
        poRequestedBy: poRequestedBy.trim() || null,
        poCustomerId: poCustomerId.trim() || null,
        poProjectName: poProjectName.trim() || null,
        poGeneralComments: poGeneralComments.trim() || null,
        poQuoteRefNo: poQuoteRefNo.trim() || null,
        poPreparerName: poPreparerName.trim() || null,
      } as any);
      push({ variant: "success", title: "Procurement details saved." });
    } catch (err) {
      push({ variant: "error", title: "Could not save", description: extractApiError(err).message });
    }
  }

  async function handleDeliveryNotePdf(kind: "preview" | "download") {
    // window.open must happen synchronously on the click, before any await,
    // or popup blockers swallow it — same reasoning as QuotationEditorPage.
    const previewWindow = kind === "preview" ? window.open("", "_blank") : null;
    setGeneratingNote(kind);
    try {
      await generateDeliveryNotePdf(
        {
          noteNo: deliveryNoteNo.trim(),
          date: deliveryDate || null,
          site: deliverySite.trim(),
          location: deliveryLocation.trim(),
          lineItems: deliveryItems.filter((it) => it.description.trim()),
          receiverName: receiverName.trim(),
          receiverDesignation: receiverDesignation.trim(),
        },
        kind === "preview" ? { preview: true, previewWindow } : undefined
      );
    } catch (err) {
      previewWindow?.close();
      push({ variant: "error", title: "Could not generate delivery note", description: extractApiError(err).message });
    } finally {
      setGeneratingNote(null);
    }
  }

  async function handlePurchaseOrderPdf(kind: "preview" | "download") {
    const previewWindow = kind === "preview" ? window.open("", "_blank") : null;
    setGeneratingPo(kind);
    try {
      await generatePurchaseOrderPdf(
        {
          lpoNo: poNumber.trim(),
          date: orderDate || null,
          requestedBy: poRequestedBy.trim(),
          customerId: poCustomerId.trim(),
          projectName: poProjectName.trim() || board?.name || "",
          vendorName: vendorName.trim(),
          vendorAddress: vendorAddress.trim(),
          lineItems: lineItems.filter((it) => it.description.trim()).map((it) => ({ ...it, unit: it.unit ?? "" })),
          generalComments: poGeneralComments,
          quoteRefNo: poQuoteRefNo.trim(),
          preparerName: poPreparerName.trim(),
        },
        kind === "preview" ? { preview: true, previewWindow } : undefined
      );
    } catch (err) {
      previewWindow?.close();
      push({ variant: "error", title: "Could not generate purchase order", description: extractApiError(err).message });
    } finally {
      setGeneratingPo(null);
    }
  }

  async function handleMaterialRequestPdf(mr: NonNullable<typeof materialRequests>[number], kind: "preview" | "download") {
    const key = `${mr.id}:${kind}`;
    const previewWindow = kind === "preview" ? window.open("", "_blank") : null;
    setGeneratingMrKey(key);
    try {
      await generateMaterialRequestPdf(
        {
          requestNo: mr.requestNo,
          projectName: board?.name ?? "",
          requestedByName: mr.requestedByName,
          department: mr.department ?? "",
          empId: mr.empId ?? "",
          urgency: mr.urgency,
          requestDate: mr.requestDate,
          requiredDate: mr.requiredDate,
          items: mr.items,
          comments: mr.comments ?? "",
          reviewedByName: mr.reviewedByName ?? "",
          approvedByName: mr.approvedByName ?? "",
        },
        kind === "preview" ? { preview: true, previewWindow } : undefined
      );
    } catch (err) {
      previewWindow?.close();
      push({ variant: "error", title: "Could not generate material request", description: extractApiError(err).message });
    } finally {
      setGeneratingMrKey(null);
    }
  }

  function handleImportMaterialRequest(requestId: string) {
    setImportedMrId(requestId);
    if (!requestId) return;
    const mr = materialRequests?.find((m) => m.id === requestId);
    if (!mr) return;
    setLineItems(mr.items.map((it) => ({ description: it.description, quantity: it.qty, unit: it.unit, unitCost: 0 })));
    push({ variant: "success", title: `Imported ${mr.items.length} item(s) from ${mr.requestNo}.`, description: "Set the unit price for each before generating the LPO." });
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
          <Badge
            tone={
              record.status === "DELIVERED"
                ? "green"
                : record.status === "CANCELLED"
                  ? "red"
                  : record.status === "ORDERED"
                    ? "indigo"
                    : record.status === "NA"
                      ? "slate"
                      : "amber"
            }
          >
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
                <Input className="w-20" value={item.unit ?? ""} onChange={(e) => updateLineItem(idx, { unit: e.target.value })} placeholder="Unit" />
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

      <div className="rounded-xl border border-slate-200 p-4">
          <SectionHeader
            icon={<ClipboardList className="h-4 w-4 text-slate-400" />}
            label={`Material Requests${materialRequests && materialRequests.length > 0 ? ` (${materialRequests.length})` : ""}`}
            open={mrOpen}
            onToggle={() => setMrOpen((o) => !o)}
          />

          {mrOpen && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-slate-400">Submitted from this project's own page — read-only here. Pick one when building a Purchase Order below to import its items.</p>
              {(!materialRequests || materialRequests.length === 0) && <p className="text-xs text-slate-400">No material requests submitted yet.</p>}
              {materialRequests && materialRequests.length > 0 && (
                <div className="space-y-2">
                  {materialRequests.map((mr) => (
                    <div key={mr.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{mr.requestNo}</span>
                          <Badge tone={mr.urgency === "URGENT" ? "red" : "slate"}>{mr.urgency === "URGENT" ? "Urgent" : "Normal"}</Badge>
                        </span>
                        <p className="text-xs text-slate-400">
                          {mr.requestedByName} · {mr.items.length} item{mr.items.length === 1 ? "" : "s"}
                          {mr.requestDate ? ` · ${format(new Date(mr.requestDate), "d MMM yyyy")}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          loading={generatingMrKey === `${mr.id}:preview`}
                          onClick={() => handleMaterialRequestPdf(mr, "preview")}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" loading={generatingMrKey === `${mr.id}:download`} onClick={() => handleMaterialRequestPdf(mr, "download")}>
                          <FileDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      <div className="rounded-xl border border-slate-200 p-4">
          <SectionHeader icon={<Receipt className="h-4 w-4 text-slate-400" />} label="Purchase Order (LPO)" open={poOpen} onToggle={() => setPoOpen((o) => !o)} />

          {poOpen && (
            <>
              <p className="mb-3 mt-3 text-xs text-slate-400">LPO No., Date and Bill To come from the PO number/Order date/Vendor fields above.</p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Project name</Label>
                  <Input value={poProjectName} onChange={(e) => setPoProjectName(e.target.value)} placeholder="Defaults to this project's name" />
                </div>
                <div>
                  <Label>Requested by</Label>
                  <Input value={poRequestedBy} onChange={(e) => setPoRequestedBy(e.target.value)} placeholder="Requester's name" />
                </div>
                <div>
                  <Label>Customer ID</Label>
                  <Input value={poCustomerId} onChange={(e) => setPoCustomerId(e.target.value)} placeholder="e.g. QPTN-0178" />
                </div>
                <div>
                  <Label>Quote Ref No.</Label>
                  <Input value={poQuoteRefNo} onChange={(e) => setPoQuoteRefNo(e.target.value)} placeholder="e.g. EST-018193" />
                </div>
                <div>
                  <Label>Prepared by</Label>
                  <Input value={poPreparerName} onChange={(e) => setPoPreparerName(e.target.value)} placeholder="Signatory's name" />
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Label className="!mb-0">Items &amp; pricing</Label>
                  <div className="flex items-center gap-2">
                    {materialRequests && materialRequests.length > 0 && (
                      <Select value={importedMrId} onChange={(e) => handleImportMaterialRequest(e.target.value)} className="!w-56 !py-1.5 !text-xs">
                        <option value="">Import from Material Request…</option>
                        {materialRequests.map((mr) => (
                          <option key={mr.id} value={mr.id}>
                            {mr.requestNo} ({mr.items.length} item{mr.items.length === 1 ? "" : "s"})
                          </option>
                        ))}
                      </Select>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setLineItems((items) => [...items, { description: "", quantity: 1, unit: "", unitCost: 0 }])}>
                      <Plus className="h-3.5 w-3.5" /> Add item
                    </Button>
                  </div>
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
                          className="w-20"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(idx, { quantity: Number(e.target.value) })}
                          placeholder="Qty"
                        />
                        <Input className="w-20" value={item.unit ?? ""} onChange={(e) => updateLineItem(idx, { unit: e.target.value })} placeholder="Unit" />
                        <Input
                          type="number"
                          min={0}
                          className="w-28"
                          value={item.unitCost}
                          onChange={(e) => updateLineItem(idx, { unitCost: Number(e.target.value) })}
                          placeholder="Unit price"
                        />
                        <button onClick={() => removeLineItem(idx)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500" aria-label="Remove item">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <p className="text-right text-xs font-medium text-slate-500">
                      Subtotal: {total.toLocaleString(undefined, { style: "currency", currency: "AED" })} · same list shown in Items / materials above
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <Label>General comments</Label>
                <Textarea rows={3} value={poGeneralComments} onChange={(e) => setPoGeneralComments(e.target.value)} placeholder="One per line — numbered automatically on the PDF" />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" loading={generatingPo === "preview"} onClick={() => handlePurchaseOrderPdf("preview")}>
                  <Eye className="h-3.5 w-3.5" /> Preview
                </Button>
                <Button size="sm" loading={generatingPo === "download"} onClick={() => handlePurchaseOrderPdf("download")}>
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </Button>
              </div>
            </>
          )}
        </div>

      <div className="rounded-xl border border-slate-200 p-4">
          <SectionHeader icon={<FileText className="h-4 w-4 text-slate-400" />} label="Delivery Note" open={deliveryOpen} onToggle={() => setDeliveryOpen((o) => !o)} />

          {deliveryOpen && (
            <>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Site</Label>
                  <Input value={deliverySite} onChange={(e) => setDeliverySite(e.target.value)} placeholder="Site name" />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} placeholder="Location" />
                </div>
                <div>
                  <Label>No.</Label>
                  <Input value={deliveryNoteNo} onChange={(e) => setDeliveryNoteNo(e.target.value)} placeholder="Delivery note number" />
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="!mb-0">Items</Label>
                  <Button variant="outline" size="sm" onClick={() => setDeliveryItems((items) => [...items, { description: "", unit: "", qty: 1 }])}>
                    <Plus className="h-3.5 w-3.5" /> Add item
                  </Button>
                </div>
                {deliveryItems.length === 0 && <p className="text-xs text-slate-400">No items added yet.</p>}
                {deliveryItems.length > 0 && (
                  <div className="space-y-2">
                    {deliveryItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          className="flex-1"
                          value={item.description}
                          onChange={(e) => updateDeliveryItem(idx, { description: e.target.value })}
                          placeholder="Description and specifications"
                        />
                        <Input className="w-24" value={item.unit} onChange={(e) => updateDeliveryItem(idx, { unit: e.target.value })} placeholder="Unit" />
                        <Input
                          type="number"
                          min={0}
                          className="w-20"
                          value={item.qty}
                          onChange={(e) => updateDeliveryItem(idx, { qty: Number(e.target.value) })}
                          placeholder="Qty"
                        />
                        <button onClick={() => removeDeliveryItem(idx)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500" aria-label="Remove item">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Receiver name</Label>
                  <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Receiver's name" />
                </div>
                <div>
                  <Label>Receiver designation</Label>
                  <Input value={receiverDesignation} onChange={(e) => setReceiverDesignation(e.target.value)} placeholder="Receiver's designation" />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">Signature is left blank on the PDF for the receiver to sign after printing.</p>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" loading={generatingNote === "preview"} onClick={() => handleDeliveryNotePdf("preview")}>
                  <Eye className="h-3.5 w-3.5" /> Preview
                </Button>
                <Button size="sm" loading={generatingNote === "download"} onClick={() => handleDeliveryNotePdf("download")}>
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </Button>
              </div>
            </>
          )}
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
