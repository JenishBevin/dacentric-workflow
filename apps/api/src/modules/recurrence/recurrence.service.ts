import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { notifyMany } from "../notifications/notifications.service";
import { AuthedUser } from "../../middleware/authenticate";
import { formatTaskId, AuditAction, NotificationEvent, RecurrenceFrequency, RecurrenceEndType, TaskType } from "@dacentric/types";

export interface RecurrenceInput {
  frequency: string;
  customIntervalDays?: number;
  endType: string;
  occurrencesLimit?: number;
  endDate?: Date;
}

export interface TaskTemplateSnapshot {
  title: string;
  description?: string | null;
  priority: string;
  boardId: string;
  stageId: string;
  assigneeUserIds: string[];
  estimatedEffortHours?: number | null;
  checklist?: Array<{ text: string; ownerId?: string }>;
  tagIds?: string[];
  requiresApproval?: boolean;
  approverUserId?: string;
  createdById: string;
}

export function computeNextRunAt(from: Date, frequency: string, customIntervalDays?: number): Date {
  const next = new Date(from);
  switch (frequency) {
    case RecurrenceFrequency.DAILY:
      next.setDate(next.getDate() + 1);
      break;
    case RecurrenceFrequency.WEEKLY:
      next.setDate(next.getDate() + 7);
      break;
    case RecurrenceFrequency.MONTHLY:
      next.setMonth(next.getMonth() + 1);
      break;
    case RecurrenceFrequency.CUSTOM:
      next.setDate(next.getDate() + (customIntervalDays ?? 7));
      break;
  }
  return next;
}

export async function createRecurringSeries(boardId: string, input: RecurrenceInput, actor: AuthedUser) {
  if (input.endType === RecurrenceEndType.AFTER_N && !input.occurrencesLimit) {
    throw Errors.badRequest("Specify how many occurrences before the series ends.");
  }
  if (input.endType === RecurrenceEndType.ON_DATE && !input.endDate) {
    throw Errors.badRequest("Specify the end date for the recurring series.");
  }

  const series = await prisma.recurringTaskSeries.create({
    data: {
      boardId,
      frequency: input.frequency as any,
      customRuleJson: input.customIntervalDays ? { intervalDays: input.customIntervalDays } : undefined,
      endType: input.endType as any,
      occurrencesLimit: input.occurrencesLimit,
      endDate: input.endDate,
      createdById: actor.id,
      taskTemplate: {},
    },
  });
  return series;
}

/** Called once, right after the first instance is created by tasks.service.createTask. */
export async function attachTemplateAndScheduleFirst(seriesId: string, snapshot: TaskTemplateSnapshot) {
  const series = await prisma.recurringTaskSeries.findUniqueOrThrow({ where: { id: seriesId } });
  const nextRunAt = computeNextRunAt(new Date(), series.frequency, (series.customRuleJson as any)?.intervalDays);
  await prisma.recurringTaskSeries.update({
    where: { id: seriesId },
    data: { taskTemplate: snapshot as any, occurrencesGenerated: 1, nextRunAt },
  });
}

/**
 * Generates the next instance for one due series. Runs from the scheduled
 * job (node-cron), independent of any browser session being open (Section
 * 23: "Do not depend exclusively on a browser being open").
 */
export async function generateNextInstance(seriesId: string): Promise<void> {
  const series = await prisma.recurringTaskSeries.findUnique({ where: { id: seriesId } });
  if (!series || !series.isActive || !series.nextRunAt) return;
  if (series.nextRunAt.getTime() > Date.now()) return;

  if (series.endType === RecurrenceEndType.AFTER_N && series.occurrencesGenerated >= (series.occurrencesLimit ?? 0)) {
    await prisma.recurringTaskSeries.update({ where: { id: seriesId }, data: { isActive: false } });
    return;
  }
  if (series.endType === RecurrenceEndType.ON_DATE && series.endDate && series.nextRunAt.getTime() > series.endDate.getTime()) {
    await prisma.recurringTaskSeries.update({ where: { id: seriesId }, data: { isActive: false } });
    return;
  }

  const snapshot = series.taskTemplate as unknown as TaskTemplateSnapshot;
  if (!snapshot?.title) return;

  const stageExists = await prisma.boardStage.findFirst({ where: { id: snapshot.stageId, boardId: series.boardId } });
  const fallbackStage = stageExists ?? (await prisma.boardStage.findFirst({ where: { boardId: series.boardId }, orderBy: { position: "asc" } }));
  if (!fallbackStage) return;

  const placeholderId = `TEMP-${Date.now()}-${Math.random()}`;
  const created = await prisma.task.create({
    data: {
      boardId: series.boardId,
      stageId: fallbackStage.id,
      title: snapshot.title,
      description: snapshot.description,
      priority: snapshot.priority as any,
      estimatedEffortHours: snapshot.estimatedEffortHours,
      createdById: snapshot.createdById,
      requiresApproval: snapshot.requiresApproval ?? false,
      approverUserId: snapshot.requiresApproval ? snapshot.approverUserId : null,
      taskId: placeholderId,
      taskType: TaskType.RECURRING_INSTANCE as any,
      seriesId: series.id,
      assignees: { create: snapshot.assigneeUserIds.map((userId, idx) => ({ userId, isPrimary: idx === 0 })) },
      checklistItems: snapshot.checklist?.length
        ? { create: snapshot.checklist.map((c, idx) => ({ text: c.text, ownerId: c.ownerId, position: idx })) }
        : undefined,
      tags: snapshot.tagIds?.length ? { create: snapshot.tagIds.map((tagId) => ({ tagId })) } : undefined,
    },
  });
  const finalTaskId = formatTaskId(created.taskNumber);
  await prisma.task.update({ where: { id: created.id }, data: { taskId: finalTaskId } });

  const nextRunAt = computeNextRunAt(series.nextRunAt, series.frequency, (series.customRuleJson as any)?.intervalDays);
  await prisma.recurringTaskSeries.update({
    where: { id: seriesId },
    data: { occurrencesGenerated: { increment: 1 }, nextRunAt },
  });

  await writeAudit({
    actor: null,
    action: AuditAction.CREATE,
    entityType: "Task",
    entityId: created.id,
    boardId: series.boardId,
    metadata: { generatedBySeriesId: series.id, taskId: finalTaskId },
  });

  await notifyMany(snapshot.assigneeUserIds, {
    event: NotificationEvent.TASK_ASSIGNED,
    title: `New recurring task ${finalTaskId}: ${snapshot.title}`,
    taskId: created.id,
    boardId: series.boardId,
  });
}

/** Scheduler entry point — processes every series whose nextRunAt has passed. */
export async function processAllDueSeries(): Promise<number> {
  const due = await prisma.recurringTaskSeries.findMany({
    where: { isActive: true, nextRunAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const s of due) {
    await generateNextInstance(s.id).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[recurrence] failed to generate instance for series ${s.id}:`, err);
    });
  }
  return due.length;
}
