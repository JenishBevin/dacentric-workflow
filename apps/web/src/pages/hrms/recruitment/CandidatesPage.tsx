import React, { useMemo, useState } from "react";
import clsx from "clsx";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { useCandidates, useDeleteCandidate, useDesignations, useSetCandidateStatus, type Candidate, type CandidateStatus } from "../../../api/hr";
import { Button, Card, EmptyState, ErrorState, Input, Select } from "../../../components/ui/primitives";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { CANDIDATE_STATUS_LABEL, fmtDate, fmtMoney } from "../../../lib/hrFormat";
import { CandidateStatusBadge, CvIndicator, fmtExperience, RecruitmentHeader, TableSkeleton, useNotify } from "../../../components/hr/recruitment/common";
import { CandidateFormDrawer } from "../../../components/hr/recruitment/CandidateFormDrawer";
import { CandidateDetailsDrawer } from "../../../components/hr/recruitment/CandidateDetailsDrawer";

const STATUSES = Object.keys(CANDIDATE_STATUS_LABEL) as CandidateStatus[];
const PIPELINE_STATUSES: CandidateStatus[] = ["CV_BANK", "NEW", "SCREENING", "INTERVIEW", "SELECTED", "REJECTED"];

export default function CandidatesPage() {
  const notify = useNotify();
  const { data, isLoading, isError, refetch } = useCandidates();
  const { data: designationRows } = useDesignations();
  const setStatus = useSetCandidateStatus();
  const del = useDeleteCandidate();

  const [status, setStatusFilter] = useState<CandidateStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [designation, setDesignation] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Candidate | null>(null);

  const candidates = data ?? [];
  const designations = useMemo(
    () => Array.from(new Set([...(designationRows ?? []).map((d) => d.name), ...candidates.map((c) => c.designation)])).sort((a, b) => a.localeCompare(b)),
    [designationRows, candidates]
  );

  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (designation && c.designation.toLowerCase() !== designation.toLowerCase()) return false;
      if (!q) return true;
      return [c.fullName, c.email, c.phone, c.designation, c.source].some((v) => v?.toLowerCase().includes(q));
    });
  }, [candidates, search, designation]);

  const counts = useMemo(() => {
    const m: Partial<Record<CandidateStatus, number>> = {};
    scoped.forEach((c) => (m[c.status] = (m[c.status] ?? 0) + 1));
    return m;
  }, [scoped]);

  const rows = status === "ALL" ? scoped : scoped.filter((c) => c.status === status);
  const details = candidates.find((c) => c.id === detailsId) ?? null;

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(c: Candidate) {
    setDetailsId(null);
    setEditing(c);
    setFormOpen(true);
  }

  async function changeStatus(c: Candidate, next: CandidateStatus) {
    if (next === c.status) return;
    try {
      await setStatus.mutateAsync({ id: c.id, status: next });
      notify.success("Status updated", `${c.fullName} is now ${CANDIDATE_STATUS_LABEL[next].toLowerCase()}`);
    } catch (err) {
      notify.error(err, "Could not change status");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      notify.success("Candidate deleted", deleting.fullName);
      setDeleting(null);
    } catch (err) {
      notify.error(err, "Could not delete candidate");
    }
  }

  return (
    <div className="space-y-4">
      <RecruitmentHeader
        title="Candidate Management"
        description="Track every applicant from first screening through to joining."
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add candidate
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone…" className="!pl-9" />
        </div>
        <Select value={designation} onChange={(e) => setDesignation(e.target.value)} className="!w-56">
          <option value="">All designations</option>
          {designations.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["ALL", ...STATUSES] as const).map((s) => {
          const count = s === "ALL" ? scoped.length : counts[s] ?? 0;
          const active = status === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {s === "ALL" ? "All" : CANDIDATE_STATUS_LABEL[s]} <span className={active ? "text-white/80" : "text-slate-400"}>{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading && <TableSkeleton />}
      {isError && <ErrorState message="Could not load candidates." onRetry={() => refetch()} />}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={candidates.length === 0 ? "No candidates yet" : "No candidates match these filters"}
          description={candidates.length === 0 ? "Add your first candidate to start the recruitment pipeline." : "Try a different status, designation or search."}
          action={
            candidates.length === 0 && (
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4" /> Add candidate
              </Button>
            )
          }
        />
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Candidate</th>
                  <th className="px-4 py-2.5 font-medium">Designation</th>
                  <th className="px-4 py-2.5 font-medium">Contact</th>
                  <th className="px-4 py-2.5 font-medium">Experience</th>
                  <th className="px-4 py-2.5 text-right font-medium">Expected (AED)</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">CV</th>
                  <th className="px-4 py-2.5 font-medium">Added</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => setDetailsId(c.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.fullName}</td>
                    <td className="px-4 py-3 text-slate-700">{c.designation}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{c.email ?? "—"}</div>
                      <div className="text-xs text-slate-400">{c.phone ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmtExperience(c.experienceYears)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmtMoney(c.expectedSalary)}</td>
                    <td className="px-4 py-3 text-slate-600">{c.source ?? "—"}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {PIPELINE_STATUSES.includes(c.status) ? (
                        <Select
                          value={c.status}
                          disabled={setStatus.isPending}
                          onChange={(e) => changeStatus(c, e.target.value as CandidateStatus)}
                          className="!w-32 !py-1 !text-xs"
                          aria-label={`Status for ${c.fullName}`}
                        >
                          {PIPELINE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {CANDIDATE_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <CandidateStatusBadge status={c.status} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <CvIndicator candidate={c} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDate(c.createdAt)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)} aria-label={`Edit ${c.fullName}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDeleting(c)} aria-label={`Delete ${c.fullName}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CandidateFormDrawer open={formOpen} candidate={editing} onClose={() => setFormOpen(false)} />
      <CandidateDetailsDrawer candidate={details} onClose={() => setDetailsId(null)} onEdit={openEdit} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete candidate"
        message={
          <>
            Delete <strong>{deleting?.fullName}</strong> along with their interviews and CV? This cannot be undone.
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
