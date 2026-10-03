import { Router } from "express";
import multer from "multer";
import { asyncHandler, ok, created } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import { Errors } from "../../common/errors";
import { requireHrManage, currentMonthKey } from "./hr.common";
import * as hr from "./hr.service";
import * as recruitment from "./recruitment.service";
import * as payroll from "./payroll.service";
import * as reports from "./reports.service";
import {
  profileSchema,
  letterSchema,
  historyNoteSchema,
  salarySchema,
  candidateSchema,
  candidateCreateSchema,
  candidateUpdateSchema,
  candidateStatusSchema,
  scheduleInterviewSchema,
  interviewUpdateSchema,
  interviewInviteSchema,
  offerSchema,
  offerResponseSchema,
  joiningSchema,
  convertSchema,
  monthSchema,
  payslipUpdateSchema,
} from "./hr.schemas";

/**
 * HRMS expansion (request 1008). Everything here — employee records, salary
 * data, recruitment, payroll — is restricted to HR staff/admins (requireHrManage),
 * not just anyone with the HRMS module grant, since it includes salary and ID data.
 * Mounted only outside production (see app.ts) until this is deployed.
 */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const hrRouter = Router();
hrRouter.use(authenticate);
hrRouter.use(requireHrManage);

const body = (req: any) => req.validatedBody;
const q = (req: any, key: string) => (req.query[key] as string | undefined) || undefined;

function sendFile(res: any, fileName: string, mimeType: string, buffer: Buffer) {
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.send(buffer);
}

// ============================ Employee page ============================

hrRouter.get("/employees/:id", asyncHandler(async (req, res) => ok(res, await hr.getEmployeeProfile(req.params.id))));

hrRouter.patch(
  "/employees/:id/profile",
  validate(profileSchema),
  asyncHandler(async (req, res) => ok(res, await hr.updateEmployeeProfile(req.params.id, body(req), req.user!)))
);

hrRouter.get("/employees/:id/documents", asyncHandler(async (req, res) => ok(res, await hr.listDocuments(req.params.id))));
hrRouter.post(
  "/employees/:id/documents",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw Errors.badRequest("No file was uploaded.");
    const { category, title, expiryDate } = req.body as Record<string, string>;
    return created(res, await hr.uploadDocument(req.params.id, req.file, { category, title, expiryDate }, req.user!));
  })
);
hrRouter.get(
  "/documents/:docId/download",
  asyncHandler(async (req, res) => {
    const { document, buffer } = await hr.downloadDocument(req.params.docId);
    sendFile(res, document.fileName, document.mimeType, buffer);
  })
);
hrRouter.delete(
  "/documents/:docId",
  asyncHandler(async (req, res) => {
    await hr.deleteDocument(req.params.docId, req.user!);
    return ok(res, { message: "Document removed." });
  })
);

hrRouter.get("/employees/:id/letters", asyncHandler(async (req, res) => ok(res, await hr.listLetters(req.params.id))));
hrRouter.post(
  "/employees/:id/letters",
  validate(letterSchema),
  asyncHandler(async (req, res) => created(res, await hr.createLetter(req.params.id, body(req), req.user!)))
);
hrRouter.delete(
  "/letters/:letterId",
  asyncHandler(async (req, res) => {
    await hr.deleteLetter(req.params.letterId, req.user!);
    return ok(res, { message: "Letter record removed." });
  })
);

hrRouter.get("/employees/:id/history", asyncHandler(async (req, res) => ok(res, await hr.listHistory(req.params.id))));
hrRouter.post(
  "/employees/:id/history",
  validate(historyNoteSchema),
  asyncHandler(async (req, res) => created(res, await hr.addHistoryNote(req.params.id, body(req), req.user!)))
);
hrRouter.delete(
  "/history/:entryId",
  asyncHandler(async (req, res) => {
    await hr.deleteHistoryEntry(req.params.entryId);
    return ok(res, { message: "Note removed." });
  })
);

hrRouter.get("/employees/:id/leave", asyncHandler(async (req, res) => ok(res, await hr.getEmployeeLeave(req.params.id))));

