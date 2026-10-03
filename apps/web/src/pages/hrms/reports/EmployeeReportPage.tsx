import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Users } from "lucide-react";
import { useEmployeeReport } from "../../../api/hr";
import { Badge, EmptyState, Input, Select } from "../../../components/ui/primitives";
import { BarList, ReportBody, ReportHeader, SummaryTile, TableCard, TD, TH, THEAD, TileGrid, TR } from "../../../components/hr/reports/ReportParts";
import { downloadCsv, fmtDate } from "../../../lib/hrFormat";

export default function EmployeeReportPage() {
  const query = useEmployeeReport();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (query.data?.rows ?? []).filter((r) => {
      if (status === "active" && !r.isActive) return false;
      if (status === "inactive" && r.isActive) return false;
      if (!q) return true;
      return [r.fullName, r.employeeCode, r.workEmail, r.jobTitle, r.department, r.team, r.nationality].some((v) => v?.toLowerCase().includes(q));
    });
  }, [query.data, search, status]);

  const exportCsv = () =>
    downloadCsv(
      "employee-directory",
      ["Code", "Name", "Work email", "Job title", "Department", "Team", "Phone", "Nationality", "Joining date", "Status"],
      rows.map((r) => [
        r.employeeCode,
        r.fullName,
        r.workEmail,
        r.jobTitle,
        r.department,
        r.team,
        r.phone,
        r.nationality,
        r.joiningDate ? r.joiningDate.slice(0, 10) : "",
        r.isActive ? "Active" : "Inactive",
      ])
    );

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Employee Reports"
        subtitle="Headcount, workforce breakdown, document expiries and the employee directory."
        onExport={exportCsv}
        exportDisabled={!query.data || rows.length === 0}
      />

      <ReportBody query={query} tiles={5}>
        {(data) => (
          <>
            <TileGrid cols={5}>
              <SummaryTile label="Total employees" value={data.summary.total} />
              <SummaryTile label="Active" value={data.summary.active} tone="green" />
              <SummaryTile label="Inactive" value={data.summary.inactive} />
              <SummaryTile label="Joined this year" value={data.summary.joinedThisYear} />
              <SummaryTile label="Documents expiring" value={data.summary.documentsExpiring} tone={data.summary.documentsExpiring > 0 ? "amber" : undefined} hint="Within 90 days or expired" />
            </TileGrid>

            <div className="grid gap-4 md:grid-cols-3">
              <BarList title="By department" items={data.byDepartment.map((d) => ({ label: d.label, value: d.count }))} />
              <BarList title="By designation" color="bg-emerald-500" items={data.byDesignation.map((d) => ({ label: d.label, value: d.count }))} />
              <BarList title="By nationality" color="bg-amber-500" items={data.byNationality.map((d) => ({ label: d.label, value: d.count }))} />
            </div>

            <TableCard title="Documents expiring or expired (next 90 days)">
              {data.expiries.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">No documents are expiring in the next 90 days.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Employee</th>
                      <th className={TH}>Document</th>
                      <th className={TH}>Expiry date</th>
                      <th className={TH}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expiries.map((e, i) => (
                      <tr key={`${e.employeeId}-${e.document}-${i}`} className={TR}>
                        <td className={TD}>
                          <Link to={`/hrms/employees/${e.employeeId}`} className="font-medium text-brand-700 hover:underline">
                            {e.fullName}
                          </Link>
                        </td>
                        <td className={`${TD} text-slate-600`}>{e.document}</td>
                        <td className={`${TD} text-slate-600`}>{fmtDate(e.expiryDate)}</td>
                        <td className={TD}>
                          <Badge tone={e.expired ? "red" : "amber"}>{e.expired ? "Expired" : "Expiring"}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableCard>

            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <h2 className="mr-auto text-sm font-semibold text-slate-800">Employee directory</h2>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees…" className="pl-9" />
                </div>
                <div className="w-36">
                  <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status filter">
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </div>
              </div>

              {rows.length === 0 ? (
                <EmptyState icon={<Users className="h-8 w-8" />} title="No employees match" description="Try a different search or status filter." />
              ) : (
                <TableCard>
                  <table className="w-full text-sm">
                    <thead className={THEAD}>
                      <tr>
                        <th className={TH}>Employee</th>
                        <th className={TH}>Code</th>
                        <th className={TH}>Job title</th>
                        <th className={TH}>Department / Team</th>
                        <th className={TH}>Nationality</th>
                        <th className={TH}>Joined</th>
                        <th className={TH}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.employeeId} className={`${TR} cursor-pointer hover:bg-slate-50`} onClick={() => navigate(`/hrms/employees/${r.employeeId}`)}>
                          <td className={TD}>
                            <Link to={`/hrms/employees/${r.employeeId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-800 hover:text-brand-700 hover:underline">
                              {r.fullName}
                            </Link>
                            <p className="text-xs text-slate-400">{r.workEmail}</p>
                          </td>
                          <td className={`${TD} font-mono text-xs text-slate-500`}>{r.employeeCode}</td>
                          <td className={`${TD} text-slate-600`}>{r.jobTitle ?? "—"}</td>
                          <td className={`${TD} text-slate-600`}>{[r.department, r.team].filter(Boolean).join(" / ") || "—"}</td>
                          <td className={`${TD} text-slate-600`}>{r.nationality ?? "—"}</td>
                          <td className={`${TD} whitespace-nowrap text-slate-600`}>{fmtDate(r.joiningDate)}</td>
                          <td className={TD}>
                            <Badge tone={r.isActive ? "green" : "slate"}>{r.isActive ? "Active" : "Inactive"}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableCard>
              )}
              <p className="text-xs text-slate-400">
                Showing {rows.length} of {data.rows.length} employees. The CSV exports the rows shown.
              </p>
            </div>
          </>
        )}
      </ReportBody>
    </div>
  );
}
