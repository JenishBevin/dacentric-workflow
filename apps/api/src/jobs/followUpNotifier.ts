import { prisma } from "../lib/prisma";
import { notifyMany } from "../modules/notifications/notifications.service";
import { NotificationEvent } from "@dacentric/types";

/**
 * Runs once a day (see recurrenceScheduler.ts) reminding assignees to follow
 * up on tasks parked on a follow-up-enabled stage (e.g. Estimation's
 * "Submitted") once their follow-up date arrives. Deliberately re-notifies
 * every day the date has passed and hasn't been pushed forward — the task
 * stays parked there until someone either updates the date or moves it to
 * the next stage (which clears it — see moveTask()).
 */
export async function runFollowUpNotifications(): Promise<void> {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const dueTasks = await prisma.task.findMany({
    where: {
      isDeleted: false,
      isCompleted: false,
      followUpDate: { lte: endOfToday },
      stage: { isFollowUpStage: true },
    },
    include: { assignees: true },
  });

  for (const task of dueTasks) {
    await notifyMany(task.assignees.map((a) => a.userId), {
      event: NotificationEvent.TASK_FOLLOW_UP_DUE,
      title: `Follow up on ${task.taskId} today`,
      taskId: task.id,
      boardId: task.boardId,
    });
  }
}
