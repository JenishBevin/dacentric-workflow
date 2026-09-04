import { prisma } from "../../lib/prisma";
import { AuthedUser } from "../../middleware/authenticate";
import { computeDueDateStatus } from "../tasks/task-formatting";
import { DueDateStatus } from "@dacentric/types";

/**
 * My Tasks (Section 29 / UC-11): every task assigned to the caller across
 * every board they belong to, grouped into the five required buckets.
 * Watcher-only tasks are deliberately excluded — only the TaskAssignee
 * relation is queried (Business Rule 10/11).
 */
export async function getMyTasks(user: AuthedUser) {
  const tasks = await prisma.task.findMany({
    where: { isDeleted: false, assignees: { some: { userId: user.id } } },
    include: {
      board: true,
      stage: true,
      assignees: { include: { user: true } },
      checklistItems: true,
    },
    orderBy: { dueDate: "asc" },
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

  const groups: Record<string, any[]> = {
    OVERDUE: [],
    DUE_TODAY: [],
    DUE_THIS_WEEK: [],
    UPCOMING: [],
    NO_DUE_DATE: [],
  };

  for (const t of tasks) {
    const item = {
      id: t.id,
      taskId: t.taskId,
      title: t.title,
      boardId: t.boardId,
      boardName: t.board.name,
      stageId: t.stageId,
      stageName: t.stage.name,
      priority: t.priority,
      dueDate: t.dueDate,
      dueDateStatus: computeDueDateStatus(t.dueDate, t.isCompleted),
      isCompleted: t.isCompleted,
      isPrimary: t.assignees.find((a) => a.userId === user.id)?.isPrimary ?? false,
      checklistProgress: { done: t.checklistItems.filter((c) => c.isComplete).length, total: t.checklistItems.length },
    };

    if (!t.dueDate) {
      groups.NO_DUE_DATE.push(item);
    } else if (item.dueDateStatus === DueDateStatus.OVERDUE) {
      groups.OVERDUE.push(item);
    } else if (t.dueDate >= startOfToday && t.dueDate <= endOfToday) {
      groups.DUE_TODAY.push(item);
    } else if (t.dueDate <= endOfWeek) {
      groups.DUE_THIS_WEEK.push(item);
    } else {
      groups.UPCOMING.push(item);
    }
  }

  return groups;
}
