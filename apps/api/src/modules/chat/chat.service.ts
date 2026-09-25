import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { AuthedUser } from "../../middleware/authenticate";
import { getStorageAdapter, validateFile, scanFile } from "../../lib/storage";
import { loadTaskWithAccess } from "../tasks/task-access";
import { assertBoardVisible } from "../boards/board-access";

/** Throws 404 (never 403) if the actor isn't a participant — never confirms
 *  a conversation's existence to someone outside it. */
async function assertParticipant(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) throw Errors.notFound("Conversation");
  return participant;
}

/** Messages visible to this participant: not hidden by them individually
 *  ("delete message"), and — if they've cleared the conversation — only
 *  what arrived after that point ("delete conversation"). Both are
 *  per-viewer; the other participant's view is untouched. */
function visibleMessagesWhere(conversationId: string, userId: string, clearedAt: Date | null) {
  return {
    conversationId,
    NOT: { deletedFor: { has: userId } },
    ...(clearedAt ? { createdAt: { gt: clearedAt } } : {}),
  };
}

/** Users any signed-in user can start a 1:1 chat with — every other active
 *  account, org-wide (chat has no board-membership scoping). */
export async function listMessageableUsers(actor: AuthedUser, search = "") {
  const users = await prisma.user.findMany({
    where: {
      id: { not: actor.id },
      status: "ACTIVE",
      name: { contains: search, mode: "insensitive" },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 50,
  });
  return users;
}

/** Finds the existing 1:1 conversation between these two users, or creates
 *  one — idempotent, so "start chat" never produces duplicate threads.
 *  Conversations/participants are never deleted (delete is per-viewer), so
 *  this lookup always finds a prior thread between the same two people. */
export async function getOrCreateDirectConversation(actor: AuthedUser, otherUserId: string) {
  if (otherUserId === actor.id) throw Errors.badRequest("You can't start a conversation with yourself.");
  const other = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!other || other.status !== "ACTIVE") throw Errors.notFound("User");

  const existing = await prisma.conversation.findFirst({
    where: {
      AND: [{ participants: { some: { userId: actor.id } } }, { participants: { some: { userId: otherUserId } } }],
    },
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: { participants: { create: [{ userId: actor.id }, { userId: otherUserId }] } },
  });
}

/** The "Discuss" button's card metadata — the entity's own values captured
 *  at the moment the discussion is started, so the card stays historically
 *  accurate even if the task/board is later renamed or moved. */
type DiscussCardMetadata = { entityType: "TASK" | "BOARD"; code: string; title: string; subtitle?: string; path: string };

async function buildDiscussCard(
  actor: AuthedUser,
  entityType: "TASK" | "BOARD",
  entityId: string
): Promise<DiscussCardMetadata> {
  if (entityType === "TASK") {
    const ctx = await loadTaskWithAccess(entityId, actor);
    return {
      entityType: "TASK",
      code: ctx.task.taskId,
      title: ctx.task.title,
      subtitle: ctx.task.stage?.name,
      path: `/workflow/boards/${ctx.task.boardId}?task=${ctx.task.id}`,
    };
  }
  await assertBoardVisible(entityId, actor);
  const board = await prisma.board.findUniqueOrThrow({ where: { id: entityId } });
  return { entityType: "BOARD", code: board.boardId, title: board.name, path: `/workflow/boards/${board.id}` };
}

/** Creates a named GROUP conversation seeded with a card describing the
 *  task/project it was started from — the "Discuss" button. Unlike
 *  getOrCreateDirectConversation, this is never deduped: every submission
 *  makes a fresh thread, since each is a deliberately-named discussion. */
export async function createGroupConversation(
  actor: AuthedUser,
  input: { name: string; userIds: string[]; entityType: "TASK" | "BOARD"; entityId: string }
) {
  const name = input.name.trim();
  if (!name) throw Errors.badRequest("Enter a name for this discussion.");

  const card = await buildDiscussCard(actor, input.entityType, input.entityId);

  const participantIds = [...new Set([actor.id, ...input.userIds])];
  const activeUsers = await prisma.user.count({ where: { id: { in: participantIds }, status: "ACTIVE" } });
  if (activeUsers !== participantIds.length) throw Errors.badRequest("One or more selected people are no longer active.");

  const conversation = await prisma.conversation.create({
    data: {
      type: "GROUP",
      name,
      createdById: actor.id,
      entityType: input.entityType,
      entityId: input.entityId,
      participants: { create: participantIds.map((userId) => ({ userId })) },
      messages: { create: { senderId: actor.id, kind: "CARD", metadata: card as any } },
    },
  });

  return conversation;
}

/** Discussions already started from this task/project — lets the "Discuss"
 *  button reopen a prior one instead of only ever starting new ones. Only
 *  discussions the actor is actually a participant of (same
 *  never-confirm-existence-to-non-participants stance as the rest of chat). */
