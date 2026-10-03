import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePayrollReport } from "../../../api/hr";
import { Badge, Card, EmptyState, Select } from "../../../components/ui/primitives";
import { FilterField, ReportBody, ReportHeader, SummaryTile, TableCard, TD, TH, THEAD, TileGrid, TR } from "../../../components/hr/reports/ReportParts";
import { downloadCsv, fmtMoney, monthLabel, titleCase } from "../../../lib/hrFormat";

const STATUS_TONE: Record<string, "slate" | "blue" | "green"> = { DRAFT: "slate", PROCESSED: "blue", PAID: "green" };
const compact = (n: number) => n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

export default function PayrollReportPage() {
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => thisYear - i), [thisYear]);
  const [year, setYear] = useState(thisYear);
  const query = usePayrollReport(year);
  const data = query.data;

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `payroll-${year}`,
      ["Month", "Status", "Headcount", "Gross", "Deductions", "Net"],
      [
        ...data.months.map((m) => [monthLabel(m.month), titleCase(m.status), m.headcount, m.gross.toFixed(2), m.deductions.toFixed(2), m.net.toFixed(2)]),
        ["Total", "", "", data.totals.gross.toFixed(2), data.totals.deductions.toFixed(2), data.totals.net.toFixed(2)],
      ]
    );
  };

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Payroll Reports"
        subtitle="Gross pay, deductions and net pay by month for a year."
        onExport={exportCsv}
        exportDisabled={!data || data.months.length === 0}
        filters={
          <FilterField label="Year" className="w-32">
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </FilterField>
        }
      />

      <ReportBody query={query} tiles={3}>
        {(d) =>
          d.months.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-8 w-8" />}
              title={`No payroll runs in ${d.year}`}
              description="Create and process a payroll run to see it reported here."
              action={
                <Link to="/hrms/payroll/processing" className="text-sm font-medium text-brand-700 hover:underline">
                  Go to Payroll Processing
                </Link>
              }
            />
          ) : (
            <>
              <TileGrid cols={3}>
                <SummaryTile label={`Gross pay ${d.year}`} value={fmtMoney(d.totals.gross)} />
                <SummaryTile label="Deductions" value={fmtMoney(d.totals.deductions)} tone={d.totals.deductions > 0 ? "amber" : undefined} />
                <SummaryTile label="Net pay" value={fmtMoney(d.totals.net)} tone="green" />
              </TileGrid>

              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">Gross vs net by month</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.months.map((m) => ({ name: monthLabel(m.month).slice(0, 3), Gross: m.gross, Net: m.net }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={compact} width={48} />
                      <Tooltip formatter={(v: number) => fmtMoney(v)} cursor={{ fill: "#f1f5f9" }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Gross" fill="#6366f1" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Net" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <TableCard title="Monthly summary" maxHeight={false}>
                <table className="w-full text-sm">
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Month</th>
                      <th className={TH}>Status</th>
                      <th className={`${TH} text-right`}>Headcount</th>
                      <th className={`${TH} text-right`}>Gross</th>
                      <th className={`${TH} text-right`}>Deductions</th>
                      <th className={`${TH} text-right`}>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.months.map((m) => (
                      <tr key={m.month} className={TR}>
                        <td className={`${TD} font-medium text-slate-800`}>{monthLabel(m.month)}</td>
                        <td className={TD}>
                          <Badge tone={STATUS_TONE[m.status] ?? "slate"}>{titleCase(m.status)}</Badge>
                        </td>
                        <td className={`${TD} text-right text-slate-600`}>{m.headcount}</td>
                        <td className={`${TD} text-right text-slate-700`}>{fmtMoney(m.gross)}</td>
                        <td className={`${TD} text-right text-slate-600`}>{fmtMoney(m.deductions)}</td>
                        <td className={`${TD} text-right font-medium text-slate-900`}>{fmtMoney(m.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                      <td className={TD} colSpan={3}>
                        Total
                      </td>
                      <td className={`${TD} text-right`}>{fmtMoney(d.totals.gross)}</td>
                      <td className={`${TD} text-right`}>{fmtMoney(d.totals.deductions)}</td>
                      <td className={`${TD} text-right`}>{fmtMoney(d.totals.net)}</td>
                    </tr>
                  </tfoot>
                </table>
              </TableCard>
            </>
          )
        }
      </ReportBody>
    </div>
  );
}
