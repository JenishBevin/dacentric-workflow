import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { notify, notifyMany } from "../notifications/notifications.service";
import { sanitizeDescription } from "../../common/richtext";
import { loadTaskWithAccess, assertCanEditTask, assertCanDeleteTask } from "./task-access";
import { AuthedUser } from "../../middleware/authenticate";
import { computeDueDateStatus } from "./task-formatting";
import { formatTaskId, formatProjectId, formatEstimationId, formatEnquiryId, formatProcurementId, AuditAction, TaskApprovalStatus, TaskType, TaskPriority, NotificationEvent, RoleCode, PermissionKey, BoardType } from "@dacentric/types";
import { getPermissionScope, scopeAtLeast, isSystemLevelAdmin } from "../../common/permissions";
import { createRecurringSeries, attachTemplateAndScheduleFirst } from "../recurrence/recurrence.service";
import { DEFAULT_STAGES, getOrCreateEstimationBoard, ESTIMATION_BOARD_NAME, getOrCreateEnquiryBoard, ACCOUNTS_BOARD_NAME, getOrCreatePersonalBoard } from "../boards/boards.service";
import { nextYearlySequence } from "../../common/sequence";

export interface CreateTaskInput {
  boardId?: string;
  stageId?: string;
  serviceId?: string;
  customerId?: string | null;
  title: string;
  description?: string;
  priority: string;
  assigneeUserIds: string[];
  startDate?: Date | null;
  dueDate?: Date | null;
  estimatedEffortHours?: number | null;
  checklist?: Array<{ text: string; ownerId?: string }>;
  tagIds?: string[];
  linkedRecordId?: string;
  watcherUserIds?: string[];
  requiresApproval?: boolean;
  approverUserId?: string;
  recurring?: {
    frequency: string;
    customIntervalDays?: number;
    endType: string;
    occurrencesLimit?: number;
    endDate?: Date;
  };
  dependencies?: Array<{ type: string; taskId: string }>;
}

// Assigns the next QPTS-2026-0001-style id the first time a task lands on
// the Estimation board — created directly there, or Awarded onto it from
// Enquiry List. Kept forever after, even once the task is later Awarded on
// into a real Project, as a permanent record of its estimation phase.
async function ensureEstimationRecord(tx: any, taskId: string) {
  const existing = await tx.estimationRecord.findUnique({ where: { taskId } });
  if (existing) return existing;
  const year = new Date().getFullYear();
  const sequence = await nextYearlySequence("ESTIMATION", year, tx);
  return tx.estimationRecord.create({ data: { taskId, year, sequence, estimationId: formatEstimationId(year, sequence) } });
}

export interface QuotationLineItemInput {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export interface SaveEstimationQuoteInput {
  currency: string;
  title?: string;
  quotationRef?: string;
  recipientName?: string;
  recipientCompany?: string;
  recipientLocation?: string;
  lineItems: QuotationLineItemInput[];
  vatRate: number;
  validityDays?: number;
  paymentTerms?: string;
  preparerName?: string;
  preparerDesignation?: string;
  preparerMobile?: string;
}

/** The "Create Quotation" popup on an Estimation-board task, rendered onto
 * the company's fixed letterhead template client-side — multi-currency
 * (default AED, per the frontend), with VAT computed server-side from
 * whatever rate the client sends (5% is only a suggested default for AED,
 * applied client-side, not hard-coded here). */
export async function saveEstimationQuote(taskId: string, input: SaveEstimationQuoteInput, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanEditTask(ctx);

  if (ctx.task.board?.name !== ESTIMATION_BOARD_NAME) {
    throw Errors.badRequest("Quotations can only be created while a task is on the Estimation board.");
  }

  const estimationRecord = await ensureEstimationRecord(prisma, taskId);

  const subtotal = Math.round(input.lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0) * 100) / 100;
  const vatAmount = Math.round(subtotal * (input.vatRate / 100) * 100) / 100;
  const totalAmount = Math.round((subtotal + vatAmount) * 100) / 100;

  const updated = await prisma.estimationRecord.update({
    where: { id: estimationRecord.id },
    data: {
      currency: input.currency,
      title: input.title,
      quotationRef: input.quotationRef,
      recipientName: input.recipientName,
      recipientCompany: input.recipientCompany,
      recipientLocation: input.recipientLocation,
      lineItems: input.lineItems as any,
      subtotal,
      vatRate: input.vatRate,
      vatAmount,
      totalAmount,
      validityDays: input.validityDays ?? 7,
      paymentTerms: input.paymentTerms,
      preparerName: input.preparerName,
      preparerDesignation: input.preparerDesignation,
      preparerMobile: input.preparerMobile,
      quotedAt: new Date(),
      quotedById: actor.id,
    },
  });

  await writeAudit({
    actor,
    action: AuditAction.EDIT,
    entityType: "EstimationRecord",
    entityId: updated.id,
    boardId: ctx.task.boardId,
    field: "quotation",
    afterValue: { currency: updated.currency, subtotal: updated.subtotal, vatRate: updated.vatRate, vatAmount: updated.vatAmount, totalAmount: updated.totalAmount },
  });

  return updated;
}

// Same idea, for a task's first (and only ever) landing on the Enquiry List
// board — there's no upstream stage before it, so this only ever runs at
// creation time.
async function ensureEnquiryRecord(tx: any, taskId: string) {
  const existing = await tx.enquiryRecord.findUnique({ where: { taskId } });
  if (existing) return existing;
  const year = new Date().getFullYear();
  const sequence = await nextYearlySequence("ENQUIRY", year, tx);
  return tx.enquiryRecord.create({ data: { taskId, year, sequence, enquiryId: formatEnquiryId(year, sequence) } });
}

// Append-only stage-change log backing a project's/enquiry's full journey
// (Enquiry -> Estimation -> Won -> Implementation -> ..., whatever stage
// names that board actually uses) — see TaskStatusHistory in schema.prisma.
async function recordStatusHistory(taskId: string, stageName: string, actor: AuthedUser, comment?: string) {
  await prisma.taskStatusHistory.create({ data: { taskId, stageName, comment, updatedById: actor.id } });
}

// The Activity Log should read like a sentence a human wrote, not a diff of
// database ids — resolve the handful of task fields that store a raw
// customer/user id into that record's display name before it's audited.
async function resolveTaskAuditValue(field: string, value: unknown): Promise<unknown> {
  if (value == null || typeof value !== "string") return value;
  if (field === "customerId") {
    const customer = await prisma.customer.findUnique({ where: { id: value }, select: { name: true, customerId: true } });
    return customer ? `${customer.name} (${customer.customerId})` : value;
  }
  if (field === "approverUserId") {
    const user = await prisma.user.findUnique({ where: { id: value }, select: { name: true } });
    return user?.name ?? value;
  }
  return value;
}

