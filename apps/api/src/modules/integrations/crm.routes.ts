import { Router } from "express";
import { asyncHandler, ok } from "../../common/http";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { searchLinkedRecords, getLinkedRecordSummary } from "./linkedRecords.service";
import { PermissionKey } from "@dacentric/types";

/** /api/integrations/crm and /api/integrations/erp both serve LinkedRecord — see linkedRecords.service.ts. */
export const crmRouter = Router();
crmRouter.use(authenticate);

crmRouter.get(
  "/records",
  requirePermission(PermissionKey.CRM_ERP_LINKING, "OWN"),
  asyncHandler(async (req, res) => {
    const { q, type } = req.query as Record<string, string>;
    return ok(res, await searchLinkedRecords(q ?? "", type));
  })
);

crmRouter.get(
  "/records/:id/summary",
  asyncHandler(async (req, res) => ok(res, await getLinkedRecordSummary(req.params.id)))
);
