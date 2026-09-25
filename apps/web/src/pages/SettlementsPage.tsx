import React, { useEffect, useMemo, useState } from "react";
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth } from "date-fns";
import { Download, History } from "lucide-react";
import clsx from "clsx";
import { useSettledClaims, downloadClaimAttachment } from "../api/claims";
import { downloadExport } from "../api/misc";
import { Badge, Button, Skeleton, EmptyState, Card, ErrorState } from "../components/ui/primitives";
import { useToast } from "../context/ToastContext";
import { extractApiError } from "../lib/apiClient";

type DatePreset = "today" | "week" | "month" | "custom" | null;

function formatAmount(amount: number) {
  return `AED ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Approved Settlements" — its own top-level tab under Request (alongside
 * Leave/Claim) so Accounts doesn't have to scroll past My Claims and
 * Pending Approvals to reach the settlement history they care about most. */
export default function SettlementsPage({ highlightClaimId }: { highlightClaimId?: string | null }) {
  const { push } = useToast();
  const [preset, setPreset] = useState<DatePreset>(null);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    if (preset === "today") return { dateFrom: startOfDay(now).toISOString(), dateTo: endOfDay(now).toISOString() };
    if (preset === "week") return { dateFrom: startOfWeek(now).toISOString(), dateTo: endOfDay(now).toISOString() };
    if (preset === "month") return { dateFrom: startOfMonth(now).toISOString(), dateTo: endOfDay(now).toISOString() };
    if (preset === "custom") {
      return {
        dateFrom: customFrom ? startOfDay(new Date(customFrom)).toISOString() : undefined,
        dateTo: customTo ? endOfDay(new Date(customTo)).toISOString() : undefined,
      };
    }
    return { dateFrom: undefined, dateTo: undefined };
  }, [preset, customFrom, customTo]);
  const filters = { dateFrom, dateTo };
  const { data: settled, isLoading, isError, refetch } = useSettledClaims(filters, true);

  function selectPreset(next: DatePreset) {
    setPreset((p) => (p === next ? null : next));
  }

  useEffect(() => {
    if (!highlightClaimId) return;
    const el = document.getElementById(`claim-${highlightClaimId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightClaimId, settled]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Approved Settlements</h2>
          <p className="text-sm text-slate-500">Every claim that's been approved and settled — filterable and exportable.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadExport("/exports/claims-settled", filters, "approved-settlements.xlsx").catch((err) =>
              push({ variant: "error", title: "Export failed", description: extractApiError(err).message })
            )
          }
        >
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["today", "week", "month"] as const).map((p) => (
          <button
            key={p}
            onClick={() => selectPreset(p)}
            className={clsx(
              "rounded-full px-3 py-1 text-xs font-medium",
              preset === p ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {p === "today" ? "Today" : p === "week" ? "This Week" : "This Month"}
          </button>
        ))}
        <button
          onClick={() => selectPreset("custom")}
          className={clsx(
            "rounded-full px-3 py-1 text-xs font-medium",
            preset === "custom" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          Custom
        </button>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700"
            />
          </div>
        )}
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && <ErrorState message="Could not load settlement history." onRetry={() => refetch()} />}
      {settled && settled.length === 0 && (
        <EmptyState icon={<History className="h-8 w-8" />} title="No settlements yet." description="Claims move here once Accounts marks them Settled." />
      )}
      {settled && settled.length > 0 && (
        <div className="space-y-2">
          {settled.map((c: any) => (
            <Card
              key={c.id}
              id={`claim-${c.id}`}
              className={clsx("flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between", c.id === highlightClaimId && "ring-2 ring-brand-500")}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-800">{c.employee?.fullName}</p>
                  <Badge tone="slate">{formatAmount(c.amount)}</Badge>
                  <span className="text-xs text-slate-400">{c.claimId}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {format(new Date(c.expenseDate), "d MMM yyyy")} · {c.reason}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Verified by {c.verifiedBy?.name ?? "—"} · Approved by {c.managementDecidedBy?.name ?? "—"} · Settled by{" "}
                  {c.settledBy?.name ?? "—"} on {c.settledAt ? format(new Date(c.settledAt), "d MMM yyyy") : "—"}
                </p>
                {c.attachments?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.attachments.map((a: any) => (
                      <button
                        key={a.id}
                        onClick={() => downloadClaimAttachment(a.id, a.fileName)}
                        className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-200"
                      >
                        <Download className="h-3 w-3" /> {a.fileName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Badge tone="green">Settled</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
