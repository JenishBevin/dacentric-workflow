import { Router } from "express";
import { asyncHandler, ok } from "../../common/http";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { getHistory } from "./history.service";
import { PermissionKey } from "@dacentric/types";

export const historyRouter = Router();
historyRouter.use(authenticate);

historyRouter.get(
  "/",
  requirePermission(PermissionKey.VIEW_WORKFLOW, "OWN"),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const rows = await getHistory(req.user!, {
      type: q.type as any,
      status: q.status as any,
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
    });
    return ok(res, rows);
  })
);
