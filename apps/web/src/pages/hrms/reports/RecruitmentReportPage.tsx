import React, { useState } from "react";
import { UserSearch } from "lucide-react";
import { useRecruitmentReport } from "../../../api/hr";
import { EmptyState, Input } from "../../../components/ui/primitives";
import { BarList, FilterField, ReportBody, ReportHeader, SummaryTile, TableCard, TD, TH, THEAD, TileGrid, TR, todayInput, yearStartInput } from "../../../components/hr/reports/ReportParts";
import { CANDIDATE_STATUS_LABEL, downloadCsv } from "../../../lib/hrFormat";
import type { CandidateStatus } from "../../../api/hr";

export default function RecruitmentReportPage() {
  const [from, setFrom] = useState(yearStartInput());
  const [to, setTo] = useState(todayInput());
  const validRange = !!from && !!to && from <= to;
  const query = useRecruitmentReport(validRange ? from : yearStartInput(), validRange ? to : todayInput());
  const data = query.data;

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `recruitment-by-designation-${from}-to-${to}`,
      ["Designation", "Candidates", "Selected", "Offered", "Joined"],
      data.byDesignation.map((r) => [r.designation, r.candidates, r.selected, r.offered, r.joined])
    );
  };

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Recruitment Reports"
        subtitle="Candidate pipeline, interviews, offers and joiners for a date range."
        onExport={exportCsv}
        exportDisabled={!data || data.byDesignation.length === 0}
        filters={
          <>
            <FilterField label="From" className="w-40">
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </FilterField>
            <FilterField label="To" className="w-40">
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </FilterField>
          </>
        }
      />

      {!validRange ? (
        <EmptyState icon={<UserSearch className="h-8 w-8" />} title="Choose a valid date range" description="Both dates are required and From must not be after To." />
      ) : (
        <ReportBody query={query} tiles={8}>
          {(d) => {
            const s = d.summary;
            return (
              <>
                <TileGrid cols={4}>
                  <SummaryTile label="Candidates" value={s.candidates} />
                  <SummaryTile label="Interviews held" value={s.interviews} hint={`${s.interviewsCompleted} completed`} />
                  <SummaryTile label="Selected" value={s.selected} />
                  <SummaryTile label="Offers made" value={s.offered} />
                  <SummaryTile
                    label="Offers accepted"
                    value={s.accepted}
                    tone="green"
                    hint={s.offerAcceptanceRate === null ? "No offers answered yet" : `${Math.round(s.offerAcceptanceRate)}% acceptance rate`}
                  />
                  <SummaryTile label="Joined" value={s.joined} tone="green" />
                  <SummaryTile label="Avg interview rating" value={s.avgRating === null ? "—" : `${s.avgRating.toFixed(1)} / 5`} />
                </TileGrid>

                {s.candidates === 0 ? (
                  <EmptyState icon={<UserSearch className="h-8 w-8" />} title="No candidates in this range" description="Try widening the date range." />
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <BarList
                        title="Pipeline by status"
                        maxRows={12}
                        items={d.byStatus.map((x) => ({ label: CANDIDATE_STATUS_LABEL[x.label as CandidateStatus] ?? x.label, value: x.count }))}
                      />
                      <BarList title="Candidates by source" color="bg-emerald-500" items={d.bySource.map((x) => ({ label: x.label, value: x.count }))} />
                    </div>

                    <TableCard title="By designation">
                      <table className="w-full text-sm">
                        <thead className={THEAD}>
                          <tr>
                            <th className={TH}>Designation</th>
                            <th className={`${TH} text-right`}>Candidates</th>
                            <th className={`${TH} text-right`}>Selected</th>
                            <th className={`${TH} text-right`}>Offered</th>
                            <th className={`${TH} text-right`}>Joined</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.byDesignation.map((r) => (
                            <tr key={r.designation} className={TR}>
                              <td className={`${TD} font-medium text-slate-800`}>{r.designation}</td>
                              <td className={`${TD} text-right text-slate-700`}>{r.candidates}</td>
                              <td className={`${TD} text-right text-slate-600`}>{r.selected}</td>
                              <td className={`${TD} text-right text-slate-600`}>{r.offered}</td>
                              <td className={`${TD} text-right text-slate-600`}>{r.joined}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableCard>
                  </>
                )}
              </>
            );
          }}
        </ReportBody>
      )}
    </div>
  );
}
