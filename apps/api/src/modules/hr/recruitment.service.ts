import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../common/audit";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction, ModuleCode } from "@dacentric/types";
import { Errors } from "../../common/errors";
import { getStorageAdapter, validateFile, scanFile } from "../../lib/storage";
import { createEmployee } from "../users/users.service";
import { getEmailAdapter } from "../../lib/email";
import { buildInterviewInviteEmail } from "./interviewInvite";
import { nextRefNo, round2 } from "./hr.common";
import { logHistory, saveSalaryStructure } from "./hr.service";

export const CANDIDATE_STATUSES = ["CV_BANK", "NEW", "SCREENING", "INTERVIEW", "SELECTED", "REJECTED", "OFFERED", "ACCEPTED", "DECLINED", "JOINED"] as const;

async function loadCandidate(id: string) {
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c) throw Errors.notFound("Candidate");
  return c;
}

// --- Candidates ---

export async function listCandidates(filters: { search?: string; status?: string; designation?: string }) {
  return prisma.candidate.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.designation ? { designation: { equals: filters.designation, mode: "insensitive" as const } } : {}),
      ...(filters.search
        ? {
            OR: [
              { fullName: { contains: filters.search, mode: "insensitive" as const } },
              { email: { contains: filters.search, mode: "insensitive" as const } },
              { phone: { contains: filters.search, mode: "insensitive" as const } },
              { designation: { contains: filters.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { interviews: { orderBy: { scheduledAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCandidate(id: string) {
  const c = await prisma.candidate.findUnique({ where: { id }, include: { interviews: { orderBy: { scheduledAt: "asc" } } } });
  if (!c) throw Errors.notFound("Candidate");
  return c;
}

export interface CandidateInput {
  fullName: string;
  designation: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  experienceYears?: number | null;
  currentCompany?: string | null;
  currentSalary?: number | null;
  expectedSalary?: number | null;
  noticePeriodDays?: number | null;
  notes?: string | null;
}

export async function createCandidate(input: CandidateInput & { status?: "NEW" | "CV_BANK" }, actor: AuthedUser) {
  const c = await prisma.candidate.create({ data: { ...input, createdById: actor.id, createdByName: actor.name } });
  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "Candidate", entityId: c.id, afterValue: { fullName: c.fullName, designation: c.designation }, module: ModuleCode.HRMS });
  return c;
}

export async function updateCandidate(id: string, input: Partial<CandidateInput>, actor: AuthedUser) {
  await loadCandidate(id);
  const c = await prisma.candidate.update({ where: { id }, data: input });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Candidate", entityId: id, afterValue: input as any, module: ModuleCode.HRMS });
  return c;
}

export async function deleteCandidate(id: string, actor: AuthedUser) {
  const c = await loadCandidate(id);
  if (c.employeeId) throw Errors.badRequest("This candidate has already been converted into an employee and can't be deleted.");
  if (c.cvStorageKey) await getStorageAdapter().remove(c.cvStorageKey).catch(() => undefined);
  await prisma.candidate.delete({ where: { id } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "Candidate", entityId: id, beforeValue: { fullName: c.fullName }, module: ModuleCode.HRMS });
}

export async function setCandidateStatus(id: string, status: string, actor: AuthedUser) {
  const c = await loadCandidate(id);
  if (!(CANDIDATE_STATUSES as readonly string[]).includes(status)) throw Errors.badRequest("Unknown status.");
  if (c.status === "JOINED") throw Errors.badRequest("A candidate who has joined can't be moved back in the pipeline.");
  const updated = await prisma.candidate.update({ where: { id }, data: { status } });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Candidate", entityId: id, field: "status", beforeValue: c.status, afterValue: status, module: ModuleCode.HRMS });
  return updated;
}

// --- CV bank ---

export async function uploadCv(id: string, file: Express.Multer.File, actor: AuthedUser) {
  const c = await loadCandidate(id);
  const validationError = validateFile(file.originalname, file.size);
  if (validationError) throw Errors.validation(validationError, { file: validationError });
  const scanResult = await scanFile(file.buffer);
  if (scanResult === "REJECTED") throw Errors.validation("This file failed the security scan and was not stored.");

  const { storageKey } = await getStorageAdapter().save(file.originalname, file.buffer);
  if (c.cvStorageKey) await getStorageAdapter().remove(c.cvStorageKey).catch(() => undefined);
  const updated = await prisma.candidate.update({
    where: { id },
    data: { cvFileName: file.originalname, cvStorageKey: storageKey, cvMimeType: file.mimetype, cvFileSizeBytes: file.size, cvUploadedAt: new Date() },
  });
  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "CandidateCv", entityId: id, afterValue: { fileName: file.originalname }, module: ModuleCode.HRMS });
  return updated;
}

export async function downloadCv(id: string) {
  const c = await loadCandidate(id);
  if (!c.cvStorageKey || !c.cvFileName) throw Errors.notFound("CV");
  const buffer = await getStorageAdapter().read(c.cvStorageKey);
  return { fileName: c.cvFileName, mimeType: c.cvMimeType ?? "application/octet-stream", buffer };
}

export async function deleteCv(id: string, actor: AuthedUser) {
  const c = await loadCandidate(id);
  if (!c.cvStorageKey) return c;
  await getStorageAdapter().remove(c.cvStorageKey).catch(() => undefined);
  const updated = await prisma.candidate.update({
    where: { id },
    data: { cvFileName: null, cvStorageKey: null, cvMimeType: null, cvFileSizeBytes: null, cvUploadedAt: null },
  });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "CandidateCv", entityId: id, beforeValue: { fileName: c.cvFileName }, module: ModuleCode.HRMS });
  return updated;
}

/** Designations known to the system (employees' job titles + candidates' applied roles) with CV counts. */
export async function listDesignations() {
  const [employees, candidates] = await Promise.all([
    prisma.employee.findMany({ where: { jobTitle: { not: null } }, select: { jobTitle: true }, distinct: ["jobTitle"] }),
    prisma.candidate.findMany({ select: { designation: true, cvStorageKey: true } }),
  ]);
  const map = new Map<string, { name: string; candidates: number; cvs: number }>();
  const touch = (name: string) => {
    const key = name.trim().toLowerCase();
    if (!map.has(key)) map.set(key, { name: name.trim(), candidates: 0, cvs: 0 });
    return map.get(key)!;
  };
  for (const e of employees) if (e.jobTitle?.trim()) touch(e.jobTitle);
  for (const c of candidates) {
    const row = touch(c.designation);
    row.candidates += 1;
    if (c.cvStorageKey) row.cvs += 1;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// --- Interviews ---

export async function listInterviews(filters: { status?: string; from?: Date; to?: Date }) {
  return prisma.candidateInterview.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from || filters.to ? { scheduledAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lt: filters.to } : {}) } } : {}),
    },
    include: { candidate: { select: { id: true, fullName: true, designation: true, status: true, email: true } } },
    orderBy: { scheduledAt: "asc" },
  });
}

