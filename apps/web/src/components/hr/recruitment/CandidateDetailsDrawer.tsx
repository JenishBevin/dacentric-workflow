import React from "react";
import { Download, Eye, Pencil } from "lucide-react";
import { Drawer } from "../../ui/Drawer";
import { Avatar, Badge, Button } from "../../ui/primitives";
import type { Candidate } from "../../../api/hr";
import { fmtDate, fmtMoney, titleCase } from "../../../lib/hrFormat";
import {
  CandidateStatusBadge,
  fmtExperience,
  fmtFileSize,
  INTERVIEW_MODE_LABEL,
  INTERVIEW_RESULT_TONE,
  INTERVIEW_STATUS_TONE,

} from "./common";
import { useCvActions } from "./useCvActions";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children || "—"}</dd>
    </div>
  );
}

export function CandidateDetailsDrawer({ candidate, onClose, onEdit }: { candidate: Candidate | null; onClose: () => void; onEdit: (c: Candidate) => void }) {
  const cv = useCvActions();
  const interviews = candidate?.interviews ?? [];

  return (
    <Drawer
      open={!!candidate}
      onClose={onClose}
      title={candidate?.fullName ?? ""}
      subtitle={candidate?.designation}
      widthClassName="md:w-[640px] md:max-w-[92vw]"
      footer={
        candidate && (
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => onEdit(candidate)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </>
        )
      }
    >
      {candidate && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Avatar name={candidate.fullName} size="lg" />
            <div className="space-y-1">
              <CandidateStatusBadge status={candidate.status} />
              <p className="text-xs text-slate-500">
                Added {fmtDate(candidate.createdAt)} by {candidate.createdByName}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email">{candidate.email}</Field>
            <Field label="Phone">{candidate.phone}</Field>
            <Field label="Source">{candidate.source}</Field>
            <Field label="Experience">{fmtExperience(candidate.experienceYears)}</Field>
            <Field label="Current company">{candidate.currentCompany}</Field>
            <Field label="Notice period">{candidate.noticePeriodDays !== null ? `${candidate.noticePeriodDays} days` : null}</Field>
            <Field label="Current salary">{candidate.currentSalary !== null ? `AED ${fmtMoney(candidate.currentSalary)}` : null}</Field>
            <Field label="Expected salary">{candidate.expectedSalary !== null ? `AED ${fmtMoney(candidate.expectedSalary)}` : null}</Field>
          </dl>

          <section>
            <h3 className="mb-1 text-sm font-semibold text-slate-900">Notes</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{candidate.notes || "No notes."}</p>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">CV</h3>
            {candidate.cvFileName ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{candidate.cvFileName}</p>
                  <p className="text-xs text-slate-500">
                    {fmtFileSize(candidate.cvFileSizeBytes)} · uploaded {fmtDate(candidate.cvUploadedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => cv.preview(candidate)}>
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => cv.download(candidate)}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No CV uploaded. Add one from the CV Bank.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Interviews</h3>
            {interviews.length === 0 ? (
              <p className="text-sm text-slate-500">No interviews scheduled yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {interviews.map((i) => (
                  <li key={i.id} className="space-y-1 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{i.round}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={INTERVIEW_STATUS_TONE[i.status]}>{titleCase(i.status)}</Badge>
                        {i.result && <Badge tone={INTERVIEW_RESULT_TONE[i.result]}>{titleCase(i.result)}</Badge>}
                        {i.rating !== null && <Badge tone="slate">{i.rating}/5</Badge>}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      {fmtDate(i.scheduledAt, "d MMM yyyy, h:mm a")} · {INTERVIEW_MODE_LABEL[i.mode]} · {i.interviewerName}
                    </p>
                    {i.feedback && <p className="whitespace-pre-wrap text-sm text-slate-600">{i.feedback}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
