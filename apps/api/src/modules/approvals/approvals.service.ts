import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { notifyMany } from "../notifications/notifications.service";
import { loadTaskWithAccess } from "../tasks/task-access";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction, TaskApprovalStatus, NotificationEvent } from "@dacentric/types";
import { isSystemLevelAdmin } from "../../common/permissions";

function assertIsApproverOrAdmin(approverUserId: string | null, actor: AuthedUser) {
  const isAdmin = isSystemLevelAdmin(actor.roles);
  if (!isAdmin && approverUserId !== actor.id) {
    throw Errors.forbidden("Only the named Approver or an Administrator can approve or reject this task.");
  }
}

export async function approveTask(taskId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  if (ctx.task.approvalStatus !== TaskApprovalStatus.PENDING_APPROVAL) {
    throw Errors.badRequest("This task is not currently awaiting approval.");
  }
  assertIsApproverOrAdmin(ctx.task.approverUserId, actor);

  const terminalStage = await prisma.boardStage.findFirst({ where: { boardId: ctx.task.boardId, isTerminal: true } });
  if (!terminalStage) throw Errors.badRequest("This board has no terminal (Done) stage configured.");

  const pendingApproval = await prisma.taskApproval.findFirst({ where: { taskId, decision: null }, orderBy: { requestedAt: "desc" } });

  const [updatedTask] = await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: {
        stageId: terminalStage.id,
        isCompleted: true,
        completedAt: new Date(),
        approvalStatus: TaskApprovalStatus.APPROVED,
        version: { increment: 1 },
      },
    }),
    ...(pendingApproval
      ? [prisma.taskApproval.update({ where: { id: pendingApproval.id }, data: { decision: "APPROVED", decidedById: actor.id, decidedAt: new Date() } })]
      : []),
  ]);

  await writeAudit({ actor, action: AuditAction.APPROVE, entityType: "Task", entityId: taskId, boardId: ctx.task.boardId, afterValue: { taskId: ctx.task.taskId } });

  const assigneeIds = ctx.task.assignees.map((a) => a.userId);
  await notifyMany(assigneeIds, {
    event: NotificationEvent.APPROVAL_APPROVED,
    title: `${ctx.task.taskId} was approved and marked Done`,
    taskId,
    boardId: ctx.task.boardId,
  });

  return updatedTask;
}

export async function rejectTask(taskId: string, reason: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  if (ctx.task.approvalStatus !== TaskApprovalStatus.PENDING_APPROVAL) {
    throw Errors.badRequest("This task is not currently awaiting approval.");
  }
  assertIsApproverOrAdmin(ctx.task.approverUserId, actor);

  const returnStageId = ctx.task.previousStageId ?? ctx.task.stageId;
  const pendingApproval = await prisma.taskApproval.findFirst({ where: { taskId, decision: null }, orderBy: { requestedAt: "desc" } });

  const [updatedTask] = await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: {
        stageId: returnStageId,
        isCompleted: false,
        completedAt: null,
        approvalStatus: TaskApprovalStatus.REJECTED,
        version: { increment: 1 },
      },
    }),
    ...(pendingApproval
      ? [
          prisma.taskApproval.update({
            where: { id: pendingApproval.id },
            data: { decision: "REJECTED", decidedById: actor.id, decidedAt: new Date(), rejectionReason: reason },
          }),
        ]
      : []),
  ]);

  await writeAudit({ actor, action: AuditAction.REJECT, entityType: "Task", entityId: taskId, boardId: ctx.task.boardId, afterValue: { reason } });

  const assigneeIds = ctx.task.assignees.map((a) => a.userId);
  await notifyMany(assigneeIds, {
    event: NotificationEvent.APPROVAL_REJECTED,
    title: `${ctx.task.taskId} was rejected: ${reason}`,
    taskId,
    boardId: ctx.task.boardId,
  });

  return updatedTask;
}

export async function listPendingApprovalsForUser(userId: string) {
  return prisma.task.findMany({
    where: { approverUserId: userId, approvalStatus: TaskApprovalStatus.PENDING_APPROVAL, isDeleted: false },
    include: { board: true, stage: true, assignees: { include: { user: true } } },
    orderBy: { updatedAt: "desc" },
  });
}
