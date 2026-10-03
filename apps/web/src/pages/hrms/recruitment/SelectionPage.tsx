import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { ArrowRight, CheckCircle2, Undo2, UserCheck, XCircle } from "lucide-react";
import { useCandidates, useSetCandidateStatus, type Candidate, type CandidateStatus } from "../../../api/hr";
import { Badge, Button, Card, EmptyState, ErrorState } from "../../../components/ui/primitives";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { fmtMoney, titleCase } from "../../../lib/hrFormat";
import {
  CandidateStatusBadge,
  fmtExperience,
  INTERVIEW_RESULT_TONE,
  interviewSummary,
  RecruitmentHeader,
  TableSkeleton,
  useNotify,
} from "../../../components/hr/recruitment/common";

type Tab = "AWAITING" | "SELECTED" | "REJECTED";
const TAB_STATUSES: Record<Tab, CandidateStatus[]> = {
  AWAITING: ["NEW", "SCREENING", "INTERVIEW"],
  SELECTED: ["SELECTED"],
  REJECTED: ["REJECTED"],
};
const TAB_LABEL: Record<Tab, string> = { AWAITING: "Awaiting decision", SELECTED: "Selected", REJECTED: "Rejected" };
const EMPTY: Record<Tab, string> = {
  AWAITING: "No candidates are waiting for a decision.",
  SELECTED: "No candidates have been selected yet.",
  REJECTED: "No candidates have been rejected.",
};

export default function SelectionPage() {
  const notify = useNotify();
  const { data, isLoading, isError, refetch } = useCandidates();
  const setStatus = useSetCandidateStatus();
  const [tab, setTab] = useState<Tab>("AWAITING");
  const [rejecting, setRejecting] = useState<Candidate | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const candidates = data ?? [];
  const byTab = useMemo(() => {
    const out = {} as Record<Tab, Candidate[]>;
    (Object.keys(TAB_STATUSES) as Tab[]).forEach((t) => (out[t] = candidates.filter((c) => TAB_STATUSES[t].includes(c.status))));
    return out;
  }, [candidates]);

  async function move(c: Candidate, status: CandidateStatus, message: string) {
    setBusyId(c.id);
    try {
      await setStatus.mutateAsync({ id: c.id, status });
      notify.success(message, c.fullName);
      return true;
    } catch (err) {
      notify.error(err, "Could not update candidate");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    if (await move(rejecting, "REJECTED", "Candidate rejected")) setRejecting(null);
  }

  const rows = byTab[tab];

  return (
    <div className="space-y-4">
      <RecruitmentHeader title="Candidate Selection" description="Review interview results and decide who moves forward to an offer." />

      <div className="inline-flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-1">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            )}
          >
            {TAB_LABEL[t]} <span className="text-xs text-slate-400">{byTab[t].length}</span>
          </button>
        ))}
      </div>

      {isLoading && <TableSkeleton />}
      {isError && <ErrorState message="Could not load candidates." onRetry={() => refetch()} />}
      {!isLoading && !isError && rows.length === 0 && <EmptyState icon={<UserCheck className="h-8 w-8" />} title={EMPTY[tab]} />}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((c) => {
            const s = interviewSummary(c.interviews);
            const busy = busyId === c.id;
            return (
              <Card key={c.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1 basis-72 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{c.fullName}</p>
                    <CandidateStatusBadge status={c.status} />
                  </div>
                  <p className="text-xs text-slate-500">
                    {c.designation} · {fmtExperience(c.experienceYears)} experience · expects AED {fmtMoney(c.expectedSalary)}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    {s.rounds === 0 ? (
                      <span>No interviews yet</span>
                    ) : (
                      <>
                        <span>
                          {s.rounds} {s.rounds === 1 ? "round" : "rounds"} ({s.completed} completed)
                        </span>
                        {s.avgRating !== null && <Badge>Avg {s.avgRating.toFixed(1)}/5</Badge>}
                        {s.results.map((r, idx) => (
                          <Badge key={idx} tone={INTERVIEW_RESULT_TONE[r.result]}>
                            {r.round}: {titleCase(r.result)}
                          </Badge>
                        ))}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {tab !== "SELECTED" && (
                    <Button size="sm" disabled={busy} onClick={() => move(c, "SELECTED", "Candidate selected")}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Select
                    </Button>
                  )}
                  {tab !== "REJECTED" && (
                    <Button size="sm" variant="outline" className="text-red-600" disabled={busy} onClick={() => setRejecting(c)}>
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </Button>
                  )}
                  {tab !== "AWAITING" && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => move(c, "SCREENING", "Moved back to the pipeline")}>
                      <Undo2 className="h-3.5 w-3.5" /> Move back to pipeline
                    </Button>
                  )}
                  {tab === "SELECTED" && (
                    <Link
                      to="/hrms/recruitment/offers"
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                    >
                      Make offer <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!rejecting}
        title="Reject candidate"
        message={
          <>
            Reject <strong>{rejecting?.fullName}</strong> for <strong>{rejecting?.designation}</strong>? You can move them back to the pipeline later.
          </>
        }
        confirmLabel="Reject"
        loading={!!rejecting && busyId === rejecting.id}
        onConfirm={confirmReject}
        onCancel={() => setRejecting(null)}
      />
    </div>
  );
}
