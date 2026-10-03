import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../common/audit";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction, ModuleCode } from "@dacentric/types";
import { Errors } from "../../common/errors";
import { getStorageAdapter, validateFile, scanFile } from "../../lib/storage";
import { nextRefNo, round2 } from "./hr.common";

// Mirrors LEAVE_ENTITLEMENTS in integrations/hrms.routes.ts (not exported there).
const LEAVE_ENTITLEMENTS: Record<string, number | null> = {
  ANNUAL: 21,
  SICK: 10,
  MATERNITY: 90,
  PATERNITY: 7,
  UNPAID: null,
  EMERGENCY: 5,
};

const LETTER_PREFIX: Record<string, string> = {
  OFFER: "OL",
  APPOINTMENT: "AL",
  EXPERIENCE: "EXP",
  RELIEVING: "REL",
  SALARY_CERTIFICATE: "SC",
  OTHER: "HR",
};

const LETTER_LABEL: Record<string, string> = {
  OFFER: "Offer Letter",
  APPOINTMENT: "Appointment Letter",
  EXPERIENCE: "Experience Letter",
  RELIEVING: "Relieving Letter",
  SALARY_CERTIFICATE: "Salary Certificate",
  OTHER: "HR Document",
};

export const LETTER_TYPES = Object.keys(LETTER_PREFIX);

async function loadEmployee(employeeId: string) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw Errors.notFound("Employee");
  return emp;
}

export async function logHistory(
  employeeId: string,
  entry: { eventType: string; title: string; details?: string | null; eventDate?: Date },
  actor: AuthedUser | null
) {
  return prisma.employeeHistory.create({
    data: {
      employeeId,
      eventType: entry.eventType,
      title: entry.title,
      details: entry.details ?? null,
      eventDate: entry.eventDate ?? new Date(),
      createdById: actor?.id ?? null,
      createdByName: actor?.name ?? null,
    },
  });
}

// --- Profile ---

export async function getEmployeeProfile(employeeId: string) {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      department: true,
      teams: true,
      user: { select: { id: true, name: true, status: true, workEmail: true } },
      salaryStructure: true,
    },
  });
  if (!emp) throw Errors.notFound("Employee");
  return emp;
}

export interface ProfileInput {
  fullName?: string;
  jobTitle?: string | null;
  departmentId?: string | null;
  isActive?: boolean;
  phone?: string | null;
  personalEmail?: string | null;
  dateOfBirth?: Date | null;
  gender?: string | null;
  nationality?: string | null;
  maritalStatus?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  joiningDate?: Date | null;
  passportNumber?: string | null;
  passportExpiry?: Date | null;
  emiratesId?: string | null;
  emiratesIdExpiry?: Date | null;
  visaNumber?: string | null;
  visaExpiry?: Date | null;
  laborCardNumber?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
}

export async function updateEmployeeProfile(employeeId: string, input: ProfileInput, actor: AuthedUser) {
  const existing = await prisma.employee.findUnique({ where: { id: employeeId }, include: { department: true } });
  if (!existing) throw Errors.notFound("Employee");

  let newDepartmentName: string | null | undefined;
  if (input.departmentId !== undefined && input.departmentId !== existing.departmentId) {
    newDepartmentName = input.departmentId ? (await prisma.department.findUnique({ where: { id: input.departmentId } }))?.name ?? null : null;
    if (input.departmentId && newDepartmentName === null) throw Errors.badRequest("That department does not exist.");
  }

  const updated = await prisma.employee.update({ where: { id: employeeId }, data: input, include: { department: true } });

  if (input.jobTitle !== undefined && (input.jobTitle ?? null) !== (existing.jobTitle ?? null)) {
    await logHistory(employeeId, { eventType: "DESIGNATION_CHANGE", title: "Designation changed", details: `${existing.jobTitle ?? "—"} → ${input.jobTitle ?? "—"}` }, actor);
  }
  if (newDepartmentName !== undefined) {
    await logHistory(employeeId, { eventType: "DEPARTMENT_CHANGE", title: "Department changed", details: `${existing.department?.name ?? "—"} → ${newDepartmentName ?? "—"}` }, actor);
  }
  if (input.isActive !== undefined && input.isActive !== existing.isActive) {
    await logHistory(employeeId, { eventType: "STATUS_CHANGE", title: input.isActive ? "Re-activated" : "Marked inactive" }, actor);
  }

  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Employee", entityId: employeeId, afterValue: input as any, module: ModuleCode.HRMS });
  return updated;
}

