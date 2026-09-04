import { Router } from "express";
import multer from "multer";
import { asyncHandler, ok, created } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { PermissionKey, TicketStatus } from "@dacentric/types";
import { Errors } from "../../common/errors";
import { createTicketSchema, updateTicketStatusSchema } from "./tickets.schemas";
import * as ticketsService from "./tickets.service";

const uploadScreenshot = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const ticketsRouter = Router();
ticketsRouter.use(authenticate);

ticketsRouter.post(
  "/",
  validate(createTicketSchema),
  asyncHandler(async (req, res) => created(res, await ticketsService.createTicket(req.user!, (req as any).validatedBody)))
);

ticketsRouter.get(
  "/mine",
  asyncHandler(async (req, res) => ok(res, await ticketsService.listMyTickets(req.user!)))
);

// Everyone else's tickets — System Admin / Super Admin only.
ticketsRouter.get(
  "/",
  requirePermission(PermissionKey.MANAGE_TICKETS, "ALL"),
  asyncHandler(async (req, res) => {
    const status = Object.values(TicketStatus).includes(req.query.status as TicketStatus) ? (req.query.status as TicketStatus) : undefined;
    return ok(res, await ticketsService.listAllTickets(status));
  })
);

ticketsRouter.get(
  "/:ticketId",
  asyncHandler(async (req, res) => ok(res, await ticketsService.getTicket(req.params.ticketId, req.user!)))
);

ticketsRouter.patch(
  "/:ticketId/status",
  requirePermission(PermissionKey.MANAGE_TICKETS, "ALL"),
  validate(updateTicketStatusSchema),
  asyncHandler(async (req, res) => ok(res, await ticketsService.updateTicketStatus(req.params.ticketId, req.user!, (req as any).validatedBody)))
);

ticketsRouter.post(
  "/:ticketId/attachments",
  uploadScreenshot.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw Errors.badRequest("No file was uploaded.");
    return created(res, await ticketsService.uploadTicketAttachment(req.params.ticketId, req.user!, req.file));
  })
);

ticketsRouter.get(
  "/:ticketId/attachments/:attachmentId/download",
  asyncHandler(async (req, res) => {
    const { attachment, buffer } = await ticketsService.downloadTicketAttachment(req.params.ticketId, req.params.attachmentId, req.user!);
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${attachment.fileName}"`);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(buffer);
  })
);

ticketsRouter.delete(
  "/:ticketId/attachments/:attachmentId",
  asyncHandler(async (req, res) => {
    await ticketsService.deleteTicketAttachment(req.params.ticketId, req.params.attachmentId, req.user!);
    return ok(res, { message: "Attachment removed." });
  })
);
