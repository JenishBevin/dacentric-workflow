import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/apiClient";
import { downloadExport } from "./misc";

/** Downloads the full database as one JSON file — Super Admin only, enforced
 * server-side regardless of what's shown here. */
export async function downloadBackup() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  await downloadExport("/backup/export", {}, `qplus-backup-${stamp}.json`);
}

export interface RestoreBackupResult {
  restoredModels: string[];
  skippedUnknownModels: string[];
}

/** Wipes every table the file covers and reloads it verbatim — a full
 * replace, not a merge. `confirmText` must be the literal string "RESTORE",
 * checked again server-side, so this can't fire by accident. */
export function useRestoreBackup() {
  return useMutation({
    mutationFn: async ({ file, confirmText }: { file: File; confirmText: string }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("confirmText", confirmText);
      return (await api.post<{ data: RestoreBackupResult }>("/backup/import", form, { headers: { "Content-Type": "multipart/form-data" } })).data.data;
    },
  });
}

export interface IdCleanupChange {
  kind: "Estimation" | "Project";
  label: string;
  before: string;
  after: string;
}
export interface IdCleanupConflict {
  kind: "Estimation" | "Project";
  label: string;
  before: string;
  wouldBecome: string;
}
export interface IdCleanupResult {
  changes: IdCleanupChange[];
  conflicts: IdCleanupConflict[];
}

/** One-off tool: previews (does not write) the Estimation/Project IDs a
 * bulk import left with a stray space in them — see cleanUpImportedIds on
 * the backend for the full story. Not auto-run; only fetches when asked. */
export function usePreviewIdCleanup(enabled: boolean) {
  return useQuery({
    queryKey: ["id-cleanup-preview"],
    queryFn: async () => (await api.get<{ data: IdCleanupResult }>("/backup/fix-imported-ids")).data.data,
    enabled,
  });
}

export function useApplyIdCleanup() {
  return useMutation({
    mutationFn: async () => (await api.post<{ data: IdCleanupResult }>("/backup/fix-imported-ids")).data.data,
  });
}
