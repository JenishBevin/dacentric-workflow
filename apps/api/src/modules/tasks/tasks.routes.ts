import { Router } from "express";
import multer from "multer";
import { asyncHandler, ok, created } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import * as tasksService from "./tasks.service";
import * as checklistService from "./checklist.service";
import * as commentsService from "./comments.service";
import * as attachmentsService from "./attachments.service";
import * as watchersService from "./watchers.service";
import * as tagsService from "../tags/tags.service";
import * as approvalsService from "../approvals/approvals.service";
import { loadTaskWithAccess } from "./task-access";
import {
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
  setAssigneesSchema,
  quickEditSchema,
  checklistItemSchema,
  updateChecklistItemSchema,
  commentSchema,
  dependencySchema,
  watcherSchema,
  rejectApprovalSchema,
} from "./tasks.schemas";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { PermissionKey } from "@dacentric/types";
import { Errors } from "../../common/errors";

export const tasksRouter = Router();
tasksRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

tasksRouter.get(
  "/board/:boardId",
  asyncHandler(async (req, res) => {
    const { assigneeUserId, priority, tagId, search, dueBefore, dueAfter } = req.query as Record<string, string>;
    const tasks = await tasksService.listBoardTasks(req.params.boardId, req.user!, {
      assigneeUserId,
      priority,
      tagId,
      search,
      dueBefore: dueBefore ? new Date(dueBefore) : undefined,
      dueAfter: dueAfter ? new Date(dueAfter) : undefined,
    });
    return ok(res, tasks);
  })
);

tasksRouter.post(
  "/",
  requirePermission(PermissionKey.CREATE_TASK, "OWN"),
  validate(createTaskSchema),
  asyncHandler(async (req, res) => created(res, await tasksService.createTask((req as any).validatedBody, req.user!)))
);

// NOTE: must be registered before the generic "/:taskId" GET route below,
// otherwise Express would treat "search" as a taskId path param.
tasksRouter.get(
  "/search/lookup",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string) ?? "";
    const tasks = await prisma.task.findMany({
      where: { isDeleted: false, OR: [{ title: { contains: q, mode: "insensitive" } }, { taskId: { contains: q, mode: "insensitive" } }] },
      take: 20,
      select: { id: true, taskId: true, title: true, boardId: true },
    });
    return ok(res, tasks);
  })
);

tasksRouter.get(
  "/:taskId",
  asyncHandler(async (req, res) => ok(res, await tasksService.getTaskDetail(req.params.taskId, req.user!)))
);

tasksRouter.patch(
  "/:taskId",
  validate(updateTaskSchema),
  asyncHandler(async (req, res) => ok(res, await tasksService.updateTask(req.params.taskId, (req as any).validatedBody, req.user!)))
);

tasksRouter.delete(
  "/:taskId",
  requirePermission(PermissionKey.DELETE_TASK, "OWN"),
  asyncHandler(async (req, res) => {
    await tasksService.deleteTask(req.params.taskId, req.user!);
    return ok(res, { message: "Task deleted." });
  })
);

tasksRouter.post(
  "/:taskId/duplicate",
  asyncHandler(async (req, res) => created(res, await tasksService.duplicateTask(req.params.taskId, req.user!)))
);

tasksRouter.post(
  "/:taskId/move",
  requirePermission(PermissionKey.MOVE_TASK, "OWN"),
  validate(moveTaskSchema),
  asyncHandler(async (req, res) => {
    const { stageId, confirmWipOverride, version } = (req as any).validatedBody;
    return ok(res, await tasksService.moveTask(req.params.taskId, stageId, req.user!, confirmWipOverride, version));
  })
);

tasksRouter.post(
  "/:taskId/complete",
  asyncHandler(async (req, res) => ok(res, await tasksService.quickComplete(req.params.taskId, req.user!)))
);

tasksRouter.patch(
  "/:taskId/quick-edit",
  validate(quickEditSchema),
  asyncHandler(async (req, res) => ok(res, await tasksService.quickEdit(req.params.taskId, (req as any).validatedBody, req.user!)))
);

tasksRouter.put(
  "/:taskId/assignees",
  requirePermission(PermissionKey.ASSIGN_TASK, "OWN"),
  validate(setAssigneesSchema),
  asyncHandler(async (req, res) => ok(res, await tasksService.setAssignees(req.params.taskId, (req as any).validatedBody.assigneeUserIds, req.user!)))
);

