import React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useEmployeeProfile } from "../../api/hr";
import { Avatar, Badge, Button, EmptyState, ErrorState, Skeleton } from "../../components/ui/primitives";
import { EmployeeOverviewTab } from "../../components/hr/EmployeeOverviewTab";
import { EmployeeDocumentsTab } from "../../components/hr/EmployeeDocumentsTab";
import { EmployeeLettersTab } from "../../components/hr/EmployeeLettersTab";
import { EmployeeHistoryTab } from "../../components/hr/EmployeeHistoryTab";
import { EmployeeLeaveTab } from "../../components/hr/EmployeeLeaveTab";
import { EmployeeSalaryTab } from "../../components/hr/EmployeeSalaryTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "documents", label: "Documents" },
  { key: "letters", label: "Letters" },
  { key: "history", label: "History" },
  { key: "leave", label: "Leave Management" },
  { key: "salary", label: "Salary & Payslips" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function EmployeeDetailPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: employee, isLoading, isError, error, refetch } = useEmployeeProfile(employeeId);

  const requested = searchParams.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : "overview";

  function selectTab(key: TabKey) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (key === "overview") next.delete("tab");
        else next.set("tab", key);
        return next;
      },
      { replace: true }
    );
  }

  const backLink = (
    <Link to="/settings/employees" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
      <ArrowLeft className="h-4 w-4" /> Employees
    </Link>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {backLink}
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !employee) {
    const notFound = (error as any)?.response?.status === 404;
    return (
      <div className="space-y-4">
        {backLink}
        {notFound ? (
          <EmptyState
            title="Employee not found."
            description="This employee does not exist or has been removed."
            action={
              <Link to="/settings/employees">
                <Button variant="outline">Back to employees</Button>
              </Link>
            }
          />
        ) : (
          <ErrorState message="Could not load this employee." onRetry={() => refetch()} />
        )}
      </div>
    );
  }

  const subtitle = [employee.jobTitle, employee.department?.name].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      {backLink}

      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={employee.fullName} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">{employee.fullName}</h1>
            <Badge tone={employee.isActive ? "green" : "slate"}>{employee.isActive ? "Active" : "Inactive"}</Badge>
          </div>
          <p className="font-mono text-xs text-slate-500">{employee.employeeCode}</p>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto border-b border-slate-200 px-1">
        <div role="tablist" className="flex min-w-max gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => selectTab(t.key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel">
        {tab === "overview" && <EmployeeOverviewTab key={employee.id} employee={employee} />}
        {tab === "documents" && <EmployeeDocumentsTab employee={employee} />}
        {tab === "letters" && <EmployeeLettersTab employee={employee} />}
        {tab === "history" && <EmployeeHistoryTab employee={employee} />}
        {tab === "leave" && <EmployeeLeaveTab employee={employee} />}
        {tab === "salary" && <EmployeeSalaryTab employee={employee} />}
      </div>
    </div>
  );
}