export async function listGroupConversationsForEntity(actor: AuthedUser, entityType: "TASK" | "BOARD", entityId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { type: "GROUP", entityType, entityId, participants: { some: { userId: actor.id } } },
    include: { participants: true },
    orderBy: { createdAt: "desc" },
  });
  return conversations.map((c) => ({ id: c.id, name: c.name, participantCount: c.participants.length, createdAt: c.createdAt }));
}

/** Manually adding people to an already-started group ("+" in the thread
 *  header) — org-wide, unlike the original candidate list the "Discuss"
 *  popup shows (which is scoped to people already tagged on the task/
 *  project); once a discussion exists, its creator/participants may
 *  reasonably want to loop in anyone else. */
export async function addParticipants(conversationId: string, actor: AuthedUser, userIds: string[]) {
  await assertParticipant(conversationId, actor.id);
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { participants: true } });
  if (conversation.type !== "GROUP") throw Errors.badRequest("Only group discussions can have people added to them.");

  const existingIds = new Set(conversation.participants.map((p) => p.userId));
  const newIds = [...new Set(userIds)].filter((id) => !existingIds.has(id));
  if (newIds.length === 0) return conversation;

  const activeUsers = await prisma.user.count({ where: { id: { in: newIds }, status: "ACTIVE" } });
  if (activeUsers !== newIds.length) throw Errors.badRequest("One or more selected people are no longer active.");

  await prisma.conversationParticipant.createMany({ data: newIds.map((userId) => ({ conversationId, userId })) });
  return prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { participants: true } });
}

/** Full "who's in this" detail for a thread — the list-of-conversations row
 *  already carries participant names, but the widget doesn't keep that query
 *  running once you're inside a thread, so an open thread needs its own
 *  lookup to show/manage membership. */
export async function getConversationDetail(conversationId: string, actor: AuthedUser) {
  await assertParticipant(conversationId, actor.id);
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { participants: { include: { user: { select: { id: true, name: true } } } } },
  });
  return {
    id: conversation.id,
    name: conversation.name,
    isGroup: conversation.type === "GROUP",
    createdById: conversation.createdById,
    participants: conversation.participants.map((p) => ({ userId: p.userId, name: p.user.name })),
  };
}

/** Removing someone from a GROUP discussion. Anyone can remove themselves
 *  ("leave"); removing someone else is limited to whoever started the
 *  discussion — the same ownership the "group heading can be set by who
 *  created this group" request implied for renaming. */
export async function removeParticipant(conversationId: string, actor: AuthedUser, targetUserId: string) {
  await assertParticipant(conversationId, actor.id);
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  if (conversation.type !== "GROUP") throw Errors.badRequest("Only group discussions support removing people.");
  if (targetUserId !== actor.id && conversation.createdById !== actor.id) {
    throw Errors.forbidden("Only the person who started this discussion can remove someone else.");
  }

  const existing = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
  });
  if (!existing) return;

  await prisma.conversationParticipant.delete({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
  });
}