async function assertActiveWorkflowUsers(userIds: string[]) {
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  if (users.length !== userIds.length) throw Errors.badRequest("One or more selected people could not be found.");
  const invalid = users.filter((u) => u.status !== "ACTIVE" || !u.moduleAccess.includes("WORKFLOW"));
  if (invalid.length) {
    throw Errors.badRequest(
      `Only active employees with Workflow access can be selected (invalid: ${invalid.map((u) => u.name).join(", ")}).`
    );
  }
}

export async function createTask(input: CreateTaskInput, actor: AuthedUser) {
  await assertActiveWorkflowUsers(input.assigneeUserIds);
  if (input.approverUserId) await assertActiveWorkflowUsers([input.approverUserId]);

  const boardId = input.boardId ?? (await getOrCreatePersonalBoard(actor)).id;

  const board = await prisma.board.findFirst({ where: { id: boardId, isDeleted: false } });
  if (!board) throw Errors.notFound("Board");

  const stage = input.stageId
    ? await prisma.boardStage.findFirst({ where: { id: input.stageId, boardId } })
    : await prisma.boardStage.findFirst({ where: { boardId }, orderBy: { position: "asc" } });
  if (!stage) throw Errors.badRequest("Selected board has no stages configured.");

  let seriesId: string | undefined;
  if (input.recurring) {
    const series = await createRecurringSeries(boardId, input.recurring, actor);
    seriesId = series.id;
  }

  const task = await prisma.$transaction(async (tx) => {
    const placeholderId = `TEMP-${Date.now()}-${Math.random()}`;
    const created = await tx.task.create({
      data: {
        boardId,
        stageId: stage.id,
        serviceId: input.serviceId ?? null,
        customerId: input.customerId ?? null,
        title: input.title,
        description: sanitizeDescription(input.description),
        priority: input.priority as any,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        estimatedEffortHours: input.estimatedEffortHours ?? null,
        createdById: actor.id,
        requiresApproval: input.requiresApproval ?? false,
        approverUserId: input.requiresApproval ? input.approverUserId : null,
        taskId: placeholderId,
        taskType: seriesId ? TaskType.RECURRING_INSTANCE : TaskType.STANDARD,
        seriesId,
        assignees: {
          create: input.assigneeUserIds.map((userId, idx) => ({ userId, isPrimary: idx === 0 })),
        },
        watchers: input.watcherUserIds?.length
          ? { create: input.watcherUserIds.filter((id) => !input.assigneeUserIds.includes(id)).map((userId) => ({ userId })) }
          : undefined,
        checklistItems: input.checklist?.length
          ? { create: input.checklist.map((c, idx) => ({ text: c.text, ownerId: c.ownerId, position: idx })) }
          : undefined,
        tags: input.tagIds?.length ? { create: input.tagIds.map((tagId) => ({ tagId })) } : undefined,
        linkedRecord: input.linkedRecordId ? { create: { linkedRecordId: input.linkedRecordId } } : undefined,
      },
    });
    const finalTaskId = formatTaskId(created.taskNumber);
    const updatedTask = await tx.task.update({ where: { id: created.id }, data: { taskId: finalTaskId } });
    if (board.name === ESTIMATION_BOARD_NAME) {
      await ensureEstimationRecord(tx, updatedTask.id);
    } else if (board.name === "Enquiry List") {
      await ensureEnquiryRecord(tx, updatedTask.id);
    }
    return updatedTask;
  });

  await recordStatusHistory(task.id, stage.name, actor);

  if (input.dependencies?.length) {
    for (const dep of input.dependencies) {
      await addDependencyInternal(task.id, dep.type as any, dep.taskId);
    }
  }

  if (seriesId) {
    await attachTemplateAndScheduleFirst(seriesId, {
      title: input.title,
      description: task.description,
      priority: input.priority,
      boardId,
      stageId: stage.id,
      assigneeUserIds: input.assigneeUserIds,
      estimatedEffortHours: input.estimatedEffortHours ?? undefined,
      checklist: input.checklist,
      tagIds: input.tagIds,
      requiresApproval: input.requiresApproval,
      approverUserId: input.approverUserId,
      createdById: actor.id,
    });
  }

  await writeAudit({
    actor,
    action: AuditAction.CREATE,
    entityType: "Task",
    entityId: task.id,
    boardId,
    afterValue: { title: task.title, taskId: task.taskId },
  });

  await notifyMany(input.assigneeUserIds, {
    event: NotificationEvent.TASK_ASSIGNED,
    title: `You were assigned to ${task.taskId}: ${task.title}`,
    taskId: task.id,
    boardId,
  });

  if (input.requiresApproval && input.approverUserId) {
    // Approver is only notified once the task actually reaches Pending Approval (UC-09),
    // not at creation time, so nothing is sent here.
  }

  return getTaskDetail(task.id, actor);
}

async function addDependencyInternal(sourceTaskId: string, type: "BLOCKED_BY" | "BLOCKS", targetTaskId: string) {
  if (sourceTaskId === targetTaskId) throw Errors.badRequest("A task cannot depend on itself.");
  // Prevent a direct circular pair (A blocked-by B while B is already blocked-by A).
  const inverseType = type === "BLOCKED_BY" ? "BLOCKS" : "BLOCKED_BY";
  const existingInverse = await prisma.taskDependency.findFirst({
    where: { sourceTaskId: targetTaskId, targetTaskId: sourceTaskId, type: inverseType as any },
  });
  if (existingInverse) {
    throw Errors.conflict("This would create a circular dependency between these two tasks.");
  }
  await prisma.taskDependency.create({ data: { sourceTaskId, targetTaskId, type: type as any } });
}

