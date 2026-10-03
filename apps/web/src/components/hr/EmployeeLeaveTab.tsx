import React from "react";
import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { useEmployeeLeave, type HrEmployee } from "../../api/hr";
import { Badge, Card, EmptyState, ErrorState, Skeleton } from "../ui/primitives";
import { fmtDate, titleCase } from "../../lib/hrFormat";

const STATUS_TONE = { PENDING: "amber", APPROVED: "green", REJECTED: "red" } as const;

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function EmployeeLeaveTab({ employee }: { employee: HrEmployee }) {
  const { data, isLoading, isError, refetch } = useEmployeeLeave(employee.id);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) return <ErrorState message="Could not load leave details." onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Read-only view. Leave requests are approved from the{" "}
        <Link to="/hrms/leave" className="font-medium text-brand-700 hover:underline">
          Leave module
        </Link>
        .
      </p>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">{data.year} balances</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.balances.map((b) => (
            <Card key={b.leaveType} className="p-4">
              <p className="text-sm font-medium text-slate-700">{titleCase(b.leaveType)}</p>
              {b.entitlement === null ? (
                <p className="mt-2 text-sm text-slate-500">
                  <span className="text-2xl font-semibold text-slate-900">{num(b.used)}</span> days taken · no entitlement
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-slate-500">
                    <span className="text-2xl font-semibold text-slate-900">{b.remaining === null ? "—" : num(b.remaining)}</span> days remaining
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${b.entitlement > 0 ? Math.min(100, (b.used / b.entitlement) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {num(b.used)} used of {num(b.entitlement)}
                  </p>
                </>
              )}
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Leave requests</h3>
        {data.requests.length === 0 ? (
          <EmptyState icon={<CalendarDays className="h-8 w-8" />} title="No leave requests yet." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Dates</th>
                  <th className="px-4 py-2.5">Days</th>
                  <th className="px-4 py-2.5">Handover</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.requests.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5">
                      <Badge tone="slate">{titleCase(r.leaveType)}</Badge>
                      {r.reason && <p className="mt-1 max-w-xs truncate text-xs text-slate-400" title={r.reason}>{r.reason}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                      {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{num(r.numberOfDays)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.handoverToEmployee?.fullName ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[r.status] ?? "slate"}>{titleCase(r.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
