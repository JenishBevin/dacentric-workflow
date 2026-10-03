import React, { useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Download, Eye, FilePlus2, FileText, X } from "lucide-react";
import { useCandidates, useMakeOffer, useRespondToOffer, type Candidate, type CandidateStatus, type OfferInput } from "../../../api/hr";
import { Button, Card, EmptyState, ErrorState, Input, Label, Textarea } from "../../../components/ui/primitives";
import { Modal } from "../../../components/ui/Modal";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { CANDIDATE_STATUS_LABEL, fmtDate, fmtMoney, toDateInput } from "../../../lib/hrFormat";
import { CandidateStatusBadge, RecruitmentHeader, TableSkeleton, useNotify } from "../../../components/hr/recruitment/common";
import { openOfferLetter } from "../../../components/hr/recruitment/offerLetter";

const OFFER_STATUSES: CandidateStatus[] = ["SELECTED", "OFFERED", "ACCEPTED", "DECLINED", "JOINED"];
const CAN_OFFER: CandidateStatus[] = ["SELECTED", "OFFERED", "DECLINED"];
const OFFER_FORM = "offer-form";

const num = (v: string) => (v === "" || isNaN(Number(v)) ? 0 : Number(v));
const today = () => fmtDate(new Date(), "yyyy-MM-dd");
const offerTotal = (c: Candidate) => c.offeredSalary ?? (c.offerBasic ?? 0) + (c.offerHousing ?? 0) + (c.offerTransport ?? 0) + (c.offerOther ?? 0);

