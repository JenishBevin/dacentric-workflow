import { Router } from "express";
import { asyncHandler, ok } from "../../common/http";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { PermissionKey } from "@dacentric/types";
import * as workTimeService from "./workTime.service";

export const workTimeRouter = Router();
workTimeRouter.use(authenticate);

workTimeRouter.post(
  "/start",
  asyncHandler(async (req, res) => {
    await workTimeService.startOrResume(req.user!.id);
    return ok(res, await workTimeService.getToday(req.user!.id));
  })
);

workTimeRouter.post(
  "/heartbeat",
  asyncHandler(async (req, res) => {
    await workTimeService.heartbeat(req.user!.id);
    return ok(res, await workTimeService.getToday(req.user!.id));
  })
);

workTimeRouter.post(
  "/pause",
  asyncHandler(async (req, res) => {
    await workTimeService.pause(req.user!.id);
    return ok(res, await workTimeService.getToday(req.user!.id));
  })
);

workTimeRouter.get(
  "/today",
  asyncHandler(async (req, res) => ok(res, await workTimeService.getToday(req.user!.id)))
);

workTimeRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const range = req.query.range === "month" ? "month" : "week";
    return ok(res, await workTimeService.getSummary(req.user!.id, range));
  })
);

// Team Lead, HR, Manager, System Admin and Super Admin only (Section: RBAC
// row for VIEW_TIME_LOGS) — everyone else is scoped to NONE by default and
// gets a 403 here, well before the service layer's own scoping kicks in.
workTimeRouter.get(
  "/reports",
  requirePermission(PermissionKey.VIEW_TIME_LOGS, "TEAM"),
  asyncHandler(async (req, res) => {
    const range = req.query.range === "month" ? "month" : "week";
    return ok(res, await workTimeService.getReport(req.user!, range));
  })
);
