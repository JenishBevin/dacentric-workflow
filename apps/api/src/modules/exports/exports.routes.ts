import { Router } from "express";
import { asyncHandler } from "../../common/http";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { listBoardTasks, listTasksByIds } from "../tasks/tasks.service";
import { listBoardsByIds } from "../boards/boards.service";
import { listCustomersByIds } from "../customers/customers.service";
import { getTeamWorkload } from "../teamWorkload/teamWorkload.service";
import { queryAuditLog } from "../audit/audit.service";
import { getHistory } from "../history/history.service";
import { listSettledClaims } from "../claims/claims.service";
import {
  buildWorkbook,
  boardExportColumns,
  mapTaskExportRow,
  customersExportColumns,
  boardsExportColumns,
  workloadExportColumns,
  auditExportColumns,
  historyExportColumns,
  settledClaimsExportColumns,
} from "./exports.service";
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
    const rows = tasks.map(mapTaskExportRow);
    const buffer = await buildWorkbook("Board Export", boardExportColumns(), rows);
    await writeAudit({ actor: req.user!, action: AuditAction.EDIT, entityType: "Export", entityId: req.params.boardId, boardId: req.params.boardId, metadata: { type: "board" } });
    sendXlsx(res, `board-export-${Date.now()}.xlsx`, buffer);
  })
);

// Bulk-selection exports — one row per selected item, used by the "Export
// selected" bulk action on Tasks/Enquiry List/Estimation, Customers and
// Projects. Same authorized-query-then-buildWorkbook pattern as every route
// above: listTasksByIds/listBoardsByIds/listCustomersByIds already enforce
// the same visibility rules as the screens these selections come from.
exportsRouter.get(
  "/tasks",
  requirePermission(PermissionKey.EXPORT, "OWN"),
  asyncHandler(async (req, res) => {
    const ids = ((req.query.ids as string) ?? "").split(",").filter(Boolean);
    const tasks = ids.length ? await listTasksByIds(ids, req.user!) : [];
    const rows = tasks.map(mapTaskExportRow);
    const buffer = await buildWorkbook("Tasks Export", boardExportColumns(), rows);
    await writeAudit({ actor: req.user!, action: AuditAction.EDIT, entityType: "Export", metadata: { type: "tasks-selection", count: ids.length } });
    sendXlsx(res, `tasks-export-${Date.now()}.xlsx`, buffer);
  })
);

exportsRouter.get(
  "/customers",
  requirePermission(PermissionKey.EXPORT, "OWN"),
  asyncHandler(async (req, res) => {
    const ids = ((req.query.ids as string) ?? "").split(",").filter(Boolean);
    const rows = ids.length ? await listCustomersByIds(ids) : [];
    const buffer = await buildWorkbook("Customers Export", customersExportColumns(), rows);
    await writeAudit({ actor: req.user!, action: AuditAction.EDIT, entityType: "Export", metadata: { type: "customers-selection", count: ids.length } });
    sendXlsx(res, `customers-export-${Date.now()}.xlsx`, buffer);
  })
);

exportsRouter.get(
  "/boards",
  requirePermission(PermissionKey.EXPORT, "OWN"),
  asyncHandler(async (req, res) => {
    const ids = ((req.query.ids as string) ?? "").split(",").filter(Boolean);
    const rows = ids.length ? await listBoardsByIds(ids, req.user!) : [];
    const buffer = await buildWorkbook("Projects Export", boardsExportColumns(), rows);
    await writeAudit({ actor: req.user!, action: AuditAction.EDIT, entityType: "Export", metadata: { type: "boards-selection", count: ids.length } });
    sendXlsx(res, `projects-export-${Date.now()}.xlsx`, buffer);
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
  "/history",
  requirePermission(PermissionKey.EXPORT, "OWN"),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const rows = await getHistory(req.user!, {
      type: q.type as any,
      status: q.status as any,
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
    });
    const exportRows = rows.map((r) => ({
      type: r.kind === "PROJECT" ? "Project" : "Enquiry",
      code: r.code,
      name: r.name,
      service: r.service ?? "",
      status: r.status,
      date: r.eventDate.toISOString().slice(0, 10),
    }));
    const buffer = await buildWorkbook("Project-Task History", historyExportColumns(), exportRows);
    await writeAudit({ actor: req.user!, action: AuditAction.EDIT, entityType: "Export", metadata: { type: "history" } });
    sendXlsx(res, `history-export-${Date.now()}.xlsx`, buffer);
  })
);

exportsRouter.get(
  "/claims-settled",
  requirePermission(PermissionKey.EXPORT, "OWN"),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const rows = await listSettledClaims(req.user!, {
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
    });
    const exportRows = rows.map((c) => ({
      claimId: c.claimId,
      employee: c.employee.fullName,
      currency: c.currency,
      amount: c.amount,
      reason: c.reason,
      expenseDate: c.expenseDate.toISOString().slice(0, 10),
      verifiedBy: c.verifiedBy?.name ?? "",
      approvedBy: c.managementDecidedBy?.name ?? "",
      settledBy: c.settledBy?.name ?? "",
      settledDate: c.settledAt ? c.settledAt.toISOString().slice(0, 10) : "",
    }));
    const buffer = await buildWorkbook("Approved Settlements", settledClaimsExportColumns(), exportRows);
    await writeAudit({ actor: req.user!, action: AuditAction.EDIT, entityType: "Export", metadata: { type: "claims-settled" } });
    sendXlsx(res, `approved-settlements-${Date.now()}.xlsx`, buffer);
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
