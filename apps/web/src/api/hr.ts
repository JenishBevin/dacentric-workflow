import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/apiClient";

/**
 * HRMS expansion (request 1008): employee page, recruitment, payroll, reports.
 * All endpoints are under /hr and restricted to HR staff/admins server-side.
 * Dates arrive as ISO strings. Every mutation invalidates the whole ["hr"]
 * cache (plus the employee directory) — simple and always consistent.
 */

// ============================== Types ==============================

export interface HrEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string;
  jobTitle: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  teams: Array<{ id: string; name: string }>;
  isActive: boolean;
  phone: string | null;
  personalEmail: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  maritalStatus: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  joiningDate: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  emiratesId: string | null;
  emiratesIdExpiry: string | null;
  visaNumber: string | null;
  visaExpiry: string | null;
  laborCardNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  /** Set when a passport-size photo is on file; changes on every upload, so it doubles as a cache key. */
  photoStorageKey: string | null;
  user: { id: string; name: string; status: string; workEmail: string } | null;
  salaryStructure: SalaryStructure | null;
}

/** Fields accepted by PATCH /hr/employees/:id/profile — send "" or null to clear a value. */
export type HrProfileInput = Partial<
  Pick<
    HrEmployee,
    | "fullName" | "jobTitle" | "departmentId" | "isActive" | "phone" | "personalEmail" | "dateOfBirth" | "gender" | "nationality"
    | "maritalStatus" | "address" | "emergencyContactName" | "emergencyContactPhone" | "joiningDate" | "passportNumber"
    | "passportExpiry" | "emiratesId" | "emiratesIdExpiry" | "visaNumber" | "visaExpiry" | "laborCardNumber" | "bankName" | "bankAccountNumber"
  >
>;

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  category: string; // PASSPORT | EMIRATES_ID | VISA | CONTRACT | CERTIFICATE | OTHER
  title: string | null;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  expiryDate: string | null;
  uploadedByName: string;
  createdAt: string;
}

export type LetterType = "OFFER" | "APPOINTMENT" | "EXPERIENCE" | "RELIEVING" | "SALARY_CERTIFICATE" | "OTHER";

export interface HrLetter {
  id: string;
  employeeId: string;
  letterType: LetterType;
  refNo: string;
  issueDate: string;
  data: Record<string, any>;
  createdByName: string;
  createdAt: string;
}

export interface EmployeeHistoryEntry {
  id: string;
  employeeId: string;
  eventType: string; // JOINED | DESIGNATION_CHANGE | DEPARTMENT_CHANGE | SALARY_REVISION | STATUS_CHANGE | LETTER_ISSUED | DOCUMENT_UPLOADED | NOTE
  title: string;
  details: string | null;
  eventDate: string;
  createdByName: string | null;
}

export interface EmployeeLeave {
  year: number;
  balances: Array<{ leaveType: string; entitlement: number | null; used: number; remaining: number | null }>;
  requests: Array<{
    id: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    numberOfDays: number;
    reason: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED";
    handoverToEmployee: { id: string; fullName: string } | null;
  }>;
}

export interface SalaryStructure {
  id: string;
  employeeId: string;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  effectiveFrom: string;
  updatedByName: string | null;
}

export interface SalaryInput {
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  effectiveFrom?: string;
}

export interface SalaryStructureRow {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  joiningDate: string | null;
  structure: SalaryStructure | null;
  total: number | null;
}

export type CandidateStatus = "CV_BANK" | "NEW" | "SCREENING" | "INTERVIEW" | "SELECTED" | "REJECTED" | "OFFERED" | "ACCEPTED" | "DECLINED" | "JOINED";

export interface CandidateInterview {
  id: string;
  candidateId: string;
  round: string;
  scheduledAt: string;
  mode: "ONSITE" | "VIDEO" | "PHONE";
  interviewerName: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  rating: number | null;
  result: "PASS" | "FAIL" | "HOLD" | null;
  feedback: string | null;
  locationOrLink: string | null;
  inviteSentAt: string | null;
  inviteSentTo: string | null;
  inviteCc: string | null;
  candidate?: { id: string; fullName: string; designation: string; status: CandidateStatus; email?: string | null };
}

export interface InviteResult {
  sent: boolean;
  to?: string;
  cc?: string[];
  error?: string;
}

