import { Router } from "express";
import { asyncHandler } from "../../common/http";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { listBoardTasks } from "../tasks/tasks.service";
import { getTeamWorkload } from "../teamWorkload/teamWorkload.service";
import { queryAuditLog } from "../audit/audit.service";
import { buildWorkbook, boardExportColumns, workloadExportColumns, auditExportColumns } from "./exports.service";
import { PermissionKey } from "@dacentric/types";
import { writeAudit } from "../../common/audit";
import { AuditAction } from "@dacentric/types";

export const exportsRouter = Router();
exportsRouter.use(authenticate);

function sendXlsx(res: import("express").Response, filename: string, buffer: Buffer) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

exportsRouter.get(
  "/board/:boardId",
  requirePermission(PermissionKey.EXPORT, "OWN"),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const tasks = await listBoardTasks(req.params.boardId, req.user!, {
      assigneeUserId: q.assigneeUserId,
      priority: q.priority,
      tagId: q.tagId,
      search: q.search,
      dueBefore: q.dueBefore ? new Date(q.dueBefore) : undefined,
      dueAfter: q.dueAfter ? new Date(q.dueAfter) : undefined,
    });
    const rows = tasks.map((t) => ({
      taskId: t.taskId,
      title: t.title,
      stage: t.stage?.name,
      priority: t.priority,
      assignees: t.assignees.map((a: { name: string }) => a.name).join(", "),
      startDate: t.startDate ? new Date(t.startDate).toISOString().slice(0, 10) : "",
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "",
      estimatedEffortHours: t.estimatedEffortHours ?? "",
      checklist: `${t.checklistProgress.done}/${t.checklistProgress.total}`,
      approvalStatus: t.approvalStatus,
      tags: t.tags.map((tag: any) => tag.name).join(", "),
    }));
    const buffer = await buildWorkbook("Board Export", boardExportColumns(), rows);
    await writeAudit({ actor: req.user!, action: AuditAction.EDIT, entityType: "Export", entityId: req.params.boardId, boardId: req.params.boardId, metadata: { type: "board" } });
    sendXlsx(res, `board-export-${Date.now()}.xlsx`, buffer);
  })
);

exportsRouter.get(
  "/team-workload",
  requirePermission(PermissionKey.EXPORT, "OWN"),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const rows = await getTeamWorkload(req.user!, {
      departmentId: q.departmentId,
      teamId: q.teamId,
      boardId: q.boardId,
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
      sort: q.sort as any,
    });
    const buffer = await buildWorkbook("Team Workload", workloadExportColumns(), rows as any);
    await writeAudit({ actor: req.user!, action: AuditAction.EDIT, entityType: "Export", metadata: { type: "team-workload" } });
    sendXlsx(res, `team-workload-${Date.now()}.xlsx`, buffer);
  })
);

exportsRouter.get(
  "/audit",
  requirePermission(PermissionKey.VIEW_AUDIT_TRAIL, "OWN"),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const { items } = await queryAuditLog(req.user!, {
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
      userId: q.userId,
      boardId: q.boardId,
      taskId: q.taskId,
      action: q.action,
      page: 1,
      pageSize: 5000,
    });
    const rows = items.map((i) => ({
      createdAt: i.createdAt.toISOString(),
      actorName: i.actorName,
      action: i.action,
      module: i.module,
      entityType: i.entityType,
      entityId: i.entityId,
      field: i.field,
      beforeValue: i.beforeValue ? JSON.stringify(i.beforeValue) : "",
      afterValue: i.afterValue ? JSON.stringify(i.afterValue) : "",
    }));
    const buffer = await buildWorkbook("Audit Trail", auditExportColumns(), rows);
    sendXlsx(res, `audit-trail-${Date.now()}.xlsx`, buffer);
  })
);