function serializeTask(task: any) {
  const checklistTotal = task.checklistItems?.length ?? 0;
  const checklistDone = task.checklistItems?.filter((c: any) => c.isComplete).length ?? 0;
  return {
    id: task.id,
    taskId: task.taskId,
    title: task.title,
    description: task.description,
    boardId: task.boardId,
    board: task.board ? { id: task.board.id, name: task.board.name } : undefined,
    stageId: task.stageId,
    stage: task.stage ? { id: task.stage.id, name: task.stage.name, color: task.stage.color, isTerminal: task.stage.isTerminal } : undefined,
    serviceId: task.serviceId,
    service: task.service ? { id: task.service.id, name: task.service.name } : undefined,
    customerId: task.customerId ?? null,
    customer: task.customer ? { id: task.customer.id, customerId: task.customer.customerId, name: task.customer.name } : null,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    dueDateStatus: computeDueDateStatus(task.dueDate, task.isCompleted),
    estimatedEffortHours: task.estimatedEffortHours,
    createdById: task.createdById,
    createdBy: task.createdBy ? { id: task.createdBy.id, name: task.createdBy.name } : undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    version: task.version,
    taskType: task.taskType,
    seriesId: task.seriesId,
    isCompleted: task.isCompleted,
    isHighlighted: task.isHighlighted,
    estimationId: task.estimationRecord?.estimationId ?? null,
    quotation: task.estimationRecord?.subtotal != null
      ? {
          currency: task.estimationRecord.currency,
          title: task.estimationRecord.title,
          quotationRef: task.estimationRecord.quotationRef,
          recipientName: task.estimationRecord.recipientName,
          recipientCompany: task.estimationRecord.recipientCompany,
          recipientLocation: task.estimationRecord.recipientLocation,
          lineItems: (task.estimationRecord.lineItems as any) ?? [],
          subtotal: task.estimationRecord.subtotal,
          vatRate: task.estimationRecord.vatRate,
          vatAmount: task.estimationRecord.vatAmount,
          totalAmount: task.estimationRecord.totalAmount,
          validityDays: task.estimationRecord.validityDays,
          paymentTerms: task.estimationRecord.paymentTerms,
          preparerName: task.estimationRecord.preparerName,
          preparerDesignation: task.estimationRecord.preparerDesignation,
          preparerMobile: task.estimationRecord.preparerMobile,
          quotedAt: task.estimationRecord.quotedAt,
        }
      : null,
    enquiryId: task.enquiryRecord?.enquiryId ?? null,
    requiresApproval: task.requiresApproval,
    approverUserId: task.approverUserId,
    approvalStatus: task.approvalStatus,
    lostApprovalStatus: task.lostApprovalStatus,
    lostReason: task.lostReason,
    dependencyEnforced: task.dependencyEnforced,
    assignees: (task.assignees ?? []).map((a: any) => ({ userId: a.userId, name: a.user?.name, isPrimary: a.isPrimary })),
    watchers: (task.watchers ?? []).map((w: any) => ({ userId: w.userId, name: w.user?.name })),
    tags: (task.tags ?? []).map((t: any) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    checklist: (task.checklistItems ?? []).map((c: any) => ({
      id: c.id,
      text: c.text,
      isComplete: c.isComplete,
      ownerId: c.ownerId,
      ownerName: c.owner?.name,
      position: c.position,
    })),
    checklistProgress: { done: checklistDone, total: checklistTotal },
    attachmentCount: task._count?.attachments ?? task.attachments?.length ?? 0,
    commentCount: task._count?.comments ?? task.comments?.length ?? 0,
    linkedRecord: task.linkedRecord?.linkedRecord
      ? { id: task.linkedRecord.linkedRecord.id, type: task.linkedRecord.linkedRecord.recordType, name: task.linkedRecord.linkedRecord.name, externalRef: task.linkedRecord.linkedRecord.externalRef }
      : null,
    blockedBy: (task.blockingLinks ?? [])
      .filter((d: any) => d.type === "BLOCKED_BY")
      .map((d: any) => ({ id: d.targetTask.id, taskId: d.targetTask.taskId, title: d.targetTask.title, isCompleted: d.targetTask.isCompleted })),
    blocks: (task.blockingLinks ?? [])
      .filter((d: any) => d.type === "BLOCKS")
      .map((d: any) => ({ id: d.targetTask.id, taskId: d.targetTask.taskId, title: d.targetTask.title, isCompleted: d.targetTask.isCompleted })),
  };
}

const TASK_DETAIL_INCLUDE = {
  board: true,
  stage: true,
  service: true,
  customer: { select: { id: true, customerId: true, name: true } },
  createdBy: true,
  assignees: { include: { user: true } },
  watchers: { include: { user: true } },
  checklistItems: { include: { owner: true }, orderBy: { position: "asc" as const } },
  tags: { include: { tag: true } },
  linkedRecord: { include: { linkedRecord: true } },
  blockingLinks: { include: { targetTask: true } },
  _count: { select: { attachments: true, comments: true } },
  estimationRecord: {
    select: {
      estimationId: true,
      currency: true,
      title: true,
      quotationRef: true,
      recipientName: true,
      recipientCompany: true,
      recipientLocation: true,
      lineItems: true,
      subtotal: true,
      vatRate: true,
      vatAmount: true,
      totalAmount: true,
      validityDays: true,
      paymentTerms: true,
      preparerName: true,
      preparerDesignation: true,
      preparerMobile: true,
      quotedAt: true,
    },
  },
  enquiryRecord: { select: { enquiryId: true } },
};

export async function getTaskDetail(taskId: string, actor: AuthedUser) {
  await loadTaskWithAccess(taskId, actor);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: TASK_DETAIL_INCLUDE as any });
  return serializeTask(task);
}

// The audit trail behind "Project status should have a proper history" —
// every stage this task has ever passed through, oldest first.
export async function getTaskStatusHistory(taskId: string, actor: AuthedUser) {
  await loadTaskWithAccess(taskId, actor);
  const rows = await prisma.taskStatusHistory.findMany({
    where: { taskId },
    include: { updatedBy: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.id, stageName: r.stageName, comment: r.comment, updatedByName: r.updatedBy.name, createdAt: r.createdAt }));
}

export async function listBoardTasks(
  boardId: string,
  actor: AuthedUser,
  filters: { assigneeUserId?: string; priority?: string; tagId?: string; search?: string; dueBefore?: Date; dueAfter?: Date }
) {
  const { assertBoardVisible } = await import("../boards/board-access");
  await assertBoardVisible(boardId, actor);

  const where: any = { boardId, isDeleted: false };
  if (filters.assigneeUserId) where.assignees = { some: { userId: filters.assigneeUserId } };
  if (filters.priority) where.priority = filters.priority;
  if (filters.tagId) where.tags = { some: { tagId: filters.tagId } };
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.dueBefore || filters.dueAfter) {
    where.dueDate = {};
    if (filters.dueBefore) where.dueDate.lte = filters.dueBefore;
    if (filters.dueAfter) where.dueDate.gte = filters.dueAfter;
  }

  const tasks = await prisma.task.findMany({ where, include: TASK_DETAIL_INCLUDE as any, orderBy: { createdAt: "desc" } });
  return tasks.map(serializeTask);
}

