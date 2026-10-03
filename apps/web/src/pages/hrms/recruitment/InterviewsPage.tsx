import React, { useMemo, useState } from "react";
import clsx from "clsx";
import { Ban, CalendarClock, CalendarPlus, Mail, MailCheck, MessageSquarePlus, Trash2, Video } from "lucide-react";
import {
  useCandidates,
  useDeleteInterview,
  useInterviews,
  useScheduleInterview,
  useSendInterviewInvite,
  useUpdateInterview,
  type Candidate,
  type CandidateInterview,
  type InterviewInput,
} from "../../../api/hr";
import { Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, Label, Select, Textarea } from "../../../components/ui/primitives";
import { Modal } from "../../../components/ui/Modal";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { fmtDate, titleCase } from "../../../lib/hrFormat";
import {
  INTERVIEW_MODE_LABEL,
  INTERVIEW_RESULT_TONE,
  INTERVIEW_STATUS_TONE,
  RecruitmentHeader,
  TableSkeleton,
  useNotify,
} from "../../../components/hr/recruitment/common";
import { EmailChipsInput } from "../../../components/hr/recruitment/EmailChipsInput";

type ScheduleInput = InterviewInput & { sendInvite?: boolean; cc?: string[]; message?: string | null };

const CC_STORAGE_KEY = "hr.interviewInvite.cc";
const loadLastCc = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(CC_STORAGE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
};
const saveLastCc = (cc: string[]) => {
  try {
    localStorage.setItem(CC_STORAGE_KEY, JSON.stringify(cc));
  } catch {
    // remembering the CC list is a convenience only
  }
};

const LOCATION_LABEL: Record<NonNullable<InterviewInput["mode"]>, { label: string; placeholder: string }> = {
  ONSITE: { label: "Location", placeholder: "e.g. Q Plus office, Business Bay" },
  VIDEO: { label: "Meeting link", placeholder: "https://meet.google.com/…" },
  PHONE: { label: "Phone / dial-in", placeholder: "Number the candidate will be called on" },
};