export interface InterviewInput {
  round: string;
  scheduledAt: Date;
  mode?: string;
  interviewerName: string;
  status?: string;
  rating?: number | null;
  result?: string | null;
  feedback?: string | null;
  locationOrLink?: string | null;
}

export interface InviteOptions {
  cc?: string[];
  message?: string | null;
}

export interface InviteResult {
  sent: boolean;
  to?: string;
  cc?: string[];
  error?: string;
}

/** Emails the candidate their interview details (with a calendar entry), CC'ing whoever HR picked. */
export async function sendInterviewInvite(interviewId: string, options: InviteOptions, actor: AuthedUser) {
  const interview = await prisma.candidateInterview.findUnique({ where: { id: interviewId }, include: { candidate: true } });
  if (!interview) throw Errors.notFound("Interview");
  const candidate = interview.candidate;
  const to = candidate.email?.trim().toLowerCase();
  if (!to) throw Errors.badRequest("This candidate has no email address. Add one to the candidate first.");
  if (interview.status !== "SCHEDULED") throw Errors.badRequest("Invitations can only be sent for scheduled interviews.");

  const cc = [...new Set((options.cc ?? []).map((e) => e.trim().toLowerCase()).filter((e) => e && e !== to))];
  const email = buildInterviewInviteEmail({
    interviewId,
    candidateName: candidate.fullName,
    designation: candidate.designation,
    round: interview.round,
    scheduledAt: interview.scheduledAt,
    mode: interview.mode,
    interviewerName: interview.interviewerName,
    locationOrLink: interview.locationOrLink,
    message: options.message?.trim() || null,
    senderName: actor.name,
  });

  try {
    await getEmailAdapter().send({ to, cc, replyTo: actor.workEmail, ...email });
  } catch (err) {
    throw Errors.badRequest(`The invitation email could not be sent: ${err instanceof Error ? err.message : "mail server error"}`);
  }

  const updated = await prisma.candidateInterview.update({
    where: { id: interviewId },
    data: { inviteSentAt: new Date(), inviteSentTo: to, inviteCc: cc.join(", ") || null },
  });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "CandidateInterview", entityId: interviewId, field: "inviteSent", afterValue: { to, cc }, module: ModuleCode.HRMS });
  return { interview: updated, to, cc };
}

