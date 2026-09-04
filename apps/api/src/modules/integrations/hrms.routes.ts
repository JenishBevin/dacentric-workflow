import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ok, created } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import { requireAnyRole } from "../../middleware/authorize";
import { prisma } from "../../lib/prisma";
import { getEmployeeWorkloadDetail } from "../teamWorkload/teamWorkload.service";
import { Errors } from "../../common/errors";
import { RoleCode } from "@dacentric/types";

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
      orderBy: { createdAt: "desc" },
    });
    return ok(res, requests);
  })
);

hrmsRouter.post(
  "/leave-requests",
  validate(
    z
      .object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        reason: z.string().max(1000).optional(),
      })
      .refine((v) => v.endDate >= v.startDate, { message: "End date must be on or after the start date.", path: ["endDate"] })
  ),
  asyncHandler(async (req, res) => {
    if (!req.user!.employeeId) {
      throw Errors.badRequest("Your account isn't linked to an employee record, so it can't apply for leave. Ask your administrator to link one.");
    }
    const { startDate, endDate, reason } = (req as any).validatedBody;
    const leave = await prisma.leaveRequest.create({
      data: { employeeId: req.user!.employeeId, startDate, endDate, reason },
    });
    return created(res, leave);
  })
);

hrmsRouter.get(
  "/leave-requests",
  requireAnyRole(RoleCode.HR, RoleCode.MANAGER, RoleCode.SYSTEM_ADMIN, RoleCode.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const requests = await prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      include: { employee: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, requests);
  })
);

hrmsRouter.get(
  "/leave-requests/:id/workload",
  requireAnyRole(RoleCode.HR, RoleCode.MANAGER, RoleCode.SYSTEM_ADMIN, RoleCode.SUPER_ADMIN),
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
  requireAnyRole(RoleCode.HR, RoleCode.MANAGER, RoleCode.SYSTEM_ADMIN, RoleCode.SUPER_ADMIN),
  validate(z.object({ decision: z.enum(["APPROVED", "REJECTED"]) })),
  asyncHandler(async (req, res) => {
    const leave = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: (req as any).validatedBody.decision, decidedAt: new Date() },
    });
    return ok(res, leave);
  })
);
