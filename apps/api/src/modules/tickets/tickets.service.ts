import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../common/audit";
import { Errors } from "../../common/errors";
import { AuthedUser } from "../../middleware/authenticate";
import { getStorageAdapter, scanFile } from "../../lib/storage";
import { AuditAction, TaskPriority, TicketStatus, formatTicketId } from "@dacentric/types";
import { isSystemLevelAdmin } from "../../common/permissions";
import path from "path";

export interface CreateTicketInput {
  title: string;
  description: string;
  priority?: TaskPriority;
}

/** Anyone signed in can raise a ticket — there's no permission gate on
 * creation or on seeing your own; MANAGE_TICKETS only governs seeing and
 * deciding *other* people's tickets. */
export async function createTicket(actor: AuthedUser, input: CreateTicketInput) {
  const ticket = await prisma.$transaction(async (tx) => {
    const placeholderId = `TEMP-${Date.now()}-${Math.random()}`;
    const created = await tx.supportTicket.create({
      data: {
        title: input.title,
        description: input.description,
        priority: (input.priority as any) ?? TaskPriority.MEDIUM,
        createdById: actor.id,
        ticketId: placeholderId,
      },
    });
    return tx.supportTicket.update({ where: { id: created.id }, data: { ticketId: formatTicketId(created.ticketNumber) } });
  });

  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "SupportTicket", entityId: ticket.id, afterValue: { title: input.title } });
  return ticket;
}

export async function listMyTickets(actor: AuthedUser) {
  return prisma.supportTicket.findMany({ where: { createdById: actor.id }, orderBy: { createdAt: "desc" } });
}

export async function listAllTickets(status?: TicketStatus) {
  return prisma.supportTicket.findMany({
    where: status ? { status } : undefined,
    include: { createdBy: { select: { id: true, name: true, workEmail: true } } },
    orderBy: { createdAt: "desc" },
  });
}

function canManage(actor: AuthedUser) {
  return isSystemLevelAdmin(actor.roles);
}

async function loadTicketWithAccess(ticketId: string, actor: AuthedUser) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { createdBy: { select: { id: true, name: true, workEmail: true } } } });
  if (!ticket) throw Errors.notFound("Ticket");
  const isOwner = ticket.createdById === actor.id;
  const isManager = canManage(actor);
  if (!isOwner && !isManager) throw Errors.notFound("Ticket"); // 404, not 403 — don't confirm existence to non-participants
  return { ticket, isOwner, isManager };
}

export async function getTicket(ticketId: string, actor: AuthedUser) {
  const { ticket } = await loadTicketWithAccess(ticketId, actor);
  const attachments = await prisma.ticketAttachment.findMany({
    where: { ticketId },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return { ...ticket, attachments };
}

export async function updateTicketStatus(ticketId: string, actor: AuthedUser, input: { status: TicketStatus; resolutionNote?: string }) {
  if (!canManage(actor)) throw Errors.forbidden("Only a System Admin or Super Admin can update a ticket's status.");
  const before = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
  const isTerminal = input.status === TicketStatus.RESOLVED || input.status === TicketStatus.CLOSED;
  const ticket = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status: input.status,
      resolutionNote: input.resolutionNote ?? before.resolutionNote,
      resolvedAt: isTerminal ? (before.resolvedAt ?? new Date()) : null,
    },
  });
  await writeAudit({
    actor,
    action: AuditAction.EDIT,
    entityType: "SupportTicket",
    entityId: ticketId,
    field: "status",
    beforeValue: before.status,
    afterValue: input.status,
  });
  return ticket;
}

const SCREENSHOT_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;

export async function uploadTicketAttachment(ticketId: string, actor: AuthedUser, file: Express.Multer.File) {
  await loadTicketWithAccess(ticketId, actor);

  const ext = path.extname(file.originalname).toLowerCase();
  if (!SCREENSHOT_EXTENSIONS.includes(ext)) {
    throw Errors.badRequest("Screenshots must be PNG, JPG, GIF, or WEBP.");
  }
  if (file.size > SCREENSHOT_MAX_BYTES) {
    throw Errors.badRequest("Screenshots must be 10 MB or smaller.");
  }
  const scanResult = await scanFile(file.buffer);
  if (scanResult !== "CLEAN") throw Errors.badRequest("This file failed a security scan and was not uploaded.");

  const { storageKey } = await getStorageAdapter().save(file.originalname, file.buffer);
  const attachment = await prisma.ticketAttachment.create({
    data: {
      ticketId,
      fileName: file.originalname,
      storageKey,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      uploadedById: actor.id,
    },
  });
  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "TicketAttachment", entityId: attachment.id, metadata: { ticketId, fileName: file.originalname } });
  return attachment;
}

export async function downloadTicketAttachment(ticketId: string, attachmentId: string, actor: AuthedUser) {
  await loadTicketWithAccess(ticketId, actor);
  const attachment = await prisma.ticketAttachment.findFirstOrThrow({ where: { id: attachmentId, ticketId } });
  const buffer = await getStorageAdapter().read(attachment.storageKey);
  return { attachment, buffer };
}

export async function deleteTicketAttachment(ticketId: string, attachmentId: string, actor: AuthedUser) {
  const { isManager } = await loadTicketWithAccess(ticketId, actor);
  const attachment = await prisma.ticketAttachment.findFirstOrThrow({ where: { id: attachmentId, ticketId } });
  if (attachment.uploadedById !== actor.id && !isManager) {
    throw Errors.forbidden("Only the person who uploaded this file, or a ticket manager, can remove it.");
  }
  await getStorageAdapter().remove(attachment.storageKey).catch(() => undefined);
  await prisma.ticketAttachment.delete({ where: { id: attachmentId } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "TicketAttachment", entityId: attachmentId, metadata: { ticketId, fileName: attachment.fileName } });
}