export async function updateTask(taskId: string, input: Record<string, any>, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanEditTask(ctx);

  if (input.version !== undefined && input.version !== ctx.task.version) {
    throw Errors.conflict("This task was updated by someone else. Please refresh.");
  }

  if (input.approverUserId) await assertActiveWorkflowUsers([input.approverUserId]);

  const before = { ...ctx.task };
  const data: any = { version: { increment: 1 }, isHighlighted: false };
  const changedFields: string[] = [];

  for (const key of ["title", "priority", "startDate", "dueDate", "estimatedEffortHours", "dependencyEnforced", "customerId"]) {
    if (input[key] !== undefined) {
      data[key] = input[key];
      changedFields.push(key);
    }
  }
  if (input.description !== undefined) {
    data.description = sanitizeDescription(input.description);
    changedFields.push("description");
  }
  if (input.requiresApproval !== undefined) {
    data.requiresApproval = input.requiresApproval;
    data.approverUserId = input.requiresApproval ? input.approverUserId ?? ctx.task.approverUserId : null;
    changedFields.push("requiresApproval");
  } else if (input.approverUserId !== undefined) {
    data.approverUserId = input.approverUserId;
    changedFields.push("approverUserId");
  }

  const updated = await prisma.task.update({ where: { id: taskId }, data, include: TASK_DETAIL_INCLUDE as any });

  for (const field of changedFields) {
    await writeAudit({
      actor,
      action: AuditAction.EDIT,
      entityType: "Task",
      entityId: taskId,
      boardId: ctx.task.boardId,
      field,
      beforeValue: await resolveTaskAuditValue(field, (before as any)[field]),
      afterValue: await resolveTaskAuditValue(field, (updated as any)[field]),
    });
  }

  const notifyIds = updated.assignees.map((a: any) => a.userId);
  await notifyMany(notifyIds, {
    event: NotificationEvent.TASK_ACTIVITY,
    title: `${updated.taskId} was updated`,
    taskId: updated.id,
    boardId: updated.boardId,
  });

  return serializeTask(updated);
}

export async function setAssignees(taskId: string, assigneeUserIds: string[], actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanEditTask(ctx);
  await assertActiveWorkflowUsers(assigneeUserIds);

  const before = ctx.task.assignees.map((a) => a.userId);

  await prisma.$transaction([
    prisma.taskAssignee.deleteMany({ where: { taskId } }),
    prisma.taskAssignee.createMany({
      data: assigneeUserIds.map((userId, idx) => ({ taskId, userId, isPrimary: idx === 0 })),
    }),
    prisma.task.update({ where: { id: taskId }, data: { version: { increment: 1 }, isHighlighted: false } }),
  ]);

  const namedUsers = await prisma.user.findMany({ where: { id: { in: [...new Set([...before, ...assigneeUserIds])] } }, select: { id: true, name: true } });
  const nameOf = (id: string) => namedUsers.find((u) => u.id === id)?.name ?? id;

  await writeAudit({
    actor,
    action: AuditAction.ASSIGN,
    entityType: "Task",
    entityId: taskId,
    boardId: ctx.task.boardId,
    field: "assignees",
    beforeValue: before.map(nameOf),
    afterValue: assigneeUserIds.map(nameOf),
  });

  const added = assigneeUserIds.filter((id) => !before.includes(id));
  const removed = before.filter((id) => !assigneeUserIds.includes(id));
  await notifyMany([...added, ...removed], {
    event: NotificationEvent.TASK_REASSIGNED,
    title: `Assignment changed on ${ctx.task.taskId}`,
    taskId,
    boardId: ctx.task.boardId,
  });

  return getTaskDetail(taskId, actor);
}

export async function quickEdit(taskId: string, input: { priority?: string; dueDate?: Date | null }, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanEditTask(ctx);
  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { priority: input.priority as any, dueDate: input.dueDate, isHighlighted: false, version: { increment: 1 } },
    include: TASK_DETAIL_INCLUDE as any,
  });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Task", entityId: taskId, boardId: ctx.task.boardId, field: "quickEdit", afterValue: input });
  return serializeTask(updated);
}

// ---------------------------------------------------------------------------
// Stage movement — WIP limits, dependency gate, approval gate (UC-07, UC-09)
// ---------------------------------------------------------------------------

