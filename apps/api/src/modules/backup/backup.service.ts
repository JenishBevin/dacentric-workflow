import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { SYSTEM_BOARD_NAMES } from "../boards/boards.service";

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

export interface ProjectStageMigrationChange {
  boardId: string;
  name: string;
  stageName: string; // the ProjectStage it was (or would be) moved to
}
export interface ProjectStageMigrationResult {
  changes: ProjectStageMigrationChange[];
}

/**
 * One-off maintenance tool (Settings -> Backup & Restore -> "Set initial
 * project stage"): request 1005 added the Projects page's own company-wide
 * Kanban stage (Backlog/To Do/In Progress/Done, customisable) — a separate,
 * manually-set field from a project's own task pipeline. Every project that
 * existed before that feature shipped has projectStageId: null, so it shows
 * up under "Backlog" on the Projects page regardless of how far along its
 * actual tasks are — misleading on day one. This is a one-time, best-effort
 * initializer: for each project that's never had its stage touched
 * (projectStageId still null), look at its own tasks — if every one sits on
 * a terminal (Done-type) board stage, move it to the "Done" project stage;
 * if it has tasks but they're not all finished, move it to "In Progress";
 * a project with no tasks yet is left alone. Going forward this field stays
 * a manual label, same as request 1005 always intended — this only backfills
 * the ones that predate it.
 */
export async function migrateProjectStages(apply: boolean): Promise<ProjectStageMigrationResult> {
  const stages = await prisma.projectStage.findMany({ orderBy: { position: "asc" } });
  const doneStage = stages.find((s) => s.name.toLowerCase() === "done") ?? stages[stages.length - 1];
  const inProgressStage = stages.find((s) => s.name.toLowerCase() === "in progress") ?? stages[Math.min(1, stages.length - 1)];
  if (!doneStage || !inProgressStage) return { changes: [] };

  const boards = await prisma.board.findMany({
    where: {
      isDeleted: false,
      isCompleted: false,
      isArchived: false,
      projectStageId: null,
      name: { notIn: SYSTEM_BOARD_NAMES },
    },
    select: {
      id: true,
      name: true,
      tasks: { where: { isDeleted: false }, select: { stage: { select: { isTerminal: true } } } },
    },
  });

  const changes: ProjectStageMigrationChange[] = [];
  for (const b of boards) {
    if (b.tasks.length === 0) continue; // nothing to infer from — leave at Backlog
    const allDone = b.tasks.every((t) => t.stage.isTerminal);
    const target = allDone ? doneStage : inProgressStage;
    changes.push({ boardId: b.id, name: b.name, stageName: target.name });
    if (apply) await prisma.board.update({ where: { id: b.id }, data: { projectStageId: target.id } });
  }

  return { changes };
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

/**
 * One-off maintenance tool (Settings -> Backup & Restore -> "Sync project
 * customers"): a Project board's own customer (shown on the Projects list,
 * Accounts page, Board Settings, ...) is copied from its anchor task's
 * customer once, at award time — see createProjectFromAwardedTask in
 * tasks.service.ts. Editing either side now keeps them in sync going
 * forward (same file's updateTask, and updateBoard in boards.service.ts),
 * but a task's customer wasn't editable in the UI at all until this fix
 * shipped, so any project whose anchor task's customer was changed before
 * then is still showing a stale customer everywhere except the task itself.
 * This finds every such project and makes the board match its anchor task
 * (the direction that matches how this drifted — see the two call sites
 * above for why the anchor task, not any other task, is what's compared).
 */
export async function reconcileProjectCustomers(apply: boolean): Promise<ProjectCustomerReconcileResult> {
  const boards = await prisma.board.findMany({
    where: { isDeleted: false, name: { notIn: SYSTEM_BOARD_NAMES } },
    select: {
      id: true,
      name: true,
      customerId: true,
      customer: { select: { name: true } },
      tasks: { where: { isDeleted: false }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true, customerId: true, customer: { select: { name: true } } } },
    },
  });

  const changes: ProjectCustomerReconcileChange[] = [];
  for (const b of boards) {
    const anchorTask = b.tasks[0];
    if (!anchorTask) continue;
    if (anchorTask.customerId === b.customerId) continue;
    changes.push({
      boardId: b.id,
      boardName: b.name,
      boardCustomerBefore: b.customer?.name ?? null,
      taskCustomerName: anchorTask.customer?.name ?? null,
    });
    if (apply) await prisma.board.update({ where: { id: b.id }, data: { customerId: anchorTask.customerId } });
  }

  return { changes };
}