export interface Candidate {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  designation: string;
  source: string | null;
  experienceYears: number | null;
  currentCompany: string | null;
  currentSalary: number | null;
  expectedSalary: number | null;
  noticePeriodDays: number | null;
  notes: string | null;
  status: CandidateStatus;
  cvFileName: string | null;
  cvFileSizeBytes: number | null;
  cvUploadedAt: string | null;
  offerRefNo: string | null;
  offerDate: string | null;
  offeredDesignation: string | null;
  offeredSalary: number | null;
  offerBasic: number | null;
  offerHousing: number | null;
  offerTransport: number | null;
  offerOther: number | null;
  offerTerms: string | null;
  joiningDate: string | null;
  joiningStatus: "PENDING" | "JOINED" | "NO_SHOW" | null;
  joiningNotes: string | null;
  joiningChecklist: Record<string, boolean> | null;
  employeeId: string | null;
  createdByName: string;
  createdAt: string;
  interviews?: CandidateInterview[];
}

export interface CandidateInput {
  fullName: string;
  designation: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  experienceYears?: number | string | null;
  currentCompany?: string | null;
  currentSalary?: number | string | null;
  expectedSalary?: number | string | null;
  noticePeriodDays?: number | string | null;
  notes?: string | null;
  /** "CV_BANK" files the CV for future use without starting the interview pipeline (create only). */
  status?: "NEW" | "CV_BANK";
}

export interface InterviewInput {
  round: string;
  scheduledAt: string; // ISO or datetime-local string
  mode?: "ONSITE" | "VIDEO" | "PHONE";
  interviewerName: string;
  status?: CandidateInterview["status"];
  rating?: number | string | null;
  result?: "PASS" | "FAIL" | "HOLD" | null;
  feedback?: string | null;
  locationOrLink?: string | null;
}

export interface OfferInput {
  offeredDesignation: string;
  offerBasic: number;
  offerHousing: number;
  offerTransport: number;
  offerOther: number;
  joiningDate: string;
  offerDate?: string;
  offerTerms?: string | null;
}

export interface DesignationRow {
  name: string;
  candidates: number;
  cvs: number;
}

export interface Payslip {
  id: string;
  runId: string;
  employeeId: string;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  bonus: number;
  grossEarnings: number;
  daysInMonth: number;
  unpaidLeaveDays: number;
  leaveDeduction: number;
  otherDeduction: number;
  deductionNote: string | null;
  netPay: number;
  employee: {
    id: string;
    fullName: string;
    employeeCode: string;
    jobTitle: string | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    department: { name: string } | null;
  };
}

export interface PayrollTotals {
  headcount: number;
  gross: number;
  deductions: number;
  net: number;
}

export interface PayrollRun {
  id: string;
  month: string; // YYYY-MM
  status: "DRAFT" | "PROCESSED" | "PAID";
  processedAt: string | null;
  paidAt: string | null;
  createdByName: string;
}

export interface PayrollRunDetail {
  run: PayrollRun;
  payslips: Payslip[];
  totals: PayrollTotals;
}

export interface EmployeePayslip extends Omit<Payslip, "employee"> {
  run: { month: string; status: PayrollRun["status"] };
}

export interface SalaryReport {
  month: string;
  run: PayrollRun | null;
  rows: Array<{
    payslipId: string;
    employeeId: string;
    employeeCode: string;
    fullName: string;
    jobTitle: string | null;
    department: string;
    basicSalary: number;
    allowances: number;
    bonus: number;
    grossEarnings: number;
    unpaidLeaveDays: number;
    deductions: number;
    netPay: number;
  }>;
  byDepartment: Array<{ department: string; headcount: number; gross: number; deductions: number; net: number }>;
  totals: PayrollTotals;
}

type Counted = Array<{ label: string; count: number }>;

export interface EmployeeReport {
  summary: { total: number; active: number; inactive: number; joinedThisYear: number; documentsExpiring: number };
  byDepartment: Counted;
  byDesignation: Counted;
  byNationality: Counted;
  expiries: Array<{ employeeId: string; fullName: string; document: string; expiryDate: string; expired: boolean }>;
  rows: Array<{
    employeeId: string;
    employeeCode: string;
    fullName: string;
    workEmail: string;
    jobTitle: string | null;
    department: string | null;
    team: string | null;
    phone: string | null;
    nationality: string | null;
    joiningDate: string | null;
    isActive: boolean;
  }>;
}