export async function scheduleInterview(candidateId: string, input: InterviewInput & { sendInvite?: boolean; cc?: string[]; message?: string | null }, actor: AuthedUser) {
  const c = await loadCandidate(candidateId);
  const { sendInvite, cc, message, ...data } = input;
  const interview = await prisma.candidateInterview.create({ data: { candidateId, ...data } });
  if (["CV_BANK", "NEW", "SCREENING"].includes(c.status)) {
    await prisma.candidate.update({ where: { id: candidateId }, data: { status: "INTERVIEW" } });
  }
  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "CandidateInterview", entityId: interview.id, afterValue: { candidateId, round: input.round }, module: ModuleCode.HRMS });

  // A failed email never undoes the scheduling — the result tells the UI what happened.
  let invite: InviteResult | undefined;
  if (sendInvite) {
    try {
      const sent = await sendInterviewInvite(interview.id, { cc, message }, actor);
      invite = { sent: true, to: sent.to, cc: sent.cc };
    } catch (err) {
      invite = { sent: false, error: err instanceof Error ? err.message : "Could not send the invitation." };
    }
  }
  const fresh = await prisma.candidateInterview.findUnique({ where: { id: interview.id } });
  return { ...fresh!, invite };
}

export async function updateInterview(id: string, input: Partial<InterviewInput>, actor: AuthedUser) {
  const existing = await prisma.candidateInterview.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound("Interview");
  const interview = await prisma.candidateInterview.update({ where: { id }, data: input });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "CandidateInterview", entityId: id, afterValue: input as any, module: ModuleCode.HRMS });
  return interview;
}

export async function deleteInterview(id: string, actor: AuthedUser) {
  const existing = await prisma.candidateInterview.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound("Interview");
  await prisma.candidateInterview.delete({ where: { id } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "CandidateInterview", entityId: id, module: ModuleCode.HRMS });
}

// --- Offer ---

export interface OfferInput {
  offeredDesignation: string;
  offerBasic: number;
  offerHousing: number;
  offerTransport: number;
  offerOther: number;
  joiningDate: Date;
  offerDate?: Date;
  offerTerms?: string | null;
}

