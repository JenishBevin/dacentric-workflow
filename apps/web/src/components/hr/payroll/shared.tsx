import React, { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import clsx from "clsx";
import { Badge, Card, Select, Skeleton } from "../../ui/primitives";
import type { Payslip, PayrollRun } from "../../../api/hr";
import { currentMonth, monthLabel, recentMonths } from "../../../lib/hrFormat";
import type { PayslipPdfInput } from "../../../lib/payslipPdf";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Selected month kept in the `?month=` URL param (falls back to the current month). */
export function useMonthParam(): [string, (m: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("month");
  const month = raw && MONTH_RE.test(raw) ? raw : currentMonth();
  const setMonth = useCallback(
    (m: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("month", m);
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );
  return [month, setMonth];
}

export const MonthSelect: React.FC<{ value: string; onChange: (m: string) => void; className?: string }> = ({ value, onChange, className }) => {
  const months = useMemo(() => {
    const list = recentMonths(24);
    return list.includes(value) ? list : [value, ...list];
  }, [value]);
  return (
    <div className={clsx("w-48", className)}>
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Select month">
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </Select>
    </div>
  );
};

export const StatTile: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: "default" | "green" | "amber" | "red" }> = ({
  label,
  value,
  hint,
  tone = "default",
}) => (
  <Card className="px-4 py-3">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p
      className={clsx(
        "mt-1 text-xl font-semibold tabular-nums",
        tone === "default" && "text-slate-900",
        tone === "green" && "text-emerald-700",
        tone === "amber" && "text-amber-700",
        tone === "red" && "text-red-700"
      )}
    >
      {value}
    </p>
    {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
  </Card>
);

export const TilesSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {Array.from({ length: count }, (_, i) => (
      <Skeleton key={i} className="h-[74px] rounded-xl" />
    ))}
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <Card className="space-y-2 p-4">
    {Array.from({ length: rows }, (_, i) => (
      <Skeleton key={i} className="h-8 w-full" />
    ))}
  </Card>
);

export const RUN_STATUS_LABEL: Record<PayrollRun["status"], string> = { DRAFT: "Draft", PROCESSED: "Processed", PAID: "Paid" };
const RUN_STATUS_TONE: Record<PayrollRun["status"], "amber" | "blue" | "green"> = { DRAFT: "amber", PROCESSED: "blue", PAID: "green" };

export const RunStatusBadge: React.FC<{ status: PayrollRun["status"] }> = ({ status }) => (
  <Badge tone={RUN_STATUS_TONE[status]} dotted>
    {RUN_STATUS_LABEL[status]}
  </Badge>
);

export function payslipToPdfInput(p: Payslip, month: string, isDraft: boolean): PayslipPdfInput {
  return {
    month,
    employeeName: p.employee.fullName,
    employeeCode: p.employee.employeeCode,
    jobTitle: p.employee.jobTitle,
    department: p.employee.department?.name ?? null,
    bankName: p.employee.bankName,
    bankAccountNumber: p.employee.bankAccountNumber,
    basicSalary: p.basicSalary,
    housingAllowance: p.housingAllowance,
    transportAllowance: p.transportAllowance,
    otherAllowance: p.otherAllowance,
    bonus: p.bonus,
    grossEarnings: p.grossEarnings,
    daysInMonth: p.daysInMonth,
    unpaidLeaveDays: p.unpaidLeaveDays,
    leaveDeduction: p.leaveDeduction,
    otherDeduction: p.otherDeduction,
    deductionNote: p.deductionNote,
    netPay: p.netPay,
    isDraft,
  };
}

/** True when a query failed with HTTP 404 (e.g. no payroll run exists for the month yet). */
export const isNotFound = (err: unknown): boolean => axios.isAxiosError(err) && err.response?.status === 404;

/** Shared table styling. */
export const TH = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
export const THR = "whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500";
export const TD = "px-3 py-2 text-sm text-slate-700";
export const TDR = "px-3 py-2 text-right text-sm tabular-nums text-slate-700";
