import React, { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Download, Eye, FilePlus2, FileText, FileX, Search, Trash2, Upload, X } from "lucide-react";
import { useCandidates, useDesignations, type Candidate } from "../../../api/hr";
import { Button, Card, EmptyState, ErrorState, Input } from "../../../components/ui/primitives";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { fmtDate } from "../../../lib/hrFormat";
import { CandidateStatusBadge, CV_ACCEPT, fmtExperience, fmtFileSize, RecruitmentHeader, TableSkeleton } from "../../../components/hr/recruitment/common";
import { useCvActions } from "../../../components/hr/recruitment/useCvActions";
import { AddCvModal } from "../../../components/hr/recruitment/AddCvModal";

type CvFilter = "ALL" | "WITH" | "MISSING";

export default function CvBankPage() {
  const { data, isLoading, isError, refetch } = useCandidates();
  const { data: designationRows } = useDesignations();
  const cv = useCvActions();

  const [selected, setSelected] = useState<string>("");
  const [search, setSearch] = useState("");
  const [cvFilter, setCvFilter] = useState<CvFilter>("ALL");
  const [removing, setRemoving] = useState<Candidate | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<Candidate | null>(null);

  const candidates = data ?? [];

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; candidates: number; cvs: number }>();
    (designationRows ?? []).forEach((d) => map.set(d.name.toLowerCase(), { ...d }));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [designationRows]);

  const inDesignation = useMemo(
    () => (selected ? candidates.filter((c) => c.designation.toLowerCase() === selected.toLowerCase()) : candidates),
    [candidates, selected]
  );
  const withCv = inDesignation.filter((c) => c.cvFileName).length;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inDesignation.filter((c) => {
      if (cvFilter === "WITH" && !c.cvFileName) return false;
      if (cvFilter === "MISSING" && c.cvFileName) return false;
      if (!q) return true;
      return [c.fullName, c.email, c.phone, c.cvFileName].some((v) => v?.toLowerCase().includes(q));
    });
  }, [inDesignation, search, cvFilter]);

  function pickFile(c: Candidate) {
    uploadTarget.current = c;
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const target = uploadTarget.current;
    e.target.value = "";
    uploadTarget.current = null;
    if (!file || !target) return;
    setBusyId(target.id);
    await cv.upload(target, file);
    setBusyId(null);
  }

  async function confirmRemove() {
    if (!removing) return;
    setBusyId(removing.id);
    const ok = await cv.remove(removing);
    setBusyId(null);
    if (ok) setRemoving(null);
  }

  const listItem = (key: string, label: string, count: number, cvs: number) => (
    <button
      key={key}
      onClick={() => setSelected(key)}
      className={clsx(
        "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        selected === key ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700 hover:bg-slate-50"
      )}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs text-slate-500">
        {cvs}/{count} CVs
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      <RecruitmentHeader
        title="CV Management (based on Designation)"
        description="Keep every candidate's CV organised by the role they applied for."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <FilePlus2 className="h-4 w-4" /> Add CV
          </Button>
        }
      />

      <input ref={fileRef} type="file" accept={CV_ACCEPT} className="hidden" onChange={onFile} />

      {isLoading && <TableSkeleton />}
      {isError && <ErrorState message="Could not load the CV bank." onRetry={() => refetch()} />}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="h-fit p-2">
            <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-slate-400">Designations</p>
            <div className="space-y-0.5">
              {listItem("", "All designations", candidates.length, candidates.filter((c) => c.cvFileName).length)}
              {groups.map((g) => listItem(g.name, g.name, g.candidates, g.cvs))}
            </div>
          </Card>

          <div className="min-w-0 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Candidates", value: inDesignation.length, tone: "text-slate-900" },
                { label: "CVs on file", value: withCv, tone: "text-emerald-700" },
                { label: "Missing CV", value: inDesignation.length - withCv, tone: "text-amber-700" },
              ].map((s) => (
                <Card key={s.label} className="px-4 py-3">
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className={clsx("text-xl font-semibold", s.tone)}>{s.value}</p>
                </Card>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search candidate or file…" className="!pl-9" />
              </div>
              {(["ALL", "WITH", "MISSING"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setCvFilter(f)}
                  className={clsx(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    cvFilter === f ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {f === "ALL" ? "All" : f === "WITH" ? "Has CV" : "No CV"}
                </button>
              ))}
              {(cvFilter !== "ALL" || search) && (
                <button
                  onClick={() => {
                    setCvFilter("ALL");
                    setSearch("");
                  }}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
                >
                  <X className="h-3 w-3" /> Clear filters
                </button>
              )}
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-8 w-8" />}
                title={inDesignation.length === 0 ? "No candidates in this designation" : "No candidates match these filters"}
                description={inDesignation.length === 0 ? "Use “Add CV” to file a CV here, or add candidates from Candidate Management." : "Clear the filters to see everyone."}
              />
            ) : (
              <Card className="divide-y divide-slate-100">
                {rows.map((c) => {
                  const busy = busyId === c.id;
                  return (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1 basis-56">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">{c.fullName}</p>
                          <CandidateStatusBadge status={c.status} />
                        </div>
                        <p className="text-xs text-slate-500">
                          {c.designation} · {fmtExperience(c.experienceYears)} experience
                        </p>
                        {c.cvFileName ? (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700">
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{c.cvFileName}</span>
                            <span className="shrink-0 text-slate-400">
                              {fmtFileSize(c.cvFileSizeBytes)} · {fmtDate(c.cvUploadedAt)}
                            </span>
                          </p>
                        ) : (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
                            <FileX className="h-3.5 w-3.5" /> No CV uploaded
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {c.cvFileName && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => cv.preview(c)}>
                              <Eye className="h-3.5 w-3.5" /> Preview
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => cv.download(c)}>
                              <Download className="h-3.5 w-3.5" /> Download
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant={c.cvFileName ? "outline" : "primary"} loading={busy && cv.uploading} disabled={busy} onClick={() => pickFile(c)}>
                          <Upload className="h-3.5 w-3.5" /> {c.cvFileName ? "Replace" : "Upload CV"}
                        </Button>
                        {c.cvFileName && (
                          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" disabled={busy} onClick={() => setRemoving(c)} aria-label={`Remove CV of ${c.fullName}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
            <p className="text-xs text-slate-400">PDF, DOC or DOCX up to 25 MB.</p>
          </div>
        </div>
      )}

      <AddCvModal open={addOpen} onClose={() => setAddOpen(false)} designations={groups.map((g) => g.name)} defaultDesignation={selected} />

      <ConfirmDialog
        open={!!removing}
        title="Remove CV"
        message={
          <>
            Remove the CV <strong>{removing?.cvFileName}</strong> of <strong>{removing?.fullName}</strong>?
          </>
        }
        confirmLabel="Remove"
        loading={cv.removing}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
