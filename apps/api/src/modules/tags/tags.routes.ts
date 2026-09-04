import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ok, created } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { PermissionKey } from "@dacentric/types";
import * as tagsService from "./tags.service";

export const tagsRouter = Router();
tagsRouter.use(authenticate);

tagsRouter.get(
  "/",
  asyncHandler(async (req, res) => ok(res, await tagsService.listTags(req.query.search as string)))
);

// Section 20: "Tag creation must be permission controlled." There's no
// dedicated PermissionKey for tag management in the RBAC matrix, so this
// reuses CREATE_BOARD's scope — granted to Workflow Manager/Board Owner and
// System Administrator, withheld from Viewer, which matches who the spec
// expects to curate organization-wide tags.
tagsRouter.post(
  "/",
  requirePermission(PermissionKey.CREATE_BOARD, "OWN"),
  validate(z.object({ name: z.string().min(1).max(50), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() })),
  asyncHandler(async (req, res) => {
    const { name, color } = (req as any).validatedBody;
    return created(res, await tagsService.createTag(name, color, req.user!));
  })
);

tagsRouter.patch(
  "/:tagId",
  requirePermission(PermissionKey.CREATE_BOARD, "OWN"),
  validate(z.object({ name: z.string().min(1).max(50).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() })),
  asyncHandler(async (req, res) => ok(res, await tagsService.updateTag(req.params.tagId, (req as any).validatedBody, req.user!)))
);

tagsRouter.delete(
  "/:tagId",
  requirePermission(PermissionKey.CREATE_BOARD, "OWN"),
  asyncHandler(async (req, res) => {
    await tagsService.deleteTag(req.params.tagId, req.user!);
    return ok(res, { message: "Tag deleted." });
  })
);
