import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler, ok, created } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import * as chatService from "./chat.service";

export const chatRouter = Router();
chatRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

chatRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const search = (req.query.search as string) ?? "";
    return ok(res, await chatService.listMessageableUsers(req.user!, search));
  })
);

chatRouter.get(
  "/conversations",
  asyncHandler(async (req, res) => ok(res, await chatService.listConversations(req.user!)))
);

chatRouter.get(
  "/conversations/unread-count",
  asyncHandler(async (req, res) => ok(res, { count: await chatService.getUnreadConversationCount(req.user!) }))
);

chatRouter.post(
  "/conversations",
  validate(z.object({ userId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const conversation = await chatService.getOrCreateDirectConversation(req.user!, (req as any).validatedBody.userId);
    return created(res, conversation);
  })
);

// "Discuss" button — creates a named GROUP conversation seeded with a
// task/project card, instead of the plain 1:1 DM above.
chatRouter.post(
  "/conversations/group",
  validate(
    z.object({
      name: z.string().trim().min(1, "Enter a name for this discussion.").max(150),
      userIds: z.array(z.string().uuid()).min(1, "Select at least one person."),
      entityType: z.enum(["TASK", "BOARD"]),
      entityId: z.string().uuid(),
    })
  ),
  asyncHandler(async (req, res) => {
    const conversation = await chatService.createGroupConversation(req.user!, (req as any).validatedBody);
    return created(res, conversation);
  })
);

// Discussions already started from a given task/project — lets the
// "Discuss" button offer "reopen" alongside "start new".
chatRouter.get(
  "/conversations/for-entity",
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.query as Record<string, string>;
    if ((entityType !== "TASK" && entityType !== "BOARD") || !entityId) {
      return ok(res, []);
    }
    return ok(res, await chatService.listGroupConversationsForEntity(req.user!, entityType, entityId));
  })
);

chatRouter.post(
  "/conversations/:conversationId/participants",
  validate(z.object({ userIds: z.array(z.string().uuid()).min(1, "Select at least one person.") })),
  asyncHandler(async (req, res) => {
    const conversation = await chatService.addParticipants(req.params.conversationId, req.user!, (req as any).validatedBody.userIds);
    return ok(res, conversation);
  })
);

chatRouter.delete(
  "/conversations/:conversationId/participants/:userId",
  asyncHandler(async (req, res) => {
    await chatService.removeParticipant(req.params.conversationId, req.user!, req.params.userId);
    return ok(res, { message: "Removed from the discussion." });
  })
);

// "Who's in this?" — a group thread's full membership, fetched only while
// that thread is open (the conversations list already carries this per row,
// but that query isn't running once you're inside a thread).
chatRouter.get(
  "/conversations/:conversationId",
  asyncHandler(async (req, res) => ok(res, await chatService.getConversationDetail(req.params.conversationId, req.user!)))
);

chatRouter.get(
  "/conversations/:conversationId/messages",
  asyncHandler(async (req, res) => {
    const take = Math.min(100, Math.max(1, Number(req.query.take) || 30));
    const before = req.query.before ? new Date(req.query.before as string) : undefined;
    return ok(res, await chatService.listMessages(req.params.conversationId, req.user!, { take, before }));
  })
);

chatRouter.post(
  "/conversations/:conversationId/messages",
  upload.array("files", 5),
  asyncHandler(async (req, res) => {
    const body = (req.body?.body as string) ?? undefined;
    const files = (req.files as Express.Multer.File[]) ?? [];
    const message = await chatService.sendMessage(req.params.conversationId, req.user!, { body, files });
    return created(res, message);
  })
);

chatRouter.patch(
  "/conversations/:conversationId/messages/:messageId",
  validate(z.object({ body: z.string().min(1).max(4000) })),
  asyncHandler(async (req, res) => {
    const message = await chatService.editMessage(req.params.conversationId, req.params.messageId, req.user!, (req as any).validatedBody.body);
    return ok(res, message);
  })
);

chatRouter.delete(
  "/conversations/:conversationId/messages/:messageId",
  asyncHandler(async (req, res) => {
    await chatService.deleteMessage(req.params.conversationId, req.params.messageId, req.user!);
    return ok(res, { message: "Message deleted." });
  })
);

chatRouter.delete(
  "/conversations/:conversationId",
  asyncHandler(async (req, res) => {
    await chatService.deleteConversation(req.params.conversationId, req.user!);
    return ok(res, { message: "Conversation deleted." });
  })
);

chatRouter.post(
  "/conversations/:conversationId/read",
  asyncHandler(async (req, res) => {
    await chatService.markConversationRead(req.params.conversationId, req.user!);
    return ok(res, { message: "Marked as read." });
  })
);

chatRouter.get(
  "/attachments/:attachmentId/download",
  asyncHandler(async (req, res) => {
    const { attachment, buffer } = await chatService.downloadChatAttachment(req.params.attachmentId, req.user!);
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${attachment.fileName}"`);
    res.send(buffer);
  })
);
