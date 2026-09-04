import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { AuthedUser } from "../../middleware/authenticate";
import { isSystemLevelAdmin } from "../../common/permissions";

export type BoardRole = "OWNER" | "EDITOR" | "VIEWER" | "COMMENTER" | null;

/**
 * Business Rule 16 / Section 36: a user who is not a member of a board must
 * never be able to discover it through any list, search, filter or export —
 * except System Administrator, who can always see every board. This helper
 * is the single choke point every board/task query routes through.
 */
export async function getBoardRole(boardId: string, user: AuthedUser): Promise<BoardRole> {
  if (isSystemLevelAdmin(user.roles)) {
    // Admin can access any board; treat as OWNER-equivalent for permission checks,
    // but this does not silently add them as a member record.
    const membership = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: user.id } },
    });
    return (membership?.role as BoardRole) ?? "OWNER";
  }
  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: user.id } },
  });
  return (membership?.role as BoardRole) ?? null;
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

/** Base Prisma `where` clause enforcing board-membership visibility (or Admin-sees-all). */
export function visibleBoardsWhere(user: AuthedUser) {
  if (isSystemLevelAdmin(user.roles)) {
    return { isDeleted: false };
  }
  return {
    isDeleted: false,
    members: { some: { userId: user.id } },
  };
}
