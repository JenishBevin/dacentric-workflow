import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { AuthedUser } from "../../middleware/authenticate";
import { getBoardRole, BoardRole } from "../boards/board-access";
import { isSystemLevelAdmin, getPermissionScope } from "../../common/permissions";
import { PermissionKey } from "@dacentric/types";

export interface TaskAccessContext {
  task: NonNullable<Awaited<ReturnType<typeof loadTaskOr404>>>;
  boardRole: BoardRole;
  isAssignee: boolean;
  isCreator: boolean;
  isAdmin: boolean;
  permissions: AuthedUser["permissions"];
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
  const isAssignee = task.assignees.some((a) => a.userId === user.id);
  // Being assigned a task is enough to open it even without board membership —
  // it already shows up in that person's My Tasks, and 404ing on click made
  // those tasks unopenable (blank drawer) and un-completable.
  if (!boardRole && !isAdmin && !isAssignee) throw Errors.notFound("Task");

  return {
    task: task as any,
    boardRole,
    isAssignee,
    isCreator: task.createdById === user.id,
    isAdmin,
    permissions: user.permissions,
  };
}

/** Edit rights on a task's core fields: board Owner/Editor, the task's assignee, Admin,
 *  or a role explicitly granted company-wide (ALL-scope) EDIT_TASK in Roles & Permissions. */
export function assertCanEditTask(ctx: TaskAccessContext) {
  if (ctx.isAdmin) return;
  if (ctx.boardRole === "OWNER" || ctx.boardRole === "EDITOR") return;
  if (ctx.isAssignee) return;
  if (getPermissionScope(ctx.permissions, PermissionKey.EDIT_TASK) === "ALL") return;
  throw Errors.forbidden("You do not have edit rights on this task.");
}

/** Collaboration rights (checklist/comments/attachments/watchers) — Viewer excluded, Commenter allowed for comments only.
 *  Someone assigned to the task always qualifies, even if they're only a Viewer of its board (e.g. an
 *  org-wide-visibility role that was never added as a member) — same as assertCanEditTask. So does anyone
 *  granted company-wide (ALL-scope) MANAGE_TASK_COLLAB in Roles & Permissions (e.g. Management) — otherwise
 *  that setting would have no actual effect, the same reasoning as assertCanEditTask's EDIT_TASK check. */
export function assertCanCollaborate(ctx: TaskAccessContext) {
  if (ctx.isAdmin) return;
  if (ctx.isAssignee) return;
  if (getPermissionScope(ctx.permissions, PermissionKey.MANAGE_TASK_COLLAB) === "ALL") return;
  if (ctx.boardRole === "VIEWER") throw Errors.forbidden("Viewers have read-only access.");
  if (!ctx.boardRole && !ctx.isAssignee) throw Errors.forbidden();
}

/** Board Owner, Admin, or a role explicitly granted company-wide (ALL-scope)
 *  DELETE_TASK in Roles & Permissions (e.g. Management) — otherwise this
 *  setting in Roles & Permissions would have no actual effect. */
export function assertCanDeleteTask(ctx: TaskAccessContext) {
  if (ctx.isAdmin) return;
  if (ctx.boardRole === "OWNER") return;
  if (getPermissionScope(ctx.permissions, PermissionKey.DELETE_TASK) === "ALL") return;
  throw Errors.forbidden("Only the board Owner or an Administrator can delete a task.");
}