export async function moveTask(
  taskId: string,
  targetStageId: string,
  actor: AuthedUser,
  confirmWipOverride = false,
  expectedVersion?: number,
  skipEditCheck = false
) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  // A Lost-approval decision is executed by the Management approver, not the
  // original requester — they were already authorized via APPROVE_TASK in
  // decideLost(), and won't generally be a board Owner/Editor/assignee on
  // the task itself, so the normal edit-rights check doesn't apply here.
  if (!skipEditCheck) assertCanEditTask(ctx);

  if (expectedVersion !== undefined && expectedVersion !== ctx.task.version) {
    throw Errors.conflict("This task was updated by someone else. Please refresh.");
  }

  const targetStage = await prisma.boardStage.findFirst({ where: { id: targetStageId, boardId: ctx.task.boardId } });
  if (!targetStage) throw Errors.badRequest("Target stage does not belong to this board.");

  // --- Accounts sign-off gate — see awardTask()'s "Stage 2" ---
  if (targetStage.isTerminal && (ctx.task.board as any)?.accountsApprovalStatus === "PENDING") {
    throw Errors.forbidden("This project is waiting on Accounts approval — it can't be marked Lost or Completed until Accounts signs off.");
  }

  if (targetStage.wipLimit) {
    const currentCount = await prisma.task.count({ where: { stageId: targetStageId, isDeleted: false, isCompleted: false } });
    if (currentCount >= targetStage.wipLimit && !confirmWipOverride) {
      throw Errors.conflict(
        `"${targetStage.name}" is at its WIP limit (${targetStage.wipLimit}). Confirm to move the task anyway.`
      );
    }
  }

  // --- Approval gate ---
  if (targetStage.isTerminal && ctx.task.requiresApproval && ctx.task.approvalStatus !== TaskApprovalStatus.APPROVED) {
    if (ctx.task.dependencyEnforced) await assertDependenciesCleared(taskId);

    const pendingApprovalStage =
      (await prisma.boardStage.findFirst({ where: { boardId: ctx.task.boardId, name: { equals: "Pending Approval", mode: "insensitive" } } })) ??
      undefined;

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        previousStageId: ctx.task.stageId,
        stageId: pendingApprovalStage ? pendingApprovalStage.id : ctx.task.stageId,
        approvalStatus: TaskApprovalStatus.PENDING_APPROVAL,
        isHighlighted: false,
        version: { increment: 1 },
      },
      include: TASK_DETAIL_INCLUDE as any,
    });

    if (!ctx.task.approverUserId) {
      throw Errors.badRequest("This task requires approval but has no Approver assigned.");
    }

    await prisma.taskApproval.create({ data: { taskId, approverId: ctx.task.approverUserId } });

    await recordStatusHistory(taskId, pendingApprovalStage ? pendingApprovalStage.name : "Pending Approval", actor);

    await writeAudit({
      actor,
      action: AuditAction.MOVE,
      entityType: "Task",
      entityId: taskId,
      boardId: ctx.task.boardId,
      field: "approvalStatus",
      afterValue: "PENDING_APPROVAL",
    });

    await notify({
      userId: ctx.task.approverUserId,
      event: NotificationEvent.APPROVAL_REQUESTED,
      title: `${ctx.task.taskId} is awaiting your approval`,
      taskId,
      boardId: ctx.task.boardId,
    });

    return serializeTask(updated);
  }

  // --- Dependency gate (Business Rule 9) ---
  if (targetStage.isTerminal && ctx.task.dependencyEnforced) {
    await assertDependenciesCleared(taskId);
  }

  // Entering "Lost" or a terminal (Completed) stage from a normal one
  // remembers where the task came from, so restoreTask() can send it back.
  // Moving between two historical states (rare) keeps whatever was already
  // captured; moving to any ordinary stage clears it — it's no longer needed.
  const enteringHistorical = targetStage.isTerminal || targetStage.name.toLowerCase() === "lost";
  const wasAlreadyHistorical = ctx.task.isCompleted || ctx.task.stage?.name?.toLowerCase() === "lost";
  const restoreStageId = enteringHistorical ? (wasAlreadyHistorical ? ctx.task.restoreStageId : ctx.task.stageId) : null;

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      stageId: targetStageId,
      isCompleted: targetStage.isTerminal,
      completedAt: targetStage.isTerminal ? new Date() : null,
      approvalStatus: targetStage.isTerminal ? TaskApprovalStatus.APPROVED : ctx.task.approvalStatus,
      isHighlighted: false,
      restoreStageId,
      version: { increment: 1 },
    },
    include: TASK_DETAIL_INCLUDE as any,
  });

  await writeAudit({
    actor,
    action: AuditAction.MOVE,
    entityType: "Task",
    entityId: taskId,
    boardId: ctx.task.boardId,
    field: "stage",
    beforeValue: ctx.task.stage?.name ?? ctx.task.stageId,
    afterValue: targetStage.name,
  });

  await recordStatusHistory(taskId, targetStage.name, actor);

  const watcherIds = (updated.watchers ?? []).map((w: any) => w.userId);
  const assigneeIds = (updated.assignees ?? []).map((a: any) => a.userId);
  await notifyMany([...assigneeIds, ...watcherIds], {
    event: NotificationEvent.TASK_ACTIVITY,
    title: `${updated.taskId} moved to ${targetStage.name}`,
    taskId,
    boardId: ctx.task.boardId,
  });

  return serializeTask(updated);
}

// ---------------------------------------------------------------------------
// Awarded — a two-stage pipeline:
//   1. An Enquiry List task Awarded lands on the (lazily-provisioned)
//      Estimation board instead of becoming a Project directly — no board is
//      created yet, the task just moves and gets highlighted there.
//   2. An Estimation-board task Awarded spins up a real Project (under the
//      task's chosen Service, if any) AND a ProcurementRecord for it, in the
//      same transaction, immediately — so Accounts, Procurement, and the
//      Project team all see it at the same time. It's gated behind Accounts
//      sign-off from the moment it's created: Board.accountsApprovalStatus
//      starts at PENDING, and moveTask()/setBoardCompleted() both refuse to
//      let the task be marked Lost/Completed while it's still PENDING (see
//      those functions). Accounts approves/rejects the *Board* directly
//      (approveAccountsBoard/rejectAccountsBoard in boards.service.ts) —
//      there's no separate "Accounts board" hand-off anymore.
// A legacy branch below still handles any task that was already sitting on
// the old Accounts board before this change shipped (sourceBoard.name ===
// ACCOUNTS_BOARD_NAME) — Awarding it there still runs the old
// approve-on-award behavior, since Accounts already fully owns it by then.
// ---------------------------------------------------------------------------

