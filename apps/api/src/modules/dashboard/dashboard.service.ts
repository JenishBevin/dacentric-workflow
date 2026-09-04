import { prisma } from "../../lib/prisma";
import { AuthedUser } from "../../middleware/authenticate";
import { visibleBoardsWhere } from "../boards/board-access";
import { computeDueDateStatus } from "../tasks/task-formatting";

export interface DashboardFilters {
  departmentId?: string;
  boardId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export type DashboardStatKind =
  | "TOTAL_OPEN"
  | "OVERDUE"
  | "DUE_TODAY"
  | "DUE_THIS_WEEK"
  | "COMPLETED_THIS_MONTH"
  | "PENDING_APPROVAL";

function dateWindows() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { now, startOfToday, endOfToday, endOfWeek, startOfMonth };
}

async function scopedBoardIds(actor: AuthedUser, filters: DashboardFilters) {
  const boardWhere = visibleBoardsWhere(actor);
  const visibleBoards = await prisma.board.findMany({ where: boardWhere, select: { id: true } });
  const boardIds = filters.boardId ? [filters.boardId] : visibleBoards.map((b) => b.id);
  return { boardWhere, boardIds };
}

/**
 * Every figure here is a live aggregate query against the same tables the
 * rest of the app writes to — Section 9: "Dashboard figures must be derived
 * from actual database data. Do not hard-code dashboard statistics."
 */
export async function getDashboard(actor: AuthedUser, filters: DashboardFilters) {
  const { boardWhere, boardIds } = await scopedBoardIds(actor, filters);
  const { now, startOfToday, endOfToday, endOfWeek, startOfMonth } = dateWindows();

  const baseWhere: any = { boardId: { in: boardIds }, isDeleted: false };

  const [
    totalOpen,
    overdue,
    dueToday,
    dueThisWeek,
    completedThisMonth,
    activeBoards,
    priorityBreakdown,
    statusBreakdown,
    pendingApprovals,
    recentActivity,
  ] = await Promise.all([
    prisma.task.count({ where: { ...baseWhere, isCompleted: false } }),
    prisma.task.count({ where: { ...baseWhere, isCompleted: false, dueDate: { lt: now } } }),
    prisma.task.count({ where: { ...baseWhere, isCompleted: false, dueDate: { gte: startOfToday, lte: endOfToday } } }),
    prisma.task.count({ where: { ...baseWhere, isCompleted: false, dueDate: { gte: startOfToday, lte: endOfWeek } } }),
    prisma.task.count({ where: { ...baseWhere, isCompleted: true, completedAt: { gte: startOfMonth } } }),
    prisma.board.count({ where: { ...boardWhere, isArchived: false } }),
    prisma.task.groupBy({ by: ["priority"], where: { ...baseWhere, isCompleted: false }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["stageId"], where: { ...baseWhere }, _count: { _all: true } }),
    prisma.task.count({ where: { ...baseWhere, approvalStatus: "PENDING_APPROVAL" } }),
    prisma.auditLog.findMany({ where: { boardId: { in: boardIds } }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);

  const stages = await prisma.boardStage.findMany({ where: { id: { in: statusBreakdown.map((s) => s.stageId) } } });
  const stageNameById = new Map(stages.map((s) => [s.id, s.name]));

  return {
    totalOpenTasks: totalOpen,
    overdueTasks: overdue,
    dueToday,
    dueThisWeek,
    completedThisMonth,
    activeBoards,
    pendingApprovals,
    priorityDistribution: priorityBreakdown.map((p) => ({ priority: p.priority, count: p._count._all })),
    statusDistribution: statusBreakdown.map((s) => ({ stage: stageNameById.get(s.stageId) ?? "Unknown", count: s._count._all })),
    recentActivity,
  };
}

/** Drill-down list backing each clickable dashboard stat card — same scoping as getDashboard. */
export async function getDashboardTaskList(actor: AuthedUser, kind: DashboardStatKind, filters: DashboardFilters) {
  const { boardIds } = await scopedBoardIds(actor, filters);
  const { now, startOfToday, endOfToday, endOfWeek, startOfMonth } = dateWindows();

  const baseWhere: any = { boardId: { in: boardIds }, isDeleted: false };
  let where: any;
  switch (kind) {
    case "TOTAL_OPEN":
      where = { ...baseWhere, isCompleted: false };
      break;
    case "OVERDUE":
      where = { ...baseWhere, isCompleted: false, dueDate: { lt: now } };
      break;
    case "DUE_TODAY":
      where = { ...baseWhere, isCompleted: false, dueDate: { gte: startOfToday, lte: endOfToday } };
      break;
    case "DUE_THIS_WEEK":
      where = { ...baseWhere, isCompleted: false, dueDate: { gte: startOfToday, lte: endOfWeek } };
      break;
    case "COMPLETED_THIS_MONTH":
      where = { ...baseWhere, isCompleted: true, completedAt: { gte: startOfMonth } };
      break;
    case "PENDING_APPROVAL":
      where = { ...baseWhere, approvalStatus: "PENDING_APPROVAL" };
      break;
  }

  const tasks = await prisma.task.findMany({
    where,
    include: { board: true, assignees: { include: { user: { select: { id: true, name: true } } } } },
    orderBy: { dueDate: "asc" },
    take: 200,
  });

  return tasks.map((t) => ({
    id: t.id,
    taskId: t.taskId,
    title: t.title,
    boardId: t.boardId,
    boardName: t.board.name,
    priority: t.priority,
    dueDate: t.dueDate,
    dueDateStatus: computeDueDateStatus(t.dueDate, t.isCompleted),
    isCompleted: t.isCompleted,
    approvalStatus: t.approvalStatus,
    assignees: t.assignees.map((a) => ({ userId: a.userId, name: a.user.name })),
  }));
}
