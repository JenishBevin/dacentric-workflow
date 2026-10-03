import React, { useRef, useState } from "react";
import { Download, Eye, FileText, Trash2, Upload } from "lucide-react";
import {
  downloadHrFile,
  previewHrFile,
  useDeleteEmployeeDocument,
  useEmployeeDocuments,
  useUploadEmployeeDocument,
  type EmployeeDocument,
  type HrEmployee,
} from "../../api/hr";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Label, Select, Skeleton } from "../ui/primitives";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { fmtDate } from "../../lib/hrFormat";
import { ExpiryBadge } from "./EmployeeOverviewTab";
import { EmployeePhotoCard } from "./EmployeePhotoCard";

export const DOCUMENT_CATEGORIES = [
  { value: "PASSPORT", label: "Passport" },
  { value: "EMIRATES_ID", label: "Emirates ID" },
  { value: "VISA", label: "Visa" },
  { value: "CONTRACT", label: "Contract" },
  { value: "CERTIFICATE", label: "Certificate" },
  { value: "OTHER", label: "Other" },
];
const categoryLabel = (v: string) => DOCUMENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const MAX_BYTES = 25 * 1024 * 1024;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmployeeDocumentsTab({ employee }: { employee: HrEmployee }) {
  const { push } = useToast();
  const { data: documents, isLoading, isError, refetch } = useEmployeeDocuments(employee.id);
  const upload = useUploadEmployeeDocument(employee.id);
  const remove = useDeleteEmployeeDocument();
  const fileRef = useRef<HTMLInputElement>(null);

  const [filter, setFilter] = useState<string>("ALL");
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("OTHER");
  const [title, setTitle] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EmployeeDocument | null>(null);

  const visible = (documents ?? []).filter((d) => filter === "ALL" || d.category === filter);

  function onPickFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const picked = ev.target.files?.[0] ?? null;
    if (picked && picked.size > MAX_BYTES) {
      push({ variant: "error", title: "File too large", description: "Maximum file size is 25 MB." });
      ev.target.value = "";
      setFile(null);
      return;
    }
    setFile(picked);
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!file) {
      push({ variant: "error", title: "Choose a file to upload." });
      return;
    }
    try {
      await upload.mutateAsync({ file, category, title: title.trim() || undefined, expiryDate: expiryDate || undefined });
      push({ variant: "success", title: "Document uploaded." });
      setFile(null);
      setTitle("");
      setExpiryDate("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      push({ variant: "error", title: "Could not upload document", description: extractApiError(err).message });
    }
  }

  function preview(doc: EmployeeDocument) {
    previewHrFile(`/documents/${doc.id}/download`, doc.mimeType).catch((err) =>
      push({ variant: "error", title: "Could not open document", description: extractApiError(err).message })
    );
  }

  async function download(doc: EmployeeDocument) {
    try {
      await downloadHrFile(`/documents/${doc.id}/download`, doc.fileName);
    } catch (err) {
      push({ variant: "error", title: "Could not download document", description: extractApiError(err).message });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      push({ variant: "success", title: "Document deleted." });
      setDeleteTarget(null);
    } catch (err) {
      push({ variant: "error", title: "Could not delete document", description: extractApiError(err).message });
    }
  }

  return (
    <div className="space-y-4">
      <EmployeePhotoCard employee={employee} />

      <Card className="p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Upload document</h3>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Label required>File</Label>
            <input
              ref={fileRef}
              type="file"
              onChange={onPickFile}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            <p className="mt-1 text-xs text-slate-400">Max 25 MB.</p>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onChange={(ev) => setCategory(ev.target.value)}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="Optional" />
          </div>
          <div>
            <Label>Expiry date</Label>
            <Input type="date" value={expiryDate} onChange={(ev) => setExpiryDate(ev.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" loading={upload.isPending} disabled={!file}>
              <Upload className="h-4 w-4" /> Upload
            </Button>
          </div>
        </form>
      </Card>

      <div className="flex flex-wrap gap-2">
        {[{ value: "ALL", label: "All" }, ...DOCUMENT_CATEGORIES].map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setFilter(c.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === c.value ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && <ErrorState message="Could not load documents." onRetry={() => refetch()} />}
      {documents && visible.length === 0 && (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={documents.length === 0 ? "No documents uploaded yet." : "No documents in this category."}
        />
      )}

      {visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((doc) => (
            <li key={doc.id}>
              <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-500">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{doc.title || doc.fileName}</p>
                      <Badge tone="indigo">{categoryLabel(doc.category)}</Badge>
                      {doc.expiryDate && (
                        <>
                          <Badge tone="slate">Expires {fmtDate(doc.expiryDate)}</Badge>
                          <ExpiryBadge date={doc.expiryDate} />
                        </>
                      )}
                    </div>
                    <p className="mt-0.5 break-all text-xs text-slate-500">
                      {doc.fileName} · {fmtSize(doc.fileSizeBytes)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Uploaded by {doc.uploadedByName} on {fmtDate(doc.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => preview(doc)}>
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => download(doc)}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDeleteTarget(doc)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete document?"
        message={
          <>
            Delete <span className="font-medium text-slate-900">{deleteTarget?.title || deleteTarget?.fileName}</span> from {employee.fullName}'s records? This cannot be
            undone.
          </>
        }
        confirmLabel="Delete document"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
