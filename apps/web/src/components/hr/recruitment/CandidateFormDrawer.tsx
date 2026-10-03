import React, { useState } from "react";
import { Drawer } from "../../ui/Drawer";
import { Button, Input, Label, Textarea } from "../../ui/primitives";
import { useCreateCandidate, useDesignations, useUpdateCandidate, type Candidate, type CandidateInput } from "../../../api/hr";
import { useNotify } from "./common";
import { DesignationField } from "./DesignationField";

const SOURCES = ["LinkedIn", "Referral", "Job portal", "Walk-in", "Agency", "Website", "Other"];
const FORM_ID = "candidate-form";

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

interface FormState {
  fullName: string;
  designation: string;
  email: string;
  phone: string;
  source: string;
  experienceYears: string;
  currentCompany: string;
  currentSalary: string;
  expectedSalary: string;
  noticePeriodDays: string;
  notes: string;
}

function initialState(c: Candidate | null, defaultDesignation?: string): FormState {
  return {
    fullName: c?.fullName ?? "",
    designation: c?.designation ?? defaultDesignation ?? "",
    email: str(c?.email),
    phone: str(c?.phone),
    source: str(c?.source),
    experienceYears: str(c?.experienceYears),
    currentCompany: str(c?.currentCompany),
    currentSalary: str(c?.currentSalary),
    expectedSalary: str(c?.expectedSalary),
    noticePeriodDays: str(c?.noticePeriodDays),
    notes: str(c?.notes),
  };
}

function CandidateForm({ initial, designations, onSubmit }: { initial: FormState; designations: string[]; onSubmit: (input: CandidateInput) => void }) {
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!f.fullName.trim()) next.fullName = "Name is required";
    if (!f.designation.trim()) next.designation = "Designation is required";
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) next.email = "Enter a valid email";
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({
      fullName: f.fullName.trim(),
      designation: f.designation.trim(),
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      source: f.source.trim() || null,
      experienceYears: f.experienceYears === "" ? null : f.experienceYears,
      currentCompany: f.currentCompany.trim() || null,
      currentSalary: f.currentSalary === "" ? null : f.currentSalary,
      expectedSalary: f.expectedSalary === "" ? null : f.expectedSalary,
      noticePeriodDays: f.noticePeriodDays === "" ? null : f.noticePeriodDays,
      notes: f.notes.trim() || null,
    });
  }

  return (
    <form id={FORM_ID} onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <Label required>Full name</Label>
        <Input value={f.fullName} onChange={set("fullName")} error={errors.fullName} maxLength={200} autoFocus />
      </div>
      <div>
        <Label required>Applied designation</Label>
        <DesignationField value={f.designation} onChange={(designation) => setF((s) => ({ ...s, designation }))} designations={designations} error={errors.designation} />
      </div>
      <div>
        <Label>Email</Label>
        <Input type="email" value={f.email} onChange={set("email")} error={errors.email} maxLength={200} />
      </div>
      <div>
        <Label>Phone</Label>
        <Input value={f.phone} onChange={set("phone")} maxLength={50} />
      </div>
      <div>
        <Label>Source</Label>
        <Input value={f.source} onChange={set("source")} list="candidate-sources" maxLength={100} />
        <datalist id="candidate-sources">
          {SOURCES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <div>
        <Label>Experience (years)</Label>
        <Input type="number" min={0} step="0.5" value={f.experienceYears} onChange={set("experienceYears")} />
      </div>
      <div>
        <Label>Current company</Label>
        <Input value={f.currentCompany} onChange={set("currentCompany")} maxLength={200} />
      </div>
      <div>
        <Label>Notice period (days)</Label>
        <Input type="number" min={0} step="1" value={f.noticePeriodDays} onChange={set("noticePeriodDays")} />
      </div>
      <div>
        <Label>Current salary (AED / month)</Label>
        <Input type="number" min={0} step="0.01" value={f.currentSalary} onChange={set("currentSalary")} />
      </div>
      <div>
        <Label>Expected salary (AED / month)</Label>
        <Input type="number" min={0} step="0.01" value={f.expectedSalary} onChange={set("expectedSalary")} />
      </div>
      <div className="sm:col-span-2">
        <Label>Notes</Label>
        <Textarea rows={4} value={f.notes} onChange={set("notes")} maxLength={4000} />
      </div>
    </form>
  );
}

export function CandidateFormDrawer({
  open,
  candidate,
  defaultDesignation,
  onClose,
  onSaved,
}: {
  open: boolean;
  candidate: Candidate | null;
  defaultDesignation?: string;
  onClose: () => void;
  onSaved?: (c: Candidate) => void;
}) {
  const notify = useNotify();
  const create = useCreateCandidate();
  const update = useUpdateCandidate();
  const { data: designations } = useDesignations();
  const pending = create.isPending || update.isPending;

  async function save(input: CandidateInput) {
    try {
      const saved = candidate ? await update.mutateAsync({ id: candidate.id, input }) : await create.mutateAsync(input);
      notify.success(candidate ? "Candidate updated" : "Candidate added", saved.fullName);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      notify.error(err, candidate ? "Could not update candidate" : "Could not add candidate");
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={candidate ? "Edit candidate" : "Add candidate"}
      subtitle={candidate ? candidate.fullName : "Capture the candidate's profile to start the pipeline"}
      widthClassName="md:w-[640px] md:max-w-[92vw]"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={pending}>
            {candidate ? "Save changes" : "Add candidate"}
          </Button>
        </>
      }
    >
      <CandidateForm initial={initialState(candidate, defaultDesignation)} designations={(designations ?? []).map((d) => d.name)} onSubmit={save} />
    </Drawer>
  );
}
