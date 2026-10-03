import React from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { FileText, FileX } from "lucide-react";
import { Badge, Skeleton } from "../../ui/primitives";
import { useToast } from "../../../context/ToastContext";
import { extractApiError } from "../../../lib/apiClient";
import { CANDIDATE_STATUS_LABEL, CANDIDATE_STATUS_TONE } from "../../../lib/hrFormat";
import type { Candidate, CandidateInterview, CandidateStatus } from "../../../api/hr";

export const RECRUITMENT_STEPS = [
  { to: "/hrms/recruitment/candidates", label: "Candidates" },
  { to: "/hrms/recruitment/cv-bank", label: "CV Bank" },
  { to: "/hrms/recruitment/interviews", label: "Interviews" },
  { to: "/hrms/recruitment/selection", label: "Selection" },
  { to: "/hrms/recruitment/offers", label: "Offer Letters" },
  { to: "/hrms/recruitment/joining", label: "Joining" },
];

export function RecruitmentHeader({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1" aria-label="Recruitment steps">
        {RECRUITMENT_STEPS.map((s, i) => (
          <NavLink
            key={s.to}
            to={s.to}
            className={({ isActive }) =>
              clsx(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              )
            }
          >
            <span className="text-xs text-slate-400">{i + 1}</span>
            {s.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function useNotify() {
  const { push } = useToast();
  return {
    success: (title: string, description?: string) => push({ variant: "success", title, description }),
    fail: (title: string, description?: string) => push({ variant: "error", title, description }),
    error: (err: unknown, title = "Action failed") => push({ variant: "error", title, description: extractApiError(err).message }),
  };
}

export function CandidateStatusBadge({ status }: { status: CandidateStatus }) {
  return (
    <Badge tone={CANDIDATE_STATUS_TONE[status]} dotted>
      {CANDIDATE_STATUS_LABEL[status]}
    </Badge>
  );
}

export function CvIndicator({ candidate }: { candidate: Pick<Candidate, "cvFileName"> }) {
  return candidate.cvFileName ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
      <FileText className="h-3.5 w-3.5" /> CV
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
      <FileX className="h-3.5 w-3.5" /> No CV
    </span>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export const fmtExperience = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n} ${Number(n) === 1 ? "yr" : "yrs"}`);

export function cvMimeType(fileName: string | null | undefined): string {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (ext === "doc") return "application/msword";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/pdf";
}

export const CV_MAX_BYTES = 25 * 1024 * 1024;
export const CV_ACCEPT = ".pdf,.doc,.docx";

export function validateCvFile(file: File): string | null {
  if (!/\.(pdf|docx?)$/i.test(file.name)) return "CV must be a PDF or Word document (.pdf, .doc, .docx).";
  if (file.size > CV_MAX_BYTES) return "CV must be 25 MB or smaller.";
  return null;
}

export function fmtFileSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const INTERVIEW_STATUS_TONE: Record<CandidateInterview["status"], "blue" | "green" | "slate" | "red"> = {
  SCHEDULED: "blue",
  COMPLETED: "green",
  CANCELLED: "slate",
  NO_SHOW: "red",
};

export const INTERVIEW_RESULT_TONE: Record<NonNullable<CandidateInterview["result"]>, "green" | "red" | "amber"> = {
  PASS: "green",
  FAIL: "red",
  HOLD: "amber",
};

export const INTERVIEW_MODE_LABEL: Record<CandidateInterview["mode"], string> = { ONSITE: "On-site", VIDEO: "Video", PHONE: "Phone" };


export function interviewSummary(interviews: CandidateInterview[] | undefined) {
  const list = (interviews ?? []).filter((i) => i.status !== "CANCELLED");
  const rated = list.filter((i) => i.rating !== null);
  return {
    rounds: list.length,
    completed: list.filter((i) => i.status === "COMPLETED").length,
    avgRating: rated.length ? rated.reduce((s, i) => s + (i.rating ?? 0), 0) / rated.length : null,
    results: list.filter((i) => i.result).map((i) => ({ round: i.round, result: i.result! })),
  };
}