export async function listConversations(actor: AuthedUser) {
  const participations = await prisma.conversationParticipant.findMany({
    where: { userId: actor.id },
    include: {
      conversation: {
        include: { participants: { include: { user: { select: { id: true, name: true } } } } },
      },
    },
  });

  const rows = await Promise.all(
    participations.map(async (p) => {
      const isGroup = p.conversation.type === "GROUP";
      const other = p.conversation.participants.find((cp) => cp.userId !== actor.id)?.user ?? null;
      const where = visibleMessagesWhere(p.conversationId, actor.id, p.clearedAt);

      const lastMessage = await prisma.chatMessage.findFirst({
        where,
        orderBy: { createdAt: "desc" },
        include: { attachments: true },
      });
      // Cleared, and nothing new has arrived since — this conversation stays
      // out of the list until the other person sends something new.
      if (p.clearedAt && !lastMessage) return null;

      const unreadCount = await prisma.chatMessage.count({
        where: { ...where, senderId: { not: actor.id }, createdAt: { gt: p.lastReadAt ?? new Date(0) } },
      });

      return {
        id: p.conversation.id,
        isGroup,
        title: isGroup ? (p.conversation.name ?? "Group") : (other?.name ?? "Unknown user"),
        participants: p.conversation.participants.map((cp) => ({ userId: cp.userId, name: cp.user.name })),
        otherUser: other,
        lastMessage: lastMessage
          ? {
              body: lastMessage.body,
              kind: lastMessage.kind,
              hasAttachments: lastMessage.attachments.length > 0,
              senderId: lastMessage.senderId,
              createdAt: lastMessage.createdAt,
            }
          : null,
        unreadCount,
        updatedAt: lastMessage?.createdAt ?? p.conversation.updatedAt,
      };
    })
  );

  return rows.filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getUnreadConversationCount(actor: AuthedUser) {
  const participations = await prisma.conversationParticipant.findMany({ where: { userId: actor.id } });
  const counts = await Promise.all(
    participations.map((p) =>
      prisma.chatMessage.count({
        where: {
          ...visibleMessagesWhere(p.conversationId, actor.id, p.clearedAt),
          senderId: { not: actor.id },
          createdAt: { gt: p.lastReadAt ?? new Date(0) },
        },
      })
    )
  );
  return counts.filter((c) => c > 0).length;
}

export async function listMessages(conversationId: string, actor: AuthedUser, opts: { take: number; before?: Date }) {
  const participant = await assertParticipant(conversationId, actor.id);

  const messages = await prisma.chatMessage.findMany({
    where: {
      ...visibleMessagesWhere(conversationId, actor.id, participant.clearedAt),
      ...(opts.before ? { createdAt: { lt: opts.before } } : {}),
    },
    include: { sender: { select: { id: true, name: true } }, attachments: true },
    orderBy: { createdAt: "desc" },
    take: opts.take,
  });
  return messages.reverse();
}

export async function sendMessage(
  conversationId: string,
  actor: AuthedUser,
  input: { body?: string; files?: Express.Multer.File[] }
) {
  await assertParticipant(conversationId, actor.id);

  const body = input.body?.trim() || undefined;
  const files = input.files ?? [];
  if (!body && files.length === 0) throw Errors.badRequest("A message needs text or at least one file.");

  const attachmentsData: Array<{ fileName: string; storageKey: string; mimeType: string; fileSizeBytes: number }> = [];
  for (const file of files) {
    const validationError = validateFile(file.originalname, file.size);
    if (validationError) throw Errors.validation(validationError, { file: validationError });
    const scanResult = await scanFile(file.buffer);
    if (scanResult === "REJECTED") throw Errors.validation(`"${file.originalname}" failed the security scan and was not sent.`);
    const { storageKey } = await getStorageAdapter().save(file.originalname, file.buffer);
    attachmentsData.push({ fileName: file.originalname, storageKey, mimeType: file.mimetype, fileSizeBytes: file.size });
  }

  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        conversationId,
        senderId: actor.id,
        body,
        attachments: attachmentsData.length ? { create: attachmentsData } : undefined,
      },
      include: { sender: { select: { id: true, name: true } }, attachments: true },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
    prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
      data: { lastReadAt: new Date() },
    }),
  ]);

  return message;
}

const EDIT_WINDOW_MS = 60_000;

export async function editMessage(conversationId: string, messageId: string, actor: AuthedUser, body: string) {
  await assertParticipant(conversationId, actor.id);
  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, conversationId } });
  if (!message) throw Errors.notFound("Message");
  if (message.senderId !== actor.id) throw Errors.forbidden("You can only edit your own messages.");
  if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw Errors.forbidden("Messages can only be edited within 1 minute of sending.");
  }

  const trimmed = body.trim();
  if (!trimmed) throw Errors.badRequest("Message text can't be empty.");

  return prisma.chatMessage.update({
    where: { id: messageId },
    data: { body: trimmed, editedAt: new Date() },
    include: { sender: { select: { id: true, name: true } }, attachments: true },
  });
}

/** "Delete for me" — hides this message from the actor's own view only.
 *  Either participant can hide any message (theirs or the other side's);
 *  the other participant's view is completely unaffected. */
export async function deleteMessage(conversationId: string, messageId: string, actor: AuthedUser) {
  await assertParticipant(conversationId, actor.id);
  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, conversationId } });
  if (!message) throw Errors.notFound("Message");
  if (message.deletedFor.includes(actor.id)) return message;

  return prisma.chatMessage.update({
    where: { id: messageId },
    data: { deletedFor: { push: actor.id } },
  });
}

/** "Delete conversation" — clears it from the actor's own inbox only. The
 *  other participant keeps their full history; the conversation reappears
 *  for the actor once a new message arrives after this point. */
export async function deleteConversation(conversationId: string, actor: AuthedUser) {
  await assertParticipant(conversationId, actor.id);
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: actor.id } },
    data: { clearedAt: new Date() },
  });
}

export async function markConversationRead(conversationId: string, actor: AuthedUser) {
  await assertParticipant(conversationId, actor.id);
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: actor.id } },
    data: { lastReadAt: new Date() },
  });
}

export async function downloadChatAttachment(attachmentId: string, actor: AuthedUser) {
  const attachment = await prisma.chatAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { message: true },
  });
  await assertParticipant(attachment.message.conversationId, actor.id);
  const buffer = await getStorageAdapter().read(attachment.storageKey);
  return { attachment, buffer };
}