export interface AttendanceReport {
  month: string;
  daysInMonth: number;
  summary: { employees: number; totalHours: number; avgPresentDays: number };
  rows: Array<{ employeeId: string; employeeCode: string; fullName: string; department: string | null; presentDays: number; totalHours: number; avgHoursPerDay: number }>;
}

export interface LeaveReport {
  summary: { requests: number; approved: number; pending: number; rejected: number; approvedDays: number };
  byType: Array<{ leaveType: string; days: number }>;
  byEmployee: Array<{ employeeId: string; fullName: string; employeeCode: string; department: string | null; days: number; requests: number }>;
  rows: Array<{ id: string; employeeId: string; fullName: string; employeeCode: string; leaveType: string; startDate: string; endDate: string; numberOfDays: number; status: string }>;
}

export interface PayrollReport {
  year: number;
  months: Array<{ month: string; status: string; headcount: number; gross: number; deductions: number; net: number }>;
  totals: { gross: number; deductions: number; net: number };
}

export interface RecruitmentReport {
  summary: {
    candidates: number;
    interviews: number;
    interviewsCompleted: number;
    avgRating: number | null;
    selected: number;
    offered: number;
    accepted: number;
    joined: number;
    offerAcceptanceRate: number | null;
  };
  byStatus: Counted;
  bySource: Counted;
  byDesignation: Array<{ designation: string; candidates: number; selected: number; offered: number; joined: number }>;
}

// ============================== Helpers ==============================

type Envelope<T> = { data: T };
const get = async <T,>(path: string, params?: Record<string, unknown>) => (await api.get<Envelope<T>>(`/hr${path}`, { params })).data.data;

/** Fetches a protected file as a Blob (e.g. employee document, candidate CV). */
export async function fetchHrFile(path: string): Promise<Blob> {
  const res = await api.get(`/hr${path}`, { responseType: "blob" });
  return res.data as Blob;
}

/** Downloads a protected file by saving it under `fileName`. */
export async function downloadHrFile(path: string, fileName: string) {
  const blob = await fetchHrFile(path);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Opens a protected file in a new tab. Call synchronously from a click handler. */
export async function previewHrFile(path: string, mimeType: string) {
  const win = window.open("", "_blank");
  try {
    const blob = await fetchHrFile(path);
    const url = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
    if (win) win.location.href = url;
  } catch (err) {
    win?.close();
    throw err;
  }
}

function useHrMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr"] });
      qc.invalidateQueries({ queryKey: ["all-employees"] });
    },
  });
}

const send = async <T,>(method: "post" | "patch" | "put" | "delete", path: string, body?: unknown, config?: object) =>
  (await api.request<Envelope<T>>({ method, url: `/hr${path}`, data: body, ...config })).data.data;

// ============================== Employee page ==============================

export const useEmployeeProfile = (id: string | undefined) =>
  useQuery({ queryKey: ["hr", "employee", id], queryFn: () => get<HrEmployee>(`/employees/${id}`), enabled: !!id });

export const useUpdateEmployeeProfile = (id: string) => useHrMutation((input: HrProfileInput) => send<HrEmployee>("patch", `/employees/${id}/profile`, input));

export const useEmployeeDocuments = (id: string | undefined) =>
  useQuery({ queryKey: ["hr", "employee", id, "documents"], queryFn: () => get<EmployeeDocument[]>(`/employees/${id}/documents`), enabled: !!id });

export const useUploadEmployeeDocument = (id: string) =>
  useHrMutation((v: { file: File; category: string; title?: string; expiryDate?: string }) => {
    const fd = new FormData();
    fd.append("file", v.file);
    fd.append("category", v.category);
    if (v.title) fd.append("title", v.title);
    if (v.expiryDate) fd.append("expiryDate", v.expiryDate);
    return send<EmployeeDocument>("post", `/employees/${id}/documents`, fd);
  });

/** The passport-size photo as an object URL (fetched with the session's auth), or null when none is on file. */
export function useEmployeePhotoUrl(id: string, photoKey: string | null) {
  const { data: blob } = useQuery({
    queryKey: ["hr", "employee", id, "photo", photoKey],
    queryFn: () => fetchHrFile(`/employees/${id}/photo`),
    enabled: !!photoKey,
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || !photoKey) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob, photoKey]);
  return url;
}

export const useUploadEmployeePhoto = (id: string) =>
  useHrMutation((file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return send<{ photoStorageKey: string }>("post", `/employees/${id}/photo`, fd);
  });