/** To / CC / message block shared by "Schedule interview" and "Send invite". */
function InvitePanel({
  toEmail,
  cc,
  onCc,
  message,
  onMessage,
}: {
  toEmail: string | null | undefined;
  cc: string[];
  onCc: (v: string[]) => void;
  message: string;
  onMessage: (v: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div>
        <Label>To</Label>
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{toEmail ?? <span className="text-slate-400">Select a candidate</span>}</p>
      </div>
      <div>
        <Label>CC</Label>
        <EmailChipsInput value={cc} onChange={onCc} placeholder="Add CC — type an email and press Enter" />
      </div>
      <div>
        <Label>Message (optional)</Label>
        <Textarea rows={3} value={message} onChange={(e) => onMessage(e.target.value)} maxLength={2000} placeholder="Anything you'd like the candidate to know or bring…" />
      </div>
    </div>
  );
}

type View = "UPCOMING" | "PAST" | "ALL";
const ROUNDS = ["Screening", "Technical", "HR", "Managerial", "Final"];
const SCHEDULE_FORM = "schedule-interview-form";
const FEEDBACK_FORM = "interview-feedback-form";

function dayKey(iso: string) {
  return fmtDate(iso, "yyyy-MM-dd");
}

function dayLabel(key: string) {
  const today = fmtDate(new Date(), "yyyy-MM-dd");
  const tomorrow = fmtDate(new Date(Date.now() + 86400000), "yyyy-MM-dd");
  const base = fmtDate(key + "T00:00:00", "EEEE, d MMM yyyy");
  return key === today ? `Today · ${base}` : key === tomorrow ? `Tomorrow · ${base}` : base;
}

function ScheduleForm({ candidates, onSubmit }: { candidates: Candidate[]; onSubmit: (candidateId: string, input: ScheduleInput) => void }) {
  const [candidateId, setCandidateId] = useState("");
  const [round, setRound] = useState("");
  const [when, setWhen] = useState("");
  const [mode, setMode] = useState<InterviewInput["mode"]>("ONSITE");
  const [interviewer, setInterviewer] = useState("");
  const [locationOrLink, setLocationOrLink] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [cc, setCc] = useState<string[]>(loadLastCc);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const candidate = candidates.find((c) => c.id === candidateId);
  const canEmail = !!candidate?.email;
  const invite = sendInvite && canEmail;
  const where = LOCATION_LABEL[mode ?? "ONSITE"];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!candidateId || !round.trim() || !when || !interviewer.trim()) return setError("Candidate, round, date & time and interviewer are required.");
    const date = new Date(when);
    if (isNaN(date.getTime())) return setError("Enter a valid date and time.");
    setError("");
    if (invite) saveLastCc(cc);
    onSubmit(candidateId, {
      round: round.trim(),
      scheduledAt: date.toISOString(),
      mode,
      interviewerName: interviewer.trim(),
      locationOrLink: locationOrLink.trim() || null,
      ...(invite ? { sendInvite: true, cc, message: message.trim() || null } : {}),
    });
  }

  return (
    <form id={SCHEDULE_FORM} onSubmit={submit} className="space-y-3">
      <div>
        <Label required>Candidate</Label>
        <Select value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
          <option value="">Select a candidate…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName} — {c.designation}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label required>Round</Label>
          <Input value={round} onChange={(e) => setRound(e.target.value)} list="interview-rounds" maxLength={100} placeholder="e.g. Technical" />
          <datalist id="interview-rounds">
            {ROUNDS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
        <div>
          <Label required>Date &amp; time</Label>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div>
          <Label>Mode</Label>
          <Select value={mode} onChange={(e) => setMode(e.target.value as InterviewInput["mode"])}>
            {Object.entries(INTERVIEW_MODE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label required>Interviewer</Label>
          <Input value={interviewer} onChange={(e) => setInterviewer(e.target.value)} maxLength={200} />
        </div>
      </div>
      <div>
        <Label>{where.label}</Label>
        <Input value={locationOrLink} onChange={(e) => setLocationOrLink(e.target.value)} maxLength={300} placeholder={where.placeholder} />
      </div>

      <div className="space-y-2.5 border-t border-slate-100 pt-3">
        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox checked={invite} disabled={!canEmail} onChange={(e) => setSendInvite(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="flex items-center gap-1.5 font-medium text-slate-800">
              <Mail className="h-4 w-4 text-slate-400" /> Email an invitation to the candidate
            </span>
            <span className="block text-xs text-slate-500">
              {!candidateId
                ? "Includes the date, time, mode and a calendar entry."
                : canEmail
                  ? "Includes the date, time, mode and a calendar entry. Replies go to you."
                  : "This candidate has no email address — add one in Candidate Management to send an invitation."}
            </span>
          </span>
        </label>
        {invite && <InvitePanel toEmail={candidate?.email} cc={cc} onCc={setCc} message={message} onMessage={setMessage} />}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function SendInviteForm({
  interview,
  pending,
  onCancel,
  onSend,
}: {
  interview: CandidateInterview;
  pending: boolean;
  onCancel: () => void;
  onSend: (cc: string[], message: string) => void;
}) {
  const [cc, setCc] = useState<string[]>(loadLastCc);
  const [message, setMessage] = useState("");
  const email = interview.candidate?.email;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend(cc, message);
      }}
      className="space-y-3"
    >
      {!email && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">This candidate has no email address. Add one in Candidate Management first.</p>}
      <InvitePanel toEmail={email} cc={cc} onCc={setCc} message={message} onMessage={setMessage} />
      {interview.inviteSentAt && <p className="text-xs text-slate-500">Last sent {fmtDate(interview.inviteSentAt, "d MMM yyyy, h:mm a")}. Sending again emails the candidate a fresh copy.</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} disabled={!email}>
          <Mail className="h-4 w-4" /> {interview.inviteSentAt ? "Resend invitation" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}

function FeedbackForm({ interview, onSubmit }: { interview: CandidateInterview; onSubmit: (input: Partial<InterviewInput>) => void }) {
  const [status, setStatus] = useState<CandidateInterview["status"]>(interview.status === "SCHEDULED" ? "COMPLETED" : interview.status);
  const [rating, setRating] = useState(interview.rating ? String(interview.rating) : "");
  const [result, setResult] = useState<string>(interview.result ?? "");
  const [feedback, setFeedback] = useState(interview.feedback ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      status,
      rating: rating === "" ? null : Number(rating),
      result: (result || null) as InterviewInput["result"],
      feedback: feedback.trim() || null,
    });
  }

  return (
    <form id={FEEDBACK_FORM} onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as CandidateInterview["status"])}>
            {(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const).map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Rating (1–5)</Label>
          <Select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">Not rated</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Result</Label>
          <Select value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="">Pending</option>
            <option value="PASS">Pass</option>
            <option value="FAIL">Fail</option>
            <option value="HOLD">Hold</option>
          </Select>
        </div>
      </div>
      <div>
        <Label>Feedback</Label>
        <Textarea rows={5} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={4000} placeholder="Strengths, concerns, recommendation…" />
      </div>
    </form>
  );
}

export default function InterviewsPage() {
  const notify = useNotify();
  const { data, isLoading, isError, refetch } = useInterviews();
  const { data: candidateData } = useCandidates();
  const schedule = useScheduleInterview();
  const update = useUpdateInterview();
  const del = useDeleteInterview();
  const sendInvite = useSendInterviewInvite();

  const [view, setView] = useState<View>("UPCOMING");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<CandidateInterview | null>(null);
  const [cancelling, setCancelling] = useState<CandidateInterview | null>(null);
  const [deleting, setDeleting] = useState<CandidateInterview | null>(null);
  const [inviteFor, setInviteFor] = useState<CandidateInterview | null>(null);

  const interviews = data ?? [];
  const schedulable = useMemo(() => (candidateData ?? []).filter((c) => c.status !== "REJECTED" && c.status !== "JOINED"), [candidateData]);

  const { upcoming, past } = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const up = interviews.filter((i) => i.status === "SCHEDULED" && new Date(i.scheduledAt) >= startOfToday);
    const upIds = new Set(up.map((i) => i.id));
    return {
      upcoming: up.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
      past: interviews.filter((i) => !upIds.has(i.id)).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
    };
  }, [interviews]);

  const list = view === "UPCOMING" ? upcoming : view === "PAST" ? past : [...interviews].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const groups = useMemo(() => {
    const map = new Map<string, CandidateInterview[]>();
    list.forEach((i) => {
      const k = dayKey(i.scheduledAt);
      map.set(k, [...(map.get(k) ?? []), i]);
    });
    return Array.from(map.entries());
  }, [list]);

  async function doSchedule(candidateId: string, input: ScheduleInput) {
    try {
      const saved = await schedule.mutateAsync({ candidateId, input });
      const inv = saved.invite;
      if (inv?.sent) notify.success("Interview scheduled", `Invitation emailed to ${inv.to}${inv.cc?.length ? ` · cc ${inv.cc.join(", ")}` : ""}`);
      else if (inv) notify.fail("Interview scheduled, but the invitation email failed", `${inv.error ?? "Unknown error"} You can resend it from the interview.`);
      else notify.success("Interview scheduled");
      setScheduleOpen(false);
      setView("UPCOMING");
    } catch (err) {
      notify.error(err, "Could not schedule interview");
    }
  }

  async function doSendInvite(cc: string[], message: string) {
    if (!inviteFor) return;
    try {
      const sent = await sendInvite.mutateAsync({ id: inviteFor.id, cc, message: message.trim() || null });
      saveLastCc(cc);
      notify.success("Invitation sent", `${sent.to}${sent.cc.length ? ` · cc ${sent.cc.join(", ")}` : ""}`);
      setInviteFor(null);
    } catch (err) {
      notify.error(err, "Could not send the invitation");
    }
  }

  async function saveFeedback(input: Partial<InterviewInput>) {
    if (!feedbackFor) return;
    try {
      await update.mutateAsync({ id: feedbackFor.id, input });
      notify.success("Feedback saved", feedbackFor.candidate?.fullName);
      setFeedbackFor(null);
    } catch (err) {
      notify.error(err, "Could not save feedback");
    }
  }

  async function confirmCancel() {
    if (!cancelling) return;
    try {
      await update.mutateAsync({ id: cancelling.id, input: { status: "CANCELLED" } });
      notify.success("Interview cancelled", cancelling.candidate?.fullName);
      setCancelling(null);
    } catch (err) {
      notify.error(err, "Could not cancel interview");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      notify.success("Interview deleted");
      setDeleting(null);
    } catch (err) {
      notify.error(err, "Could not delete interview");
    }
  }

  const tabs: Array<{ key: View; label: string; count: number }> = [
    { key: "UPCOMING", label: "Upcoming", count: upcoming.length },
    { key: "PAST", label: "Past", count: past.length },
    { key: "ALL", label: "All", count: interviews.length },
  ];

  return (
    <div className="space-y-4">
      <RecruitmentHeader
        title="Interview Management"
        description="Schedule interview rounds and record feedback for every candidate."
        actions={
          <Button onClick={() => setScheduleOpen(true)}>
            <CalendarPlus className="h-4 w-4" /> Schedule interview
          </Button>
        }
      />

      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={clsx(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            )}
          >
            {t.label} <span className="text-xs text-slate-400">{t.count}</span>
          </button>
        ))}
      </div>

      {isLoading && <TableSkeleton />}
      {isError && <ErrorState message="Could not load interviews." onRetry={() => refetch()} />}
      {!isLoading && !isError && groups.length === 0 && (
        <EmptyState
          icon={<CalendarClock className="h-8 w-8" />}
          title={view === "UPCOMING" ? "No upcoming interviews" : view === "PAST" ? "No past interviews" : "No interviews yet"}
          description="Schedule an interview to move a candidate through the pipeline."
          action={
            <Button onClick={() => setScheduleOpen(true)}>
              <CalendarPlus className="h-4 w-4" /> Schedule interview
            </Button>
          }
        />
      )}

      {!isLoading &&
        !isError &&
        groups.map(([key, items]) => (
          <section key={key} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">{dayLabel(key)}</h2>
            <Card className="divide-y divide-slate-100">
              {items.map((i) => (
                <div key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-1 basis-64 gap-3">
                    <div className="w-16 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-slate-800">{fmtDate(i.scheduledAt, "h:mm a")}</div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        {i.candidate?.fullName ?? "Candidate"} <span className="font-normal text-slate-500">· {i.candidate?.designation}</span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span>{i.round}</span>
                        <span className="inline-flex items-center gap-1">
                          <Video className="h-3 w-3" /> {INTERVIEW_MODE_LABEL[i.mode]}
                        </span>
                        <span>with {i.interviewerName}</span>
                        {i.locationOrLink && <span className="truncate">· {i.locationOrLink}</span>}
                      </p>
                      {i.inviteSentAt && (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700">
                          <MailCheck className="h-3.5 w-3.5" /> Invitation sent {fmtDate(i.inviteSentAt, "d MMM, h:mm a")}
                          {i.inviteSentTo ? ` to ${i.inviteSentTo}` : ""}
                          {i.inviteCc ? ` · cc ${i.inviteCc}` : ""}
                        </p>
                      )}
                      {i.feedback && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-600">{i.feedback}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={INTERVIEW_STATUS_TONE[i.status]}>{titleCase(i.status)}</Badge>
                    {i.result && <Badge tone={INTERVIEW_RESULT_TONE[i.result]}>{titleCase(i.result)}</Badge>}
                    {i.rating !== null && <Badge>{i.rating}/5</Badge>}
                    <Button size="sm" variant="outline" onClick={() => setFeedbackFor(i)}>
                      <MessageSquarePlus className="h-3.5 w-3.5" /> {i.status === "SCHEDULED" ? "Record feedback" : "Edit feedback"}
                    </Button>
                    {i.status === "SCHEDULED" && (
                      <Button size="sm" variant="outline" onClick={() => setInviteFor(i)}>
                        <Mail className="h-3.5 w-3.5" /> {i.inviteSentAt ? "Resend invite" : "Send invite"}
                      </Button>
                    )}
                    {i.status === "SCHEDULED" && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(i)} aria-label="Cancel interview">
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDeleting(i)} aria-label="Delete interview">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        ))}

      <Modal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Schedule interview"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setScheduleOpen(false)} disabled={schedule.isPending}>
              Cancel
            </Button>
            <Button type="submit" form={SCHEDULE_FORM} loading={schedule.isPending}>
              Schedule
            </Button>
          </>
        }
      >
        <ScheduleForm candidates={schedulable} onSubmit={doSchedule} />
      </Modal>

      <Modal
        open={!!inviteFor}
        onClose={() => setInviteFor(null)}
        title={inviteFor?.inviteSentAt ? "Resend interview invitation" : "Send interview invitation"}
        description={inviteFor ? `${inviteFor.candidate?.fullName ?? "Candidate"} · ${inviteFor.round} · ${fmtDate(inviteFor.scheduledAt, "d MMM yyyy, h:mm a")}` : undefined}
        size="lg"
      >
        {inviteFor && <SendInviteForm key={inviteFor.id} interview={inviteFor} pending={sendInvite.isPending} onCancel={() => setInviteFor(null)} onSend={doSendInvite} />}
      </Modal>

      <Modal
        open={!!feedbackFor}
        onClose={() => setFeedbackFor(null)}
        title="Record feedback"
        description={feedbackFor ? `${feedbackFor.candidate?.fullName ?? "Candidate"} · ${feedbackFor.round} · ${fmtDate(feedbackFor.scheduledAt, "d MMM yyyy, h:mm a")}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setFeedbackFor(null)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button type="submit" form={FEEDBACK_FORM} loading={update.isPending}>
              Save feedback
            </Button>
          </>
        }
      >
        {feedbackFor && <FeedbackForm key={feedbackFor.id} interview={feedbackFor} onSubmit={saveFeedback} />}
      </Modal>

      <ConfirmDialog
        open={!!cancelling}
        title="Cancel interview"
        message={
          <>
            Cancel the <strong>{cancelling?.round}</strong> interview with <strong>{cancelling?.candidate?.fullName}</strong>? It stays in the list as cancelled.
          </>
        }
        confirmLabel="Cancel interview"
        loading={update.isPending}
        onConfirm={confirmCancel}
        onCancel={() => setCancelling(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Delete interview"
        message={
          <>
            Delete the <strong>{deleting?.round}</strong> interview with <strong>{deleting?.candidate?.fullName}</strong>? This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