// --- Documents ---

export async function listDocuments(employeeId: string) {
  await loadEmployee(employeeId);
  return prisma.employeeDocument.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" } });
}

export async function uploadDocument(
  employeeId: string,
  file: Express.Multer.File,
  meta: { category?: string; title?: string; expiryDate?: string },
  actor: AuthedUser
) {
  await loadEmployee(employeeId);

  const validationError = validateFile(file.originalname, file.size);
  if (validationError) throw Errors.validation(validationError, { file: validationError });
  const scanResult = await scanFile(file.buffer);
  if (scanResult === "REJECTED") throw Errors.validation("This file failed the security scan and was not stored.");

  const { storageKey } = await getStorageAdapter().save(file.originalname, file.buffer);
  const expiry = meta.expiryDate ? new Date(meta.expiryDate) : null;

  const doc = await prisma.employeeDocument.create({
    data: {
      employeeId,
      category: meta.category?.trim() || "OTHER",
      title: meta.title?.trim() || null,
      fileName: file.originalname,
      storageKey,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      expiryDate: expiry && !isNaN(expiry.getTime()) ? expiry : null,
      uploadedById: actor.id,
      uploadedByName: actor.name,
      scanStatus: scanResult,
    },
  });
  await logHistory(employeeId, { eventType: "DOCUMENT_UPLOADED", title: "Document uploaded", details: doc.title || doc.fileName }, actor);
  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "EmployeeDocument", entityId: doc.id, afterValue: { fileName: doc.fileName, employeeId }, module: ModuleCode.HRMS });
  return doc;
}

export async function downloadDocument(documentId: string) {
  const document = await prisma.employeeDocument.findUnique({ where: { id: documentId } });
  if (!document) throw Errors.notFound("Document");
  const buffer = await getStorageAdapter().read(document.storageKey);
  return { document, buffer };
}

export async function deleteDocument(documentId: string, actor: AuthedUser) {
  const document = await prisma.employeeDocument.findUnique({ where: { id: documentId } });
  if (!document) throw Errors.notFound("Document");
  await getStorageAdapter().remove(document.storageKey);
  await prisma.employeeDocument.delete({ where: { id: documentId } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "EmployeeDocument", entityId: documentId, beforeValue: { fileName: document.fileName }, module: ModuleCode.HRMS });
}

// --- Letters ---

export async function listLetters(employeeId: string) {
  await loadEmployee(employeeId);
  return prisma.hrLetter.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" } });
}

export async function createLetter(employeeId: string, input: { letterType: string; issueDate: Date; data: Record<string, unknown> }, actor: AuthedUser) {
  await loadEmployee(employeeId);
  if (!LETTER_TYPES.includes(input.letterType)) throw Errors.badRequest("Unknown letter type.");
  const refNo = await nextRefNo(LETTER_PREFIX[input.letterType], "letter");
  const letter = await prisma.hrLetter.create({
    data: {
      employeeId,
      letterType: input.letterType,
      refNo,
      issueDate: input.issueDate,
      data: input.data as any,
      createdById: actor.id,
      createdByName: actor.name,
    },
  });
  await logHistory(employeeId, { eventType: "LETTER_ISSUED", title: `${LETTER_LABEL[input.letterType]} issued`, details: refNo, eventDate: input.issueDate }, actor);
  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "HrLetter", entityId: letter.id, afterValue: { letterType: input.letterType, refNo, employeeId }, module: ModuleCode.HRMS });
  return letter;
}