// --- Checklist ---
tasksRouter.post(
  "/:taskId/checklist",
  validate(checklistItemSchema),
  asyncHandler(async (req, res) => {
    const { text, ownerId } = (req as any).validatedBody;
    return created(res, await checklistService.addChecklistItem(req.params.taskId, text, ownerId, req.user!));
  })
);
tasksRouter.patch(
  "/:taskId/checklist/:itemId",
  validate(updateChecklistItemSchema),
  asyncHandler(async (req, res) => ok(res, await checklistService.updateChecklistItem(req.params.taskId, req.params.itemId, (req as any).validatedBody, req.user!)))
);
tasksRouter.delete(
  "/:taskId/checklist/:itemId",
  asyncHandler(async (req, res) => {
    await checklistService.deleteChecklistItem(req.params.taskId, req.params.itemId, req.user!);
    return ok(res, { message: "Checklist item removed." });
  })
);

// --- Comments ---
tasksRouter.get(
  "/:taskId/comments",
  asyncHandler(async (req, res) => ok(res, await commentsService.listComments(req.params.taskId, req.user!)))
);
tasksRouter.post(
  "/:taskId/comments",
  validate(commentSchema),
  asyncHandler(async (req, res) => {
    const { body, mentionedUserIds } = (req as any).validatedBody;
    return created(res, await commentsService.addComment(req.params.taskId, body, mentionedUserIds, req.user!));
  })
);

// --- Attachments ---
tasksRouter.get(
  "/:taskId/attachments",
  asyncHandler(async (req, res) => ok(res, await attachmentsService.listAttachments(req.params.taskId, req.user!)))
);
tasksRouter.post(
  "/:taskId/attachments",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw Errors.badRequest("No file was uploaded.");
    return created(res, await attachmentsService.uploadAttachment(req.params.taskId, req.file, req.user!));
  })
);
tasksRouter.get(
  "/:taskId/attachments/:attachmentId/download",
  asyncHandler(async (req, res) => {
    const { attachment, buffer } = await attachmentsService.downloadAttachment(req.params.taskId, req.params.attachmentId, req.user!);
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${attachment.fileName}"`);
    res.send(buffer);
  })
);
tasksRouter.delete(
  "/:taskId/attachments/:attachmentId",
  asyncHandler(async (req, res) => {
    await attachmentsService.deleteAttachment(req.params.taskId, req.params.attachmentId, req.user!);
    return ok(res, { message: "Attachment removed." });
  })
);

// --- Tags on task ---
tasksRouter.put(
  "/:taskId/tags",
  validate(z.object({ tagIds: z.array(z.string().uuid()) })),
  asyncHandler(async (req, res) => {
    await tagsService.setTaskTags(req.params.taskId, (req as any).validatedBody.tagIds, req.user!);
    return ok(res, { message: "Tags updated." });
  })
);

// --- Dependencies ---
tasksRouter.post(
  "/:taskId/dependencies",
  validate(dependencySchema),
  asyncHandler(async (req, res) => {
    const { type, taskId: targetTaskId } = (req as any).validatedBody;
    await loadTaskWithAccess(req.params.taskId, req.user!);
    await tasksService.addDependencyInternal(req.params.taskId, type, targetTaskId);
    return created(res, await tasksService.getTaskDetail(req.params.taskId, req.user!));
  })
);
tasksRouter.delete(
  "/:taskId/dependencies/:dependencyId",
  asyncHandler(async (req, res) => {
    await loadTaskWithAccess(req.params.taskId, req.user!);
    await prisma.taskDependency.delete({ where: { id: req.params.dependencyId } });
    return ok(res, { message: "Dependency removed." });
  })
);
// --- Watchers ---
tasksRouter.post(
  "/:taskId/watchers",
  validate(watcherSchema),
  asyncHandler(async (req, res) => created(res, await watchersService.addWatcher(req.params.taskId, (req as any).validatedBody.userId, req.user!)))
);
tasksRouter.delete(
  "/:taskId/watchers/:userId",
  asyncHandler(async (req, res) => {
    await watchersService.removeWatcher(req.params.taskId, req.params.userId, req.user!);
    return ok(res, { message: "Watcher removed." });
  })
);

// --- Approval ---
tasksRouter.post(
  "/:taskId/approval/approve",
  requirePermission(PermissionKey.APPROVE_TASK, "OWN"),
  asyncHandler(async (req, res) => ok(res, await approvalsService.approveTask(req.params.taskId, req.user!)))
);
tasksRouter.post(
  "/:taskId/approval/reject",
  requirePermission(PermissionKey.APPROVE_TASK, "OWN"),
  validate(rejectApprovalSchema),
  asyncHandler(async (req, res) => ok(res, await approvalsService.rejectTask(req.params.taskId, (req as any).validatedBody.reason, req.user!)))
);

// --- Activity log (task-scoped audit view) ---
tasksRouter.get(
  "/:taskId/activity",
  asyncHandler(async (req, res) => {
    await loadTaskWithAccess(req.params.taskId, req.user!);
    const logs = await prisma.auditLog.findMany({
      where: { entityType: "Task", entityId: req.params.taskId },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, logs);
  })
);
