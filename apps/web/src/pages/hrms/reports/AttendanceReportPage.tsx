import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Info } from "lucide-react";
import { useAttendanceReport } from "../../../api/hr";
import { EmptyState, Select } from "../../../components/ui/primitives";
import { FilterField, ReportBody, ReportHeader, SummaryTile, TableCard, TD, TH, THEAD, TileGrid, TR } from "../../../components/hr/reports/ReportParts";
import { currentMonth, downloadCsv, monthLabel, recentMonths } from "../../../lib/hrFormat";

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

export default function AttendanceReportPage() {
  const months = useMemo(() => recentMonths(18), []);
  const [month, setMonth] = useState(currentMonth());
  const query = useAttendanceReport(month);
  const data = query.data;
  const maxHours = Math.max(1, ...(data?.rows.map((r) => r.totalHours) ?? []));

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `attendance-${month}`,
      ["Code", "Name", "Department", "Present days", "Days in month", "Total hours", "Avg hours per present day"],
      data.rows.map((r) => [r.employeeCode, r.fullName, r.department, r.presentDays, data.daysInMonth, r.totalHours, r.avgHoursPerDay])
    );
  };

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Attendance Reports"
        subtitle="Monthly presence and hours worked per employee."
        onExport={exportCsv}
        exportDisabled={!data || data.rows.length === 0}
        filters={
          <FilterField label="Month" className="w-44">
            <Select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          </FilterField>
        }
      />

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <p>Attendance comes from the work-time tracker. A day counts as present when at least one minute of time was tracked.</p>
      </div>

      <ReportBody query={query} tiles={3}>
        {(d) => (
          <>
            <TileGrid cols={3}>
              <SummaryTile label="Employees tracked" value={d.summary.employees} />
              <SummaryTile label="Total hours" value={num(d.summary.totalHours)} />
              <SummaryTile label="Average present days" value={num(d.summary.avgPresentDays)} hint={`of ${d.daysInMonth} days in ${monthLabel(d.month)}`} />
            </TileGrid>

            {d.rows.length === 0 ? (
              <EmptyState icon={<CalendarCheck className="h-8 w-8" />} title="No attendance recorded" description={`No time was tracked in ${monthLabel(d.month)}.`} />
            ) : (
              <TableCard>
                <table className="w-full text-sm">
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Code</th>
                      <th className={TH}>Employee</th>
                      <th className={TH}>Department</th>
                      <th className={`${TH} text-right`}>Present days</th>
                      <th className={TH}>Total hours</th>
                      <th className={`${TH} text-right`}>Avg hrs / day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.employeeId} className={TR}>
                        <td className={`${TD} font-mono text-xs text-slate-500`}>{r.employeeCode}</td>
                        <td className={TD}>
                          <Link to={`/hrms/employees/${r.employeeId}`} className="font-medium text-slate-800 hover:text-brand-700 hover:underline">
                            {r.fullName}
                          </Link>
                        </td>
                        <td className={`${TD} text-slate-600`}>{r.department ?? "—"}</td>
                        <td className={`${TD} text-right text-slate-700`}>
                          {r.presentDays} <span className="text-slate-400">/ {d.daysInMonth}</span>
                        </td>
                        <td className={`${TD} min-w-[180px]`}>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.totalHours / maxHours) * 100}%` }} />
                            </div>
                            <span className="w-14 text-right font-medium text-slate-800">{num(r.totalHours)}</span>
                          </div>
                        </td>
                        <td className={`${TD} text-right text-slate-600`}>{num(r.avgHoursPerDay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            )}
          </>
        )}
      </ReportBody>
    </div>
  );
}