export async function deleteLetter(letterId: string, actor: AuthedUser) {
  const letter = await prisma.hrLetter.findUnique({ where: { id: letterId } });
  if (!letter) throw Errors.notFound("Letter");
  await prisma.hrLetter.delete({ where: { id: letterId } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "HrLetter", entityId: letterId, beforeValue: { refNo: letter.refNo }, module: ModuleCode.HRMS });
}

// --- History ---

export async function listHistory(employeeId: string) {
  await loadEmployee(employeeId);
  return prisma.employeeHistory.findMany({ where: { employeeId }, orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }] });
}

export async function addHistoryNote(employeeId: string, input: { title: string; details?: string | null; eventDate?: Date }, actor: AuthedUser) {
  await loadEmployee(employeeId);
  return logHistory(employeeId, { eventType: "NOTE", title: input.title, details: input.details, eventDate: input.eventDate }, actor);
}

export async function deleteHistoryEntry(entryId: string) {
  const entry = await prisma.employeeHistory.findUnique({ where: { id: entryId } });
  if (!entry) throw Errors.notFound("History entry");
  if (entry.eventType !== "NOTE") throw Errors.badRequest("Only manual notes can be removed from the history.");
  await prisma.employeeHistory.delete({ where: { id: entryId } });
}

// --- Leave (read-only view of this employee's records; deciding stays on the Request page) ---

export async function getEmployeeLeave(employeeId: string) {
  await loadEmployee(employeeId);
  const year = new Date().getFullYear();
  const requests = await prisma.leaveRequest.findMany({
    where: { employeeId },
    include: { handoverToEmployee: { select: { id: true, fullName: true } } },
    orderBy: { startDate: "desc" },
  });
  const used: Record<string, number> = {};
  for (const r of requests) {
    if (r.status === "APPROVED" && r.startDate.getFullYear() === year) used[r.leaveType] = (used[r.leaveType] ?? 0) + r.numberOfDays;
  }
  const balances = Object.keys(LEAVE_ENTITLEMENTS).map((leaveType) => {
    const entitlement = LEAVE_ENTITLEMENTS[leaveType];
    const usedDays = used[leaveType] ?? 0;
    return { leaveType, entitlement, used: usedDays, remaining: entitlement === null ? null : entitlement - usedDays };
  });
  return { year, balances, requests };
}

// --- Salary structure ---

export async function getSalaryStructure(employeeId: string) {
  await loadEmployee(employeeId);
  return prisma.salaryStructure.findUnique({ where: { employeeId } });
}

export interface SalaryInput {
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  effectiveFrom?: Date;
}

export async function saveSalaryStructure(employeeId: string, input: SalaryInput, actor: AuthedUser) {
  await loadEmployee(employeeId);
  const before = await prisma.salaryStructure.findUnique({ where: { employeeId } });
  const data = {
    basicSalary: round2(input.basicSalary),
    housingAllowance: round2(input.housingAllowance),
    transportAllowance: round2(input.transportAllowance),
    otherAllowance: round2(input.otherAllowance),
    effectiveFrom: input.effectiveFrom ?? new Date(),
    updatedById: actor.id,
    updatedByName: actor.name,
  };
  const saved = await prisma.salaryStructure.upsert({ where: { employeeId }, create: { employeeId, ...data }, update: data });
  const total = (s: { basicSalary: number; housingAllowance: number; transportAllowance: number; otherAllowance: number }) =>
    s.basicSalary + s.housingAllowance + s.transportAllowance + s.otherAllowance;
  await logHistory(
    employeeId,
    {
      eventType: "SALARY_REVISION",
      title: before ? "Salary revised" : "Salary structure set",
      details: before ? `${total(before).toFixed(2)} → ${total(saved).toFixed(2)} AED / month` : `${total(saved).toFixed(2)} AED / month`,
      eventDate: saved.effectiveFrom,
    },
    actor
  );
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "SalaryStructure", entityId: saved.id, afterValue: { employeeId, total: total(saved) }, module: ModuleCode.HRMS });
  return saved;
}
