import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { AuthedUser } from "../../middleware/authenticate";
import { isSystemLevelAdmin, getPermissionScope } from "../../common/permissions";
import { PermissionKey } from "@dacentric/types";

export type BoardRole = "OWNER" | "EDITOR" | "VIEWER" | "COMMENTER" | null;

/** Anyone whose effective VIEW_WORKFLOW scope is org-wide (e.g. CEO/Director),
 *  not just the hardcoded System/Super Admin roles — Section 5's RBAC matrix
 *  is the source of truth for *visibility*, not a fixed role list. */
function hasOrgWideViewScope(user: AuthedUser): boolean {
  return getPermissionScope(user.permissions, PermissionKey.VIEW_WORKFLOW) === "ALL";
}

/**
 * Business Rule 16 / Section 36: a user who is not a member of a board must
 * never be able to discover it through any list, search, filter or export —
 * except System Administrator (full OWNER-equivalent access) or anyone with
 * org-wide VIEW_WORKFLOW (read-only VIEWER-equivalent access, since that
 * scope grants visibility, not board/task configuration authority). This
 * helper is the single choke point every board/task query routes through.
 */
export async function getBoardRole(boardId: string, user: AuthedUser): Promise<BoardRole> {
  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: user.id } },
  });
  if (membership) return membership.role as BoardRole;

  if (isSystemLevelAdmin(user.roles)) return "OWNER";
  if (hasOrgWideViewScope(user)) return "VIEWER";
  return null;
}

export async function assertBoardVisible(boardId: string, user: AuthedUser) {
  const role = await getBoardRole(boardId, user);
  if (!role) throw Errors.notFound("Board", "Board not found."); // 404, not 403 — never confirms existence to non-members
  return role;
}

export function assertCanEditBoard(role: BoardRole) {
  if (role !== "OWNER" && role !== "EDITOR") {
    throw Errors.forbidden("Only board Owners and Editors can make this change.");
  }
}

export function assertIsBoardOwnerOrAdmin(role: BoardRole, user: AuthedUser) {
  if (role !== "OWNER" && !isSystemLevelAdmin(user.roles)) {
    throw Errors.forbidden("Only the board Owner or an Administrator can do this.");
  }
}

export function canComment(role: BoardRole) {
  return role === "OWNER" || role === "EDITOR" || role === "COMMENTER";
}

/** Base Prisma `where` clause enforcing board-membership visibility (or org-wide-visibility-sees-all). */
export function visibleBoardsWhere(user: AuthedUser) {
  if (isSystemLevelAdmin(user.roles) || hasOrgWideViewScope(user)) {
    return { isDeleted: false };
  }
  return {
    isDeleted: false,
    members: { some: { userId: user.id } },
  };
}
