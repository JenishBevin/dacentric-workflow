import React, { useState } from "react";
import { Check, FilePlus2, Lock, RefreshCw, Save, Trash2, Wallet } from "lucide-react";
import clsx from "clsx";
import {
  useCreatePayrollRun,
  useDeletePayrollRun,
  usePayPayrollRun,
  usePayrollRun,
  usePayrollRuns,
  useProcessPayrollRun,
  useRecalculatePayrollRun,
  useUpdatePayslip,
  type Payslip,
  type PayrollRun,
} from "../../../api/hr";
import { Button, Card, EmptyState, ErrorState, Input } from "../../../components/ui/primitives";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { useToast } from "../../../context/ToastContext";
import { extractApiError } from "../../../lib/apiClient";
import { fmtDate, fmtMoney, monthLabel } from "../../../lib/hrFormat";
import {
  isNotFound,
  MonthSelect,
  RunStatusBadge,
  StatTile,
  TableSkeleton,
  TD,
  TDR,
  TH,
  THR,
  TilesSkeleton,
  useMonthParam,
} from "../../../components/hr/payroll/shared";

// ---------------------------------------------------------------------------
// Status stepper
// ---------------------------------------------------------------------------
const STEPS: Array<{ status: PayrollRun["status"]; label: string }> = [
  { status: "DRAFT", label: "Draft" },
  { status: "PROCESSED", label: "Processed" },
  { status: "PAID", label: "Paid" },
];

const Stepper: React.FC<{ status: PayrollRun["status"] }> = ({ status }) => {
  const current = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = i < current || status === "PAID";
        const active = i === current && status !== "PAID";
        return (
          <React.Fragment key={s.status}>
            <li className="flex items-center gap-2">
              <span
                className={clsx(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                  done && "bg-emerald-600 text-white",
                  active && "bg-brand-600 text-white",
                  !done && !active && "bg-slate-200 text-slate-500"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={clsx("text-sm", active || done ? "font-medium text-slate-900" : "text-slate-500")}>{s.label}</span>
            </li>
            {i < STEPS.length - 1 && <span className={clsx("h-px w-8 sm:w-14", i < current ? "bg-emerald-500" : "bg-slate-300")} />}
          </React.Fragment>
        );
      })}
    </ol>
  );
};

