import React, { useState } from "react";
import { format } from "date-fns";
import { Download, Pencil, Receipt, X } from "lucide-react";
import { useEmployeePayslips, useSaveSalary, type EmployeePayslip, type HrEmployee, type SalaryStructure } from "../../api/hr";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Label, Skeleton } from "../ui/primitives";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { fmtDate, fmtMoney, monthLabel, titleCase, toDateInput } from "../../lib/hrFormat";
import { generatePayslipPdf } from "../../lib/payslipPdf";

const RUN_TONE = { DRAFT: "slate", PROCESSED: "blue", PAID: "green" } as const;

const toNum = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function EmployeeSalaryTab({ employee }: { employee: HrEmployee }) {
  const [editing, setEditing] = useState(false);
  const structure = employee.salaryStructure;
  const total = structure ? structure.basicSalary + structure.housingAllowance + structure.transportAllowance + structure.otherAllowance : 0;

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Salary structure</h3>
          {editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> {structure ? "Edit" : "Set salary"}
            </Button>
          )}
        </div>

        {editing ? (
          <SalaryForm employee={employee} structure={structure} onDone={() => setEditing(false)} />
        ) : structure ? (
          <>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Amount label="Basic salary" value={structure.basicSalary} />
              <Amount label="Housing allowance" value={structure.housingAllowance} />
              <Amount label="Transport allowance" value={structure.transportAllowance} />
              <Amount label="Other allowance" value={structure.otherAllowance} />
            </dl>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <p className="text-sm text-slate-500">
                Effective from <span className="font-medium text-slate-700">{fmtDate(structure.effectiveFrom)}</span>
                {structure.updatedByName ? ` · updated by ${structure.updatedByName}` : ""}
              </p>
              <p className="text-sm text-slate-500">
                Total monthly <span className="text-lg font-semibold text-slate-900">AED {fmtMoney(total)}</span>
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">No salary structure has been set for this employee yet.</p>
        )}
      </Card>

      <PayslipHistory employee={employee} />
    </div>
  );
}

const Amount: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-slate-800">AED {fmtMoney(value)}</dd>
  </div>
);

function SalaryForm({ employee, structure, onDone }: { employee: HrEmployee; structure: SalaryStructure | null; onDone: () => void }) {
  const { push } = useToast();
  const save = useSaveSalary(employee.id);
  const [basic, setBasic] = useState(structure ? String(structure.basicSalary) : "");
  const [housing, setHousing] = useState(structure ? String(structure.housingAllowance) : "");
  const [transport, setTransport] = useState(structure ? String(structure.transportAllowance) : "");
  const [other, setOther] = useState(structure ? String(structure.otherAllowance) : "");
  const [effectiveFrom, setEffectiveFrom] = useState(structure ? toDateInput(structure.effectiveFrom) : format(new Date(), "yyyy-MM-dd"));

  const total = toNum(basic) + toNum(housing) + toNum(transport) + toNum(other);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!basic.trim() || toNum(basic) <= 0) {
      push({ variant: "error", title: "Basic salary is required." });
      return;
    }
    try {
      await save.mutateAsync({
        basicSalary: toNum(basic),
        housingAllowance: toNum(housing),
        transportAllowance: toNum(transport),
        otherAllowance: toNum(other),
        effectiveFrom: effectiveFrom || undefined,
      });
      push({ variant: "success", title: "Salary structure saved." });
      onDone();
    } catch (err) {
      push({ variant: "error", title: "Could not save salary", description: extractApiError(err).message });
    }
  }

  const money = (value: string, set: (v: string) => void) => ({
    type: "number" as const,
    min: 0,
    step: "0.01",
    inputMode: "decimal" as const,
    value,
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => set(ev.target.value),
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label required>Basic salary</Label>
          <Input {...money(basic, setBasic)} />
        </div>
        <div>
          <Label>Housing allowance</Label>
          <Input {...money(housing, setHousing)} />
        </div>
        <div>
          <Label>Transport allowance</Label>
          <Input {...money(transport, setTransport)} />
        </div>
        <div>
          <Label>Other allowance</Label>
          <Input {...money(other, setOther)} />
        </div>
        <div>
          <Label>Effective from</Label>
          <Input type="date" value={effectiveFrom} onChange={(ev) => setEffectiveFrom(ev.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-sm text-slate-500">
          Total monthly <span className="text-lg font-semibold text-slate-900">AED {fmtMoney(total)}</span>
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save salary
          </Button>
        </div>
      </div>
    </form>
  );
}

function PayslipHistory({ employee }: { employee: HrEmployee }) {
  const { push } = useToast();
  const { data: payslips, isLoading, isError, refetch } = useEmployeePayslips(employee.id);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function download(p: EmployeePayslip) {
    setBusyId(p.id);
    try {
      await generatePayslipPdf(
        {
          month: p.run.month,
          employeeName: employee.fullName,
          employeeCode: employee.employeeCode,
          jobTitle: employee.jobTitle,
          department: employee.department?.name ?? null,
          bankName: employee.bankName,
          bankAccountNumber: employee.bankAccountNumber,
          basicSalary: p.basicSalary,
          housingAllowance: p.housingAllowance,
          transportAllowance: p.transportAllowance,
          otherAllowance: p.otherAllowance,
          bonus: p.bonus,
          grossEarnings: p.grossEarnings,
          daysInMonth: p.daysInMonth,
          unpaidLeaveDays: p.unpaidLeaveDays,
          leaveDeduction: p.leaveDeduction,
          otherDeduction: p.otherDeduction,
          deductionNote: p.deductionNote,
          netPay: p.netPay,
        },
        { preview: false }
      );
    } catch (err) {
      push({ variant: "error", title: "Could not generate payslip", description: err instanceof Error ? err.message : extractApiError(err).message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Payslip history</h3>
      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && <ErrorState message="Could not load payslips." onRetry={() => refetch()} />}
      {payslips && payslips.length === 0 && <EmptyState icon={<Receipt className="h-8 w-8" />} title="No payslips yet." description="Payslips appear here once a payroll run is created." />}
      {payslips && payslips.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Month</th>
                <th className="px-4 py-2.5 text-right">Gross</th>
                <th className="px-4 py-2.5 text-right">Deductions</th>
                <th className="px-4 py-2.5 text-right">Net pay</th>
                <th className="px-4 py-2.5">Run status</th>
                <th className="px-4 py-2.5 text-right">Payslip</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{monthLabel(p.run.month)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{fmtMoney(p.grossEarnings)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{fmtMoney(p.leaveDeduction + p.otherDeduction)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-900">{fmtMoney(p.netPay)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={RUN_TONE[p.run.status] ?? "slate"}>{titleCase(p.run.status)}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="outline" size="sm" loading={busyId === p.id} onClick={() => download(p)}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
