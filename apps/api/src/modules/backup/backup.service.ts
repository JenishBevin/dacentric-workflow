import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";

// A full logical (row-data) backup of every table Prisma knows about — not
// a pg_dump. Table order is derived from the schema's own foreign keys at
// runtime (topological sort) rather than hand-maintained, so it never drifts
// out of sync as models are added. File attachments themselves live in
// external storage (see storageKey on TaskAttachment etc.), not in Postgres,
// so they aren't part of this — only their metadata rows are.
export const BACKUP_FORMAT_VERSION = 1;

interface DmmfField {
  name: string;
  kind: string;
  type: string;
  relationFromFields?: string[];
  hasDefaultValue?: boolean;
  default?: unknown;
}

function getModels() {
  return Prisma.dmmf.datamodel.models as unknown as Array<{ name: string; fields: DmmfField[] }>;
}

/** Parent-before-child order, derived from which models own an FK to which. */
function getDependencyOrder(): string[] {
  const models = getModels();
  const names = new Set(models.map((m) => m.name));
  const dependsOn = new Map<string, Set<string>>();
  for (const m of models) dependsOn.set(m.name, new Set());

  for (const m of models) {
    for (const f of m.fields) {
      if (f.kind === "object" && f.relationFromFields && f.relationFromFields.length > 0 && f.type !== m.name && names.has(f.type)) {
        dependsOn.get(m.name)!.add(f.type);
      }
    }
  }

  const ordered: string[] = [];
  const done = new Set<string>();
  const inProgress = new Set<string>();

  function visit(name: string) {
    if (done.has(name) || inProgress.has(name)) return;
    inProgress.add(name);
    for (const dep of dependsOn.get(name) ?? []) visit(dep);
    inProgress.delete(name);
    done.add(name);
    ordered.push(name);
  }

  for (const m of models) visit(m.name);
  return ordered;
}

function accessorFor(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function dateTimeFieldsFor(modelName: string): string[] {
  const model = getModels().find((m) => m.name === modelName);
  if (!model) return [];
  return model.fields.filter((f) => f.kind === "scalar" && f.type === "DateTime").map((f) => f.name);
}

function autoincrementColumns(): Array<{ model: string; field: string }> {
  const result: Array<{ model: string; field: string }> = [];
  for (const m of getModels()) {
    for (const f of m.fields) {
      if (f.hasDefaultValue && typeof f.default === "object" && f.default !== null && (f.default as any).name === "autoincrement") {
        result.push({ model: m.name, field: f.name });
      }
    }
  }
  return result;
}

export async function buildBackup() {
  const order = getDependencyOrder();
  const data: Record<string, unknown[]> = {};
  for (const name of order) {
    data[name] = await (prisma as any)[accessorFor(name)].findMany();
  }
  return {
    meta: {
      exportedAt: new Date().toISOString(),
      formatVersion: BACKUP_FORMAT_VERSION,
      modelOrder: order,
    },
    data,
  };
}

interface BackupFile {
  meta?: { formatVersion?: number; modelOrder?: string[] };
  data?: Record<string, unknown[]>;
}

/** Wipes every table this backup covers and reloads it row-for-row, exactly
 * as captured — a full replace, not a merge. Runs as one transaction so a
 * bad or truncated file rolls back instead of leaving a half-restored
 * database. */
export async function restoreBackup(file: BackupFile) {
  if (!file || typeof file !== "object" || !file.data || typeof file.data !== "object") {
    throw Errors.badRequest("This doesn't look like a backup file — no data section found.");
  }

  const liveOrder = getDependencyOrder();
  const order = liveOrder.filter((name) => Array.isArray(file.data![name]));
  const unknownModels = Object.keys(file.data).filter((name) => !liveOrder.includes(name));

  if (order.length === 0) {
    throw Errors.badRequest("This backup file has no recognizable tables for the current database schema.");
  }

  await prisma.$transaction(
    async (tx) => {
      for (const name of [...order].reverse()) {
        await (tx as any)[accessorFor(name)].deleteMany({});
      }

      for (const name of order) {
        const rows = file.data![name] as Array<Record<string, unknown>>;
        if (!rows.length) continue;
        const dateFields = dateTimeFieldsFor(name);
        const prepared = rows.map((row) => {
          if (dateFields.length === 0) return row;
          const copy = { ...row };
          for (const field of dateFields) {
            if (copy[field] != null) copy[field] = new Date(copy[field] as string);
          }
          return copy;
        });
        await (tx as any)[accessorFor(name)].createMany({ data: prepared });
      }

      for (const { model, field } of autoincrementColumns()) {
        if (!order.includes(model)) continue;
        await tx.$executeRawUnsafe(
          `SELECT setval(pg_get_serial_sequence('"${model}"', '${field}'), COALESCE((SELECT MAX("${field}") FROM "${model}"), 1), (SELECT MAX("${field}") FROM "${model}") IS NOT NULL)`
        );
      }
    },
    { timeout: 10 * 60 * 1000, maxWait: 60 * 1000 }
  );

  return { restoredModels: order, skippedUnknownModels: unknownModels };
}

export interface IdCleanupChange {
  kind: "Estimation" | "Project";
  label: string; // the board/estimation's own name/title, for context
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

/**
 * One-off maintenance tool (Settings -> Backup & Restore -> "Fix imported
 * IDs"): a bulk import of the Estimations/Awarded Projects sheet takes
 * Estimation ID and Project ID verbatim from the spreadsheet cell (see
 * importEstimationsFromExcel in tasks.service.ts) rather than
 * auto-generating them, since it's backfilling real historical reference
 * numbers — so a stray space typed into the source spreadsheet lands
 * straight in the stored id and silently breaks the header search bar's
 * exact-match lookup (it compacts whatever you type before comparing, but
 * can't compact what's actually stored). `apply: false` only reports what
 * it would change; `apply: true` writes it. A collision (two different
 * original ids that would collapse to the same clean value) is reported
 * and left untouched rather than guessed at.
 */
export async function cleanUpImportedIds(apply: boolean): Promise<IdCleanupResult> {
  const changes: IdCleanupChange[] = [];
  const conflicts: IdCleanupConflict[] = [];

  const estimations = await prisma.estimationRecord.findMany({
    where: { estimationId: { contains: " " } },
    select: { id: true, estimationId: true, task: { select: { title: true } } },
  });
  for (const e of estimations) {
    const clean = e.estimationId.replace(/\s+/g, "");
    const collision = await prisma.estimationRecord.findFirst({ where: { estimationId: clean, id: { not: e.id } } });
    if (collision) {
      conflicts.push({ kind: "Estimation", label: e.task.title, before: e.estimationId, wouldBecome: clean });
      continue;
    }
    changes.push({ kind: "Estimation", label: e.task.title, before: e.estimationId, after: clean });
    if (apply) await prisma.estimationRecord.update({ where: { id: e.id }, data: { estimationId: clean } });
  }

  const boards = await prisma.board.findMany({
    where: { boardId: { contains: " " } },
    select: { id: true, boardId: true, name: true },
  });
  for (const b of boards) {
    const clean = b.boardId.replace(/\s+/g, "");
    const collision = await prisma.board.findFirst({ where: { boardId: clean, id: { not: b.id } } });
    if (collision) {
      conflicts.push({ kind: "Project", label: b.name, before: b.boardId, wouldBecome: clean });
      continue;
    }
    changes.push({ kind: "Project", label: b.name, before: b.boardId, after: clean });
    if (apply) await prisma.board.update({ where: { id: b.id }, data: { boardId: clean } });
  }

  return { changes, conflicts };
}
