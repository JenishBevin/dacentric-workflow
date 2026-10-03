import React from "react";
import clsx from "clsx";
import { format } from "date-fns";
import { Award, Download, Eye, FileSignature, FileText, Files, LogOut, Trash2, Wallet } from "lucide-react";
import { useCreateLetter, useDeleteLetter, useEmployeeLetters } from "../../api/hr";
import type { HrEmployee, HrLetter, LetterType } from "../../api/hr";
import { Badge, Button, Card, EmptyState, Input, Label, Skeleton, Textarea } from "../ui/primitives";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { fmtDate, titleCase, toDateInput } from "../../lib/hrFormat";
import { generateHrLetterPdf } from "../../lib/hrLetterPdf";

/** CONTRACT (request 1008): rendered inside the Employee page's "Letters" tab. */

interface TypeMeta {
  label: string;
  hint: string;
  icon: React.ReactNode;
  tone: "blue" | "indigo" | "green" | "amber" | "purple" | "slate";
}

const TYPES: LetterType[] = ["OFFER", "APPOINTMENT", "EXPERIENCE", "RELIEVING", "SALARY_CERTIFICATE", "OTHER"];

const TYPE_META: Record<LetterType, TypeMeta> = {
  OFFER: { label: "Offer Letter", hint: "Offer of employment", icon: <FileText className="h-5 w-5" />, tone: "blue" },
  APPOINTMENT: { label: "Appointment Letter", hint: "Confirm terms of appointment", icon: <FileSignature className="h-5 w-5" />, tone: "indigo" },
  EXPERIENCE: { label: "Experience Letter", hint: "Certificate of service", icon: <Award className="h-5 w-5" />, tone: "green" },
  RELIEVING: { label: "Relieving Letter", hint: "Accepted resignation", icon: <LogOut className="h-5 w-5" />, tone: "amber" },
  SALARY_CERTIFICATE: { label: "Salary Certificate", hint: "Monthly salary breakdown", icon: <Wallet className="h-5 w-5" />, tone: "purple" },
  OTHER: { label: "Other HR Document", hint: "Free-form letter", icon: <Files className="h-5 w-5" />, tone: "slate" },
};

interface FormState {
  designation: string;
  department: string;
  joiningDate: string;
  lastWorkingDate: string;
  resignationDate: string;
  basicSalary: string;
  housingAllowance: string;
  transportAllowance: string;
  otherAllowance: string;
  probationMonths: string;
  noticePeriod: string;
  validUntil: string;
  workingHours: string;
  terms: string;
  conduct: string;
  remarks: string;
  addressedTo: string;
  purpose: string;
  title: string;
  body: string;
}

const todayInput = () => format(new Date(), "yyyy-MM-dd");

function buildDefaults(e: HrEmployee): FormState {
  const s = e.salaryStructure;
  const money = (n: number | undefined) => (n === undefined || n === null ? "" : String(n));
  return {
    designation: e.jobTitle ?? "",
    department: e.department?.name ?? "",
    joiningDate: toDateInput(e.joiningDate),
    lastWorkingDate: todayInput(),
    resignationDate: "",
    basicSalary: money(s?.basicSalary),
    housingAllowance: money(s?.housingAllowance),
    transportAllowance: money(s?.transportAllowance),
    otherAllowance: money(s?.otherAllowance),
    probationMonths: "",
    noticePeriod: "",
    validUntil: "",
    workingHours: "",
    terms: "",
    conduct: "",
    remarks: "",
    addressedTo: "",
    purpose: "",
    title: "",
    body: "",
  };
}

const SALARY_TYPES: LetterType[] = ["OFFER", "APPOINTMENT", "SALARY_CERTIFICATE"];

