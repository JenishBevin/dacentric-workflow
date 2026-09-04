import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ok, created } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import * as boardsService from "./boards.service";
import {
  createBoardSchema,
  updateBoardSchema,
  createStageSchema,
  updateStageSchema,
  reorderStagesSchema,
  addMemberSchema,
  updateMemberRoleSchema,
} from "./boards.schemas";
import { PermissionKey } from "@dacentric/types";

export const boardsRouter = Router();
boardsRouter.use(authenticate);

boardsRouter.get(
  "/templates",
  asyncHandler(async (_req, res) => ok(res, await boardsService.listTemplates()))
);

boardsRouter.get(
  "/",
  requirePermission(PermissionKey.VIEW_WORKFLOW, "OWN"),
  asyncHandler(async (req, res) => {
    const { search, scope } = req.query as Record<string, string>;
    const boards = await boardsService.listBoards(req.user!, { search, scope: scope as any });
    return ok(res, boards);
  })
);

boardsRouter.post(
  "/",
  requirePermission(PermissionKey.CREATE_BOARD, "OWN"),
  validate(createBoardSchema),
  asyncHandler(async (req, res) => {
    const board = await boardsService.createBoard((req as any).validatedBody, req.user!);
    return created(res, board);
  })
);

boardsRouter.get(
  "/:boardId",
  asyncHandler(async (req, res) => ok(res, await boardsService.getBoardDetail(req.params.boardId, req.user!)))
);

boardsRouter.patch(
  "/:boardId",
  validate(updateBoardSchema),
  asyncHandler(async (req, res) => ok(res, await boardsService.updateBoard(req.params.boardId, (req as any).validatedBody, req.user!)))
);

boardsRouter.post(
  "/:boardId/duplicate",
  asyncHandler(async (req, res) => created(res, await boardsService.duplicateBoard(req.params.boardId, req.user!)))
);

boardsRouter.post(
  "/:boardId/archive",
  validate(z.object({ archived: z.boolean() })),
  asyncHandler(async (req, res) => ok(res, await boardsService.archiveBoard(req.params.boardId, (req as any).validatedBody.archived, req.user!)))
);

boardsRouter.delete(
  "/:boardId",
  asyncHandler(async (req, res) => {
    const cascadeConfirm = req.query.confirmCascade === "true";
    await boardsService.deleteBoard(req.params.boardId, req.user!, cascadeConfirm);
    return ok(res, { message: "Board deleted." });
  })
);

boardsRouter.post(
  "/:boardId/save-as-template",
  validate(z.object({ name: z.string().min(1).max(100) })),
  asyncHandler(async (req, res) => created(res, await boardsService.saveAsTemplate(req.params.boardId, (req as any).validatedBody.name, req.user!)))
);

// --- Stages ---
boardsRouter.post(
  "/:boardId/stages",
  validate(createStageSchema),
  asyncHandler(async (req, res) => created(res, await boardsService.addStage(req.params.boardId, (req as any).validatedBody, req.user!)))
);

boardsRouter.patch(
  "/:boardId/stages/:stageId",
  validate(updateStageSchema),
  asyncHandler(async (req, res) =>
    ok(res, await boardsService.updateStage(req.params.boardId, req.params.stageId, (req as any).validatedBody, req.user!))
  )
);

boardsRouter.delete(
  "/:boardId/stages/:stageId",
  asyncHandler(async (req, res) => {
    await boardsService.deleteStage(req.params.boardId, req.params.stageId, req.user!);
    return ok(res, { message: "Stage deleted." });
  })
);

boardsRouter.post(
  "/:boardId/stages/reorder",
  validate(reorderStagesSchema),
  asyncHandler(async (req, res) => {
    await boardsService.reorderStages(req.params.boardId, (req as any).validatedBody.orderedStageIds, req.user!);
    return ok(res, { message: "Stages reordered." });
  })
);

// --- Members ---
boardsRouter.post(
  "/:boardId/members",
  validate(addMemberSchema),
  asyncHandler(async (req, res) => {
    const { userId, role } = (req as any).validatedBody;
    return created(res, await boardsService.addMember(req.params.boardId, userId, role, req.user!));
  })
);

boardsRouter.patch(
  "/:boardId/members/:userId",
  validate(updateMemberRoleSchema),
  asyncHandler(async (req, res) =>
    ok(res, await boardsService.updateMemberRole(req.params.boardId, req.params.userId, (req as any).validatedBody.role, req.user!))
  )
);

boardsRouter.delete(
  "/:boardId/members/:userId",
  asyncHandler(async (req, res) => {
    await boardsService.removeMember(req.params.boardId, req.params.userId, req.user!);
    return ok(res, { message: "Member removed." });
  })
);
