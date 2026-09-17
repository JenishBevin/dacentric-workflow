import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Building2, Inbox, Trello, ArrowRight, Lock } from "lucide-react";
import { useCustomers } from "../../api/customers";
import { Card, Skeleton, ErrorState, Badge, EmptyState } from "../../components/ui/primitives";
import { useAuth } from "../../context/AuthContext";
import { MiniStatCard, DonutCenter, STATUS_PALETTE, greeting } from "./shared";

const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", PROSPECT: "Prospect", INACTIVE: "Inactive" };
const STATUS_TONE: Record<string, "green" | "slate" | "amber"> = { ACTIVE: "green", PROSPECT: "amber", INACTIVE: "slate" };

export default function CrmDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasCrm = user?.moduleAccess.includes("CRM") ?? false;
  const { data: customers, isLoading, isError, refetch } = useCustomers({});

  const stats = useMemo(() => {
    if (!customers) return null;
    const byStatus: Record<string, number> = { ACTIVE: 0, PROSPECT: 0, INACTIVE: 0 };
    let enquiries = 0;
    let projects = 0;
    for (const c of customers) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      enquiries += c.enquiryCount;
      projects += c.projectCount;
    }
    const topByActivity = [...customers]
      .filter((c) => c.enquiryCount + c.projectCount > 0)
      .sort((a, b) => b.enquiryCount + b.projectCount - (a.enquiryCount + a.projectCount))
      .slice(0, 5);
    const recent = [...customers].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
    const donutData = (["ACTIVE", "PROSPECT", "INACTIVE"] as const).map((s) => ({ name: STATUS_LABEL[s], count: byStatus[s] }));
    return { total: customers.length, byStatus, enquiries, projects, topByActivity, recent, donutData };
  }, [customers]);

  if (!hasCrm) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-slate-900">CRM Dashboard</h1>
        <EmptyState icon={<Lock className="h-8 w-8" />} title="You don't have access to this feature" description="CRM access is required. Contact your administrator if you believe you should have it." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          {greeting()}, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-sm text-slate-500">CRM overview — customers, enquiries, and projects across your portfolio.</p>
      </div>

      {isError && <ErrorState message="Could not load CRM data." onRetry={() => refetch()} />}
      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {stats && (
        <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex-1">
              <MiniStatCard icon={Building2} label="Total Customers" value={stats.total} tone="bg-brand-100 text-brand-700" onClick={() => navigate("/workflow/customers")} />
              <MiniStatCard
                icon={Building2}
                label="Active"
                value={stats.byStatus.ACTIVE}
                tone="bg-emerald-100 text-emerald-700"
                onClick={() => navigate("/workflow/customers?status=ACTIVE")}
              />
              <MiniStatCard
                icon={Building2}
                label="Prospect"
                value={stats.byStatus.PROSPECT}
                tone="bg-amber-100 text-amber-700"
                onClick={() => navigate("/workflow/customers?status=PROSPECT")}
              />
              <MiniStatCard
                icon={Building2}
                label="Inactive"
                value={stats.byStatus.INACTIVE}
                tone="bg-slate-200 text-slate-600"
                onClick={() => navigate("/workflow/customers?status=INACTIVE")}
              />
              <MiniStatCard icon={Inbox} label="Total Enquiries" value={stats.enquiries} tone="bg-indigo-100 text-indigo-700" onClick={() => navigate("/workflow/enquiries")} />
              <MiniStatCard icon={Trello} label="Total Projects" value={stats.projects} tone="bg-purple-100 text-purple-700" onClick={() => navigate("/workflow/boards")} />
            </div>

            <Card className="p-3 lg:w-64 lg:shrink-0">
              <p className="mb-1 text-xs font-semibold text-slate-800">Customers by Status</p>
              <div className="relative">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={stats.donutData} dataKey="count" nameKey="name" innerRadius={42} outerRadius={62} paddingAngle={2}>
                      {stats.donutData.map((entry, idx) => (
                        <Cell key={idx} fill={STATUS_PALETTE[idx % STATUS_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <DonutCenter total={stats.total} />
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {stats.donutData.map((s, idx) => (
                  <div key={s.name} className="flex items-center gap-1 text-[10px] text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_PALETTE[idx % STATUS_PALETTE.length] }} />
                    {s.name} ({s.count})
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Top Customers by Activity</p>
                <Link to="/workflow/customers" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                  View All <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {stats.topByActivity.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No customer activity yet.</p>}
              <div className="space-y-1">
                {stats.topByActivity.map((c) => (
                  <Link key={c.id} to={`/workflow/customers/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{c.name}</p>
                      <p className="font-mono text-xs text-slate-400">{c.customerId}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge tone="slate">{c.enquiryCount} enq</Badge>
                      <Badge tone="slate">{c.projectCount} proj</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Recently Added</p>
                <Link to="/workflow/customers" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                  View All <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {stats.recent.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No customers yet.</p>}
              <div className="space-y-1">
                {stats.recent.map((c) => (
                  <Link key={c.id} to={`/workflow/customers/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{c.name}</p>
                      <p className="font-mono text-xs text-slate-400">{c.customerId}</p>
                    </div>
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
