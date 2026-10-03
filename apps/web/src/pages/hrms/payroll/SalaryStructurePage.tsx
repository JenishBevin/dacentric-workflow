import React, { useMemo, useState } from "react";
import { Pencil, Search, Wallet } from "lucide-react";
import { format } from "date-fns";
import { useSalaryStructures, useSaveSalary, type SalaryStructureRow } from "../../../api/hr";
import { Badge, Button, EmptyState, ErrorState, Input, Label } from "../../../components/ui/primitives";
import { Drawer } from "../../../components/ui/Drawer";
import { useToast } from "../../../context/ToastContext";
import { extractApiError } from "../../../lib/apiClient";
import { fmtDate, fmtMoney, toDateInput } from "../../../lib/hrFormat";
import { StatTile, TableSkeleton, TD, TDR, TH, THR, TilesSkeleton } from "../../../components/hr/payroll/shared";

const FIELDS = [
  { key: "basicSalary", label: "Basic salary" },
  { key: "housingAllowance", label: "Housing allowance" },
  { key: "transportAllowance", label: "Transport allowance" },
  { key: "otherAllowance", label: "Other allowance" },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

function parseAmount(s: string): number | null {
  if (s.trim() === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Edit drawer — rendered per employee (keyed) because useSaveSalary binds the employee id at hook time. */
const SalaryEditDrawer: React.FC<{ row: SalaryStructureRow; onClose: () => void }> = ({ row, onClose }) => {
  const { push } = useToast();
  const save = useSaveSalary(row.employeeId);
  const s = row.structure;
  const [values, setValues] = useState<Record<FieldKey, string>>({
    basicSalary: s ? String(s.basicSalary) : "",
    housingAllowance: s ? String(s.housingAllowance) : "",
    transportAllowance: s ? String(s.transportAllowance) : "",
    otherAllowance: s ? String(s.otherAllowance) : "",
  });
  const [effectiveFrom, setEffectiveFrom] = useState(s ? toDateInput(s.effectiveFrom) : format(new Date(), "yyyy-MM-dd"));
  const [submitted, setSubmitted] = useState(false);

  const parsed = FIELDS.map((f) => parseAmount(values[f.key]));
  const total = parsed.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  const basicEmpty = values.basicSalary.trim() === "";
  const hasError = parsed.some((n) => n === null) || basicEmpty || !effectiveFrom;

  async function onSave() {
    setSubmitted(true);
    if (hasError) return;
    try {
      await save.mutateAsync({
        basicSalary: parsed[0]!,
        housingAllowance: parsed[1]!,
        transportAllowance: parsed[2]!,
        otherAllowance: parsed[3]!,
        effectiveFrom,
      });
      push({ variant: "success", title: "Salary structure saved", description: row.fullName });
      onClose();
    } catch (err) {
      push({ variant: "error", title: "Could not save salary structure", description: extractApiError(err).message });
    }
  }

  return (
    <Drawer
      open
      onClose={() => !save.isPending && onClose()}
      title={s ? "Edit salary structure" : "Set salary structure"}
      subtitle={`${row.fullName} (${row.employeeCode})`}
      widthClassName="md:w-[460px] md:max-w-[92vw]"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={onSave} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Monthly amounts in AED. The total is what the employee earns before bonus and deductions.</p>
        {FIELDS.map((f, i) => {
          const invalid = parsed[i] === null || (f.key === "basicSalary" && basicEmpty);
          return (
            <div key={f.key}>
              <Label required={f.key === "basicSalary"}>{f.label}</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder="0.00"
                error={submitted && invalid ? "Enter a non-negative amount" : undefined}
              />
            </div>
          );
        })}
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-600">Total monthly salary</span>
          <span className="text-lg font-semibold tabular-nums text-slate-900">AED {fmtMoney(total)}</span>
        </div>
        <div>
          <Label required>Effective from</Label>
          <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} error={submitted && !effectiveFrom ? "Pick a date" : undefined} />
        </div>
      </div>
    </Drawer>
  );
};

export default function SalaryStructurePage() {
  const { data, isLoading, isError, refetch } = useSalaryStructures();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const rows = data ?? [];
  const withStructure = rows.filter((r) => r.structure).length;
  const totalPayroll = rows.reduce((sum, r) => sum + (r.total ?? 0), 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.employeeCode, r.fullName, r.jobTitle, r.department].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [rows, search]);

  const editing = rows.find((r) => r.employeeId === editingId) ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Salary Structure</h1>
        <p className="text-sm text-slate-500">Monthly salary components for every active employee. Payroll runs are built from these amounts.</p>
      </div>

      {isLoading ? (
        <>
          <TilesSkeleton count={3} />
          <TableSkeleton />
        </>
      ) : isError ? (
        <ErrorState message="Could not load salary structures." onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label="With salary structure" value={withStructure} tone="green" />
            <StatTile label="Without salary structure" value={rows.length - withStructure} tone={rows.length - withStructure > 0 ? "amber" : "default"} hint="Excluded from payroll runs" />
            <StatTile label="Total monthly payroll" value={`AED ${fmtMoney(totalPayroll)}`} />
          </div>

          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search by name, code, designation, department" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={<Wallet className="h-8 w-8" />} title="No active employees" description="Add employees under Settings to manage their salary structure." />
          ) : filtered.length === 0 ? (
            <EmptyState title="No employees match your search" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={TH}>Code</th>
                    <th className={TH}>Employee</th>
                    <th className={TH}>Designation</th>
                    <th className={TH}>Department</th>
                    <th className={THR}>Basic</th>
                    <th className={THR}>Housing</th>
                    <th className={THR}>Transport</th>
                    <th className={THR}>Other</th>
                    <th className={THR}>Total</th>
                    <th className={TH}>Effective from</th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.employeeId} className="hover:bg-slate-50/60">
                      <td className={`${TD} whitespace-nowrap font-mono text-xs`}>{r.employeeCode}</td>
                      <td className={`${TD} whitespace-nowrap font-medium text-slate-900`}>{r.fullName}</td>
                      <td className={TD}>{r.jobTitle ?? "—"}</td>
                      <td className={TD}>{r.department ?? "—"}</td>
                      {r.structure ? (
                        <>
                          <td className={TDR}>{fmtMoney(r.structure.basicSalary)}</td>
                          <td className={TDR}>{fmtMoney(r.structure.housingAllowance)}</td>
                          <td className={TDR}>{fmtMoney(r.structure.transportAllowance)}</td>
                          <td className={TDR}>{fmtMoney(r.structure.otherAllowance)}</td>
                          <td className={`${TDR} font-semibold text-slate-900`}>{fmtMoney(r.total)}</td>
                          <td className={`${TD} whitespace-nowrap`}>{fmtDate(r.structure.effectiveFrom)}</td>
                        </>
                      ) : (
                        <>
                          <td className={TD} colSpan={5}>
                            <Badge tone="amber">Not set</Badge>
                          </td>
                          <td className={TD}>—</td>
                        </>
                      )}
                      <td className={`${TD} text-right`}>
                        <Button size="sm" variant={r.structure ? "outline" : "primary"} onClick={() => setEditingId(r.employeeId)}>
                          <Pencil className="h-3.5 w-3.5" />
                          {r.structure ? "Edit" : "Set"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editing && <SalaryEditDrawer key={editing.employeeId} row={editing} onClose={() => setEditingId(null)} />}
    </div>
  );
}
