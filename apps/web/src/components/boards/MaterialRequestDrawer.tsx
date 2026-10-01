import React, { useState } from "react";
import { Plus, Trash2, Eye, Download } from "lucide-react";
import { Drawer } from "../ui/Drawer";
import { Button, Input, Label, Select, Textarea } from "../ui/primitives";
import { useCreateMaterialRequest, MaterialRequestItem } from "../../api/boards";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { generateMaterialRequestPdf } from "../../lib/materialRequestPdf";

/** Create-only form for a project's Material Request Form (MRF) — opened
 * from the Project page's toolbar. Submitting creates the record (visible
 * read-only on this same project's Procurement page, and importable into a
 * Purchase Order's item list there) and offers an immediate Preview/Download
 * of the generated PDF. */
export const MaterialRequestDrawer: React.FC<{ open: boolean; onClose: () => void; boardId: string; projectName: string }> = ({
  open,
  onClose,
  boardId,
  projectName,
}) => {
  const { user } = useAuth();
  const { push } = useToast();
  const create = useCreateMaterialRequest(boardId);

  const [requestedByName, setRequestedByName] = useState(user?.name ?? "");
  const [department, setDepartment] = useState("");
  const [empId, setEmpId] = useState("");
  const [urgency, setUrgency] = useState<"NORMAL" | "URGENT">("NORMAL");
  const [requestDate, setRequestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [requiredDate, setRequiredDate] = useState("");
  const [items, setItems] = useState<MaterialRequestItem[]>([{ description: "", unit: "", qty: 1, remarks: "" }]);
  const [comments, setComments] = useState("");
  const [reviewedByName, setReviewedByName] = useState("");
  const [approvedByName, setApprovedByName] = useState("");
  const [generating, setGenerating] = useState<"preview" | "download" | null>(null);

  function updateItem(idx: number, patch: Partial<MaterialRequestItem>) {
    setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeItem(idx: number) {
    setItems((rows) => rows.filter((_, i) => i !== idx));
  }

  function reset() {
    setRequestedByName(user?.name ?? "");
    setDepartment("");
    setEmpId("");
    setUrgency("NORMAL");
    setRequestDate(new Date().toISOString().slice(0, 10));
    setRequiredDate("");
    setItems([{ description: "", unit: "", qty: 1, remarks: "" }]);
    setComments("");
    setReviewedByName("");
    setApprovedByName("");
  }

  async function handleSubmit(kind: "preview" | "download") {
    const cleanItems = items.filter((it) => it.description.trim());
    if (!requestedByName.trim() || cleanItems.length === 0) {
      push({ variant: "error", title: "Requested By and at least one item are required." });
      return;
    }
    // window.open must happen synchronously on the click, before any await,
    // or popup blockers swallow it.
    const previewWindow = kind === "preview" ? window.open("", "_blank") : null;
    setGenerating(kind);
    try {
      const saved = await create.mutateAsync({
        requestedByName: requestedByName.trim(),
        department: department.trim() || null,
        empId: empId.trim() || null,
        urgency,
        requestDate: requestDate || null,
        requiredDate: requiredDate || null,
        items: cleanItems,
        comments: comments.trim() || null,
        reviewedByName: reviewedByName.trim() || null,
        approvedByName: approvedByName.trim() || null,
      });
      await generateMaterialRequestPdf(
        {
          requestNo: saved.requestNo,
          projectName,
          requestedByName: saved.requestedByName,
          department: saved.department ?? "",
          empId: saved.empId ?? "",
          urgency: saved.urgency,
          requestDate: saved.requestDate,
          requiredDate: saved.requiredDate,
          items: cleanItems,
          comments: saved.comments ?? "",
          reviewedByName: saved.reviewedByName ?? "",
          approvedByName: saved.approvedByName ?? "",
        },
        kind === "preview" ? { preview: true, previewWindow } : undefined
      );
      push({ variant: "success", title: `${saved.requestNo} submitted.`, description: "It's now visible on this project's Procurement page." });
      reset();
      onClose();
    } catch (err) {
      previewWindow?.close();
      push({ variant: "error", title: "Could not submit material request", description: extractApiError(err).message });
    } finally {
      setGenerating(null);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Material Request Form" subtitle={projectName}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label required>Requested by</Label>
            <Input value={requestedByName} onChange={(e) => setRequestedByName(e.target.value)} placeholder="Requester's name" />
          </div>
          <div>
            <Label>Department</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" />
          </div>
          <div>
            <Label>Emp ID</Label>
            <Input value={empId} onChange={(e) => setEmpId(e.target.value)} placeholder="Employee ID" />
          </div>
          <div>
            <Label>Urgency</Label>
            <Select value={urgency} onChange={(e) => setUrgency(e.target.value as "NORMAL" | "URGENT")}>
              <option value="NORMAL">Normal</option>
              <option value="URGENT">Urgent</option>
            </Select>
          </div>
          <div>
            <Label>Requested date</Label>
            <Input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
          </div>
          <div>
            <Label>Required date</Label>
            <Input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label required className="!mb-0">
              Materials
            </Label>
            <Button variant="outline" size="sm" onClick={() => setItems((rows) => [...rows, { description: "", unit: "", qty: 1, remarks: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Add item
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input className="flex-1" value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} placeholder="Material description" />
                <Input className="w-16" value={item.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} placeholder="Unit" />
                <Input type="number" min={0} className="w-16" value={item.qty} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })} placeholder="Qty" />
                <Input className="w-24" value={item.remarks ?? ""} onChange={(e) => updateItem(idx, { remarks: e.target.value })} placeholder="Remarks" />
                <button onClick={() => removeItem(idx)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500" aria-label="Remove item">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label>Comments</Label>
          <Textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Optional" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Reviewed by</Label>
            <Input value={reviewedByName} onChange={(e) => setReviewedByName(e.target.value)} placeholder="Reviewer's name (optional)" />
          </div>
          <div>
            <Label>Approved by</Label>
            <Input value={approvedByName} onChange={(e) => setApprovedByName(e.target.value)} placeholder="Approver's name (optional)" />
          </div>
        </div>
        <p className="text-xs text-slate-400">Signatures are left blank on the PDF for physical sign-off.</p>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" loading={generating === "preview"} onClick={() => handleSubmit("preview")}>
            <Eye className="h-4 w-4" /> Submit &amp; Preview
          </Button>
          <Button loading={generating === "download"} onClick={() => handleSubmit("download")}>
            <Download className="h-4 w-4" /> Submit &amp; Download
          </Button>
        </div>
      </div>
    </Drawer>
  );
};