hrRouter.get("/employees/:id/salary", asyncHandler(async (req, res) => ok(res, await hr.getSalaryStructure(req.params.id))));
hrRouter.put(
  "/employees/:id/salary",
  validate(salarySchema),
  asyncHandler(async (req, res) => ok(res, await hr.saveSalaryStructure(req.params.id, body(req), req.user!)))
);
hrRouter.get("/employees/:id/payslips", asyncHandler(async (req, res) => ok(res, await payroll.getEmployeePayslips(req.params.id))));

// ============================ Recruitment ============================

hrRouter.get(
  "/recruitment/candidates",
  asyncHandler(async (req, res) => ok(res, await recruitment.listCandidates({ search: q(req, "search"), status: q(req, "status"), designation: q(req, "designation") })))
);
hrRouter.post(
  "/recruitment/candidates",
  validate(candidateCreateSchema),
  asyncHandler(async (req, res) => created(res, await recruitment.createCandidate(body(req), req.user!)))
);
hrRouter.get("/recruitment/designations", asyncHandler(async (_req, res) => ok(res, await recruitment.listDesignations())));
hrRouter.get("/recruitment/candidates/:id", asyncHandler(async (req, res) => ok(res, await recruitment.getCandidate(req.params.id))));
hrRouter.patch(
  "/recruitment/candidates/:id",
  validate(candidateUpdateSchema),
  asyncHandler(async (req, res) => ok(res, await recruitment.updateCandidate(req.params.id, body(req), req.user!)))
);
hrRouter.delete(
  "/recruitment/candidates/:id",
  asyncHandler(async (req, res) => {
    await recruitment.deleteCandidate(req.params.id, req.user!);
    return ok(res, { message: "Candidate removed." });
  })
);
hrRouter.post(
  "/recruitment/candidates/:id/status",
  validate(candidateStatusSchema),
  asyncHandler(async (req, res) => ok(res, await recruitment.setCandidateStatus(req.params.id, body(req).status, req.user!)))
);

hrRouter.post(
  "/recruitment/candidates/:id/cv",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw Errors.badRequest("No file was uploaded.");
    return ok(res, await recruitment.uploadCv(req.params.id, req.file, req.user!));
  })
);
hrRouter.get(
  "/recruitment/candidates/:id/cv",
  asyncHandler(async (req, res) => {
    const { fileName, mimeType, buffer } = await recruitment.downloadCv(req.params.id);
    sendFile(res, fileName, mimeType, buffer);
  })
);
hrRouter.delete("/recruitment/candidates/:id/cv", asyncHandler(async (req, res) => ok(res, await recruitment.deleteCv(req.params.id, req.user!))));

hrRouter.get(
  "/recruitment/interviews",
  asyncHandler(async (req, res) => {
    const from = q(req, "from");
    const to = q(req, "to");
    return ok(res, await recruitment.listInterviews({ status: q(req, "status"), from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined }));
  })
);
hrRouter.post(
  "/recruitment/candidates/:id/interviews",
  validate(scheduleInterviewSchema),
  asyncHandler(async (req, res) => created(res, await recruitment.scheduleInterview(req.params.id, body(req), req.user!)))
);
hrRouter.post(
  "/recruitment/interviews/:interviewId/invite",
  validate(interviewInviteSchema),
  asyncHandler(async (req, res) => ok(res, await recruitment.sendInterviewInvite(req.params.interviewId, body(req), req.user!)))
);
hrRouter.patch(
  "/recruitment/interviews/:interviewId",
  validate(interviewUpdateSchema),
  asyncHandler(async (req, res) => ok(res, await recruitment.updateInterview(req.params.interviewId, body(req), req.user!)))
);
hrRouter.delete(
  "/recruitment/interviews/:interviewId",
  asyncHandler(async (req, res) => {
    await recruitment.deleteInterview(req.params.interviewId, req.user!);
    return ok(res, { message: "Interview removed." });
  })
);

