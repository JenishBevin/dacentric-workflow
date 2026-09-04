import { Router } from "express";
import { asyncHandler, ok } from "../../common/http";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { queryAuditLog } from "./audit.service";
import { PermissionKey } from "@dacentric/types";

export const auditRouter = Router();
auditRouter.use(authenticate);

auditRouter.get(
  "/",
  requirePermission(PermissionKey.VIEW_AUDIT_TRAIL, "OWN"),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const result = await queryAuditLog(req.user!, {
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
      userId: q.userId,
      boardId: q.boardId,
      taskId: q.taskId,
      action: q.action,
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    });
    return ok(res, result.items, { total: result.total });
  })
);
