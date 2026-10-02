import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../common/audit";
import { loadTaskWithAccess } from "./task-access";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction, RoleCode, TaskApprovalStatus, NotificationEvent } from "@dacentric/types";
import { getStorageAdapter, validateFile, scanFile } from "../../lib/storage";
import { Errors } from "../../common/errors";
import { notifyMany } from "../notifications/notifications.service";

const ESTIMATION_BOARD_NAME = "Estimation";

// Deliberately narrower than isSystemLevelAdmin() — System Admin is NOT
// included, only the exact roles the business asked for.
const ALLOWED_ROLES: RoleCode[] = [RoleCode.SUPER_ADMIN, RoleCode.ACCOUNTS, RoleCode.PROCUREMENT, RoleCode.MANAGEMENT];

function canSeeSecretAttachments(actor: AuthedUser): boolean {
  return actor.roles.some((r) => ALLOWED_ROLES.includes(r));
}

/** Loads the task and enforces the role gate. Awarding moves a task onto a
 * new Project board but keeps the same row — quotationApprovalStatus and
 * any already-submitted files travel with it — so once a task has ever
 * engaged with the quotation feature (currently on Estimation, OR its
 * quotationApprovalStatus is no longer NONE), viewing/deciding on it stays
 * reachable for good. Without this, an approved quotation's own file became
 * permanently unreachable — and a still-PENDING one unreachable to actually
 * approve/reject — the moment the project was created, even though the
 * backend's own decideQuotation() never required staying on Estimation.
 * Anyone outside the allowed roles still gets the same 404 loadTaskWithAccess
 * already uses for boards they can't see — a 403 here would leak that a
 * hidden feature exists on this task even to someone who can never open it. */
async function loadWithSecretAccess(taskId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  if (!canSeeSecretAttachments(actor)) throw Errors.notFound("Task");
  const everEngaged = ctx.task.board?.name === ESTIMATION_BOARD_NAME || ctx.task.quotationApprovalStatus !== TaskApprovalStatus.NONE;
  if (!everEngaged) {
    throw Errors.badRequest("Secret attachments only exist while a task is on the Estimation board.");
  }
  return ctx;
}

/** New uploads/deletes, unlike viewing, stay Estimation-only — those are
 *  active-review-phase actions, not part of the permanent record. */
function assertOnEstimationBoard(ctx: Awaited<ReturnType<typeof loadTaskWithAccess>>) {
  if (ctx.task.board?.name !== ESTIMATION_BOARD_NAME) {
    throw Errors.badRequest("This action is only available while the task is still on the Estimation board.");
  }
}

export async function uploadSecretAttachment(taskId: string, file: Express.Multer.File, actor: AuthedUser) {
  const ctx = await loadWithSecretAccess(taskId, actor);
  assertOnEstimationBoard(ctx);

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

  // A submitted quotation file needs Management's sign-off before it counts
  // as approved. Re-submitting after a rejection (or the very first upload)
  // raises a fresh request; if one's already pending, another file landing
  // alongside it doesn't need a second notification round.
  if (ctx.task.quotationApprovalStatus !== TaskApprovalStatus.PENDING_APPROVAL) {
    const { findApproveTaskAllUserIds } = await import("./tasks.service");
    await prisma.task.update({
      where: { id: taskId },
      data: {
        quotationApprovalStatus: TaskApprovalStatus.PENDING_APPROVAL,
        quotationDecidedById: null,
        quotationDecidedAt: null,
        quotationRejectionReason: null,
      },
    });
    await writeAudit({
      actor,
      action: AuditAction.EDIT,
      entityType: "Task",
      entityId: taskId,
      boardId: ctx.task.boardId,
      field: "quotationApprovalStatus",
      afterValue: "requested: quotation submitted — pending Management approval",
    });
    const approverIds = await findApproveTaskAllUserIds();
    await notifyMany(approverIds, {
      event: NotificationEvent.APPROVAL_REQUESTED,
      title: `${ctx.task.taskId} submitted a quotation for approval`,
      taskId,
      boardId: ctx.task.boardId,
    });
  }

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
  assertOnEstimationBoard(ctx);
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
