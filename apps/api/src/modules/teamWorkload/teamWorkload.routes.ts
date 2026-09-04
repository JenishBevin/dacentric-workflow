import { Router } from "express";
import { asyncHandler, ok } from "../../common/http";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { getTeamWorkload, getEmployeeWorkloadDetail } from "./teamWorkload.service";
import { PermissionKey } from "@dacentric/types";

export const teamWorkloadRouter = Router();
teamWorkloadRouter.use(authenticate);

teamWorkloadRouter.get(
  "/",
  requirePermission(PermissionKey.VIEW_TEAM_WORKLOAD, "OWN"),
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
    return ok(res, rows);
  })
);

teamWorkloadRouter.get(
  "/employee/:employeeId",
  requirePermission(PermissionKey.VIEW_TEAM_WORKLOAD, "OWN"),
  asyncHandler(async (req, res) => ok(res, await getEmployeeWorkloadDetail(req.params.employeeId, req.user!)))
);
