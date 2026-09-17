import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Contact, UserCheck, UserX, ClipboardList, ArrowRight, Lock } from "lucide-react";
import { useAllEmployees, useHrmsLeaveRequests } from "../../api/misc";
import { Card, Skeleton, ErrorState, EmptyState } from "../../components/ui/primitives";
import { useAuth } from "../../context/AuthContext";
import { MiniStatCard, DonutCenter, STATUS_PALETTE, greeting } from "./shared";

interface EmployeeRow {
  id: string;
  isActive: boolean;
  department: { id: string; name: string } | null;
}

export default function HrmsDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasHrms = user?.moduleAccess.includes("HRMS") ?? false;
  const isLeaveApprover = user?.roles.some((r) => ["HR", "SYSTEM_ADMIN", "SUPER_ADMIN"].includes(r)) ?? false;
  const { data: employees, isLoading, isError, refetch } = useAllEmployees();
  const { data: leaveRequests } = useHrmsLeaveRequests({ enabled: hasHrms && isLeaveApprover });

  const stats = useMemo(() => {
    if (!employees) return null;
    const rows = employees as EmployeeRow[];
    const active = rows.filter((e) => e.isActive).length;
    const inactive = rows.length - active;
    const byDept = new Map<string, number>();
    for (const e of rows) {
      const name = e.department?.name ?? "Unassigned";
      byDept.set(name, (byDept.get(name) ?? 0) + 1);
    }
    const deptData = [...byDept.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    return { total: rows.length, active, inactive, deptData };
  }, [employees]);

  if (!hasHrms) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-slate-900">HRMS Dashboard</h1>
        <EmptyState icon={<Lock className="h-8 w-8" />} title="You don't have access to this feature" description="HRMS access is required. Contact your administrator if you believe you should have it." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          {greeting()}, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-sm text-slate-500">HRMS overview — headcount, departments, and leave.</p>
      </div>

      {isError && <ErrorState message="Could not load HRMS data." onRetry={() => refetch()} />}
      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {stats && (
        <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex-1">
              <MiniStatCard icon={Contact} label="Total Employees" value={stats.total} tone="bg-brand-100 text-brand-700" onClick={() => navigate("/settings/employees")} />
              <MiniStatCard icon={UserCheck} label="Active" value={stats.active} tone="bg-emerald-100 text-emerald-700" onClick={() => navigate("/settings/employees")} />
              <MiniStatCard icon={UserX} label="Inactive" value={stats.inactive} tone="bg-slate-200 text-slate-600" onClick={() => navigate("/settings/employees")} />
              {isLeaveApprover && (
                <MiniStatCard
                  icon={ClipboardList}
                  label="Pending Leave Requests"
                  value={leaveRequests?.length ?? 0}
                  tone="bg-amber-100 text-amber-700"
                  onClick={() => navigate("/hrms/leave")}
                />
              )}
            </div>

            <Card className="p-3 lg:w-64 lg:shrink-0">
              <p className="mb-1 text-xs font-semibold text-slate-800">Employees by Department</p>
              <div className="relative">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={stats.deptData} dataKey="count" nameKey="name" innerRadius={42} outerRadius={62} paddingAngle={2}>
                      {stats.deptData.map((entry, idx) => (
                        <Cell key={idx} fill={STATUS_PALETTE[idx % STATUS_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <DonutCenter total={stats.total} />
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {stats.deptData.map((s, idx) => (
                  <div key={s.name} className="flex items-center gap-1 text-[10px] text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_PALETTE[idx % STATUS_PALETTE.length] }} />
                    {s.name} ({s.count})
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Employee Directory</p>
              <Link to="/settings/employees" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-sm text-slate-500">
              {stats.total} employees across {stats.deptData.length} department{stats.deptData.length === 1 ? "" : "s"}.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