export const useRemoveEmployeePhoto = (id: string) => useHrMutation(() => send("delete", `/employees/${id}/photo`));

export const useDeleteEmployeeDocument = () => useHrMutation((docId: string) => send("delete", `/documents/${docId}`));

export const useEmployeeLetters = (id: string | undefined) =>
  useQuery({ queryKey: ["hr", "employee", id, "letters"], queryFn: () => get<HrLetter[]>(`/employees/${id}/letters`), enabled: !!id });

export const useCreateLetter = (id: string) =>
  useHrMutation((v: { letterType: LetterType; issueDate: string; data: Record<string, unknown> }) => send<HrLetter>("post", `/employees/${id}/letters`, v));

export const useDeleteLetter = () => useHrMutation((letterId: string) => send("delete", `/letters/${letterId}`));

export const useEmployeeHistory = (id: string | undefined) =>
  useQuery({ queryKey: ["hr", "employee", id, "history"], queryFn: () => get<EmployeeHistoryEntry[]>(`/employees/${id}/history`), enabled: !!id });

export const useAddHistoryNote = (id: string) =>
  useHrMutation((v: { title: string; details?: string; eventDate?: string }) => send<EmployeeHistoryEntry>("post", `/employees/${id}/history`, v));

export const useDeleteHistoryNote = () => useHrMutation((entryId: string) => send("delete", `/history/${entryId}`));

export const useEmployeeLeave = (id: string | undefined) =>
  useQuery({ queryKey: ["hr", "employee", id, "leave"], queryFn: () => get<EmployeeLeave>(`/employees/${id}/leave`), enabled: !!id });

export const useSaveSalary = (employeeId: string) => useHrMutation((v: SalaryInput) => send<SalaryStructure>("put", `/employees/${employeeId}/salary`, v));

export const useEmployeePayslips = (id: string | undefined) =>
  useQuery({ queryKey: ["hr", "employee", id, "payslips"], queryFn: () => get<EmployeePayslip[]>(`/employees/${id}/payslips`), enabled: !!id });

// ============================== Recruitment ==============================

export const useCandidates = (filters: { search?: string; status?: string; designation?: string } = {}) =>
  useQuery({ queryKey: ["hr", "candidates", filters], queryFn: () => get<Candidate[]>("/recruitment/candidates", filters) });

export const useDesignations = () => useQuery({ queryKey: ["hr", "designations"], queryFn: () => get<DesignationRow[]>("/recruitment/designations") });

export const useCreateCandidate = () => useHrMutation((v: CandidateInput) => send<Candidate>("post", "/recruitment/candidates", v));
export const useUpdateCandidate = () => useHrMutation((v: { id: string; input: Partial<CandidateInput> }) => send<Candidate>("patch", `/recruitment/candidates/${v.id}`, v.input));
export const useDeleteCandidate = () => useHrMutation((id: string) => send("delete", `/recruitment/candidates/${id}`));
export const useSetCandidateStatus = () => useHrMutation((v: { id: string; status: CandidateStatus }) => send<Candidate>("post", `/recruitment/candidates/${v.id}/status`, { status: v.status }));

export const useUploadCv = () =>
  useHrMutation((v: { id: string; file: File }) => {
    const fd = new FormData();
    fd.append("file", v.file);
    return send<Candidate>("post", `/recruitment/candidates/${v.id}/cv`, fd);
  });
export const useDeleteCv = () => useHrMutation((id: string) => send<Candidate>("delete", `/recruitment/candidates/${id}/cv`));

export const useInterviews = (filters: { status?: string; from?: string; to?: string } = {}) =>
  useQuery({ queryKey: ["hr", "interviews", filters], queryFn: () => get<CandidateInterview[]>("/recruitment/interviews", filters) });
/** Scheduling can email the invitation in the same step; `invite` in the result says whether that worked. */
export const useScheduleInterview = () =>
  useHrMutation((v: { candidateId: string; input: InterviewInput & { sendInvite?: boolean; cc?: string[]; message?: string | null } }) =>
    send<CandidateInterview & { invite?: InviteResult }>("post", `/recruitment/candidates/${v.candidateId}/interviews`, v.input)
  );
export const useSendInterviewInvite = () =>
  useHrMutation((v: { id: string; cc?: string[]; message?: string | null }) =>
    send<{ interview: CandidateInterview; to: string; cc: string[] }>("post", `/recruitment/interviews/${v.id}/invite`, { cc: v.cc, message: v.message })
  );
