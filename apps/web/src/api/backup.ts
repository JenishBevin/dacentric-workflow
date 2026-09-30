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

export interface ProjectStageMigrationChange {
  boardId: string;
  name: string;
  stageName: string;
}
export interface ProjectStageMigrationResult {
  changes: ProjectStageMigrationChange[];
}

/** One-off tool: sets a sensible initial Projects-page Stage for projects
 * that predate request 1005 (still unset/"Backlog" by default) based on
 * whether their own tasks are actually done — see migrateProjectStages on
 * the backend for the full story. Not auto-run; only fetches when asked. */
export function usePreviewProjectStageMigration(enabled: boolean) {
  return useQuery({
    queryKey: ["project-stage-migration-preview"],
    queryFn: async () => (await api.get<{ data: ProjectStageMigrationResult }>("/backup/migrate-project-stages")).data.data,
    enabled,
  });
}

export function useApplyProjectStageMigration() {
  return useMutation({
    mutationFn: async () => (await api.post<{ data: ProjectStageMigrationResult }>("/backup/migrate-project-stages")).data.data,
  });
}

export interface ProjectCustomerReconcileChange {
  boardId: string;
  boardName: string;
  boardCustomerBefore: string | null;
  taskCustomerName: string | null;
}
export interface ProjectCustomerReconcileResult {
  changes: ProjectCustomerReconcileChange[];
}

/** One-off tool: a project's own customer (Projects list, Accounts, Board
 * Settings, ...) is copied from its anchor task's customer once, at award
 * time, and wasn't editable on the task itself until this fix shipped — so
 * any project whose anchor task's customer was since changed some other way
 * is still showing a stale customer everywhere but the task. This makes the
 * board match its anchor task. See reconcileProjectCustomers on the backend
 * for the full story. Not auto-run; only fetches when asked. */
export function usePreviewProjectCustomerReconcile(enabled: boolean) {
  return useQuery({
    queryKey: ["project-customer-reconcile-preview"],
    queryFn: async () => (await api.get<{ data: ProjectCustomerReconcileResult }>("/backup/reconcile-project-customers")).data.data,
    enabled,
  });
}

export function useApplyProjectCustomerReconcile() {
  return useMutation({
    mutationFn: async () => (await api.post<{ data: ProjectCustomerReconcileResult }>("/backup/reconcile-project-customers")).data.data,
  });
}
