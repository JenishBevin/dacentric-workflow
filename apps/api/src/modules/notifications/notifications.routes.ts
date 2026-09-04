import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ok, parsePagination } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import { prisma } from "../../lib/prisma";
import { NotificationEvent } from "@dacentric/types";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { skip, take, page, pageSize } = parsePagination(req);
    const [items, unreadCount, total] = await Promise.all([
      prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.notification.count({ where: { userId: req.user!.id, isRead: false } }),
      prisma.notification.count({ where: { userId: req.user!.id } }),
    ]);
    return ok(res, { items, unreadCount }, { page, pageSize, total });
  })
);

notificationsRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { isRead: true, readAt: new Date() },
    });
    return ok(res, { message: "Marked as read." });
  })
);

notificationsRouter.post(
  "/mark-all-read",
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user!.id, isRead: false }, data: { isRead: true, readAt: new Date() } });
    return ok(res, { message: "All notifications marked as read." });
  })
);

notificationsRouter.get(
  "/preferences",
  asyncHandler(async (req, res) => {
    const existing = await prisma.notificationPreference.findMany({ where: { userId: req.user!.id } });
    const byEvent = new Map(existing.map((p) => [p.event, p]));
    const all = Object.values(NotificationEvent).map((event) => ({
      event,
      inApp: byEvent.get(event as any)?.inApp ?? true,
      email: byEvent.get(event as any)?.email ?? true,
    }));
    return ok(res, all);
  })
);

notificationsRouter.put(
  "/preferences/:event",
  validate(z.object({ inApp: z.boolean(), email: z.boolean() })),
  asyncHandler(async (req, res) => {
    const event = req.params.event as NotificationEvent;
    const { inApp, email } = (req as any).validatedBody;
    const pref = await prisma.notificationPreference.upsert({
      where: { userId_event: { userId: req.user!.id, event: event as any } },
      create: { userId: req.user!.id, event: event as any, inApp, email },
      update: { inApp, email },
    });
    return ok(res, pref);
  })
);
