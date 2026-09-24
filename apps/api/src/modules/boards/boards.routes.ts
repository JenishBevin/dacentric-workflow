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
  updateProcurementSchema,
  bulkDeleteBoardsSchema,
  bulkArchiveBoardsSchema,
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
    const { search, scope, serviceId } = req.query as Record<string, string>;
    const boards = await boardsService.listBoards(req.user!, { search, scope: scope as any, serviceId });
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

// Must come before "/:boardId" — otherwise Express would capture
// "bulk-delete"/"bulk-archive" as a boardId path param and never reach these handlers.
boardsRouter.post(
  "/bulk-delete",
  validate(bulkDeleteBoardsSchema),
  asyncHandler(async (req, res) => {
    const { boardIds, confirmCascade } = (req as any).validatedBody;
    return ok(res, await boardsService.bulkDeleteBoards(boardIds, req.user!, confirmCascade));
  })
);

boardsRouter.post(
  "/bulk-archive",
  validate(bulkArchiveBoardsSchema),
  asyncHandler(async (req, res) => {
    const { boardIds, archived } = (req as any).validatedBody;
    return ok(res, await boardsService.bulkArchiveBoards(boardIds, archived, req.user!));
  })
);

// Must come before "/:boardId" — otherwise Express would capture
// "enquiry-list" as a boardId path param and never reach this handler.
boardsRouter.get(
  "/enquiry-list",
  requirePermission(PermissionKey.VIEW_WORKFLOW, "OWN"),
  asyncHandler(async (req, res) => ok(res, await boardsService.getOrCreateEnquiryBoard(req.user!)))
);

// Same ordering requirement as "/enquiry-list" above.
boardsRouter.get(
  "/estimation",
  requirePermission(PermissionKey.VIEW_WORKFLOW, "OWN"),
  asyncHandler(async (req, res) => ok(res, await boardsService.getOrCreateEstimationBoard(req.user!)))
);

// Every Project awaiting Accounts sign-off (see awardTask() — the Project
// and its ProcurementRecord already exist by this point, gated behind
// Board.accountsApprovalStatus). Must come before "/:boardId", same
// ordering requirement as "/enquiry-list" above.
boardsRouter.get(
  "/accounts",
  requirePermission(PermissionKey.VIEW_WORKFLOW, "OWN"),
  asyncHandler(async (req, res) => ok(res, await boardsService.listAccountsPendingBoards(req.user!, req.query.search as string | undefined)))
);

// Same ordering requirement as "/enquiry-list" above.
boardsRouter.get(
  "/personal-tasks",
  requirePermission(PermissionKey.VIEW_WORKFLOW, "OWN"),
  asyncHandler(async (req, res) => ok(res, await boardsService.getOrCreatePersonalBoard(req.user!)))
);

// Every board that has an attached ProcurementRecord — the "Procurement" nav.
// Must come before "/:boardId" — otherwise Express would capture
// "procurement" as a boardId path param and never reach this handler.
boardsRouter.get(
  "/procurement",
  requirePermission(PermissionKey.VIEW_WORKFLOW, "OWN"),
  asyncHandler(async (req, res) => ok(res, await boardsService.listProcurementBoards(req.user!, req.query.search as string | undefined)))
);

// Same ordering requirement as "/enquiry-list" above.
boardsRouter.get(
  "/services",
  requirePermission(PermissionKey.VIEW_WORKFLOW, "OWN"),
  asyncHandler(async (_req, res) => ok(res, await boardsService.listServices()))
);

// Must come before "/:boardId" — otherwise Express would capture
// "search" as a boardId path param and never reach this handler.
boardsRouter.get(
  "/search/lookup",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string) ?? "";
    return ok(res, await boardsService.searchBoards(q, req.user!));
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

boardsRouter.post(
  "/:boardId/complete",
  validate(z.object({ completed: z.boolean() })),
  asyncHandler(async (req, res) => ok(res, await boardsService.setBoardCompleted(req.params.boardId, (req as any).validatedBody.completed, req.user!)))
);

// --- Accounts sign-off (see listAccountsPendingBoards above) ---
boardsRouter.post(
  "/:boardId/accounts-approve",
  requirePermission(PermissionKey.CREATE_BOARD, "OWN"),
  asyncHandler(async (req, res) => ok(res, await boardsService.approveAccountsBoard(req.params.boardId, req.user!)))
);

boardsRouter.post(
  "/:boardId/accounts-reject",
  requirePermission(PermissionKey.CREATE_BOARD, "OWN"),
  validate(z.object({ reason: z.string().min(1, "A rejection reason is required.") })),
  asyncHandler(async (req, res) => ok(res, await boardsService.rejectAccountsBoard(req.params.boardId, (req as any).validatedBody.reason, req.user!)))
);

// --- Procurement (see ProcurementRecord — attached once Accounts awards a task) ---
boardsRouter.get(
  "/:boardId/procurement",
  asyncHandler(async (req, res) => ok(res, await boardsService.getProcurementRecord(req.params.boardId, req.user!)))
);

boardsRouter.patch(
  "/:boardId/procurement",
  validate(updateProcurementSchema),
  asyncHandler(async (req, res) =>
    ok(res, await boardsService.updateProcurementRecord(req.params.boardId, (req as any).validatedBody, req.user!))
  )
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