/** Validates the form for a type and builds the `data` blob documented in hrLetterPdf.ts. */
function buildData(type: LetterType, f: FormState): { data?: Record<string, unknown>; error?: string } {
  const opt = (v: string) => v.trim() || undefined;
  const money = (v: string) => Number(v) || 0;

  if (type === "OTHER") {
    if (!f.title.trim()) return { error: "Enter a title for the document." };
    if (!f.body.trim()) return { error: "Enter the body text of the document." };
    return { data: { title: f.title.trim(), body: f.body.trim(), addressedTo: opt(f.addressedTo) } };
  }

  if (!f.designation.trim()) return { error: "Designation is required." };
  if (!f.joiningDate) return { error: type === "OFFER" || type === "APPOINTMENT" ? "Joining date is required." : "Date of joining is required." };

  if (SALARY_TYPES.includes(type)) {
    for (const k of ["basicSalary", "housingAllowance", "transportAllowance", "otherAllowance"] as const) {
      const n = Number(f[k] || 0);
      if (!Number.isFinite(n) || n < 0) return { error: "Salary amounts must be zero or a positive number." };
    }
    if (money(f.basicSalary) <= 0) return { error: "Basic salary is required for this letter." };
  }

  const salary = {
    basicSalary: money(f.basicSalary),
    housingAllowance: money(f.housingAllowance),
    transportAllowance: money(f.transportAllowance),
    otherAllowance: money(f.otherAllowance),
  };

  if (type === "EXPERIENCE" || type === "RELIEVING") {
    if (!f.lastWorkingDate) return { error: "Last working date is required." };
    if (f.lastWorkingDate < f.joiningDate) return { error: "Last working date cannot be before the joining date." };
  }

  switch (type) {
    case "OFFER":
      return {
        data: {
          designation: f.designation.trim(),
          department: opt(f.department),
          joiningDate: f.joiningDate,
          ...salary,
          probationMonths: opt(f.probationMonths),
          noticePeriod: opt(f.noticePeriod),
          validUntil: opt(f.validUntil),
          terms: opt(f.terms),
        },
      };
    case "APPOINTMENT":
      return {
        data: {
          designation: f.designation.trim(),
          department: opt(f.department),
          joiningDate: f.joiningDate,
          ...salary,
          probationMonths: opt(f.probationMonths),
          noticePeriod: opt(f.noticePeriod),
          workingHours: opt(f.workingHours),
          terms: opt(f.terms),
        },
      };
    case "EXPERIENCE":
      return {
        data: {
          designation: f.designation.trim(),
          department: opt(f.department),
          joiningDate: f.joiningDate,
          lastWorkingDate: f.lastWorkingDate,
          conduct: opt(f.conduct),
        },
      };
    case "RELIEVING":
      return {
        data: {
          designation: f.designation.trim(),
          joiningDate: f.joiningDate,
          lastWorkingDate: f.lastWorkingDate,
          resignationDate: opt(f.resignationDate),
          remarks: opt(f.remarks),
        },
      };
    case "SALARY_CERTIFICATE":
      return {
        data: {
          designation: f.designation.trim(),
          joiningDate: f.joiningDate,
          ...salary,
          addressedTo: opt(f.addressedTo),
          purpose: opt(f.purpose),
        },
      };
  }
}

