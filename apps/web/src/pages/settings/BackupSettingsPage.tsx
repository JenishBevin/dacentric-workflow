import React, { useRef, useState } from "react";
import { DatabaseBackup, Download, Upload, AlertTriangle, ShieldAlert, Wrench, Kanban } from "lucide-react";
import {
  downloadBackup,
  useRestoreBackup,
  usePreviewIdCleanup,
  useApplyIdCleanup,
  IdCleanupResult,
  usePreviewProjectStageMigration,
  useApplyProjectStageMigration,
  ProjectStageMigrationResult,
} from "../../api/backup";
import { Button, EmptyState, Input, Label, Badge } from "../../components/ui/primitives";
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

  const [previewRequested, setPreviewRequested] = useState(false);
  const { data: preview, isLoading: previewLoading, refetch: refetchPreview } = usePreviewIdCleanup(previewRequested);
  const applyCleanup = useApplyIdCleanup();
  const [applied, setApplied] = useState<IdCleanupResult | null>(null);

  const [stagePreviewRequested, setStagePreviewRequested] = useState(false);
  const { data: stagePreview, isLoading: stagePreviewLoading, refetch: refetchStagePreview } = usePreviewProjectStageMigration(stagePreviewRequested);
  const applyStageMigration = useApplyProjectStageMigration();
  const [stageApplied, setStageApplied] = useState<ProjectStageMigrationResult | null>(null);

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

  async function handleCheckIds() {
    setApplied(null);
    if (!previewRequested) {
      setPreviewRequested(true);
    } else {
      await refetchPreview();
    }
  }

  async function handleApplyIdFix() {
    try {
      const result = await applyCleanup.mutateAsync();
      setApplied(result);
      push({ variant: "success", title: `Fixed ${result.changes.length} id${result.changes.length === 1 ? "" : "s"}.` });
    } catch (err) {
      push({ variant: "error", title: "Could not apply fix", description: extractApiError(err).message });
    }
  }

  async function handleCheckStages() {
    setStageApplied(null);
    if (!stagePreviewRequested) {
      setStagePreviewRequested(true);
    } else {
      await refetchStagePreview();
    }
  }

  async function handleApplyStageMigration() {
    try {
      const result = await applyStageMigration.mutateAsync();
      setStageApplied(result);
      push({ variant: "success", title: `Set ${result.changes.length} project${result.changes.length === 1 ? "" : "s"}' stage.` });
    } catch (err) {
      push({ variant: "error", title: "Could not set project stages", description: extractApiError(err).message });
    }
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

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Wrench className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Fix imported IDs</p>
            <p className="mt-0.5 text-xs text-slate-500">
              A bulk-imported Estimation or Project ID that has a stray space in it (e.g. from the source spreadsheet) won't turn up in the header search
              bar. This checks for any and removes just the extra spaces — nothing else about the record changes.
            </p>
          </div>
          <Button variant="outline" onClick={handleCheckIds} loading={previewLoading}>
            Check for spaced IDs
          </Button>
        </div>

        {previewRequested && !previewLoading && preview && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            {preview.changes.length === 0 && preview.conflicts.length === 0 ? (
              <p className="text-sm text-slate-500">No spaced IDs found — nothing to fix.</p>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">
                    Found {preview.changes.length} id{preview.changes.length === 1 ? "" : "s"} to fix
                    {preview.conflicts.length > 0 && `, ${preview.conflicts.length} skipped (needs manual review)`}
                  </p>
                  {!applied && preview.changes.length > 0 && (
                    <Button size="sm" loading={applyCleanup.isPending} onClick={handleApplyIdFix}>
                      Fix {preview.changes.length} id{preview.changes.length === 1 ? "" : "s"}
                    </Button>
                  )}
                  {applied && <Badge tone="green">Fixed</Badge>}
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 text-xs">
                  {preview.changes.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50">
                      <Badge tone="slate">{c.kind}</Badge>
                      <span className="min-w-0 flex-1 truncate text-slate-400" title={c.label}>
                        {c.label}
                      </span>
                      <span className="font-mono text-slate-500 line-through">{c.before}</span>
                      <span className="font-mono font-medium text-slate-800">{c.after}</span>
                    </div>
                  ))}
                  {preview.conflicts.map((c, i) => (
                    <div key={`conflict-${i}`} className="flex items-center gap-2 rounded bg-red-50 px-1.5 py-1">
                      <Badge tone="red">Conflict</Badge>
                      <span className="min-w-0 flex-1 truncate text-slate-400" title={c.label}>
                        {c.label}
                      </span>
                      <span className="font-mono text-slate-500">{c.before}</span>
                      <span className="text-red-600">would collide — left as-is</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Kanban className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Set initial project stage</p>
            <p className="mt-0.5 text-xs text-slate-500">
              The Projects page's own Stage column (Backlog/To Do/In Progress/Done) is separate from a project's own task
              pipeline — every project that existed before it shipped defaults to "Backlog" regardless of real progress.
              One-time only: sets it to "Done" for projects whose tasks are all finished, "In Progress" otherwise. Projects
              with no tasks yet, or a stage you've already set by hand, are left alone.
            </p>
          </div>
          <Button variant="outline" onClick={handleCheckStages} loading={stagePreviewLoading}>
            Check projects
          </Button>
        </div>

        {stagePreviewRequested && !stagePreviewLoading && stagePreview && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            {stagePreview.changes.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing to set — every project already has a stage, or has no tasks yet.</p>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">
                    {stagePreview.changes.length} project{stagePreview.changes.length === 1 ? "" : "s"} will get a stage set
                  </p>
                  {!stageApplied && (
                    <Button size="sm" loading={applyStageMigration.isPending} onClick={handleApplyStageMigration}>
                      Set {stagePreview.changes.length} project{stagePreview.changes.length === 1 ? "" : "s"}
                    </Button>
                  )}
                  {stageApplied && <Badge tone="green">Done</Badge>}
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 text-xs">
                  {stagePreview.changes.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50">
                      <span className="min-w-0 flex-1 truncate text-slate-600" title={c.name}>
                        {c.name}
                      </span>
                      <Badge tone={c.stageName.toLowerCase() === "done" ? "green" : "amber"}>{c.stageName}</Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
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
