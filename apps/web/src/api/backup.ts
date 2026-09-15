import { useMutation } from "@tanstack/react-query";
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