export async function awardTask(taskId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanEditTask(ctx);

  const canCreateBoard = scopeAtLeast(getPermissionScope(actor.permissions, PermissionKey.CREATE_BOARD), "OWN");
  if (!canCreateBoard) throw Errors.forbidden("You do not have permission to do that.");

  const sourceBoard = await prisma.board.findUniqueOrThrow({ where: { id: ctx.task.boardId } });

  if (sourceBoard.name !== ESTIMATION_BOARD_NAME && sourceBoard.name !== ACCOUNTS_BOARD_NAME) {
    // Stage 1: move onto Estimation — no Project exists yet.
    const estimationStub = await getOrCreateEstimationBoard(actor);
    const estimationBoard = await prisma.board.findUniqueOrThrow({
      where: { id: estimationStub.id },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    const firstStage = estimationBoard.stages[0];

    await prisma.task.update({
      where: { id: taskId },
      data: { boardId: estimationBoard.id, stageId: firstStage.id, isHighlighted: true, version: { increment: 1 } },
    });
    const estimationRecord = await ensureEstimationRecord(prisma, taskId);

    await writeAudit({
      actor,
      action: AuditAction.MOVE,
      entityType: "Task",
      entityId: taskId,
      boardId: estimationBoard.id,
      metadata: { awarded: true, fromBoardId: sourceBoard.id, toBoardId: estimationBoard.id, toStageId: firstStage.id, estimationId: estimationRecord.estimationId },
    });

    await recordStatusHistory(taskId, firstStage.name, actor, "Qualified to Estimation");

    return { kind: "moved-to-estimation" as const, id: estimationBoard.id, name: estimationBoard.name };
  }

  // Legacy branch: a task still physically sitting on the old Accounts
  // board from before this pipeline change — Awarding it here still spins
  // up the Project/Procurement (already fully signed off by Accounts by
  // this point, so no PENDING gate is set).
  if (sourceBoard.name === ACCOUNTS_BOARD_NAME) {
    const { board: newBoard, firstStageId } = await createProjectFromAwardedTask(ctx.task, actor, null);

    await writeAudit({
      actor,
      action: AuditAction.CREATE,
      entityType: "Board",
      entityId: newBoard.id,
      boardId: newBoard.id,
      afterValue: { name: newBoard.name, awardedFromTaskId: ctx.task.taskId },
    });
    await writeAudit({
      actor,
      action: AuditAction.MOVE,
      entityType: "Task",
      entityId: taskId,
      boardId: newBoard.id,
      metadata: { awarded: true, fromBoardId: ctx.task.boardId, toBoardId: newBoard.id, toStageId: firstStageId },
    });
    await recordStatusHistory(taskId, newBoard.stages[0].name, actor, "Awarded to Project");

    return { kind: "project-created" as const, id: newBoard.id, name: newBoard.name };
  }

  // Stage 2 (current pipeline): Estimation awarded — spin up the Project and
  // its ProcurementRecord together immediately, pending Accounts sign-off.
  const { board: newBoard, firstStageId } = await createProjectFromAwardedTask(ctx.task, actor, "PENDING");

  await writeAudit({
    actor,
    action: AuditAction.CREATE,
    entityType: "Board",
    entityId: newBoard.id,
    boardId: newBoard.id,
    afterValue: { name: newBoard.name, awardedFromTaskId: ctx.task.taskId, accountsApprovalStatus: "PENDING" },
  });
  await writeAudit({
    actor,
    action: AuditAction.MOVE,
    entityType: "Task",
    entityId: taskId,
    boardId: newBoard.id,
    metadata: { awarded: true, fromBoardId: ctx.task.boardId, toBoardId: newBoard.id, toStageId: firstStageId, pendingAccountsApproval: true },
  });

  await recordStatusHistory(taskId, newBoard.stages[0].name, actor, "Awarded — pending Accounts approval");

  return { kind: "project-created-pending-approval" as const, id: newBoard.id, name: newBoard.name };
}

/** Shared by both the current and legacy Award-to-Project paths: creates the
 * Project board and its ProcurementRecord in one transaction, and moves the
 * task onto the new board's first stage. `accountsApprovalStatus` is
 * "PENDING" for a fresh award (current pipeline) or null for the legacy
 * path, where Accounts has already signed off by the time this runs. */
async function createProjectFromAwardedTask(task: { id: string; title: string; boardId: string } & Record<string, any>, actor: AuthedUser, accountsApprovalStatus: "PENDING" | null) {
  return prisma.$transaction(async (tx) => {
    const placeholderId = `TEMP-${Date.now()}-${Math.random()}`;
    const created = await tx.board.create({
      data: {
        boardId: placeholderId,
        name: task.title,
        boardType: BoardType.STANDALONE,
        serviceId: task.serviceId ?? null,
        customerId: task.customerId ?? null,
        isHighlighted: true,
        accountsApprovalStatus: accountsApprovalStatus ?? undefined,
        createdById: actor.id,
        stages: {
          create: DEFAULT_STAGES.map((s, idx) => ({
            name: s.name,
            color: s.color,
            position: idx,
            isTerminal: (s as any).isTerminal ?? idx === DEFAULT_STAGES.length - 1,
          })),
        },
        members: { create: [{ userId: actor.id, role: "OWNER" }] },
      },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    const projectYear = new Date().getFullYear();
    const projectSequence = await nextYearlySequence("PROJECT", projectYear, tx);
    const board = await tx.board.update({
      where: { id: created.id },
      data: { boardId: formatProjectId(projectYear, projectSequence) },
      include: { stages: { orderBy: { position: "asc" } } },
    });

    await tx.task.update({
      where: { id: task.id },
      data: { boardId: board.id, stageId: board.stages[0].id, isHighlighted: true, version: { increment: 1 } },
    });

    const procurementYear = new Date().getFullYear();
    const procurementSequence = await nextYearlySequence("PROCUREMENT", procurementYear, tx);
    await tx.procurementRecord.create({
      data: { boardId: board.id, year: procurementYear, sequence: procurementSequence, procurementId: formatProcurementId(procurementYear, procurementSequence) },
    });

    return { board, firstStageId: board.stages[0].id };
  });
}

/** The "Lost" action on an enquiry — moves it to its board's "Lost" stage
 *  (via the same moveTask() every drag-and-drop move uses, so WIP limits,
 *  approval gates, and notifications all still apply), so it shows up in
 *  Project/Task History as Lost instead of ever becoming a Project.
 *
 *  Called directly for every board except Enquiry List — see
 *  requestLostApproval() below for the gated path. */
export async function markTaskLost(taskId: string, actor: AuthedUser, skipEditCheck = false) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  const lostStage = await prisma.boardStage.findFirst({
    where: { boardId: ctx.task.boardId, name: { equals: "Lost", mode: "insensitive" } },
  });
  if (!lostStage) throw Errors.badRequest('This board has no "Lost" stage.');
  return moveTask(taskId, lostStage.id, actor, false, undefined, skipEditCheck);
}

/** The "Reject" action on an Accounts-board task — Accounts sign-off is a
 *  direct approve/reject, not a multi-person approval chain (Approve just
 *  calls awardTask() like every other board's Awarded button), so this only
 *  needs to move the task to Accounts' "Rejected" stage and record why. */
export async function rejectAccountsTask(taskId: string, reason: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  if (ctx.task.board?.name !== ACCOUNTS_BOARD_NAME) {
    throw Errors.badRequest("This action is only available on the Accounts board.");
  }
  const rejectedStage = await prisma.boardStage.findFirst({
    where: { boardId: ctx.task.boardId, name: { equals: "Rejected", mode: "insensitive" } },
  });
  if (!rejectedStage) throw Errors.badRequest('This board has no "Rejected" stage.');

  const result = await moveTask(taskId, rejectedStage.id, actor);

  await writeAudit({
    actor,
    action: AuditAction.REJECT,
    entityType: "Task",
    entityId: taskId,
    boardId: ctx.task.boardId,
    field: "accountsApproval",
    afterValue: reason,
  });

  return result;
}

// Anyone holding Approve Task: All (Management, by default — configurable
// from Settings -> Roles & Permissions) rather than a single named approver,
// since a Lost enquiry needs sign-off from management broadly, not one
// designated person chosen per task.
async function findLostApproverIds(): Promise<string[]> {
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { permission: PermissionKey.APPROVE_TASK, scope: "ALL" },
    select: { roleId: true },
  });
  if (!rolePermissions.length) return [];
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { roleId: { in: rolePermissions.map((r) => r.roleId) } } } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** The "Lost" action on an Enquiry List task — instead of moving it
 *  immediately, this flags it as awaiting Management's sign-off; the task
 *  only actually lands on the "Lost" stage once decideLost() approves it.
 *  Every other board's Lost button still calls markTaskLost() directly. */
export async function requestLostApproval(taskId: string, reason: string | undefined, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanEditTask(ctx);

  if (ctx.task.board?.name !== "Enquiry List") {
    return markTaskLost(taskId, actor);
  }

  if (ctx.task.lostApprovalStatus === TaskApprovalStatus.PENDING_APPROVAL) {
    throw Errors.conflict("A Lost approval request is already pending for this task.");
  }
  if (!reason?.trim()) {
    throw Errors.badRequest("A reason is required to request this enquiry be marked Lost.");
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { lostApprovalStatus: TaskApprovalStatus.PENDING_APPROVAL, lostReason: reason.trim(), version: { increment: 1 } },
    include: TASK_DETAIL_INCLUDE as any,
  });

  await writeAudit({
    actor,
    action: AuditAction.MOVE,
    entityType: "Task",
    entityId: taskId,
    boardId: ctx.task.boardId,
    field: "lostApprovalStatus",
    afterValue: `requested: ${reason.trim()} — pending Management approval`,
  });

  const approverIds = await findLostApproverIds();
  await notifyMany(approverIds, {
    event: NotificationEvent.APPROVAL_REQUESTED,
    title: `${ctx.task.taskId} requests approval to mark Lost`,
    taskId,
    boardId: ctx.task.boardId,
  });

  return serializeTask(updated);
}

