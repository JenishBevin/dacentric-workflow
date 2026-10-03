import { format } from "date-fns";
import type { CandidateStatus } from "../api/hr";

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(value: string | Date | null | undefined, pattern = "d MMM yyyy"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return isNaN(d.getTime()) ? "—" : format(d, pattern);
}

/** "2026-10" -> "October 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(y, (m ?? 1) - 1, 1), "MMMM yyyy");
}

export function currentMonth(): string {
  return format(new Date(), "yyyy-MM");
}

/** Last `count` months (newest first) as YYYY-MM keys, for month pickers. */
export function recentMonths(count = 18): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => format(new Date(now.getFullYear(), now.getMonth() - i, 1), "yyyy-MM"));
}

/** <input type="date"> value for an ISO string (or ""). */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
  CV_BANK: "In CV bank",
  NEW: "New",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  SELECTED: "Selected",
  REJECTED: "Rejected",
  OFFERED: "Offered",
  ACCEPTED: "Offer accepted",
  DECLINED: "Offer declined",
  JOINED: "Joined",
};

export const CANDIDATE_STATUS_TONE: Record<CandidateStatus, "slate" | "blue" | "indigo" | "green" | "red" | "amber" | "purple"> = {
  CV_BANK: "purple",
  NEW: "slate",
  SCREENING: "blue",
  INTERVIEW: "indigo",
  SELECTED: "green",
  REJECTED: "red",
  OFFERED: "amber",
  ACCEPTED: "green",
  DECLINED: "red",
  JOINED: "green",
};

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Downloads rows as a CSV file (opens cleanly in Excel — BOM included). */
export function downloadCsv(fileName: string, headers: string[], rows: Array<Array<unknown>>) {
  const body = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
