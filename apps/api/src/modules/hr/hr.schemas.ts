import { z } from "zod";

// Blank strings from the forms become null so a cleared field actually clears it.
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const nstr = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());
const nnum = z.preprocess(blankToNull, z.coerce.number().min(0).nullable().optional());
const nint = z.preprocess(blankToNull, z.coerce.number().int().min(0).nullable().optional());
const ndate = z.preprocess(blankToNull, z.union([z.null(), z.coerce.date()]).optional());
const money = z.coerce.number().min(0).max(10_000_000);

export const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  jobTitle: nstr(200),
  departmentId: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
  isActive: z.boolean().optional(),
  phone: nstr(50),
  personalEmail: z.preprocess(blankToNull, z.string().trim().email().max(200).nullable().optional()),
  dateOfBirth: ndate,
  gender: nstr(30),
  nationality: nstr(100),
  maritalStatus: nstr(30),
  address: nstr(500),
  emergencyContactName: nstr(200),
  emergencyContactPhone: nstr(50),
  joiningDate: ndate,
  passportNumber: nstr(60),
  passportExpiry: ndate,
  emiratesId: nstr(60),
  emiratesIdExpiry: ndate,
  visaNumber: nstr(60),
  visaExpiry: ndate,
  laborCardNumber: nstr(60),
  bankName: nstr(200),
  bankAccountNumber: nstr(80),
});

export const letterSchema = z.object({
  letterType: z.enum(["OFFER", "APPOINTMENT", "EXPERIENCE", "RELIEVING", "SALARY_CERTIFICATE", "OTHER"]),
  issueDate: z.coerce.date(),
  data: z.record(z.unknown()),
});

export const historyNoteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  details: nstr(2000),
  eventDate: z.preprocess(blankToNull, z.coerce.date().optional()),
});

export const salarySchema = z.object({
  basicSalary: money,
  housingAllowance: money.default(0),
  transportAllowance: money.default(0),
  otherAllowance: money.default(0),
  effectiveFrom: z.preprocess(blankToNull, z.coerce.date().optional()),
});

// --- Recruitment ---

export const candidateSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  designation: z.string().trim().min(1).max(200),
  email: z.preprocess(blankToNull, z.string().trim().email().max(200).nullable().optional()),
  phone: nstr(50),
  source: nstr(100),
  experienceYears: nnum,
  currentCompany: nstr(200),
  currentSalary: nnum,
  expectedSalary: nnum,
  noticePeriodDays: nint,
  notes: nstr(4000),
});
export const candidateUpdateSchema = candidateSchema.partial();
// "CV_BANK" files a CV for future use without starting the interview pipeline.
export const candidateCreateSchema = candidateSchema.extend({ status: z.enum(["NEW", "CV_BANK"]).optional() });

export const candidateStatusSchema = z.object({
  status: z.enum(["CV_BANK", "NEW", "SCREENING", "INTERVIEW", "SELECTED", "REJECTED", "OFFERED", "ACCEPTED", "DECLINED", "JOINED"]),
});

export const interviewSchema = z.object({
  round: z.string().trim().min(1).max(100),
  scheduledAt: z.coerce.date(),
  mode: z.enum(["ONSITE", "VIDEO", "PHONE"]).optional(),
  interviewerName: z.string().trim().min(1).max(200),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  rating: z.preprocess(blankToNull, z.coerce.number().int().min(1).max(5).nullable().optional()),
  result: z.preprocess(blankToNull, z.enum(["PASS", "FAIL", "HOLD"]).nullable().optional()),
  feedback: nstr(4000),
  locationOrLink: nstr(300),
});
export const interviewUpdateSchema = interviewSchema.partial();

const emailList = z.preprocess(
  (v) => (v === null || v === undefined || v === "" ? [] : v),
  z.array(z.string().trim().toLowerCase().email("Enter valid email addresses for CC").max(200)).max(10, "At most 10 CC recipients")
);

/** Scheduling can optionally send the invitation email in the same step. */
export const scheduleInterviewSchema = interviewSchema.extend({
  sendInvite: z.boolean().optional(),
  cc: emailList.optional(),
  message: nstr(2000),
});

export const interviewInviteSchema = z.object({ cc: emailList.optional(), message: nstr(2000) });

export const offerSchema = z.object({
  offeredDesignation: z.string().trim().min(1).max(200),
  offerBasic: money,
  offerHousing: money.default(0),
  offerTransport: money.default(0),
  offerOther: money.default(0),
  joiningDate: z.coerce.date(),
  offerDate: z.preprocess(blankToNull, z.coerce.date().optional()),
  offerTerms: nstr(4000),
});

export const offerResponseSchema = z.object({ response: z.enum(["ACCEPTED", "DECLINED"]) });

export const joiningSchema = z.object({
  joiningDate: ndate,
  joiningStatus: z.preprocess(blankToNull, z.enum(["PENDING", "JOINED", "NO_SHOW"]).nullable().optional()),
  joiningNotes: nstr(2000),
  joiningChecklist: z.record(z.boolean()).nullable().optional(),
});

export const convertSchema = z.object({
  workEmail: z.string().trim().email().max(200),
  departmentId: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
});

// --- Payroll ---

export const monthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM") });

export const payslipUpdateSchema = z.object({
  bonus: z.coerce.number().min(0).max(10_000_000).optional(),
  otherDeduction: z.coerce.number().min(0).max(10_000_000).optional(),
  deductionNote: nstr(300),
});
