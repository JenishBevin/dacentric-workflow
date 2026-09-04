import { prisma } from "../../lib/prisma";
import { getEmailAdapter } from "../../lib/email";
import { notificationDigestEmail } from "../../lib/email/templates";
import { NotificationEvent } from "@dacentric/types";
import { env } from "../../lib/env";

export interface NotifyInput {
  userId: string;
  event: NotificationEvent;
  title: string;
  body?: string;
  taskId?: string;
  boardId?: string;
}

/**
 * Fires a single notification: always recorded in-app; emailed too if the
 * recipient's per-event preference allows it (Section 32 / Section 6.9).
 * Defaults to in-app+email ON for every event until the user changes it.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const [pref, user] = await Promise.all([
    prisma.notificationPreference.findUnique({
      where: { userId_event: { userId: input.userId, event: input.event as any } },
    }),
    prisma.user.findUnique({ where: { id: input.userId } }),
  ]);

  if (!user) return;

  const inAppEnabled = pref?.inApp ?? true;
  const emailEnabled = pref?.email ?? true;

  if (inAppEnabled) {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        event: input.event as any,
        title: input.title,
        body: input.body,
        taskId: input.taskId,
        boardId: input.boardId,
      },
    });
  }

  if (emailEnabled) {
    const link = input.taskId
      ? `${env.webPublicUrl}/workflow/tasks/${input.taskId}`
      : input.boardId
      ? `${env.webPublicUrl}/workflow/boards/${input.boardId}`
      : env.webPublicUrl;
    const msg = notificationDigestEmail(user.name, input.title, input.body ?? input.title, link);
    getEmailAdapter()
      .send({ to: user.workEmail, ...msg })
      .catch(() => undefined);
  }
}

export async function notifyMany(userIds: string[], base: Omit<NotifyInput, "userId">): Promise<void> {
  const unique = Array.from(new Set(userIds));
  await Promise.all(unique.map((userId) => notify({ ...base, userId })));
}
