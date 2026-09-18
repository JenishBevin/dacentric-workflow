import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../common/audit";
import { loadTaskWithAccess } from "./task-access";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction, RoleCode } from "@dacentric/types";
import { getStorageAdapter, validateFile, scanFile } from "../../lib/storage";
import { Errors } from "../../common/errors";

const ESTIMATION_BOARD_NAME = "Estimation";

// Deliberately narrower than isSystemLevelAdmin() — System Admin is NOT
// included, only the exact roles the business asked for.
const ALLOWED_ROLES: RoleCode[] = [RoleCode.SUPER_ADMIN, RoleCode.ACCOUNTS, RoleCode.PROCUREMENT, RoleCode.MANAGEMENT];

function canSeeSecretAttachments(actor: AuthedUser): boolean {
  return actor.roles.some((r) => ALLOWED_ROLES.includes(r));
}

/** Loads the task and enforces both the role gate and the Estimation-only
 * scope. Anyone outside the allowed roles gets the same 404 loadTaskWithAccess
 * already uses for boards they can't see — a 403 here would leak that a
 * hidden feature exists on this task even to someone who can never open it. */
async function loadWithSecretAccess(taskId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  if (!canSeeSecretAttachments(actor)) throw Errors.notFound("Task");
  if (ctx.task.board?.name !== ESTIMATION_BOARD_NAME) {
    throw Errors.badRequest("Secret attachments only exist while a task is on the Estimation board.");
  }
  return ctx;
}

export async function uploadSecretAttachment(taskId: string, file: Express.Multer.File, actor: AuthedUser) {
  const ctx = await loadWithSecretAccess(taskId, actor);

  const validationError = validateFile(file.originalname, file.size);
  if (validationError) throw Errors.validation(validationError, { file: validationError });

  const scanResult = await scanFile(file.buffer);
  if (scanResult === "REJECTED") {
    throw Errors.validation("This file failed the security scan and was not stored.");
  }

  const { storageKey } = await getStorageAdapter().save(file.originalname, file.buffer);

  const attachment = await prisma.secretTaskAttachment.create({
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
    entityType: "SecretTaskAttachment",
    entityId: attachment.id,
    boardId: ctx.task.boardId,
    afterValue: { fileName: file.originalname, sizeBytes: file.size },
  });

  return attachment;
}

export async function listSecretAttachments(taskId: string, actor: AuthedUser) {
  await loadWithSecretAccess(taskId, actor);
  const attachments = await prisma.secretTaskAttachment.findMany({
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

export async function downloadSecretAttachment(taskId: string, attachmentId: string, actor: AuthedUser) {
  await loadWithSecretAccess(taskId, actor);
  const attachment = await prisma.secretTaskAttachment.findFirstOrThrow({ where: { id: attachmentId, taskId } });
  const buffer = await getStorageAdapter().read(attachment.storageKey);
  return { attachment, buffer };
}

export async function deleteSecretAttachment(taskId: string, attachmentId: string, actor: AuthedUser) {
  const ctx = await loadWithSecretAccess(taskId, actor);
  const attachment = await prisma.secretTaskAttachment.findFirstOrThrow({ where: { id: attachmentId, taskId } });

  await getStorageAdapter().remove(attachment.storageKey);
  await prisma.secretTaskAttachment.delete({ where: { id: attachmentId } });

  await writeAudit({
    actor,
    action: AuditAction.DELETE,
    entityType: "SecretTaskAttachment",
    entityId: attachmentId,
    boardId: ctx.task.boardId,
    beforeValue: { fileName: attachment.fileName },
  });
}
