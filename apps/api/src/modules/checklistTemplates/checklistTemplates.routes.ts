import { Router } from "express";
import { asyncHandler, ok, created } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import * as checklistTemplatesService from "./checklistTemplates.service";
import { createChecklistTemplateSchema } from "./checklistTemplates.schemas";

// Same convention as board templates (boards.routes.ts "/templates" and
// "/:boardId/save-as-template"): a shared, org-wide convenience resource —
// authenticate only, no extra requirePermission gate.
export const checklistTemplatesRouter = Router();
checklistTemplatesRouter.use(authenticate);

checklistTemplatesRouter.get(
  "/",
  asyncHandler(async (_req, res) => ok(res, await checklistTemplatesService.listChecklistTemplates()))
);

checklistTemplatesRouter.post(
  "/",
  validate(createChecklistTemplateSchema),
  asyncHandler(async (req, res) => {
    const { name, items } = (req as any).validatedBody;
    return created(res, await checklistTemplatesService.createChecklistTemplate(name, items, req.user!));
  })
);
