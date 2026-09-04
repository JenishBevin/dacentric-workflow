import { prisma } from "../lib/prisma";
import { notifyMany } from "../modules/notifications/notifications.service";
import { NotificationEvent } from "@dacentric/types";

/**
 * Runs once a day (see server.ts scheduling) firing the "due today" and
 * "overdue" notifications described in Section 32 / Section 6.9. Scheduled
 * to run once every 24h so it does not re-notify within the same day.
 */
export async function runDueDateNotifications(): Promise<void> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setHours(23, 59, 59, 999);

  const [dueToday, overdue] = await Promise.all([
    prisma.task.findMany({
      where: { isDeleted: false, isCompleted: false, dueDate: { gte: startOfToday, lte: endOfToday } },
      include: { assignees: true },
    }),
    prisma.task.findMany({
      where: { isDeleted: false, isCompleted: false, dueDate: { lt: startOfToday } },
      include: { assignees: true },
    }),
  ]);

  for (const task of dueToday) {
    await notifyMany(
      task.assignees.map((a) => a.userId),
      { event: NotificationEvent.TASK_DUE_TODAY, title: `${task.taskId} is due today`, taskId: task.id, boardId: task.boardId }
    );
  }
  for (const task of overdue) {
    await notifyMany(
      task.assignees.map((a) => a.userId),
      { event: NotificationEvent.TASK_OVERDUE, title: `${task.taskId} is overdue`, taskId: task.id, boardId: task.boardId }
    );
  }
}