// ---------------------------------------------------------------------------
// Payslip row (editable while DRAFT)
// ---------------------------------------------------------------------------
function parseMoney(s: string): number | null {
  if (s.trim() === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const PayslipRow: React.FC<{ p: Payslip; editable: boolean }> = ({ p, editable }) => {
  const { push } = useToast();
  const update = useUpdatePayslip();
  const [bonus, setBonus] = useState(String(p.bonus));
  const [other, setOther] = useState(String(p.otherDeduction));
  const [note, setNote] = useState(p.deductionNote ?? "");

  const bonusN = parseMoney(bonus);
  const otherN = parseMoney(other);
  const dirty = bonusN !== p.bonus || otherN !== p.otherDeduction || note.trim() !== (p.deductionNote ?? "");
  const invalid = bonusN === null || otherN === null;

  async function save() {
    if (invalid || !dirty) return;
    try {
      await update.mutateAsync({ id: p.id, input: { bonus: bonusN!, otherDeduction: otherN!, deductionNote: note.trim() || null } });
      push({ variant: "success", title: "Payslip updated", description: p.employee.fullName });
    } catch (err) {
      push({ variant: "error", title: "Could not update payslip", description: extractApiError(err).message });
    }
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  };

  const allowances = p.housingAllowance + p.transportAllowance + p.otherAllowance;

  return (
    <tr className="align-top hover:bg-slate-50/60">
      <td className={`${TD} whitespace-nowrap`}>
        <div className="font-medium text-slate-900">{p.employee.fullName}</div>
        <div className="font-mono text-xs text-slate-500">{p.employee.employeeCode}</div>
      </td>
      <td className={TD}>{p.employee.jobTitle ?? "—"}</td>
      <td className={TDR}>{fmtMoney(p.basicSalary)}</td>
      <td className={TDR}>{fmtMoney(allowances)}</td>
      <td className={TDR}>
        {editable ? (
          <Input
            type="number"
            min={0}
            step="0.01"
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
            onKeyDown={onKey}
            disabled={update.isPending}
            className="w-28 text-right"
            aria-label={`Bonus for ${p.employee.fullName}`}
            error={bonusN === null ? "Invalid" : undefined}
          />
        ) : (
          fmtMoney(p.bonus)
        )}
      </td>
      <td className={`${TDR} font-medium`}>{fmtMoney(p.grossEarnings)}</td>
      <td className={TDR}>{p.unpaidLeaveDays}</td>
      <td className={TDR}>{fmtMoney(p.leaveDeduction)}</td>
      <td className={TDR}>
        {editable ? (
          <div className="ml-auto flex w-44 flex-col gap-1.5">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={other}
              onChange={(e) => setOther(e.target.value)}
              onKeyDown={onKey}
              disabled={update.isPending}
              className="text-right"
              aria-label={`Other deduction for ${p.employee.fullName}`}
              error={otherN === null ? "Invalid" : undefined}
            />
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={onKey}
              disabled={update.isPending}
              placeholder="Note (optional)"
              maxLength={200}
              className="text-left"
              aria-label={`Deduction note for ${p.employee.fullName}`}
            />
          </div>
        ) : (
          <div>
            <div>{fmtMoney(p.otherDeduction)}</div>
            {p.deductionNote && <div className="max-w-[180px] text-right text-xs italic text-slate-500">{p.deductionNote}</div>}
          </div>
        )}
      </td>
      <td className={`${TDR} font-semibold text-slate-900`}>{fmtMoney(p.netPay)}</td>
      {editable && (
        <td className={`${TD} text-right`}>
          <Button size="sm" variant={dirty ? "primary" : "outline"} disabled={!dirty || invalid} loading={update.isPending} onClick={save}>
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
        </td>
      )}
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
type ConfirmKind = "recalc" | "process" | "pay" | "delete";

export default function PayrollProcessingPage() {
  const { push } = useToast();
  const [month, setMonth] = useMonthParam();
  const runs = usePayrollRuns();
  const detail = usePayrollRun(month);
  const create = useCreatePayrollRun();
  const recalc = useRecalculatePayrollRun();
  const processRun = useProcessPayrollRun();
  const pay = usePayPayrollRun();
  const del = useDeletePayrollRun();
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);

  const busy = create.isPending || recalc.isPending || processRun.isPending || pay.isPending || del.isPending;
  const run = detail.data?.run ?? null;
  const noRun = detail.isError && isNotFound(detail.error);
  const label = monthLabel(month);

  async function onCreate() {
    try {
      await create.mutateAsync(month);
      push({ variant: "success", title: "Payroll run created", description: label });
    } catch (err) {
      push({ variant: "error", title: "Could not create payroll run", description: extractApiError(err).message });
    }
  }

  async function onConfirm() {
    if (!confirm) return;
    try {
      if (confirm === "recalc") {
        await recalc.mutateAsync(month);
        push({ variant: "success", title: "Payroll recalculated", description: label });
      } else if (confirm === "process") {
        await processRun.mutateAsync(month);
        push({ variant: "success", title: "Payroll processed", description: `${label} is now locked for editing.` });
      } else if (confirm === "pay") {
        await pay.mutateAsync(month);
        push({ variant: "success", title: "Payroll marked as paid", description: label });
      } else {
        await del.mutateAsync(month);
        push({ variant: "success", title: "Payroll run deleted", description: label });
      }
      setConfirm(null);
    } catch (err) {
      push({ variant: "error", title: "Action failed", description: extractApiError(err).message });
      setConfirm(null);
    }
  }

  const confirmCopy: Record<ConfirmKind, { title: string; message: React.ReactNode; label: string; destructive: boolean }> = {
    recalc: {
      title: "Recalculate payroll",
      message: (
        <>
          Re-pull salary structures and approved unpaid leave for <strong>{label}</strong>. Bonus and other-deduction entries you have typed in are kept.
        </>
      ),
      label: "Recalculate",
      destructive: false,
    },
    process: {
      title: "Process payroll",
      message: (
        <>
          Mark the <strong>{label}</strong> payroll as processed. This locks all payslips — bonus and deductions can no longer be edited, and the run cannot be
          deleted or recalculated.
        </>
      ),
      label: "Process payroll",
      destructive: false,
    },
    pay: {
      title: "Mark payroll as paid",
      message: (
        <>
          Confirm that salaries for <strong>{label}</strong> have been paid out. The run becomes final.
        </>
      ),
      label: "Mark as paid",
      destructive: false,
    },
    delete: {
      title: "Delete payroll run",
      message: (
        <>
          Delete the draft payroll run for <strong>{label}</strong>, including all of its payslips and manual entries? This cannot be undone.
        </>
      ),
      label: "Delete run",
      destructive: true,
    },
  };

  const payslips = detail.data?.payslips ?? [];
  const totals = detail.data?.totals;
  const editable = run?.status === "DRAFT";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Payroll Processing</h1>
          <p className="text-sm text-slate-500">Build, review and finalise the monthly payroll run.</p>
        </div>
        <MonthSelect value={month} onChange={setMonth} />
      </div>

      {detail.isLoading ? (
        <>
          <TilesSkeleton />
          <TableSkeleton />
        </>
      ) : noRun ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title={`No payroll run for ${label}`}
          description="Creating a run generates one payslip for every active employee with a salary structure."
          action={
            <Button onClick={onCreate} loading={create.isPending}>
              <FilePlus2 className="h-4 w-4" />
              Create payroll run
            </Button>
          }
        />
      ) : detail.isError ? (
        <ErrorState message="Could not load this payroll run." onRetry={() => detail.refetch()} />
      ) : run && totals ? (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{label}</span>
                <RunStatusBadge status={run.status} />
              </div>
              <Stepper status={run.status} />
              <p className="text-xs text-slate-500">
                Created by {run.createdByName}
                {run.processedAt && ` · Processed ${fmtDate(run.processedAt)}`}
                {run.paidAt && ` · Paid ${fmtDate(run.paidAt)}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {run.status === "DRAFT" && (
                <>
                  <Button variant="outline" onClick={() => setConfirm("recalc")} disabled={busy}>
                    <RefreshCw className="h-4 w-4" />
                    Recalculate
                  </Button>
                  <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => setConfirm("delete")} disabled={busy}>
                    <Trash2 className="h-4 w-4" />
                    Delete run
                  </Button>
                  <Button onClick={() => setConfirm("process")} disabled={busy || payslips.length === 0}>
                    <Lock className="h-4 w-4" />
                    Process payroll
                  </Button>
                </>
              )}
              {run.status === "PROCESSED" && (
                <Button onClick={() => setConfirm("pay")} disabled={busy}>
                  <Check className="h-4 w-4" />
                  Mark as paid
                </Button>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Employees" value={totals.headcount} />
            <StatTile label="Gross earnings" value={fmtMoney(totals.gross)} hint="AED" />
            <StatTile label="Deductions" value={fmtMoney(totals.deductions)} hint="AED" tone={totals.deductions > 0 ? "amber" : "default"} />
            <StatTile label="Net payable" value={fmtMoney(totals.net)} hint="AED" tone="green" />
          </div>

          {editable ? (
            <p className="text-xs text-slate-500">
              Draft: enter a bonus or other deduction per employee, then press Save on the row (or Enter). Unpaid leave is calculated automatically.
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Lock className="h-3.5 w-3.5" /> This run is {run.status === "PAID" ? "paid" : "processed"} and read-only.
            </p>
          )}

          {payslips.length === 0 ? (
            <EmptyState title="This run has no payslips" description="Recalculate after adding salary structures for your employees." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={TH}>Employee</th>
                    <th className={TH}>Designation</th>
                    <th className={THR}>Basic</th>
                    <th className={THR}>Allowances</th>
                    <th className={THR}>Bonus</th>
                    <th className={THR}>Gross</th>
                    <th className={THR}>Unpaid days</th>
                    <th className={THR}>Leave deduction</th>
                    <th className={THR}>Other deduction</th>
                    <th className={THR}>Net pay</th>
                    {editable && <th className={TH} />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payslips.map((p) => (
                    <PayslipRow key={`${p.id}:${p.bonus}:${p.otherDeduction}:${p.deductionNote ?? ""}:${p.netPay}`} p={p} editable={!!editable} />
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold text-slate-900">
                  <tr>
                    <td className={TD} colSpan={5}>
                      Total ({totals.headcount})
                    </td>
                    <td className={TDR}>{fmtMoney(totals.gross)}</td>
                    <td className={TD} colSpan={2} />
                    <td className={TDR}>{fmtMoney(totals.deductions)}</td>
                    <td className={TDR}>{fmtMoney(totals.net)}</td>
                    {editable && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      ) : null}

      {/* All runs */}
      <div className="space-y-2 pt-2">
        <h2 className="text-sm font-semibold text-slate-900">All payroll runs</h2>
        {runs.isLoading ? (
          <TableSkeleton rows={3} />
        ) : runs.isError ? (
          <ErrorState message="Could not load payroll runs." onRetry={() => runs.refetch()} />
        ) : (runs.data ?? []).length === 0 ? (
          <EmptyState title="No payroll runs yet" description="Select a month above and create the first run." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className={TH}>Month</th>
                  <th className={TH}>Status</th>
                  <th className={THR}>Employees</th>
                  <th className={THR}>Gross</th>
                  <th className={THR}>Deductions</th>
                  <th className={THR}>Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.data!.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setMonth(r.month)}
                    className={clsx("cursor-pointer hover:bg-slate-50", r.month === month && "bg-brand-50/50")}
                  >
                    <td className={`${TD} font-medium text-slate-900`}>{monthLabel(r.month)}</td>
                    <td className={TD}>
                      <RunStatusBadge status={r.status} />
                    </td>
                    <td className={TDR}>{r.totals.headcount}</td>
                    <td className={TDR}>{fmtMoney(r.totals.gross)}</td>
                    <td className={TDR}>{fmtMoney(r.totals.deductions)}</td>
                    <td className={`${TDR} font-semibold`}>{fmtMoney(r.totals.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm ? confirmCopy[confirm].title : ""}
        message={confirm ? confirmCopy[confirm].message : ""}
        confirmLabel={confirm ? confirmCopy[confirm].label : undefined}
        destructive={confirm ? confirmCopy[confirm].destructive : false}
        loading={busy}
        onConfirm={onConfirm}
        onCancel={() => !busy && setConfirm(null)}
      />
    </div>
  );
}
