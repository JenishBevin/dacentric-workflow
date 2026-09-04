import { prisma } from "../../lib/prisma";
import { AuthedUser } from "../../middleware/authenticate";
import { getPermissionScope, isSystemLevelAdmin } from "../../common/permissions";
import { PermissionKey } from "@dacentric/types";
import { visibleBoardsWhere } from "../boards/board-access";

export interface AuditFilters {
  dateFrom?: Date;
  dateTo?: Date;
  userId?: string;
  boardId?: string;
  taskId?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Section 34 / Business Rule 15: Admin sees all Workflow activity; a
 * Manager sees board-scoped activity only for boards they're permitted to
 * view. No route anywhere calls update/delete on AuditLog — it is
 * genuinely append-only end to end.
 */
export async function queryAuditLog(actor: AuthedUser, filters: AuditFilters) {
  const scope = getPermissionScope(actor.permissions, PermissionKey.VIEW_AUDIT_TRAIL);
  const isAdmin = isSystemLevelAdmin(actor.roles);

  const where: any = {};
  if (!isAdmin) {
    if (scope === "NONE") return { items: [], total: 0 };
    // Board-scoped: restrict to boards the user can see.
    const boards = await prisma.board.findMany({ where: visibleBoardsWhere(actor), select: { id: true } });
    where.boardId = { in: boards.map((b) => b.id) };
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
    if (filters.dateTo) where.createdAt.lte = filters.dateTo;
  }
  if (filters.userId) where.userId = filters.userId;
  if (filters.boardId) where.boardId = filters.boardId;
  if (filters.taskId) where.entityId = filters.taskId;
  if (filters.action) where.action = filters.action;

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total };
}