/** Management's decision on a pending Lost request — approving moves the
 *  task to the Lost stage (via markTaskLost, so it shows up in Project/Task
 *  History exactly like any other Lost enquiry); rejecting just clears the
 *  pending flag and leaves the task where it was. */
export async function decideLost(taskId: string, approve: boolean, actor: AuthedUser, reason?: string) {
  const ctx = await loadTaskWithAccess(taskId, actor);

  const canDecide = isSystemLevelAdmin(actor.roles) || scopeAtLeast(getPermissionScope(actor.permissions, PermissionKey.APPROVE_TASK), "ALL");
  if (!canDecide) throw Errors.forbidden("Only Management or an Administrator can approve or reject a Lost request.");

  if (ctx.task.lostApprovalStatus !== TaskApprovalStatus.PENDING_APPROVAL) {
    throw Errors.badRequest("This task has no pending Lost approval request.");
  }

  const assigneeIds = ctx.task.assignees.map((a) => a.userId);

  if (!approve) {
    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { lostApprovalStatus: TaskApprovalStatus.NONE, lostReason: null, version: { increment: 1 } },
      include: TASK_DETAIL_INCLUDE as any,
    });

    await writeAudit({
      actor,
      action: AuditAction.REJECT,
      entityType: "Task",
      entityId: taskId,
      boardId: ctx.task.boardId,
      field: "lostApprovalStatus",
      afterValue: reason ? `rejected: ${reason}` : "rejected",
    });

    await notifyMany(assigneeIds, {
      event: NotificationEvent.APPROVAL_REJECTED,
      title: `${ctx.task.taskId}'s Lost request was rejected${reason ? `: ${reason}` : ""}`,
      taskId,
      boardId: ctx.task.boardId,
    });

    return serializeTask(updated);
  }

  // markTaskLost runs first and can throw (e.g. the board has no "Lost"
  // stage) — only flip the flag once the move actually succeeds, so a
  // failure here leaves the request PENDING_APPROVAL and retryable instead
  // of stranding it at APPROVED with no path forward.
  const result = await markTaskLost(taskId, actor, true);
  await prisma.task.update({ where: { id: taskId }, data: { lostApprovalStatus: TaskApprovalStatus.APPROVED } });

  await writeAudit({
    actor,
    action: AuditAction.APPROVE,
    entityType: "Task",
    entityId: taskId,
    boardId: ctx.task.boardId,
    field: "lostApprovalStatus",
    afterValue: "approved",
  });

  await notifyMany(assigneeIds, {
    event: NotificationEvent.APPROVAL_APPROVED,
    title: `${ctx.task.taskId}'s Lost request was approved`,
    taskId,
    boardId: ctx.task.boardId,
  });

  return result;
}

/** Undoes a Lost or Completed task from Project/Task History — sends it back
 *  to whichever stage it was on right before that happened (restoreStageId,
 *  captured by moveTask/approveTask), on the same board. Falls back to the
 *  board's first ordinary stage if that stage no longer exists. */
export async function restoreTask(taskId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanEditTask(ctx);

  const isLost = ctx.task.stage?.name?.toLowerCase() === "lost";
  if (!isLost && !ctx.task.isCompleted) {
    throw Errors.badRequest("This task is not currently Lost or Completed.");
  }

  let targetStage = ctx.task.restoreStageId
    ? await prisma.boardStage.findFirst({ where: { id: ctx.task.restoreStageId, boardId: ctx.task.boardId } })
    : null;

  if (!targetStage) {
    targetStage = await prisma.boardStage.findFirst({
      where: { boardId: ctx.task.boardId, isTerminal: false, NOT: { name: { equals: "Lost", mode: "insensitive" } } },
      orderBy: { position: "asc" },
    });
  }
  if (!targetStage) throw Errors.badRequest("This board has no earlier stage to restore this task to.");

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      stageId: targetStage.id,
      isCompleted: false,
      completedAt: null,
      approvalStatus: TaskApprovalStatus.NONE,
      lostApprovalStatus: TaskApprovalStatus.NONE,
      lostReason: null,
      restoreStageId: null,
      version: { increment: 1 },
    },
    include: TASK_DETAIL_INCLUDE as any,
  });

  await writeAudit({
    actor,
    action: AuditAction.MOVE,
    entityType: "Task",
    entityId: taskId,
    boardId: ctx.task.boardId,
    field: "stage",
    beforeValue: ctx.task.stage?.name ?? ctx.task.stageId,
    afterValue: `restored: ${targetStage.name}`,
  });

  await recordStatusHistory(taskId, targetStage.name, actor, isLost ? "Restored from Lost" : "Restored from Completed");

  const watcherIds = (updated.watchers ?? []).map((w: any) => w.userId);
  const assigneeIds = (updated.assignees ?? []).map((a: any) => a.userId);
  await notifyMany([...assigneeIds, ...watcherIds], {
    event: NotificationEvent.TASK_ACTIVITY,
    title: `${updated.taskId} was restored to ${targetStage.name}`,
    taskId,
    boardId: ctx.task.boardId,
  });

  return serializeTask(updated);
}