export function EmployeeLettersTab({ employee }: { employee: HrEmployee }) {
  const { push } = useToast();
  const { data: letters, isLoading } = useEmployeeLetters(employee.id);
  const createLetter = useCreateLetter(employee.id);
  const deleteLetter = useDeleteLetter();

  const [type, setType] = React.useState<LetterType>("OFFER");
  const [form, setForm] = React.useState<FormState>(() => buildDefaults(employee));
  const [issueDate, setIssueDate] = React.useState(todayInput());
  const [busy, setBusy] = React.useState<"" | "generate" | "preview">("");
  const [filter, setFilter] = React.useState<LetterType | "ALL">("ALL");
  const [rowBusy, setRowBusy] = React.useState<string>("");
  const [toDelete, setToDelete] = React.useState<HrLetter | null>(null);

  // Re-prefill when a different employee is shown (same component instance).
  React.useEffect(() => {
    setForm(buildDefaults(employee));
    setType("OFFER");
    setFilter("ALL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const text = (key: keyof FormState) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value),
  });

  const meta = TYPE_META[type];
  const needsSalary = SALARY_TYPES.includes(type);
  const showDesignation = type !== "OTHER";
  const showDepartment = type === "OFFER" || type === "APPOINTMENT" || type === "EXPERIENCE";
  const showProbation = type === "OFFER" || type === "APPOINTMENT";
  const showLastDay = type === "EXPERIENCE" || type === "RELIEVING";
  const pdfBase = {
    recipientName: employee.fullName,
    recipientAddress: employee.address,
  };

  async function onPreview() {
    // Open the window synchronously, before any await, so popup blockers allow it.
    const win = window.open("", "_blank");
    const built = buildData(type, form);
    if (!built.data) {
      win?.close();
      push({ variant: "error", title: "Check the form", description: built.error });
      return;
    }
    setBusy("preview");
    try {
      await generateHrLetterPdf(
        { letterType: type, refNo: "PREVIEW", issueDate, ...pdfBase, data: built.data },
        { preview: true, previewWindow: win }
      );
    } catch (err) {
      win?.close();
      push({ variant: "error", title: "Could not build the preview", description: err instanceof Error ? err.message : "Unexpected error" });
    } finally {
      setBusy("");
    }
  }

  async function onGenerate() {
    const built = buildData(type, form);
    if (!built.data) {
      push({ variant: "error", title: "Check the form", description: built.error });
      return;
    }
    if (!issueDate) {
      push({ variant: "error", title: "Check the form", description: "Issue date is required." });
      return;
    }
    setBusy("generate");
    let saved: HrLetter;
    try {
      saved = await createLetter.mutateAsync({ letterType: type, issueDate, data: built.data });
    } catch (err) {
      push({ variant: "error", title: "Could not issue the letter", description: extractApiError(err).message });
      setBusy("");
      return;
    }
    try {
      await generateHrLetterPdf({ letterType: type, refNo: saved.refNo, issueDate: saved.issueDate, ...pdfBase, data: built.data });
      push({ variant: "success", title: `${meta.label} issued`, description: `Reference ${saved.refNo} saved and downloaded.` });
    } catch (err) {
      push({
        variant: "error",
        title: `Letter ${saved.refNo} saved, but the PDF failed`,
        description: `${err instanceof Error ? err.message : "Unexpected error"} You can download it again from the issued letters list.`,
      });
    } finally {
      setBusy("");
    }
  }

  async function renderStored(letter: HrLetter, preview: boolean) {
    const win = preview ? window.open("", "_blank") : null; // synchronous, before any await
    setRowBusy(`${letter.id}:${preview ? "p" : "d"}`);
    try {
      await generateHrLetterPdf(
        { letterType: letter.letterType, refNo: letter.refNo, issueDate: letter.issueDate, ...pdfBase, data: letter.data ?? {} },
        preview ? { preview: true, previewWindow: win } : undefined
      );
    } catch (err) {
      win?.close();
      push({ variant: "error", title: "Could not build the PDF", description: err instanceof Error ? err.message : "Unexpected error" });
    } finally {
      setRowBusy("");
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteLetter.mutateAsync(toDelete.id);
      push({ variant: "success", title: "Letter record removed", description: `${toDelete.refNo} was deleted from the employee's records.` });
      setToDelete(null);
    } catch (err) {
      push({ variant: "error", title: "Could not delete the letter", description: extractApiError(err).message });
    }
  }

  const all = letters ?? [];
  const counts = all.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.letterType]: (acc[l.letterType] ?? 0) + 1 }), {});
  const shown = filter === "ALL" ? all : all.filter((l) => l.letterType === filter);

  return (
    <div className="space-y-6">
      {/* ------------------------------ Generator ------------------------------ */}
      <Card className="p-5">
        <h3 className="text-base font-semibold text-slate-900">Generate a letter</h3>
        <p className="mt-0.5 text-sm text-slate-500">Choose a document type, review the details prefilled from {employee.fullName}'s profile, then generate the PDF.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {TYPES.map((t) => {
            const m = TYPE_META[t];
            const active = t === type;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={active}
                className={clsx(
                  "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors focus-visible:focus-ring",
                  active ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <span className={clsx(active ? "text-brand-600" : "text-slate-500")}>{m.icon}</span>
                <span className="text-sm font-semibold text-slate-900">{m.label}</span>
                <span className="text-xs text-slate-500">{m.hint}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <h4 className="text-sm font-semibold text-slate-800">{meta.label} details</h4>

          {needsSalary && !employee.salaryStructure && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No salary structure is set up for this employee yet, so the amounts below are empty. Enter them manually, or set up the salary structure first to have them prefilled.
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <Label required>Issue date</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>

            {showDesignation && (
              <div>
                <Label required>Designation</Label>
                <Input {...text("designation")} placeholder="e.g. Site Engineer" />
              </div>
            )}
            {showDepartment && (
              <div>
                <Label>Department</Label>
                <Input {...text("department")} placeholder="Optional" />
              </div>
            )}
            {showDesignation && (
              <div>
                <Label required>{type === "OFFER" || type === "APPOINTMENT" ? "Joining date" : "Date of joining"}</Label>
                <Input type="date" {...text("joiningDate")} />
              </div>
            )}
            {showLastDay && (
              <div>
                <Label required>Last working date</Label>
                <Input type="date" {...text("lastWorkingDate")} />
              </div>
            )}
            {type === "RELIEVING" && (
              <div>
                <Label>Resignation date</Label>
                <Input type="date" {...text("resignationDate")} />
              </div>
            )}
            {showProbation && (
              <>
                <div>
                  <Label>Probation (months)</Label>
                  <Input type="number" min={0} {...text("probationMonths")} placeholder="e.g. 6" />
                </div>
                <div>
                  <Label>Notice period</Label>
                  <Input {...text("noticePeriod")} placeholder="e.g. 30 days" />
                </div>
              </>
            )}
            {type === "OFFER" && (
              <div>
                <Label>Offer valid until</Label>
                <Input type="date" {...text("validUntil")} />
              </div>
            )}
            {type === "APPOINTMENT" && (
              <div>
                <Label>Working hours</Label>
                <Input {...text("workingHours")} placeholder="e.g. 8 hours a day, Monday to Friday" />
              </div>
            )}
            {(type === "SALARY_CERTIFICATE" || type === "OTHER") && (
              <div>
                <Label>Addressed to</Label>
                <Input {...text("addressedTo")} placeholder={type === "OTHER" ? "Optional" : "Default: To Whom It May Concern"} />
              </div>
            )}
            {type === "SALARY_CERTIFICATE" && (
              <div>
                <Label>Purpose</Label>
                <Input {...text("purpose")} placeholder="e.g. bank loan application" />
              </div>
            )}
          </div>

          {needsSalary && (
            <div className="mt-4">
              <Label>Monthly salary (AED)</Label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    ["basicSalary", "Basic"],
                    ["housingAllowance", "Housing"],
                    ["transportAllowance", "Transport"],
                    ["otherAllowance", "Other allowance"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <span className="mb-1 block text-xs text-slate-500">{label}</span>
                    <Input type="number" min={0} step="0.01" {...text(key)} placeholder="0.00" />
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Total: AED{" "}
                {(["basicSalary", "housingAllowance", "transportAllowance", "otherAllowance"] as const)
                  .reduce((s, k) => s + (Number(form[k]) || 0), 0)
                  .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}

          {(type === "OFFER" || type === "APPOINTMENT") && (
            <div className="mt-4">
              <Label>Additional terms</Label>
              <Textarea rows={4} {...text("terms")} placeholder="Optional. One term per line." />
            </div>
          )}
          {type === "EXPERIENCE" && (
            <div className="mt-4">
              <Label>Conduct statement</Label>
              <Textarea rows={3} {...text("conduct")} placeholder="Optional. Default: conduct and performance were satisfactory." />
            </div>
          )}
          {type === "RELIEVING" && (
            <div className="mt-4">
              <Label>Remarks / dues statement</Label>
              <Textarea rows={3} {...text("remarks")} placeholder="Optional. Replaces the default 'no dues' statement." />
            </div>
          )}
          {type === "OTHER" && (
            <div className="mt-4 space-y-4">
              <div>
                <Label required>Title</Label>
                <Input {...text("title")} placeholder="e.g. Address Proof Letter" />
              </div>
              <div>
                <Label required>Body</Label>
                <Textarea rows={8} {...text("body")} placeholder="Write the letter text. Each line becomes its own paragraph." />
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={onPreview} loading={busy === "preview"} disabled={busy === "generate"}>
              <Eye className="h-4 w-4" /> Preview
            </Button>
            <Button onClick={onGenerate} loading={busy === "generate"} disabled={busy === "preview"}>
              <Download className="h-4 w-4" /> Generate &amp; download
            </Button>
          </div>
          <p className="mt-2 text-right text-xs text-slate-500">Preview does not save anything. Generating issues a reference number and records the letter below.</p>
        </div>
      </Card>

      {/* ------------------------------ Issued letters ------------------------------ */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">Issued letters</h3>
          {all.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(["ALL", ...TYPES] as const)
                .filter((t) => t === "ALL" || counts[t])
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFilter(t)}
                    className={clsx(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:focus-ring",
                      filter === t ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {t === "ALL" ? `All (${all.length})` : `${TYPE_META[t].label} (${counts[t]})`}
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title={all.length === 0 ? "No letters issued yet" : "No letters of this type"}
              description={all.length === 0 ? "Letters you generate above are recorded here with their reference numbers." : "Try another filter."}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">Reference</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Issue date</th>
                    <th className="py-2 pr-3 font-medium">Issued by</th>
                    <th className="py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-slate-900">{l.refNo}</td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={TYPE_META[l.letterType]?.tone ?? "slate"}>{TYPE_META[l.letterType]?.label ?? titleCase(l.letterType)}</Badge>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{fmtDate(l.issueDate)}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{l.createdByName}</td>
                      <td className="py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" loading={rowBusy === `${l.id}:p`} disabled={!!rowBusy} onClick={() => renderStored(l, true)}>
                            <Eye className="h-3.5 w-3.5" /> Preview
                          </Button>
                          <Button size="sm" variant="outline" loading={rowBusy === `${l.id}:d`} disabled={!!rowBusy} onClick={() => renderStored(l, false)}>
                            <Download className="h-3.5 w-3.5" /> Download
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setToDelete(l)} aria-label={`Delete ${l.refNo}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete letter record"
        message={
          <>
            Delete the record for <strong>{toDelete?.refNo}</strong> ({toDelete ? TYPE_META[toDelete.letterType]?.label : ""})? This only removes the record from the employee's file. Any copy already downloaded or sent is not affected.
          </>
        }
        confirmLabel="Delete record"
        loading={deleteLetter.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
