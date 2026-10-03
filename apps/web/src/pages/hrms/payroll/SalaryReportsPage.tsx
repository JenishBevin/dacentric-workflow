import React from "react";
import { Link } from "react-router-dom";
import { BarChart3, Download } from "lucide-react";
import { useSalaryReport } from "../../../api/hr";
import { Button, Card, EmptyState, ErrorState } from "../../../components/ui/primitives";
import { downloadCsv, fmtMoney, monthLabel } from "../../../lib/hrFormat";
import { MonthSelect, RunStatusBadge, StatTile, TableSkeleton, TD, TDR, TH, THR, TilesSkeleton, useMonthParam } from "../../../components/hr/payroll/shared";

export default function SalaryReportsPage() {
  const [month, setMonth] = useMonthParam();
  const { data, isLoading, isError, refetch } = useSalaryReport(month);
  const label = monthLabel(month);

  const hasRun = !!data?.run;
  const rows = data?.rows ?? [];
  const departments = data?.byDepartment ?? [];
  const maxGross = Math.max(0, ...departments.map((d) => d.gross));

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `salary-register-${month}`,
      ["Code", "Name", "Designation", "Department", "Basic", "Allowances", "Bonus", "Gross", "Unpaid leave days", "Deductions", "Net pay"],
      [
        ...data.rows.map((r) => [
          r.employeeCode,
          r.fullName,
          r.jobTitle ?? "",
          r.department,
          r.basicSalary.toFixed(2),
          r.allowances.toFixed(2),
          r.bonus.toFixed(2),
          r.grossEarnings.toFixed(2),
          r.unpaidLeaveDays,
          r.deductions.toFixed(2),
          r.netPay.toFixed(2),
        ]),
        ["", "Total", "", "", sum(rows, "basicSalary"), sum(rows, "allowances"), sum(rows, "bonus"), data.totals.gross.toFixed(2), sum(rows, "unpaidLeaveDays", 0), data.totals.deductions.toFixed(2), data.totals.net.toFixed(2)],
      ]
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Salary Reports</h1>
          <p className="text-sm text-slate-500">Payroll totals by department and the employee payroll register for a month.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthSelect value={month} onChange={setMonth} />
          <Button variant="outline" onClick={exportCsv} disabled={!hasRun || rows.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <>
          <TilesSkeleton />
          <TableSkeleton />
        </>
      ) : isError || !data ? (
        <ErrorState message="Could not load the salary report." onRetry={() => refetch()} />
      ) : !data.run ? (
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" />}
          title={`No payroll run for ${label}`}
          description="Create a payroll run for this month to see salary reports."
          action={
            <Link to={`/hrms/payroll/processing?month=${month}`}>
              <Button>Go to Payroll Processing</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="font-medium text-slate-900">{label}</span>
            <RunStatusBadge status={data.run.status} />
            {data.run.status === "DRAFT" && <span className="text-amber-700">Draft — figures not final</span>}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Headcount" value={data.totals.headcount} />
            <StatTile label="Gross earnings" value={fmtMoney(data.totals.gross)} hint="AED" />
            <StatTile label="Deductions" value={fmtMoney(data.totals.deductions)} hint="AED" tone={data.totals.deductions > 0 ? "amber" : "default"} />
            <StatTile label="Net payroll" value={fmtMoney(data.totals.net)} hint="AED" tone="green" />
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">By department</h2>
            {departments.length === 0 ? (
              <EmptyState title="No department data" />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={TH}>Department</th>
                      <th className={THR}>Headcount</th>
                      <th className={THR}>Gross</th>
                      <th className={THR}>Deductions</th>
                      <th className={THR}>Net</th>
                      <th className={`${TH} w-1/4 min-w-[140px]`}>Share of gross</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {departments.map((d) => (
                      <tr key={d.department} className="hover:bg-slate-50/60">
                        <td className={`${TD} font-medium text-slate-900`}>{d.department}</td>
                        <td className={TDR}>{d.headcount}</td>
                        <td className={TDR}>{fmtMoney(d.gross)}</td>
                        <td className={TDR}>{fmtMoney(d.deductions)}</td>
                        <td className={`${TDR} font-semibold`}>{fmtMoney(d.net)}</td>
                        <td className={TD}>
                          <div className="h-2 w-full rounded-full bg-slate-100">
                            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${maxGross > 0 ? Math.max(2, (d.gross / maxGross) * 100) : 0}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">Employee payroll register</h2>
            {rows.length === 0 ? (
              <EmptyState title="No payslips in this run" />
            ) : (
              <Card className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={TH}>Code</th>
                      <th className={TH}>Employee</th>
                      <th className={TH}>Department</th>
                      <th className={THR}>Basic</th>
                      <th className={THR}>Allowances</th>
                      <th className={THR}>Bonus</th>
                      <th className={THR}>Gross</th>
                      <th className={THR}>Unpaid days</th>
                      <th className={THR}>Deductions</th>
                      <th className={THR}>Net pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.payslipId} className="hover:bg-slate-50/60">
                        <td className={`${TD} whitespace-nowrap font-mono text-xs`}>{r.employeeCode}</td>
                        <td className={`${TD} whitespace-nowrap font-medium text-slate-900`}>{r.fullName}</td>
                        <td className={TD}>{r.department}</td>
                        <td className={TDR}>{fmtMoney(r.basicSalary)}</td>
                        <td className={TDR}>{fmtMoney(r.allowances)}</td>
                        <td className={TDR}>{fmtMoney(r.bonus)}</td>
                        <td className={TDR}>{fmtMoney(r.grossEarnings)}</td>
                        <td className={TDR}>{r.unpaidLeaveDays}</td>
                        <td className={TDR}>{fmtMoney(r.deductions)}</td>
                        <td className={`${TDR} font-semibold text-slate-900`}>{fmtMoney(r.netPay)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold text-slate-900">
                    <tr>
                      <td className={TD} colSpan={3}>
                        Total ({rows.length})
                      </td>
                      <td className={TDR}>{fmtMoney(rows.reduce((s, r) => s + r.basicSalary, 0))}</td>
                      <td className={TDR}>{fmtMoney(rows.reduce((s, r) => s + r.allowances, 0))}</td>
                      <td className={TDR}>{fmtMoney(rows.reduce((s, r) => s + r.bonus, 0))}</td>
                      <td className={TDR}>{fmtMoney(data.totals.gross)}</td>
                      <td className={TDR}>{rows.reduce((s, r) => s + r.unpaidLeaveDays, 0)}</td>
                      <td className={TDR}>{fmtMoney(data.totals.deductions)}</td>
                      <td className={TDR}>{fmtMoney(data.totals.net)}</td>
                    </tr>
                  </tfoot>
                </table>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function sum<T extends Record<string, any>>(rows: T[], key: keyof T, digits = 2): string | number {
  const total = rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
  return digits === 0 ? total : total.toFixed(digits);
}
