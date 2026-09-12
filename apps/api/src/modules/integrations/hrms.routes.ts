import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler, ok, created } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import { requireAnyRole } from "../../middleware/authorize";
import { prisma } from "../../lib/prisma";
import { getEmployeeWorkloadDetail } from "../teamWorkload/teamWorkload.service";
import { Errors } from "../../common/errors";
import { RoleCode } from "@dacentric/types";
import { LeaveType } from "@prisma/client";
import { getStorageAdapter, validateFile, scanFile } from "../../lib/storage";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Core-essentials leave module: fixed per-type day entitlements (no
// configurable policy engine — see schema.prisma's LeaveType comment).
// `null` means no balance cap (unpaid leave).
const LEAVE_ENTITLEMENTS: Record<LeaveType, number | null> = {
  ANNUAL: 21,
  SICK: 10,
  MATERNITY: 90,
  PATERNITY: 7,
  UNPAID: null,
  EMERGENCY: 5,
};

function inclusiveDayCount(startDate: Date, endDate: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;
}

/**
 * Minimal HRMS surface — only what UC-12 needs to exist: a leave-request
 * list an approver would see, and the read-only "View current workload"
 * panel embedded on that screen. The full HRMS leave module itself is out
 * of scope for this build (Section 31: "Do not build the complete HRMS
 * leave module. Only build the Workflow integration interface/API/
 * component required by the requirements.").
 */
export const hrmsRouter = Router();
hrmsRouter.use(authenticate);

// --- Self-service: any authenticated user with a linked Employee record can
// apply for their own leave and see their own history. Deciding it stays
// restricted to the approver roles above — this is the one deliberate
// expansion beyond "read-only integration point": the requirements ask for
// an apply-and-approve flow, which needs a real write path for the applicant.
hrmsRouter.get(
  "/leave-requests/mine",
  asyncHandler(async (req, res) => {
    if (!req.user!.employeeId) return ok(res, []);
    const requests = await prisma.leaveRequest.findMany({
      where: { employeeId: req.user!.employeeId },
      include: { handoverToEmployee: { select: { id: true, fullName: true } }, attachments: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, requests);
  })
);

// Balance per leave type for the current year: entitlement minus days
// already used by APPROVED requests, computed on the fly — no running
// counter stored anywhere.
hrmsRouter.get(
  "/leave-requests/balance",
  asyncHandler(async (req, res) => {
    if (!req.user!.employeeId) return ok(res, []);
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear() + 1, 0, 1);
    const approved = await prisma.leaveRequest.findMany({
      where: { employeeId: req.user!.employeeId, status: "APPROVED", startDate: { gte: yearStart, lt: yearEnd } },
      select: { leaveType: true, numberOfDays: true },
    });
    const used: Record<string, number> = {};
    for (const r of approved) used[r.leaveType] = (used[r.leaveType] ?? 0) + r.numberOfDays;
    const balance = (Object.keys(LEAVE_ENTITLEMENTS) as LeaveType[]).map((leaveType) => {
      const entitlement = LEAVE_ENTITLEMENTS[leaveType];
      const usedDays = used[leaveType] ?? 0;
      return { leaveType, entitlement, used: usedDays, remaining: entitlement === null ? null : entitlement - usedDays };
    });
    return ok(res, balance);
  })
);

hrmsRouter.post(
  "/leave-requests",
  upload.array("files", 5),
  validate(
    z
      .object({
        leaveType: z.nativeEnum(LeaveType),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        reason: z.string().max(1000).optional(),
        handoverToEmployeeId: z.string().uuid().optional(),
        handoverNotes: z.string().max(2000).optional(),
      })
      .refine((v) => v.endDate >= v.startDate, { message: "End date must be on or after the start date.", path: ["endDate"] })
  ),
  asyncHandler(async (req, res) => {
    if (!req.user!.employeeId) {
      throw Errors.badRequest("Your account isn't linked to an employee record, so it can't apply for leave. Ask your administrator to link one.");
    }
    const { leaveType, startDate, endDate, reason, handoverToEmployeeId, handoverNotes } = (req as any).validatedBody;
    const files = (req.files as Express.Multer.File[]) ?? [];

    // Sick leave needs proof — a medical certificate is mandatory, not optional.
    if (leaveType === "SICK" && files.length === 0) {
      throw Errors.badRequest("A medical certificate is required for sick leave.");
    }

    const overlapping = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: req.user!.employeeId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlapping) {
      throw Errors.badRequest("You already have a leave request that overlaps these dates.");
    }

    const attachmentsData: Array<{ fileName: string; storageKey: string; mimeType: string; fileSizeBytes: number }> = [];
    for (const file of files) {
      const validationError = validateFile(file.originalname, file.size);
      if (validationError) throw Errors.validation(validationError, { file: validationError });
      const scanResult = await scanFile(file.buffer);
      if (scanResult === "REJECTED") throw Errors.validation(`"${file.originalname}" failed the security scan and was not stored.`);
      const { storageKey } = await getStorageAdapter().save(file.originalname, file.buffer);
      attachmentsData.push({ fileName: file.originalname, storageKey, mimeType: file.mimetype, fileSizeBytes: file.size });
    }

    const numberOfDays = inclusiveDayCount(startDate, endDate);
    const leave = await prisma.leaveRequest.create({
      data: {
        employeeId: req.user!.employeeId,
        leaveType,
        startDate,
        endDate,
        numberOfDays,
        reason,
        handoverToEmployeeId,
        handoverNotes,
        attachments: { create: attachmentsData },
      },
      include: { attachments: true },
    });
    return created(res, leave);
  })
);

hrmsRouter.get(
  "/leave-requests/attachments/:attachmentId/download",
  asyncHandler(async (req, res) => {
    const attachment = await prisma.leaveAttachment.findUniqueOrThrow({
      where: { id: req.params.attachmentId },
      include: { leaveRequest: true },
    });
    const isOwner = req.user!.employeeId && attachment.leaveRequest.employeeId === req.user!.employeeId;
    const isApprover = req.user!.roles.some((r) => [RoleCode.HR, RoleCode.SYSTEM_ADMIN, RoleCode.SUPER_ADMIN].includes(r));
    if (!isOwner && !isApprover) throw Errors.forbidden("You do not have permission to view this file.");

    const buffer = await getStorageAdapter().read(attachment.storageKey);
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${attachment.fileName}"`);
    res.send(buffer);
  })
);

hrmsRouter.get(
  "/leave-requests",
  requireAnyRole(RoleCode.HR, RoleCode.SYSTEM_ADMIN, RoleCode.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    // Single-stage approval: every request goes straight to HR (or an
    // Administrator) — no Proj.Manager / Management stage.
    const requests = await prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      include: { employee: true, handoverToEmployee: { select: { id: true, fullName: true } }, attachments: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, requests);
  })
);

