import React, { useRef, useState } from "react";
import { format } from "date-fns";
import { Lock, Download, Trash2, UploadCloud } from "lucide-react";
import { useTaskSecretAttachments, useUploadSecretAttachment, useDeleteSecretAttachment } from "../../api/tasks";
import { useToast } from "../../context/ToastContext";
import { api, extractApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../ui/ConfirmDialog";

interface SecretAttachment {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  uploadedByName: string;
  createdAt: string;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Restricted-visibility attachments on Estimation tasks — only rendered at
 * all when the caller has already checked canSeeSecretAttachments(user); the
 * API independently 404s these routes for anyone else, so this component
 * never needs its own permission prop.
 */
export const SecretAttachmentsSection: React.FC<{ taskId: string }> = ({ taskId }) => {
  const { push } = useToast();
  const { data: attachments } = useTaskSecretAttachments(taskId, true);
  const upload = useUploadSecretAttachment(taskId);
  const del = useDeleteSecretAttachment(taskId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SecretAttachment | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function downloadAttachment(a: SecretAttachment) {
    setDownloadingId(a.id);
    try {
      const res = await api.get(`/tasks/${taskId}/secret-attachments/${a.id}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", a.fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      push({ variant: "error", title: "Could not download file", description: extractApiError(err).message });
    } finally {
      setDownloadingId(null);
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        push({ variant: "error", title: "File too large", description: `${file.name} exceeds the 25MB limit.` });
        continue;
      }
      try {
        await upload.mutateAsync(file);
      } catch (err) {
        push({ variant: "error", title: `Could not upload ${file.name}`, description: extractApiError(err).message });
      }
    }
  }

  return (
    <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
          <Lock className="h-3.5 w-3.5" /> Submit Quotation
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          uploadFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center text-xs ${
          dragOver ? "border-amber-400 bg-amber-100/60" : "border-amber-300 bg-white/50"
        }`}
      >
        <UploadCloud className="h-5 w-5 text-amber-500" />
        <p className="text-amber-800">
          Drag files here, or{" "}
          <button onClick={() => inputRef.current?.click()} className="font-medium text-amber-900 hover:underline">
            browse
          </button>
        </p>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
      </div>

      <div className="space-y-1.5">
        {attachments?.map((a: SecretAttachment) => (
          <div key={a.id} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-2.5 py-2">
            <Lock className="h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-800">{a.fileName}</p>
              <p className="text-[11px] text-slate-400">
                {formatBytes(a.fileSizeBytes)} · {a.uploadedByName} · {format(new Date(a.createdAt), "d MMM, HH:mm")}
              </p>
            </div>
            <button
              onClick={() => downloadAttachment(a)}
              disabled={downloadingId === a.id}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              aria-label={`Download ${a.fileName}`}
            >
              <Download className="h-4 w-4" />
            </button>
            <button onClick={() => setPendingDelete(a)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${a.fileName}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {attachments?.length === 0 && <p className="py-2 text-xs text-amber-700/70">No files submitted yet.</p>}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete file"
        message={
          <>
            Are you sure you want to delete <strong>&ldquo;{pendingDelete?.fileName}&rdquo;</strong>?
          </>
        }
        confirmLabel="Delete"
        loading={del.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await del.mutateAsync(pendingDelete.id);
          } catch (err) {
            push({ variant: "error", title: "Could not delete attachment", description: extractApiError(err).message });
          }
          setPendingDelete(null);
        }}
      />
    </section>
  );
};
