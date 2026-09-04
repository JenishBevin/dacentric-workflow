import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../common/audit";
import { loadTaskWithAccess, assertCanCollaborate } from "./task-access";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction } from "@dacentric/types";
import { getStorageAdapter, validateFile, scanFile } from "../../lib/storage";
import { Errors } from "../../common/errors";

export async function uploadAttachment(taskId: string, file: Express.Multer.File, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanCollaborate(ctx);

  const validationError = validateFile(file.originalname, file.size);
  if (validationError) throw Errors.validation(validationError, { file: validationError });

  const scanResult = await scanFile(file.buffer);
  if (scanResult === "REJECTED") {
    throw Errors.validation("This file failed the security scan and was not stored.");
  }

  const { storageKey } = await getStorageAdapter().save(file.originalname, file.buffer);

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId,
      fileName: file.originalname,
      storageKey,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      uploadedById: actor.id,
      scanStatus: scanResult,
    },
  });

  await writeAudit({
    actor,
    action: AuditAction.CREATE,
    entityType: "TaskAttachment",
    entityId: attachment.id,
    boardId: ctx.task.boardId,
    afterValue: { fileName: file.originalname, sizeBytes: file.size },
  });

  return attachment;
}

export async function listAttachments(taskId: string, actor: AuthedUser) {
  await loadTaskWithAccess(taskId, actor);
  // Select only what the client needs — never the raw joined User row,
  // which would carry passwordHash and friends.
  const attachments = await prisma.taskAttachment.findMany({
    where: { taskId },
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return attachments.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    fileSizeBytes: a.fileSizeBytes,
    mimeType: a.mimeType,
    uploadedByName: a.uploadedBy.name,
    createdAt: a.createdAt,
  }));
}

export async function downloadAttachment(taskId: string, attachmentId: string, actor: AuthedUser) {
  await loadTaskWithAccess(taskId, actor);
  const attachment = await prisma.taskAttachment.findFirstOrThrow({ where: { id: attachmentId, taskId } });
  const buffer = await getStorageAdapter().read(attachment.storageKey);
  return { attachment, buffer };
}

export async function deleteAttachment(taskId: string, attachmentId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanCollaborate(ctx);
  const attachment = await prisma.taskAttachment.findFirstOrThrow({ where: { id: attachmentId, taskId } });

  if (attachment.uploadedById !== actor.id && ctx.boardRole !== "OWNER" && !ctx.isAdmin) {
    throw Errors.forbidden("Only the uploader, the board Owner, or an Administrator can remove this file.");
  }

  await getStorageAdapter().remove(attachment.storageKey);
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });

  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "TaskAttachment", entityId: attachmentId, boardId: ctx.task.boardId, beforeValue: { fileName: attachment.fileName } });
}