hrmsRouter.get(
  "/leave-requests/:id/workload",
  requireAnyRole(RoleCode.HR, RoleCode.SYSTEM_ADMIN, RoleCode.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const leave = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!leave) throw Errors.notFound("Leave request");
    // UC-12: this is a read-only view scoped to exactly the employee whose
    // leave is open on this screen — not the general Team Workload scope.
    const workload = await getEmployeeWorkloadDetail(leave.employeeId, {
      ...req.user!,
      // Elevate scope for this single, explicit lookup only; the response
      // itself is read-only and no mutation endpoint accepts this bypass.
      permissions: { ...req.user!.permissions, "WORKFLOW:VIEW_TEAM_WORKLOAD": "ALL" },
    } as any);
    return ok(res, { ...workload, readOnly: true, leaveRequest: leave });
  })
);

hrmsRouter.post(
  "/leave-requests/:id/decision",
  requireAnyRole(RoleCode.HR, RoleCode.SYSTEM_ADMIN, RoleCode.SUPER_ADMIN),
  validate(z.object({ decision: z.enum(["APPROVED", "REJECTED"]) })),
  asyncHandler(async (req, res) => {
    const { decision } = (req as any).validatedBody as { decision: "APPROVED" | "REJECTED" };
    const leave = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!leave) throw Errors.notFound("Leave request");
    if (leave.status !== "PENDING") throw Errors.conflict("This leave request has already been decided.");

    const updated = await prisma.leaveRequest.update({
      where: { id: leave.id },
      data: { status: decision, decidedById: req.user!.id, decidedAt: new Date() },
    });
    return ok(res, updated);
  })
);
