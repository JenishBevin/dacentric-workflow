import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../common/audit";
import { loadTaskWithAccess, assertCanCollaborate } from "./task-access";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction } from "@dacentric/types";
import { Errors } from "../../common/errors";

/**
 * Watchers/followers (Section 24, Business Rule 10/11): notified of
 * activity but never assignees, never counted in workload, never in My
 * Tasks totals. Enforced by simply never joining watchers into any
 * workload/My-Tasks query anywhere in the codebase.
 */
export async function addWatcher(taskId: string, userId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanCollaborate(ctx);

  if (ctx.task.assignees.some((a) => a.userId === userId)) {
    throw Errors.badRequest("This person is already an assignee; assignees automatically receive task activity.");
  }

  const watcher = await prisma.taskWatcher.upsert({
    where: { taskId_userId: { taskId, userId } },
    create: { taskId, userId },
    update: {},
  });
  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "TaskWatcher", entityId: watcher.id, boardId: ctx.task.boardId, afterValue: { userId } });
  return watcher;
}

export async function removeWatcher(taskId: string, userId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanCollaborate(ctx);
  await prisma.taskWatcher.delete({ where: { taskId_userId: { taskId, userId } } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "TaskWatcher", entityId: taskId, boardId: ctx.task.boardId, afterValue: { userId } });
}
