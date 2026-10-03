import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, UserCheck, UserPlus } from "lucide-react";
import { useCandidates, useConvertCandidate, useUpdateJoining, type Candidate } from "../../../api/hr";
import { useDepartments } from "../../../api/misc";
import { Button, Card, Checkbox, EmptyState, ErrorState, Input, Label, Select, Textarea } from "../../../components/ui/primitives";
import { Modal } from "../../../components/ui/Modal";
import { fmtDate, fmtMoney, toDateInput } from "../../../lib/hrFormat";
import { CandidateStatusBadge, RecruitmentHeader, TableSkeleton, useNotify } from "../../../components/hr/recruitment/common";

const CHECKLIST: Array<{ key: string; label: string }> = [
  { key: "documentsReceived", label: "Documents received" },
  { key: "medicalDone", label: "Medical done" },
  { key: "idCardIssued", label: "ID card issued" },
  { key: "laptopIssued", label: "Laptop issued" },
  { key: "emailCreated", label: "Email created" },
];
const CONVERT_FORM = "convert-form";

type JoiningStatus = NonNullable<Candidate["joiningStatus"]>;

function JoiningCard({ candidate: c, onConvert }: { candidate: Candidate; onConvert: (c: Candidate) => void }) {
  const notify = useNotify();
  const update = useUpdateJoining();
  const [joiningDate, setJoiningDate] = useState(toDateInput(c.joiningDate));
  const [status, setStatus] = useState<JoiningStatus>(c.joiningStatus ?? "PENDING");
  const [notes, setNotes] = useState(c.joiningNotes ?? "");
  const [checklist, setChecklist] = useState<Record<string, boolean>>(c.joiningChecklist ?? {});

  const joined = c.status === "JOINED";
  const done = CHECKLIST.filter((i) => checklist[i.key]).length;

  async function save() {
    try {
      await update.mutateAsync({
        id: c.id,
        input: { joiningDate: joiningDate || null, joiningStatus: status, joiningNotes: notes.trim() || null, joiningChecklist: checklist },
      });
      notify.success("Joining details saved", c.fullName);
    } catch (err) {
      notify.error(err, "Could not save joining details");
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-900">{c.fullName}</p>
            <CandidateStatusBadge status={c.status} />
          </div>
          <p className="text-xs text-slate-500">
            {c.offeredDesignation ?? c.designation} · offer {c.offerRefNo ?? "—"} · AED {fmtMoney(c.offeredSalary)}/month
          </p>
        </div>
        {joined ? (
          c.employeeId && (
            <Link
              to={`/hrms/employees/${c.employeeId}`}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              View employee profile <ArrowRight className="h-4 w-4" />
            </Link>
          )
        ) : (
          <Button size="sm" onClick={() => onConvert(c)}>
            <UserPlus className="h-3.5 w-3.5" /> Convert to employee
          </Button>
        )}
      </div>

      {joined ? (
        <p className="text-sm text-slate-600">
          Joined on {fmtDate(c.joiningDate)}. {c.joiningNotes}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Joining date</Label>
              <Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
            </div>
            <div>
              <Label>Joining status</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value as JoiningStatus)}>
                <option value="PENDING">Pending</option>
                <option value="JOINED">Joined</option>
                <option value="NO_SHOW">No show</option>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="!mb-0">Onboarding checklist</Label>
              <span className="text-xs text-slate-500">
                {done}/{CHECKLIST.length} done
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {CHECKLIST.map((i) => (
                <label key={i.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <Checkbox checked={!!checklist[i.key]} onChange={(e) => setChecklist((s) => ({ ...s, [i.key]: e.target.checked }))} />
                  {i.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={save} loading={update.isPending}>
              Save joining details
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function ConvertForm({ departments, onSubmit }: { departments: Array<{ id: string; name: string }>; onSubmit: (workEmail: string, departmentId: string | null) => void }) {
  const [email, setEmail] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid work email.");
    setError("");
    onSubmit(email.trim(), departmentId || null);
  }

  return (
    <form id={CONVERT_FORM} onSubmit={submit} className="space-y-3">
      <div>
        <Label required>Work email</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" error={error} autoFocus />
      </div>
      <div>
        <Label>Department</Label>
        <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">No department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-xs text-slate-500">The offered designation, salary structure and joining date are carried over to the new employee record.</p>
    </form>
  );
}

export default function JoiningPage() {
  const notify = useNotify();
  const { data, isLoading, isError, refetch } = useCandidates();
  const { data: departments } = useDepartments();
  const convert = useConvertCandidate();

  const [converting, setConverting] = useState<Candidate | null>(null);
  const [result, setResult] = useState<{ id: string; employeeCode: string } | null>(null);

  const rows = useMemo(() => (data ?? []).filter((c) => c.status === "ACCEPTED" || c.status === "JOINED"), [data]);

  function closeConvert() {
    setConverting(null);
    setResult(null);
  }

  async function doConvert(workEmail: string, departmentId: string | null) {
    if (!converting) return;
    try {
      const employee = await convert.mutateAsync({ id: converting.id, workEmail, departmentId });
      setResult(employee);
      notify.success("Converted to employee", `${converting.fullName} is now ${employee.employeeCode}`);
    } catch (err) {
      notify.error(err, "Could not convert candidate");
    }
  }

  return (
    <div className="space-y-4">
      <RecruitmentHeader title="Joining Details" description="Track onboarding for candidates who accepted their offer and convert them into employees." />

      {isLoading && <TableSkeleton rows={3} />}
      {isError && <ErrorState message="Could not load candidates." onRetry={() => refetch()} />}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState icon={<UserCheck className="h-8 w-8" />} title="No accepted offers yet" description="Candidates appear here once they accept their offer letter." />
      )}

      {!isLoading && !isError && (
        <div className="space-y-3">
          {rows.map((c) => (
            <JoiningCard
              key={`${c.id}:${c.status}:${c.joiningDate}:${c.joiningStatus}:${c.joiningNotes}:${JSON.stringify(c.joiningChecklist)}`}
              candidate={c}
              onConvert={setConverting}
            />
          ))}
        </div>
      )}

      <Modal
        open={!!converting}
        onClose={closeConvert}
        title={result ? "Employee created" : "Convert to employee"}
        description={converting ? `${converting.fullName} · ${converting.offeredDesignation ?? converting.designation}` : undefined}
        footer={
          result ? (
            <>
              <Button variant="outline" onClick={closeConvert}>
                Close
              </Button>
              <Link to={`/hrms/employees/${result.id}`}>
                <Button>
                  Open employee profile <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={closeConvert} disabled={convert.isPending}>
                Cancel
              </Button>
              <Button type="submit" form={CONVERT_FORM} loading={convert.isPending}>
                Convert
              </Button>
            </>
          )
        }
      >
        {result ? (
          <p className="text-sm text-slate-700">
            {converting?.fullName} is now employee <strong>{result.employeeCode}</strong>. Their offer salary and joining date have been added to the new profile.
          </p>
        ) : (
          <ConvertForm departments={(departments ?? []) as Array<{ id: string; name: string }>} onSubmit={doConvert} />
        )}
      </Modal>
    </div>
  );
}
