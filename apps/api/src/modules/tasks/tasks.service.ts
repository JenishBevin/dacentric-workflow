import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { notify, notifyMany } from "../notifications/notifications.service";
import { sanitizeDescription } from "../../common/richtext";
import { loadTaskWithAccess, assertCanEditTask, assertCanDeleteTask } from "./task-access";
import { AuthedUser } from "../../middleware/authenticate";
import { computeDueDateStatus } from "./task-formatting";
import { formatTaskId, AuditAction, TaskApprovalStatus, TaskType, NotificationEvent, RoleCode, PermissionKey } from "@dacentric/types";
import { getPermissionScope, scopeAtLeast } from "../../common/permissions";
import { createRecurringSeries, attachTemplateAndScheduleFirst } from "../recurrence/recurrence.service";

export interface CreateTaskInput {
  boardId: string;
  stageId?: string;
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

  const board = await prisma.board.findFirst({ where: { id: input.boardId, isDeleted: false } });
  if (!board) throw Errors.notFound("Board");

  const stage = input.stageId
    ? await prisma.boardStage.findFirst({ where: { id: input.stageId, boardId: input.boardId } })
    : await prisma.boardStage.findFirst({ where: { boardId: input.boardId }, orderBy: { position: "asc" } });
  if (!stage) throw Errors.badRequest("Selected board has no stages configured.");

  let seriesId: string | undefined;
  if (input.recurring) {
    const series = await createRecurringSeries(input.boardId, input.recurring, actor);
    seriesId = series.id;
  }

  const task = await prisma.$transaction(async (tx) => {
    const placeholderId = `TEMP-${Date.now()}-${Math.random()}`;
    const created = await tx.task.create({
      data: {
        boardId: input.boardId,
        stageId: stage.id,
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
    return tx.task.update({ where: { id: created.id }, data: { taskId: finalTaskId } });
  });

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
      boardId: input.boardId,
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
    boardId: input.boardId,
    afterValue: { title: task.title, taskId: task.taskId },
  });

  await notifyMany(input.assigneeUserIds, {
    event: NotificationEvent.TASK_ASSIGNED,
    title: `You were assigned to ${task.taskId}: ${task.title}`,
    taskId: task.id,
    boardId: input.boardId,
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
    requiresApproval: task.requiresApproval,
    approverUserId: task.approverUserId,
    approvalStatus: task.approvalStatus,
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
  createdBy: true,
  assignees: { include: { user: true } },
  watchers: { include: { user: true } },
  checklistItems: { include: { owner: true }, orderBy: { position: "asc" as const } },
  tags: { include: { tag: true } },
  linkedRecord: { include: { linkedRecord: true } },
  blockingLinks: { include: { targetTask: true } },
  _count: { select: { attachments: true, comments: true } },
};

export async function getTaskDetail(taskId: string, actor: AuthedUser) {
  await loadTaskWithAccess(taskId, actor);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: TASK_DETAIL_INCLUDE as any });
  return serializeTask(task);
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
  const data: any = { version: { increment: 1 } };
  const changedFields: string[] = [];

  for (const key of ["title", "priority", "startDate", "dueDate", "estimatedEffortHours", "dependencyEnforced"]) {
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
      beforeValue: (before as any)[field],
      afterValue: (updated as any)[field],
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
    prisma.task.update({ where: { id: taskId }, data: { version: { increment: 1 } } }),
  ]);

  await writeAudit({
    actor,
    action: AuditAction.ASSIGN,
    entityType: "Task",
    entityId: taskId,
    boardId: ctx.task.boardId,
    field: "assignees",
    beforeValue: before,
    afterValue: assigneeUserIds,
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
    data: { priority: input.priority as any, dueDate: input.dueDate, version: { increment: 1 } },
    include: TASK_DETAIL_INCLUDE as any,
  });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Task", entityId: taskId, boardId: ctx.task.boardId, field: "quickEdit", afterValue: input });
  return serializeTask(updated);
}

// ---------------------------------------------------------------------------
// Stage movement — WIP limits, dependency gate, approval gate (UC-07, UC-09)
// ---------------------------------------------------------------------------

export async function moveTask(taskId: string, targetStageId: string, actor: AuthedUser, confirmWipOverride = false, expectedVersion?: number) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanEditTask(ctx);

  if (expectedVersion !== undefined && expectedVersion !== ctx.task.version) {
    throw Errors.conflict("This task was updated by someone else. Please refresh.");
  }

  const targetStage = await prisma.boardStage.findFirst({ where: { id: targetStageId, boardId: ctx.task.boardId } });
  if (!targetStage) throw Errors.badRequest("Target stage does not belong to this board.");

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
        version: { increment: 1 },
      },
      include: TASK_DETAIL_INCLUDE as any,
    });

    if (!ctx.task.approverUserId) {
      throw Errors.badRequest("This task requires approval but has no Approver assigned.");
    }

    await prisma.taskApproval.create({ data: { taskId, approverId: ctx.task.approverUserId } });

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

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      stageId: targetStageId,
      isCompleted: targetStage.isTerminal,
      completedAt: targetStage.isTerminal ? new Date() : null,
      approvalStatus: targetStage.isTerminal ? TaskApprovalStatus.APPROVED : ctx.task.approvalStatus,
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
    beforeValue: ctx.task.stageId,
    afterValue: targetStageId,
  });

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

export { addDependencyInternal, serializeTask, assertActiveWorkflowUsers };
