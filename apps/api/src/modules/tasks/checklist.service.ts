import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../common/audit";
import { notify } from "../notifications/notifications.service";
import { loadTaskWithAccess, assertCanCollaborate } from "./task-access";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction, NotificationEvent } from "@dacentric/types";
import { Errors } from "../../common/errors";

export async function addChecklistItem(taskId: string, text: string, ownerId: string | undefined, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanCollaborate(ctx);

  const maxPos = await prisma.checklistItem.aggregate({ where: { taskId }, _max: { position: true } });
  const item = await prisma.checklistItem.create({
    data: { taskId, text, ownerId, position: (maxPos._max.position ?? -1) + 1 },
  });

  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "ChecklistItem", entityId: item.id, boardId: ctx.task.boardId, afterValue: { text, ownerId } });

  if (ownerId) {
    await notify({ userId: ownerId, event: NotificationEvent.CHECKLIST_ASSIGNED, title: `You were assigned a checklist item on ${ctx.task.taskId}`, taskId, boardId: ctx.task.boardId });
  }
  return item;
}

export async function updateChecklistItem(
  taskId: string,
  itemId: string,
  input: { text?: string; isComplete?: boolean; ownerId?: string | null },
  actor: AuthedUser
) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanCollaborate(ctx);

  const before = await prisma.checklistItem.findFirst({ where: { id: itemId, taskId } });
  if (!before) throw Errors.notFound("Checklist item");

  const item = await prisma.checklistItem.update({
    where: { id: itemId },
    data: {
      text: input.text,
      isComplete: input.isComplete,
      completedAt: input.isComplete ? new Date() : input.isComplete === false ? null : undefined,
      ownerId: input.ownerId === null ? null : input.ownerId,
    },
  });

  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "ChecklistItem", entityId: itemId, boardId: ctx.task.boardId, beforeValue: before, afterValue: input });

  if (input.ownerId && input.ownerId !== before.ownerId) {
    await notify({ userId: input.ownerId, event: NotificationEvent.CHECKLIST_ASSIGNED, title: `You were assigned a checklist item on ${ctx.task.taskId}`, taskId, boardId: ctx.task.boardId });
  }

  return item;
}

export async function deleteChecklistItem(taskId: string, itemId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanCollaborate(ctx);
  const item = await prisma.checklistItem.delete({ where: { id: itemId } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "ChecklistItem", entityId: itemId, boardId: ctx.task.boardId, beforeValue: item });
}
