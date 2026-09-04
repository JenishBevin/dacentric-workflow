import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { AuthedUser } from "../../middleware/authenticate";
import { getBoardRole, BoardRole } from "../boards/board-access";
import { isSystemLevelAdmin } from "../../common/permissions";

export interface TaskAccessContext {
  task: NonNullable<Awaited<ReturnType<typeof loadTaskOr404>>>;
  boardRole: BoardRole;
  isAssignee: boolean;
  isCreator: boolean;
  isAdmin: boolean;
}

async function loadTaskOr404(taskId: string) {
  return prisma.task.findFirst({
    where: { id: taskId, isDeleted: false },
    include: { assignees: true, board: true, stage: true },
  });
}

/** Loads a task and enforces board-membership visibility in one step. */
export async function loadTaskWithAccess(taskId: string, user: AuthedUser): Promise<TaskAccessContext> {
  const task = await loadTaskOr404(taskId);
  if (!task) throw Errors.notFound("Task");

  const boardRole = await getBoardRole(task.boardId, user);
  const isAdmin = isSystemLevelAdmin(user.roles);
  if (!boardRole && !isAdmin) throw Errors.notFound("Task");

  return {
    task: task as any,
    boardRole,
    isAssignee: task.assignees.some((a) => a.userId === user.id),
    isCreator: task.createdById === user.id,
    isAdmin,
  };
}

/** Edit rights on a task's core fields: board Owner/Editor, the task's assignee, or Admin. */
export function assertCanEditTask(ctx: TaskAccessContext) {
  if (ctx.isAdmin) return;
  if (ctx.boardRole === "OWNER" || ctx.boardRole === "EDITOR") return;
  if (ctx.isAssignee) return;
  throw Errors.forbidden("You do not have edit rights on this task.");
}

/** Collaboration rights (checklist/comments/attachments) — Viewer excluded, Commenter allowed for comments only. */
export function assertCanCollaborate(ctx: TaskAccessContext) {
  if (ctx.isAdmin) return;
  if (ctx.boardRole === "VIEWER") throw Errors.forbidden("Viewers have read-only access.");
  if (!ctx.boardRole && !ctx.isAssignee) throw Errors.forbidden();
}

export function assertCanDeleteTask(ctx: TaskAccessContext) {
  if (ctx.isAdmin) return;
  if (ctx.boardRole === "OWNER") return;
  throw Errors.forbidden("Only the board Owner or an Administrator can delete a task.");
}
