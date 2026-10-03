import React, { useState } from "react";
import { Pencil, X } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { useUpdateEmployeeProfile, type HrEmployee, type HrProfileInput } from "../../api/hr";
import { useDepartments } from "../../api/misc";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "../ui/primitives";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { fmtDate, toDateInput } from "../../lib/hrFormat";

export function ExpiryBadge({ date }: { date: string | null | undefined }) {
  if (!date) return null;
  const days = differenceInCalendarDays(new Date(date), new Date());
  if (isNaN(days)) return null;
  if (days < 0) return <Badge tone="red">Expired</Badge>;
  if (days <= 90) return <Badge tone="amber">Expires in {days}d</Badge>;
  return null;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-0.5 break-words text-sm text-slate-800">{children || "—"}</dd>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card className="p-4 sm:p-5">
    <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
  </Card>
);

const ExpiryField: React.FC<{ label: string; date: string | null }> = ({ label, date }) => (
  <Field label={label}>
    {date ? (
      <span className="inline-flex flex-wrap items-center gap-2">
        {fmtDate(date)}
        <ExpiryBadge date={date} />
      </span>
    ) : null}
  </Field>
);

interface FormState {
  fullName: string;
  jobTitle: string;
  departmentId: string;
  isActive: boolean;
  phone: string;
  personalEmail: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  maritalStatus: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  joiningDate: string;
  passportNumber: string;
  passportExpiry: string;
  emiratesId: string;
  emiratesIdExpiry: string;
  visaNumber: string;
  visaExpiry: string;
  laborCardNumber: string;
  bankName: string;
  bankAccountNumber: string;
}

function toForm(e: HrEmployee): FormState {
  return {
    fullName: e.fullName,
    jobTitle: e.jobTitle ?? "",
    departmentId: e.departmentId ?? "",
    isActive: e.isActive,
    phone: e.phone ?? "",
    personalEmail: e.personalEmail ?? "",
    dateOfBirth: toDateInput(e.dateOfBirth),
    gender: e.gender ?? "",
    nationality: e.nationality ?? "",
    maritalStatus: e.maritalStatus ?? "",
    address: e.address ?? "",
    emergencyContactName: e.emergencyContactName ?? "",
    emergencyContactPhone: e.emergencyContactPhone ?? "",
    joiningDate: toDateInput(e.joiningDate),
    passportNumber: e.passportNumber ?? "",
    passportExpiry: toDateInput(e.passportExpiry),
    emiratesId: e.emiratesId ?? "",
    emiratesIdExpiry: toDateInput(e.emiratesIdExpiry),
    visaNumber: e.visaNumber ?? "",
    visaExpiry: toDateInput(e.visaExpiry),
    laborCardNumber: e.laborCardNumber ?? "",
    bankName: e.bankName ?? "",
    bankAccountNumber: e.bankAccountNumber ?? "",
  };
}

export function EmployeeOverviewTab({ employee }: { employee: HrEmployee }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" /> Cancel editing
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
      </div>
      {editing ? <OverviewForm employee={employee} onDone={() => setEditing(false)} /> : <OverviewDetails employee={employee} />}
    </div>
  );
}

function OverviewDetails({ employee: e }: { employee: HrEmployee }) {
  return (
    <div className="space-y-4">
      <Section title="Personal">
        <Field label="Date of birth">{e.dateOfBirth ? fmtDate(e.dateOfBirth) : null}</Field>
        <Field label="Gender">{e.gender}</Field>
        <Field label="Nationality">{e.nationality}</Field>
        <Field label="Marital status">{e.maritalStatus}</Field>
        <Field label="Phone">{e.phone}</Field>
        <Field label="Personal email">{e.personalEmail}</Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Address">{e.address}</Field>
        </div>
      </Section>

      <Section title="Employment">
        <Field label="Employee code">{e.employeeCode}</Field>
        <Field label="Work email">{e.workEmail}</Field>
        <Field label="Job title">{e.jobTitle}</Field>
        <Field label="Department">{e.department?.name}</Field>
        <Field label="Teams">{e.teams.map((t) => t.name).join(", ")}</Field>
        <Field label="Joining date">{e.joiningDate ? fmtDate(e.joiningDate) : null}</Field>
        <Field label="Linked login">
          {e.user ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              {e.user.name}
              <Badge tone={e.user.status === "ACTIVE" ? "green" : "slate"}>{e.user.status}</Badge>
            </span>
          ) : (
            <span className="text-slate-400">Not linked</span>
          )}
        </Field>
      </Section>

      <Section title="Identity & Visa">
        <Field label="Passport number">{e.passportNumber}</Field>
        <ExpiryField label="Passport expiry" date={e.passportExpiry} />
        <div className="hidden lg:block" />
        <Field label="Emirates ID number">{e.emiratesId}</Field>
        <ExpiryField label="Emirates ID expiry" date={e.emiratesIdExpiry} />
        <div className="hidden lg:block" />
        <Field label="Visa number">{e.visaNumber}</Field>
        <ExpiryField label="Visa expiry" date={e.visaExpiry} />
        <Field label="Labour card number">{e.laborCardNumber}</Field>
      </Section>

      <Section title="Bank">
        <Field label="Bank name">{e.bankName}</Field>
        <Field label="Account number / IBAN">{e.bankAccountNumber}</Field>
      </Section>

      <Section title="Emergency contact">
        <Field label="Name">{e.emergencyContactName}</Field>
        <Field label="Phone">{e.emergencyContactPhone}</Field>
      </Section>
    </div>
  );
}