hrRouter.post(
  "/recruitment/candidates/:id/offer",
  validate(offerSchema),
  asyncHandler(async (req, res) => ok(res, await recruitment.makeOffer(req.params.id, body(req), req.user!)))
);
hrRouter.post(
  "/recruitment/candidates/:id/offer/respond",
  validate(offerResponseSchema),
  asyncHandler(async (req, res) => ok(res, await recruitment.respondToOffer(req.params.id, body(req).response, req.user!)))
);
hrRouter.patch(
  "/recruitment/candidates/:id/joining",
  validate(joiningSchema),
  asyncHandler(async (req, res) => ok(res, await recruitment.updateJoining(req.params.id, body(req), req.user!)))
);
hrRouter.post(
  "/recruitment/candidates/:id/convert",
  validate(convertSchema),
  asyncHandler(async (req, res) => created(res, await recruitment.convertToEmployee(req.params.id, body(req), req.user!)))
);

// ============================ Payroll ============================

hrRouter.get("/payroll/salary-structures", asyncHandler(async (_req, res) => ok(res, await payroll.listSalaryStructures())));
hrRouter.get("/payroll/runs", asyncHandler(async (_req, res) => ok(res, await payroll.listRuns())));
hrRouter.post(
  "/payroll/runs",
  validate(monthSchema),
  asyncHandler(async (req, res) => created(res, await payroll.createRun(body(req).month, req.user!)))
);
hrRouter.get("/payroll/runs/:month", asyncHandler(async (req, res) => ok(res, await payroll.getRun(req.params.month))));
hrRouter.post("/payroll/runs/:month/recalculate", asyncHandler(async (req, res) => ok(res, await payroll.recalculateRun(req.params.month, req.user!))));
hrRouter.post("/payroll/runs/:month/process", asyncHandler(async (req, res) => ok(res, await payroll.processRun(req.params.month, req.user!))));
hrRouter.post("/payroll/runs/:month/pay", asyncHandler(async (req, res) => ok(res, await payroll.payRun(req.params.month, req.user!))));
hrRouter.delete(
  "/payroll/runs/:month",
  asyncHandler(async (req, res) => {
    await payroll.deleteRun(req.params.month, req.user!);
    return ok(res, { message: "Payroll run deleted." });
  })
);
hrRouter.patch(
  "/payroll/payslips/:payslipId",
  validate(payslipUpdateSchema),
  asyncHandler(async (req, res) => ok(res, await payroll.updatePayslip(req.params.payslipId, body(req), req.user!)))
);
hrRouter.get("/payroll/reports/salary", asyncHandler(async (req, res) => ok(res, await payroll.salaryReport(q(req, "month") ?? currentMonthKey()))));

// ============================ Reports ============================

function rangeFromQuery(req: any): { from: Date; to: Date } {
  const now = new Date();
  const from = q(req, "from") ? new Date(q(req, "from")!) : new Date(now.getFullYear(), 0, 1);
  const to = q(req, "to") ? new Date(`${q(req, "to")}T23:59:59.999Z`) : now;
  if (isNaN(from.getTime()) || isNaN(to.getTime())) throw Errors.badRequest("Invalid date range.");
  return { from, to };
}

hrRouter.get("/reports/employees", asyncHandler(async (_req, res) => ok(res, await reports.employeeReport())));
hrRouter.get("/reports/attendance", asyncHandler(async (req, res) => ok(res, await reports.attendanceReport(q(req, "month") ?? currentMonthKey()))));
hrRouter.get(
  "/reports/leave",
  asyncHandler(async (req, res) => {
    const { from, to } = rangeFromQuery(req);
    return ok(res, await reports.leaveReport(from, to));
  })
);
hrRouter.get("/reports/payroll", asyncHandler(async (req, res) => ok(res, await reports.payrollReport(Number(q(req, "year")) || new Date().getFullYear()))));
hrRouter.get(
  "/reports/recruitment",
  asyncHandler(async (req, res) => {
    const { from, to } = rangeFromQuery(req);
    return ok(res, await reports.recruitmentReport(from, to));
  })
);