export const useUpdateInterview = () => useHrMutation((v: { id: string; input: Partial<InterviewInput> }) => send<CandidateInterview>("patch", `/recruitment/interviews/${v.id}`, v.input));
export const useDeleteInterview = () => useHrMutation((id: string) => send("delete", `/recruitment/interviews/${id}`));

export const useMakeOffer = () => useHrMutation((v: { id: string; input: OfferInput }) => send<Candidate>("post", `/recruitment/candidates/${v.id}/offer`, v.input));
export const useRespondToOffer = () => useHrMutation((v: { id: string; response: "ACCEPTED" | "DECLINED" }) => send<Candidate>("post", `/recruitment/candidates/${v.id}/offer/respond`, { response: v.response }));
export const useUpdateJoining = () =>
  useHrMutation((v: { id: string; input: { joiningDate?: string | null; joiningStatus?: Candidate["joiningStatus"]; joiningNotes?: string | null; joiningChecklist?: Record<string, boolean> | null } }) =>
    send<Candidate>("patch", `/recruitment/candidates/${v.id}/joining`, v.input)
  );
export const useConvertCandidate = () => useHrMutation((v: { id: string; workEmail: string; departmentId?: string | null }) => send<{ id: string; employeeCode: string }>("post", `/recruitment/candidates/${v.id}/convert`, { workEmail: v.workEmail, departmentId: v.departmentId }));

// ============================== Payroll ==============================

export const useSalaryStructures = () => useQuery({ queryKey: ["hr", "salary-structures"], queryFn: () => get<SalaryStructureRow[]>("/payroll/salary-structures") });
export const usePayrollRuns = () => useQuery({ queryKey: ["hr", "payroll-runs"], queryFn: () => get<Array<PayrollRun & { totals: PayrollTotals }>>("/payroll/runs") });
// A 404 means "no run for this month yet" — an expected answer, never worth retrying.
export const usePayrollRun = (month: string | undefined) =>
  useQuery({
    queryKey: ["hr", "payroll-run", month],
    queryFn: () => get<PayrollRunDetail>(`/payroll/runs/${month}`),
    enabled: !!month,
    retry: (failureCount, err) => !(axios.isAxiosError(err) && err.response?.status === 404) && failureCount < 1,
  });
export const useCreatePayrollRun = () => useHrMutation((month: string) => send<PayrollRunDetail>("post", "/payroll/runs", { month }));
export const useRecalculatePayrollRun = () => useHrMutation((month: string) => send<PayrollRunDetail>("post", `/payroll/runs/${month}/recalculate`));
export const useProcessPayrollRun = () => useHrMutation((month: string) => send<PayrollRunDetail>("post", `/payroll/runs/${month}/process`));
export const usePayPayrollRun = () => useHrMutation((month: string) => send<PayrollRunDetail>("post", `/payroll/runs/${month}/pay`));
export const useDeletePayrollRun = () => useHrMutation((month: string) => send("delete", `/payroll/runs/${month}`));
export const useUpdatePayslip = () => useHrMutation((v: { id: string; input: { bonus?: number; otherDeduction?: number; deductionNote?: string | null } }) => send<Payslip>("patch", `/payroll/payslips/${v.id}`, v.input));
export const useSalaryReport = (month: string) => useQuery({ queryKey: ["hr", "salary-report", month], queryFn: () => get<SalaryReport>("/payroll/reports/salary", { month }) });

// ============================== Reports ==============================

export const useEmployeeReport = () => useQuery({ queryKey: ["hr", "report", "employees"], queryFn: () => get<EmployeeReport>("/reports/employees") });
export const useAttendanceReport = (month: string) => useQuery({ queryKey: ["hr", "report", "attendance", month], queryFn: () => get<AttendanceReport>("/reports/attendance", { month }) });
export const useLeaveReport = (from: string, to: string) => useQuery({ queryKey: ["hr", "report", "leave", from, to], queryFn: () => get<LeaveReport>("/reports/leave", { from, to }) });
export const usePayrollReport = (year: number) => useQuery({ queryKey: ["hr", "report", "payroll", year], queryFn: () => get<PayrollReport>("/reports/payroll", { year }) });
export const useRecruitmentReport = (from: string, to: string) => useQuery({ queryKey: ["hr", "report", "recruitment", from, to], queryFn: () => get<RecruitmentReport>("/reports/recruitment", { from, to }) });