function OverviewForm({ employee, onDone }: { employee: HrEmployee; onDone: () => void }) {
  const { push } = useToast();
  const update = useUpdateEmployeeProfile(employee.id);
  const { data: departments } = useDepartments();
  const [form, setForm] = useState<FormState>(() => toForm(employee));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: keyof FormState) => ({
    value: form[key] as string,
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => set(key, ev.target.value as never),
  });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.fullName.trim()) {
      push({ variant: "error", title: "Full name is required." });
      return;
    }
    const { departmentId, ...rest } = form;
    const payload: HrProfileInput = {
      ...rest,
      fullName: form.fullName.trim(),
      departmentId: departmentId || null,
    };
    try {
      await update.mutateAsync(payload);
      push({ variant: "success", title: "Employee profile updated." });
      onDone();
    } catch (err) {
      push({ variant: "error", title: "Could not update profile", description: extractApiError(err).message });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormSection title="Employment">
        <div>
          <Label required>Full name</Label>
          <Input {...text("fullName")} />
        </div>
        <div>
          <Label>Job title</Label>
          <Input {...text("jobTitle")} />
        </div>
        <div>
          <Label>Department</Label>
          <Select value={form.departmentId} onChange={(ev) => set("departmentId", ev.target.value)}>
            <option value="">None</option>
            {departments?.map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Joining date</Label>
          <Input type="date" {...text("joiningDate")} />
        </div>
        <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(ev) => set("isActive", ev.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus-visible:focus-ring"
          />
          Active employee
        </label>
      </FormSection>

      <FormSection title="Personal">
        <div>
          <Label>Date of birth</Label>
          <Input type="date" {...text("dateOfBirth")} />
        </div>
        <div>
          <Label>Gender</Label>
          <Select value={form.gender} onChange={(ev) => set("gender", ev.target.value)}>
            <option value="">—</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
            {form.gender && !["Male", "Female", "Other"].includes(form.gender) && <option value={form.gender}>{form.gender}</option>}
          </Select>
        </div>
        <div>
          <Label>Nationality</Label>
          <Input {...text("nationality")} />
        </div>
        <div>
          <Label>Marital status</Label>
          <Select value={form.maritalStatus} onChange={(ev) => set("maritalStatus", ev.target.value)}>
            <option value="">—</option>
            <option value="Single">Single</option>
            <option value="Married">Married</option>
            <option value="Divorced">Divorced</option>
            <option value="Widowed">Widowed</option>
            {form.maritalStatus && !["Single", "Married", "Divorced", "Widowed"].includes(form.maritalStatus) && (
              <option value={form.maritalStatus}>{form.maritalStatus}</option>
            )}
          </Select>
        </div>
        <div>
          <Label>Phone</Label>
          <Input {...text("phone")} />
        </div>
        <div>
          <Label>Personal email</Label>
          <Input type="email" {...text("personalEmail")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Label>Address</Label>
          <Textarea rows={2} value={form.address} onChange={(ev) => set("address", ev.target.value)} />
        </div>
      </FormSection>

      <FormSection title="Identity & Visa">
        <div>
          <Label>Passport number</Label>
          <Input {...text("passportNumber")} />
        </div>
        <div>
          <Label>Passport expiry</Label>
          <Input type="date" {...text("passportExpiry")} />
        </div>
        <div className="hidden lg:block" />
        <div>
          <Label>Emirates ID number</Label>
          <Input {...text("emiratesId")} />
        </div>
        <div>
          <Label>Emirates ID expiry</Label>
          <Input type="date" {...text("emiratesIdExpiry")} />
        </div>
        <div className="hidden lg:block" />
        <div>
          <Label>Visa number</Label>
          <Input {...text("visaNumber")} />
        </div>
        <div>
          <Label>Visa expiry</Label>
          <Input type="date" {...text("visaExpiry")} />
        </div>
        <div>
          <Label>Labour card number</Label>
          <Input {...text("laborCardNumber")} />
        </div>
      </FormSection>

      <FormSection title="Bank">
        <div>
          <Label>Bank name</Label>
          <Input {...text("bankName")} />
        </div>
        <div>
          <Label>Account number / IBAN</Label>
          <Input {...text("bankAccountNumber")} />
        </div>
      </FormSection>

      <FormSection title="Emergency contact">
        <div>
          <Label>Name</Label>
          <Input {...text("emergencyContactName")} />
        </div>
        <div>
          <Label>Phone</Label>
          <Input {...text("emergencyContactPhone")} />
        </div>
      </FormSection>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={update.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card className="p-4 sm:p-5">
    <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  </Card>
);
