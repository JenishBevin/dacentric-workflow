import { Router } from "express";
import { asyncHandler, ok } from "../../common/http";
import { authenticate } from "../../middleware/authenticate";
import { Errors } from "../../common/errors";
import { getDashboard, getDashboardTaskList, DashboardStatKind } from "./dashboard.service";

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

const STAT_KINDS: DashboardStatKind[] = ["TOTAL_OPEN", "OVERDUE", "DUE_TODAY", "DUE_THIS_WEEK", "COMPLETED_THIS_MONTH", "PENDING_APPROVAL"];

dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const dashboard = await getDashboard(req.user!, {
      departmentId: q.departmentId,
      boardId: q.boardId,
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
    });
    return ok(res, dashboard);
  })
);

dashboardRouter.get(
  "/tasks",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    if (!STAT_KINDS.includes(q.kind as DashboardStatKind)) {
      throw Errors.badRequest("Unknown dashboard stat kind.");
    }
    const tasks = await getDashboardTaskList(req.user!, q.kind as DashboardStatKind, {
      departmentId: q.departmentId,
      boardId: q.boardId,
    });
    return ok(res, tasks);
  })
);
