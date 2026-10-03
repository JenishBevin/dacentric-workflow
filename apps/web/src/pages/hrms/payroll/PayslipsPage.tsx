import React, { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Download, Eye, FileText } from "lucide-react";
import { usePayrollRun, type Payslip } from "../../../api/hr";
import { Button, EmptyState, ErrorState } from "../../../components/ui/primitives";
import { useToast } from "../../../context/ToastContext";
import { extractApiError } from "../../../lib/apiClient";
import { fmtMoney, monthLabel } from "../../../lib/hrFormat";
import { generatePayslipPdf, generatePayslipsPdf } from "../../../lib/payslipPdf";
import { isNotFound, MonthSelect, payslipToPdfInput, RunStatusBadge, TableSkeleton, TD, TDR, TH, THR, useMonthParam } from "../../../components/hr/payroll/shared";

export default function PayslipsPage() {
  const { push } = useToast();
  const [month, setMonth] = useMonthParam();
  const detail = usePayrollRun(month);
  // "<payslipId>:preview" | "<payslipId>:download" | "all"
  const [working, setWorking] = useState<string | null>(null);

  const run = detail.data?.run ?? null;
  const payslips = detail.data?.payslips ?? [];
  const noRun = detail.isError && isNotFound(detail.error);
  const isDraft = run?.status === "DRAFT";
  const label = monthLabel(month);

  async function onOne(p: Payslip, mode: "preview" | "download") {
    // Open the preview tab synchronously (inside the click) so the popup blocker allows it.
    const previewWindow = mode === "preview" ? window.open("", "_blank") : null;
    setWorking(`${p.id}:${mode}`);
    try {
      await generatePayslipPdf(payslipToPdfInput(p, month, isDraft), { preview: mode === "preview", previewWindow });
    } catch (err) {
      previewWindow?.close();
      push({ variant: "error", title: "Could not generate payslip", description: err instanceof Error ? err.message : extractApiError(err).message });
    } finally {
      setWorking(null);
    }
  }

  async function onAll() {
    setWorking("all");
    try {
      await generatePayslipsPdf(payslips.map((p) => payslipToPdfInput(p, month, isDraft)));
    } catch (err) {
      push({ variant: "error", title: "Could not generate payslips", description: err instanceof Error ? err.message : extractApiError(err).message });
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Payslip Generation</h1>
          <p className="text-sm text-slate-500">Preview or download payslips for any payroll month.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthSelect value={month} onChange={setMonth} />
          <Button onClick={onAll} loading={working === "all"} disabled={working !== null || payslips.length === 0 || !run}>
            <Download className="h-4 w-4" />
            Download all (one PDF)
          </Button>
        </div>
      </div>

      {detail.isLoading ? (
        <TableSkeleton />
      ) : noRun ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={`No payroll run for ${label}`}
          description="Payslips are generated from a payroll run. Create the run first."
          action={
            <Link to={`/hrms/payroll/processing?month=${month}`}>
              <Button>Go to Payroll Processing</Button>
            </Link>
          }
        />
      ) : detail.isError ? (
        <ErrorState message="Could not load payslips." onRetry={() => detail.refetch()} />
      ) : run ? (
        <>
          {isDraft && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <strong>Draft — figures not final.</strong> This payroll run has not been processed yet, so PDFs generated now carry a DRAFT mark.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="font-medium text-slate-900">{label}</span>
            <RunStatusBadge status={run.status} />
            <span>· {payslips.length} payslip{payslips.length === 1 ? "" : "s"}</span>
          </div>

          {payslips.length === 0 ? (
            <EmptyState title="No payslips in this run" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={TH}>Code</th>
                    <th className={TH}>Employee</th>
                    <th className={TH}>Designation</th>
                    <th className={TH}>Department</th>
                    <th className={THR}>Gross</th>
                    <th className={THR}>Deductions</th>
                    <th className={THR}>Net pay</th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payslips.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className={`${TD} whitespace-nowrap font-mono text-xs`}>{p.employee.employeeCode}</td>
                      <td className={`${TD} whitespace-nowrap font-medium text-slate-900`}>{p.employee.fullName}</td>
                      <td className={TD}>{p.employee.jobTitle ?? "—"}</td>
                      <td className={TD}>{p.employee.department?.name ?? "—"}</td>
                      <td className={TDR}>{fmtMoney(p.grossEarnings)}</td>
                      <td className={TDR}>{fmtMoney(p.leaveDeduction + p.otherDeduction)}</td>
                      <td className={`${TDR} font-semibold text-slate-900`}>{fmtMoney(p.netPay)}</td>
                      <td className={`${TD} whitespace-nowrap text-right`}>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => onOne(p, "preview")} loading={working === `${p.id}:preview`} disabled={working !== null}>
                            <Eye className="h-3.5 w-3.5" />
                            Preview
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => onOne(p, "download")} loading={working === `${p.id}:download`} disabled={working !== null}>
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