export async function makeOffer(id: string, input: OfferInput, actor: AuthedUser) {
  const c = await loadCandidate(id);
  if (!["SELECTED", "OFFERED", "DECLINED"].includes(c.status)) {
    throw Errors.badRequest("Only a selected candidate can be made an offer.");
  }
  const refNo = c.offerRefNo ?? (await nextRefNo("OL", "offer"));
  const total = round2(input.offerBasic + input.offerHousing + input.offerTransport + input.offerOther);
  const updated = await prisma.candidate.update({
    where: { id },
    data: {
      status: "OFFERED",
      offerRefNo: refNo,
      offerDate: input.offerDate ?? new Date(),
      offeredDesignation: input.offeredDesignation,
      offeredSalary: total,
      offerBasic: input.offerBasic,
      offerHousing: input.offerHousing,
      offerTransport: input.offerTransport,
      offerOther: input.offerOther,
      offerTerms: input.offerTerms ?? null,
      joiningDate: input.joiningDate,
      joiningStatus: "PENDING",
    },
  });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Candidate", entityId: id, field: "offer", afterValue: { refNo, total }, module: ModuleCode.HRMS });
  return updated;
}

export async function respondToOffer(id: string, response: "ACCEPTED" | "DECLINED", actor: AuthedUser) {
  const c = await loadCandidate(id);
  if (c.status !== "OFFERED") throw Errors.badRequest("There is no open offer for this candidate.");
  const updated = await prisma.candidate.update({ where: { id }, data: { status: response } });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Candidate", entityId: id, field: "offerResponse", afterValue: response, module: ModuleCode.HRMS });
  return updated;
}

// --- Joining ---

export interface JoiningInput {
  joiningDate?: Date | null;
  joiningStatus?: string | null;
  joiningNotes?: string | null;
  joiningChecklist?: Record<string, boolean> | null;
}

export async function updateJoining(id: string, input: JoiningInput, actor: AuthedUser) {
  const c = await loadCandidate(id);
  if (!["ACCEPTED", "JOINED"].includes(c.status)) throw Errors.badRequest("Joining details apply once an offer has been accepted.");
  const updated = await prisma.candidate.update({
    where: { id },
    data: { ...input, joiningChecklist: input.joiningChecklist === undefined ? undefined : (input.joiningChecklist as any) },
  });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Candidate", entityId: id, field: "joining", afterValue: input as any, module: ModuleCode.HRMS });
  return updated;
}

/** Turns an accepted candidate into an Employee, carrying over the offered salary structure. */
export async function convertToEmployee(id: string, input: { workEmail: string; departmentId?: string | null }, actor: AuthedUser) {
  const c = await loadCandidate(id);
  if (c.employeeId) throw Errors.badRequest("This candidate has already been converted.");
  if (c.status !== "ACCEPTED") throw Errors.badRequest("The offer must be accepted before the candidate can join.");

  const employee = await createEmployee(
    { fullName: c.fullName, workEmail: input.workEmail, jobTitle: c.offeredDesignation ?? c.designation, departmentId: input.departmentId ?? null },
    actor
  );
  const joiningDate = c.joiningDate ?? new Date();
  await prisma.employee.update({
    where: { id: employee.id },
    data: { joiningDate, phone: c.phone ?? undefined, personalEmail: c.email ?? undefined },
  });
  await logHistory(employee.id, { eventType: "JOINED", title: "Joined the company", details: `As ${c.offeredDesignation ?? c.designation} (from recruitment, offer ${c.offerRefNo ?? "—"})`, eventDate: joiningDate }, actor);
  if (c.offerBasic != null) {
    await saveSalaryStructure(
      employee.id,
      {
        basicSalary: c.offerBasic ?? 0,
        housingAllowance: c.offerHousing ?? 0,
        transportAllowance: c.offerTransport ?? 0,
        otherAllowance: c.offerOther ?? 0,
        effectiveFrom: joiningDate,
      },
      actor
    );
  }
  await prisma.candidate.update({ where: { id }, data: { status: "JOINED", joiningStatus: "JOINED", employeeId: employee.id } });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Candidate", entityId: id, field: "convertedToEmployee", afterValue: { employeeId: employee.id }, module: ModuleCode.HRMS });
  return employee;
}