function OfferForm({ candidate, onSubmit }: { candidate: Candidate; onSubmit: (input: OfferInput) => void }) {
  const [designation, setDesignation] = useState(candidate.offeredDesignation ?? candidate.designation);
  const [basic, setBasic] = useState(candidate.offerBasic !== null ? String(candidate.offerBasic) : "");
  const [housing, setHousing] = useState(candidate.offerHousing !== null ? String(candidate.offerHousing) : "");
  const [transport, setTransport] = useState(candidate.offerTransport !== null ? String(candidate.offerTransport) : "");
  const [other, setOther] = useState(candidate.offerOther !== null ? String(candidate.offerOther) : "");
  const [joiningDate, setJoiningDate] = useState(toDateInput(candidate.joiningDate));
  const [offerDate, setOfferDate] = useState(toDateInput(candidate.offerDate) || today());
  const [terms, setTerms] = useState(candidate.offerTerms ?? "");
  const [error, setError] = useState("");

  const total = num(basic) + num(housing) + num(transport) + num(other);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!designation.trim()) return setError("Offered designation is required.");
    if (num(basic) <= 0) return setError("Basic salary must be greater than zero.");
    if (!joiningDate) return setError("Joining date is required.");
    setError("");
    onSubmit({
      offeredDesignation: designation.trim(),
      offerBasic: num(basic),
      offerHousing: num(housing),
      offerTransport: num(transport),
      offerOther: num(other),
      joiningDate,
      offerDate: offerDate || undefined,
      offerTerms: terms.trim() || null,
    });
  }

  const money = (label: string, value: string, set: (v: string) => void, required = false) => (
    <div>
      <Label required={required}>{label}</Label>
      <Input type="number" min={0} step="0.01" value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <form id={OFFER_FORM} onSubmit={submit} className="space-y-3">
      <div>
        <Label required>Offered designation</Label>
        <Input value={designation} onChange={(e) => setDesignation(e.target.value)} maxLength={200} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {money("Basic salary (AED)", basic, setBasic, true)}
        {money("Housing allowance (AED)", housing, setHousing)}
        {money("Transport allowance (AED)", transport, setTransport)}
        {money("Other allowance (AED)", other, setOther)}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-600">Total monthly package</span>
        <span className="font-semibold text-slate-900">AED {fmtMoney(total)}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label required>Joining date</Label>
          <Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
        </div>
        <div>
          <Label>Offer date</Label>
          <Input type="date" value={offerDate} onChange={(e) => setOfferDate(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Terms &amp; conditions</Label>
        <Textarea rows={5} value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={4000} placeholder="Probation, notice period, working hours, benefits…" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

export default function OfferLettersPage() {
  const notify = useNotify();
  const { data, isLoading, isError, refetch } = useCandidates();
  const makeOffer = useMakeOffer();
  const respond = useRespondToOffer();

  const [filter, setFilter] = useState<CandidateStatus | "ALL">("ALL");
  const [offerFor, setOfferFor] = useState<Candidate | null>(null);
  const [responding, setResponding] = useState<{ candidate: Candidate; response: "ACCEPTED" | "DECLINED" } | null>(null);

  const all = useMemo(() => (data ?? []).filter((c) => OFFER_STATUSES.includes(c.status)), [data]);
  const rows = filter === "ALL" ? all : all.filter((c) => c.status === filter);

  async function saveOffer(input: OfferInput) {
    if (!offerFor) return;
    const isUpdate = !!offerFor.offerRefNo;
    let saved: Candidate;
    try {
      saved = await makeOffer.mutateAsync({ id: offerFor.id, input });
    } catch (err) {
      notify.error(err, "Could not save offer");
      return;
    }
    setOfferFor(null);
    notify.success(isUpdate ? "Offer updated" : "Offer created", `${saved.fullName} · ${saved.offerRefNo}`);
    try {
      await openOfferLetter(saved, "download");
    } catch (err) {
      notify.error(err, "Offer saved, but the letter could not be generated");
    }
  }

  async function confirmRespond() {
    if (!responding) return;
    try {
      await respond.mutateAsync({ id: responding.candidate.id, response: responding.response });
      notify.success(responding.response === "ACCEPTED" ? "Offer accepted" : "Offer declined", responding.candidate.fullName);
      setResponding(null);
    } catch (err) {
      notify.error(err, "Could not record the response");
    }
  }

  const letter = (c: Candidate, mode: "preview" | "download") => openOfferLetter(c, mode).catch((err) => notify.error(err, "Could not generate the letter"));

  return (
    <div className="space-y-4">
      <RecruitmentHeader title="Offer Letter Generation" description="Make offers to selected candidates and generate their offer letters." />

      <div className="flex flex-wrap gap-1.5">
        {(["ALL", ...OFFER_STATUSES] as const).map((s) => {
          const count = s === "ALL" ? all.length : all.filter((c) => c.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === s ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {s === "ALL" ? "All" : CANDIDATE_STATUS_LABEL[s]} <span className={filter === s ? "text-white/80" : "text-slate-400"}>{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading && <TableSkeleton />}
      {isError && <ErrorState message="Could not load candidates." onRetry={() => refetch()} />}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No candidates here yet"
          description="Select candidates in the Selection step and they will appear here, ready for an offer."
        />
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((c) => {
            const hasOffer = !!c.offerRefNo;
            const busy = respond.isPending && responding?.candidate.id === c.id;
            return (
              <Card key={c.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1 basis-72 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{c.fullName}</p>
                    <CandidateStatusBadge status={c.status} />
                  </div>
                  <p className="text-xs text-slate-500">
                    Applied for {c.designation}
                    {c.offeredDesignation && c.offeredDesignation !== c.designation ? ` · offered ${c.offeredDesignation}` : ""}
                  </p>
                  {hasOffer ? (
                    <p className="text-xs text-slate-600">
                      <span className="font-medium">{c.offerRefNo}</span> · {fmtDate(c.offerDate)} · AED {fmtMoney(offerTotal(c))}/month · joining {fmtDate(c.joiningDate)}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400">No offer made yet · expects AED {fmtMoney(c.expectedSalary)}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {CAN_OFFER.includes(c.status) && (
                    <Button size="sm" variant={hasOffer ? "outline" : "primary"} onClick={() => setOfferFor(c)}>
                      <FilePlus2 className="h-3.5 w-3.5" /> {hasOffer ? "Update offer" : "Make offer"}
                    </Button>
                  )}
                  {hasOffer && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => letter(c, "preview")}>
                        <Eye className="h-3.5 w-3.5" /> Preview
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => letter(c, "download")}>
                        <Download className="h-3.5 w-3.5" /> Download
                      </Button>
                    </>
                  )}
                  {c.status === "OFFERED" && (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => setResponding({ candidate: c, response: "ACCEPTED" })}>
                        <Check className="h-3.5 w-3.5" /> Mark accepted
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" disabled={busy} onClick={() => setResponding({ candidate: c, response: "DECLINED" })}>
                        <X className="h-3.5 w-3.5" /> Mark declined
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!offerFor}
        onClose={() => setOfferFor(null)}
        size="lg"
        title={offerFor?.offerRefNo ? "Update offer" : "Make offer"}
        description={offerFor ? `${offerFor.fullName} · applied for ${offerFor.designation}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setOfferFor(null)} disabled={makeOffer.isPending}>
              Cancel
            </Button>
            <Button type="submit" form={OFFER_FORM} loading={makeOffer.isPending}>
              Save &amp; generate letter
            </Button>
          </>
        }
      >
        {offerFor && <OfferForm key={offerFor.id} candidate={offerFor} onSubmit={saveOffer} />}
      </Modal>

      <ConfirmDialog
        open={!!responding}
        title={responding?.response === "ACCEPTED" ? "Mark offer accepted" : "Mark offer declined"}
        message={
          <>
            Record that <strong>{responding?.candidate.fullName}</strong> has {responding?.response === "ACCEPTED" ? "accepted" : "declined"} offer{" "}
            <strong>{responding?.candidate.offerRefNo}</strong>?
          </>
        }
        confirmLabel={responding?.response === "ACCEPTED" ? "Mark accepted" : "Mark declined"}
        destructive={responding?.response === "DECLINED"}
        loading={respond.isPending}
        onConfirm={confirmRespond}
        onCancel={() => setResponding(null)}
      />
    </div>
  );
}
