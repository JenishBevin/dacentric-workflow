import React, { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarOff } from "lucide-react";
import { useLeaveReport } from "../../../api/hr";
import { Badge, EmptyState, Input } from "../../../components/ui/primitives";
import { BarList, FilterField, ReportBody, ReportHeader, SummaryTile, TableCard, TD, TH, THEAD, TileGrid, TR, todayInput, yearStartInput } from "../../../components/hr/reports/ReportParts";
import { downloadCsv, fmtDate, titleCase } from "../../../lib/hrFormat";

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "slate"> = { APPROVED: "green", PENDING: "amber", REJECTED: "red" };

export default function LeaveReportPage() {
  const [from, setFrom] = useState(yearStartInput());
  const [to, setTo] = useState(todayInput());
  const validRange = !!from && !!to && from <= to;
  const query = useLeaveReport(validRange ? from : yearStartInput(), validRange ? to : todayInput());
  const data = query.data;

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `leave-requests-${from}-to-${to}`,
      ["Code", "Employee", "Leave type", "Start date", "End date", "Days", "Status"],
      data.rows.map((r) => [r.employeeCode, r.fullName, titleCase(r.leaveType), r.startDate.slice(0, 10), r.endDate.slice(0, 10), r.numberOfDays, titleCase(r.status)])
    );
  };

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Leave Reports"
        subtitle="Leave requests, days taken by type and per employee for a date range."
        onExport={exportCsv}
        exportDisabled={!data || data.rows.length === 0}
        filters={
          <>
            <FilterField label="From" className="w-40">
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </FilterField>
            <FilterField label="To" className="w-40">
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </FilterField>
          </>
        }
      />

      {!validRange ? (
        <EmptyState icon={<CalendarOff className="h-8 w-8" />} title="Choose a valid date range" description="Both dates are required and From must not be after To." />
      ) : (
        <ReportBody query={query} tiles={5}>
          {(d) => (
            <>
              <TileGrid cols={5}>
                <SummaryTile label="Requests" value={d.summary.requests} />
                <SummaryTile label="Approved" value={d.summary.approved} tone="green" />
                <SummaryTile label="Pending" value={d.summary.pending} tone={d.summary.pending > 0 ? "amber" : undefined} />
                <SummaryTile label="Rejected" value={d.summary.rejected} />
                <SummaryTile label="Approved days" value={d.summary.approvedDays} />
              </TileGrid>

              {d.rows.length === 0 ? (
                <EmptyState icon={<CalendarOff className="h-8 w-8" />} title="No leave requests" description="No leave falls within the selected dates." />
              ) : (
                <>
                  <div className="grid gap-4 lg:grid-cols-3">
                    <BarList
                      title="Leave days by type"
                      color="bg-emerald-500"
                      unit="d"
                      items={d.byType.map((t) => ({ label: titleCase(t.leaveType), value: t.days }))}
                    />
                    <div className="lg:col-span-2">
                      <TableCard title="Leave by employee">
                        <table className="w-full text-sm">
                          <thead className={THEAD}>
                            <tr>
                              <th className={TH}>Employee</th>
                              <th className={TH}>Department</th>
                              <th className={`${TH} text-right`}>Days</th>
                              <th className={`${TH} text-right`}>Requests</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.byEmployee.map((e) => (
                              <tr key={e.employeeId} className={TR}>
                                <td className={TD}>
                                  <Link to={`/hrms/employees/${e.employeeId}`} className="font-medium text-slate-800 hover:text-brand-700 hover:underline">
                                    {e.fullName}
                                  </Link>
                                  <p className="font-mono text-xs text-slate-400">{e.employeeCode}</p>
                                </td>
                                <td className={`${TD} text-slate-600`}>{e.department ?? "—"}</td>
                                <td className={`${TD} text-right font-medium text-slate-800`}>{e.days}</td>
                                <td className={`${TD} text-right text-slate-600`}>{e.requests}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TableCard>
                    </div>
                  </div>

                  <TableCard title="All leave requests">
                    <table className="w-full text-sm">
                      <thead className={THEAD}>
                        <tr>
                          <th className={TH}>Employee</th>
                          <th className={TH}>Type</th>
                          <th className={TH}>Dates</th>
                          <th className={`${TH} text-right`}>Days</th>
                          <th className={TH}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.rows.map((r) => (
                          <tr key={r.id} className={TR}>
                            <td className={TD}>
                              <Link to={`/hrms/employees/${r.employeeId}`} className="font-medium text-slate-800 hover:text-brand-700 hover:underline">
                                {r.fullName}
                              </Link>
                              <p className="font-mono text-xs text-slate-400">{r.employeeCode}</p>
                            </td>
                            <td className={`${TD} text-slate-600`}>{titleCase(r.leaveType)}</td>
                            <td className={`${TD} whitespace-nowrap text-slate-600`}>
                              {fmtDate(r.startDate)}
                              {r.endDate.slice(0, 10) !== r.startDate.slice(0, 10) && ` – ${fmtDate(r.endDate)}`}
                            </td>
                            <td className={`${TD} text-right text-slate-700`}>{r.numberOfDays}</td>
                            <td className={TD}>
                              <Badge tone={STATUS_TONE[r.status] ?? "slate"}>{titleCase(r.status)}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableCard>
                </>
              )}
            </>
          )}
        </ReportBody>
      )}
    </div>
  );
}