async function assertDependenciesCleared(taskId: string) {
  const openBlockers = await prisma.taskDependency.findMany({
    where: { sourceTaskId: taskId, type: "BLOCKED_BY", targetTask: { isCompleted: false, isDeleted: false } },
    include: { targetTask: true },
  });
  if (openBlockers.length) {
    throw Errors.conflict(
      `This task is blocked by ${openBlockers.length} open task(s) (${openBlockers
        .map((b) => b.targetTask.taskId)
        .join(", ")}) and cannot move to Done until they are completed.`
    );
  }
}

/** Task-card "Complete" checkbox (Section 26): same approval gate as drag-to-Done. */
export async function quickComplete(taskId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  const terminalStage = await prisma.boardStage.findFirst({ where: { boardId: ctx.task.boardId, isTerminal: true } });
  if (!terminalStage) throw Errors.badRequest("This board has no terminal (Done) stage configured.");
  return moveTask(taskId, terminalStage.id, actor);
}

export async function deleteTask(taskId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanDeleteTask(ctx);
  await prisma.task.update({ where: { id: taskId }, data: { isDeleted: true, deletedAt: new Date() } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "Task", entityId: taskId, boardId: ctx.task.boardId, beforeValue: { title: ctx.task.title, taskId: ctx.task.taskId } });
}

export async function duplicateTask(taskId: string, actor: AuthedUser) {
  const original = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: true, checklistItems: true, tags: true, watchers: true },
  });
  return createTask(
    {
      boardId: original.boardId,
      stageId: original.stageId,
      title: `${original.title} (Copy)`,
      description: original.description ?? undefined,
      priority: original.priority,
      assigneeUserIds: original.assignees.map((a) => a.userId),
      startDate: original.startDate,
      dueDate: original.dueDate,
      estimatedEffortHours: original.estimatedEffortHours,
      checklist: original.checklistItems.map((c) => ({ text: c.text, ownerId: c.ownerId ?? undefined })),
      tagIds: original.tags.map((t) => t.tagId),
      watcherUserIds: original.watchers.map((w) => w.userId),
    },
    actor
  );
}

// --- Excel import for Enquiry List ---

const ENQUIRY_IMPORT_COLUMN_ALIASES: Record<string, string[]> = {
  title: ["title", "enquiry title", "subject", "enquiry"],
  description: ["description", "details", "notes"],
  customerId: ["customer id"],
  customerName: ["customer name", "customer", "company"],
  service: ["service", "service type"],
  priority: ["priority"],
  assigneeEmail: ["assignee email", "assignee", "assigned to"],
  startDate: ["start date"],
  dueDate: ["due date", "deadline"],
};

export interface ImportEnquiriesResult {
  created: number;
  skipped: Array<{ row: number; reason: string }>;
}

function parseExcelDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function importEnquiriesFromExcel(buffer: Buffer, actor: AuthedUser): Promise<ImportEnquiriesResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw Errors.badRequest("The uploaded file has no worksheet.");

  const headerCells = sheet.getRow(1).values as unknown[];
  const columnIndex: Record<string, number> = {};
  headerCells.forEach((cell, idx) => {
    if (typeof cell === "string" && cell.trim()) columnIndex[cell.trim().toLowerCase()] = idx;
  });

  const resolveColumn = (field: string): number | undefined => {
    for (const alias of ENQUIRY_IMPORT_COLUMN_ALIASES[field]) {
      const idx = columnIndex[alias];
      if (idx !== undefined) return idx;
    }
    return undefined;
  };
  const fieldColumns = Object.fromEntries(Object.keys(ENQUIRY_IMPORT_COLUMN_ALIASES).map((f) => [f, resolveColumn(f)])) as Record<
    string,
    number | undefined
  >;

  if (!fieldColumns.title) {
    throw Errors.badRequest('The file must have a "Title" column (row 1).');
  }

  const board = await getOrCreateEnquiryBoard(actor);
  const services = await prisma.service.findMany();

  const result: ImportEnquiriesResult = { created: 0, skipped: [] };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const cellText = (colIdx?: number) => (colIdx ? String(row.getCell(colIdx).value ?? "").trim() : "");

    const isBlankRow = Object.values(fieldColumns).every((idx) => !cellText(idx));
    if (isBlankRow) continue;

    const title = cellText(fieldColumns.title);
    if (!title) {
      result.skipped.push({ row: rowNumber, reason: "Missing Title" });
      continue;
    }

    try {
      const priorityRaw = cellText(fieldColumns.priority).toUpperCase();
      const priority = (Object.values(TaskPriority) as string[]).includes(priorityRaw) ? priorityRaw : TaskPriority.MEDIUM;

      let customerId: string | null = null;
      const customerIdCell = cellText(fieldColumns.customerId);
      const customerNameCell = cellText(fieldColumns.customerName);
      if (customerIdCell) {
        const match = await prisma.customer.findFirst({ where: { customerId: { equals: customerIdCell, mode: "insensitive" } } });
        customerId = match?.id ?? null;
      } else if (customerNameCell) {
        const match = await prisma.customer.findFirst({ where: { name: { contains: customerNameCell, mode: "insensitive" } } });
        customerId = match?.id ?? null;
      }

      const serviceNameCell = cellText(fieldColumns.service);
      const service = serviceNameCell ? services.find((s) => s.name.toLowerCase() === serviceNameCell.toLowerCase()) : undefined;

      const assigneeEmailCell = cellText(fieldColumns.assigneeEmail);
      let assigneeUserId = actor.id;
      if (assigneeEmailCell) {
        const match = await prisma.user.findFirst({ where: { workEmail: { equals: assigneeEmailCell, mode: "insensitive" }, status: "ACTIVE" } });
        if (match) assigneeUserId = match.id;
      }

      await createTask(
        {
          boardId: board.id,
          title,
          description: cellText(fieldColumns.description) || undefined,
          priority,
          customerId,
          serviceId: service?.id,
          assigneeUserIds: [assigneeUserId],
          startDate: parseExcelDate(cellText(fieldColumns.startDate)),
          dueDate: parseExcelDate(cellText(fieldColumns.dueDate)),
        },
        actor
      );
      result.created++;
    } catch (err: any) {
      result.skipped.push({ row: rowNumber, reason: err?.message ?? "Unknown error" });
    }
  }

  await writeAudit({
    actor,
    action: AuditAction.CREATE,
    entityType: "Task",
    boardId: board.id,
    afterValue: { source: "excel-import", created: result.created, skipped: result.skipped.length },
  });

  return result;
}

export { addDependencyInternal, serializeTask, assertActiveWorkflowUsers };
