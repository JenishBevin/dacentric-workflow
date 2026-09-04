import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../common/audit";
import { notifyMany } from "../notifications/notifications.service";
import { loadTaskWithAccess, assertCanCollaborate } from "./task-access";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction, NotificationEvent } from "@dacentric/types";

export async function addComment(taskId: string, body: string, mentionedUserIds: string[] | undefined, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanCollaborate(ctx);

  // @mentions must resolve to active platform users (Business rule, UC-16).
  const validMentions = mentionedUserIds?.length
    ? (await prisma.user.findMany({ where: { id: { in: mentionedUserIds }, status: "ACTIVE" } })).map((u) => u.id)
    : [];

  const comment = await prisma.comment.create({
    data: { taskId, authorId: actor.id, body, mentionedUserIds: validMentions },
  });

  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "Comment", entityId: comment.id, boardId: ctx.task.boardId, afterValue: { body } });

  const watchers = await prisma.taskWatcher.findMany({ where: { taskId } });
  const notifyIds = new Set([...validMentions, ...watchers.map((w) => w.userId)]);
  notifyIds.delete(actor.id);

  await notifyMany(validMentions, {
    event: NotificationEvent.MENTION,
    title: `${actor.name} mentioned you on ${ctx.task.taskId}`,
    taskId,
    boardId: ctx.task.boardId,
  });

  const watcherOnly = [...notifyIds].filter((id) => !validMentions.includes(id));
  await notifyMany(watcherOnly, {
    event: NotificationEvent.TASK_ACTIVITY,
    title: `New comment on ${ctx.task.taskId}`,
    taskId,
    boardId: ctx.task.boardId,
  });

  return { id: comment.id, body: comment.body, authorName: actor.name, createdAt: comment.createdAt };
}

export async function listComments(taskId: string, actor: AuthedUser) {
  await loadTaskWithAccess(taskId, actor);
  // Select only what the client needs (id/body/author name/date) — never
  // the raw joined User row, which would carry passwordHash and friends.
  const comments = await prisma.comment.findMany({
    where: { taskId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return comments.map((c) => ({ id: c.id, body: c.body, authorName: c.author.name, createdAt: c.createdAt }));
}
