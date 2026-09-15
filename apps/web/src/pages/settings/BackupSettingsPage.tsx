import React, { useRef, useState } from "react";
import { DatabaseBackup, Download, Upload, AlertTriangle, ShieldAlert } from "lucide-react";
import { downloadBackup, useRestoreBackup } from "../../api/backup";
import { Button, EmptyState, Input, Label } from "../../components/ui/primitives";
import { Modal } from "../../components/ui/Modal";
import { useAuth } from "../../context/AuthContext";
import { isSuperAdmin } from "../../lib/permissions";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";

/**
 * Whole-database backup/restore — deliberately Super Admin only, and kept
 * out of the configurable Roles & Permissions system entirely, since it
 * bypasses the app's own access rules rather than being governed by them.
 * Restore is a full replace: whatever is in the uploaded file becomes the
 * entire database, verbatim. File attachments themselves live in separate
 * storage and aren't included — only their records are.
 */
export default function BackupSettingsPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const restoreBackup = useRestoreBackup();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [downloading, setDownloading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  if (!isSuperAdmin(user)) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8" />}
          title="Super Admin access required"
          description="Only a Super Admin can back up or restore the database."
        />
      </div>
    );
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadBackup();
    } catch (err) {
      push({ variant: "error", title: "Backup failed", description: extractApiError(err).message });
    } finally {
      setDownloading(false);
    }
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingFile(file);
    setConfirmText("");
    setConfirmOpen(true);
  }

  async function handleRestore() {
    if (!pendingFile) return;
    try {
      const result = await restoreBackup.mutateAsync({ file: pendingFile, confirmText: confirmText.trim() });
      push({ variant: "success", title: "Database restored.", description: `${result.restoredModels.length} table(s) reloaded from the backup.` });
      setConfirmOpen(false);
      setPendingFile(null);
      setConfirmText("");
    } catch (err) {
      push({ variant: "error", title: "Restore failed", description: extractApiError(err).message });
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Backup &amp; Restore</h1>
        <p className="text-sm text-slate-500">
          A full copy of every record in the database — every project, task, user, customer and setting. File attachments themselves live in separate
          storage and aren't included, only their records.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <DatabaseBackup className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Download a backup</p>
            <p className="mt-0.5 text-xs text-slate-500">Saves everything as one JSON file to your computer. Keep it somewhere safe — it contains all data in the system.</p>
          </div>
          <Button onClick={handleDownload} loading={downloading}>
            <Download className="h-4 w-4" /> Download Backup
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50/50 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <Upload className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Restore from a backup file</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Replaces <strong>everything</strong> currently in the database with exactly what's in the file — this cannot be undone. Only use this to
              recover from a genuine backup.
            </p>
          </div>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFilePicked} />
          <Button variant="danger" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Upload Backup
          </Button>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (restoreBackup.isPending) return;
          setConfirmOpen(false);
          setPendingFile(null);
          setConfirmText("");
        }}
        title="Restore database from backup"
        size="sm"
      >
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              You're about to permanently erase all current data and replace it with the contents of <strong>{pendingFile?.name}</strong>. This cannot be
              undone.
            </p>
            <div>
              <Label>
                Type <span className="font-mono font-semibold text-slate-800">RESTORE</span> to confirm
              </Label>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE" autoFocus />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={restoreBackup.isPending}
            onClick={() => {
              setConfirmOpen(false);
              setPendingFile(null);
              setConfirmText("");
            }}
          >
            Cancel
          </Button>
          <Button variant="danger" disabled={confirmText.trim() !== "RESTORE"} loading={restoreBackup.isPending} onClick={handleRestore}>
            Restore database
          </Button>
        </div>
      </Modal>
    </div>
  );
}
