import React, { useRef, useState } from "react";
import { FileText, UploadCloud, X } from "lucide-react";
import { Modal } from "../../ui/Modal";
import { Button, Input, Label } from "../../ui/primitives";
import { useCreateCandidate, useUploadCv } from "../../../api/hr";
import { CV_ACCEPT, fmtFileSize, useNotify, validateCvFile } from "./common";
import { DesignationField } from "./DesignationField";

/**
 * Files a CV in the bank for future use — creates the candidate as "In CV bank"
 * (not in the interview pipeline) and attaches the CV in one step. The person
 * can be moved into the pipeline later from Candidate Management or by
 * scheduling an interview.
 */
function AddCvForm({ designations, defaultDesignation, onDone }: { designations: string[]; defaultDesignation: string; onDone: () => void }) {
  const notify = useNotify();
  const create = useCreateCandidate();
  const upload = useUploadCv();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState("");
  const [designation, setDesignation] = useState(defaultDesignation);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pending = create.isPending || upload.isPending;

  function pick(f: File | undefined | null) {
    if (!f) return;
    const problem = validateCvFile(f);
    if (problem) {
      setErrors((e) => ({ ...e, file: problem }));
      return;
    }
    setErrors((e) => ({ ...e, file: "" }));
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = "Name is required";
    if (!designation.trim()) next.designation = "Designation is required";
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Enter a valid email";
    if (!file) next.file = "Choose the CV file to upload";
    setErrors(next);
    if (Object.keys(next).length || !file) return;

    let candidateId: string;
    try {
      const saved = await create.mutateAsync({
        fullName: fullName.trim(),
        designation: designation.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        status: "CV_BANK",
      });
      candidateId = saved.id;
    } catch (err) {
      notify.error(err, "Could not add the CV");
      return;
    }
    try {
      await upload.mutateAsync({ id: candidateId, file });
      notify.success("CV added to the bank", `${fullName.trim()} · ${designation.trim()}`);
      onDone();
    } catch (err) {
      notify.error(err, "Candidate saved, but the CV upload failed — use “Upload CV” on their row");
      onDone();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label required>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.fullName} maxLength={200} autoFocus />
        </div>
        <div>
          <Label required>Designation</Label>
          <DesignationField value={designation} onChange={setDesignation} designations={designations} error={errors.designation} />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} maxLength={200} />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} />
        </div>
      </div>

      <div>
        <Label required>CV file</Label>
        <input ref={fileRef} type="file" accept={CV_ACCEPT} className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        {file ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <span className="flex min-w-0 items-center gap-2 text-sm text-emerald-800">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-emerald-700/70">{fmtFileSize(file.size)}</span>
            </span>
            <button type="button" onClick={() => setFile(null)} className="rounded p-1 text-emerald-700 hover:bg-emerald-100" aria-label="Remove file">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm ${
              dragOver ? "border-brand-400 bg-brand-50" : errors.file ? "border-red-300 bg-red-50/40" : "border-slate-300 bg-slate-50 hover:bg-slate-100"
            }`}
          >
            <UploadCloud className="h-5 w-5 text-slate-400" />
            <span className="text-slate-700">Drag the CV here, or click to browse</span>
            <span className="text-xs text-slate-400">PDF, DOC or DOCX up to 25 MB</span>
          </div>
        )}
        {errors.file && <p className="mt-1 text-xs text-red-600">{errors.file}</p>}
      </div>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Saved as <strong>In CV bank</strong> — kept for future openings, no interview needed. You can move them into the interview pipeline any time.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Add CV
        </Button>
      </div>
    </form>
  );
}

export function AddCvModal({
  open,
  onClose,
  designations,
  defaultDesignation = "",
}: {
  open: boolean;
  onClose: () => void;
  designations: string[];
  defaultDesignation?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Add CV to the bank" description="Store a CV for future use, even if the person is not being interviewed now." size="lg">
      {open && <AddCvForm designations={designations} defaultDesignation={defaultDesignation} onDone={onClose} />}
    </Modal>
  );
}
