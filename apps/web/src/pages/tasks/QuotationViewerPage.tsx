import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, FileSpreadsheet, Pencil } from "lucide-react";
import { useTask, useQuotations, useQuotation } from "../../api/tasks";
import { useBoardDetail } from "../../api/boards";
import { downloadExport } from "../../api/misc";
import { Button, Select, Badge, Skeleton, ErrorState, EmptyState } from "../../components/ui/primitives";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { can, isAdmin } from "../../lib/permissions";
import { extractApiError } from "../../lib/apiClient";
import { boardPath } from "../../lib/boardPath";

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toFixed(1)}%`;

/** Read-only view of a task's saved quotations together with their costing sheet — vendors, buying costs, margins and
 *  profit per item — so Management can review a quotation and suggest where to negotiate the cost. Pick which saved
 *  quotation to look at from the dropdown. */
export default function QuotationViewerPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { push } = useToast();

  const { data: task, isLoading: taskLoading, isError: taskError } = useTask(taskId);
  const { data: board } = useBoardDetail(task?.boardId);
  const { data: versions, isLoading: versionsLoading, isError: versionsError, refetch } = useQuotations(taskId);
  const [selectedId, setSelectedId] = useState<string | undefined>(searchParams.get("q") ?? undefined);
  const [downloading, setDownloading] = useState(false);

  // Default to the newest saved quotation.
  useEffect(() => {
    if (!selectedId && versions && versions.length > 0) setSelectedId(versions[0].id);
  }, [versions, selectedId]);

  const { data: q, isLoading: quoteLoading } = useQuotation(taskId, selectedId);

  const rows = useMemo(() => {
    const items = q?.lineItems ?? [];
    return items.map((item) => {
      const hasCost = item.buyingCost != null;
      const buying = hasCost ? item.qty * (item.buyingCost as number) : null;
      const selling = item.qty * item.unitPrice;
      const profit = buying != null ? selling - buying : null;
      return {
        item,
        buying,
        selling,
        profit,
        marginOnCost: buying && buying > 0 ? ((selling - buying) / buying) * 100 : null,
        marginOnSelling: profit != null && selling > 0 ? (profit / selling) * 100 : null,
      };
    });
  }, [q]);

  const totals = useMemo(() => {
    const costed = rows.filter((r) => r.buying != null);
    const cost = costed.reduce((s, r) => s + (r.buying as number), 0);
    const costedSelling = costed.reduce((s, r) => s + r.selling, 0);
    return { cost, costedSelling, profit: costedSelling - cost, uncosted: rows.length - costed.length };
  }, [rows]);

  // Spend per vendor — where the buying cost is concentrated, i.e. where negotiating pays off most.
  const vendors = useMemo(() => {
    const map = new Map<string, { items: number; cost: number }>();
    rows.forEach((r) => {
      if (r.buying == null) return;
      const key = r.item.vendorName?.trim() || "No vendor entered";
      const cur = map.get(key) ?? { items: 0, cost: 0 };
      map.set(key, { items: cur.items + 1, cost: cur.cost + r.buying });
    });
    return [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.cost - a.cost);
  }, [rows]);

  // Mirrors task-access.ts's assertCanEditTask exactly — see the matching
  // comment in TaskDetailDrawer.tsx for why a plain can(user, "EDIT_TASK")
  // isn't enough on its own.
  const isAssignee = !!task?.assignees.some((a) => a.userId === user?.id);
  const boardRole = board?.members.find((m: any) => m.userId === user?.id)?.role;
  const canEdit =
    !!task &&
    (isAdmin(user) || boardRole === "OWNER" || boardRole === "EDITOR" || isAssignee || can(user, "EDIT_TASK", "ALL")) &&
    task.board?.name === "Estimation";
  const backPath = task ? `${boardPath(task.board?.name, task.boardId)}?task=${task.id}` : "/workflow/estimation";

  function selectVersion(id: string) {
    setSelectedId(id);
    const next = new URLSearchParams(searchParams);
    next.set("q", id);
    setSearchParams(next, { replace: true });
  }

  async function downloadSheet() {
    if (!q) return;
    setDownloading(true);
    try {
      const safeName = (q.name ?? q.quotationRef ?? "quotation").replace(/[^\w.-]+/g, "-");
      await downloadExport(`/tasks/${taskId}/quotations/${q.id}/costing-sheet`, {}, `costing-sheet-${safeName}-v${q.versionNumber}.xlsx`);
    } catch (err) {
      push({ variant: "error", title: "Could not download the costing sheet", description: extractApiError(err).message });
    } finally {
      setDownloading(false);
    }
  }

  if (taskLoading || versionsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (taskError || versionsError || !task) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <ErrorState message="Could not open the quotations. You may not have access to this task's costing." onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-card">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate(backPath)}>
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to task</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">Quotations &amp; costing — {task.title}</p>
              <p className="text-xs text-slate-500">
                {task.taskId}
                {task.estimationId ? ` · ${task.estimationId}` : ""} · read-only
              </p>
            </div>
          </div>
          {versions && versions.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex flex-1 items-center gap-2 sm:flex-none">
                <label htmlFor="quote-select" className="shrink-0 text-sm text-slate-600">
                  Quotation
                </label>
                <Select id="quote-select" value={selectedId ?? ""} onChange={(e) => selectVersion(e.target.value)} className="!py-1.5 sm:!w-72">
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {(v.name || v.title || "Untitled") + ` — v${v.versionNumber} — ${v.currency} ${money(v.totalAmount)}`}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-center gap-2">
                {q?.costingEnabled && (
                  <Button variant="outline" size="sm" className="shrink-0" loading={downloading} onClick={downloadSheet}>
                    <FileSpreadsheet className="h-4 w-4" /> Costing sheet (.xlsx)
                  </Button>
                )}
                {canEdit && q && (
                  <Button size="sm" className="shrink-0" onClick={() => navigate(`/workflow/tasks/${task.id}/quotation?q=${q.id}`)}>
                    <Pencil className="h-4 w-4" /> Edit this quotation
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {(!versions || versions.length === 0) && <EmptyState title="No quotations saved for this task yet." description="Once one is saved from the Estimation task, it appears here with its costing." />}

      {versions && versions.length > 0 && (quoteLoading || !q) && <Skeleton className="h-96 w-full" />}

      {q && (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
                  <Badge tone="indigo">v{q.versionNumber}</Badge>
                  {q.name || q.title || "Untitled quotation"}
                  {q.costingEnabled ? <Badge tone="green">Costing sheet</Badge> : <Badge tone="slate">No costing sheet</Badge>}
                </p>
                <p className="mt-1 text-sm text-slate-600">{q.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[q.quotationRef, [q.recipientName, q.recipientCompany, q.recipientLocation].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Saved by {q.createdByName ?? "unknown"} · last updated {format(new Date(q.updatedAt), "d MMM yyyy, HH:mm")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-500">Quotation total (incl. {q.vatRate}% VAT)</p>
                <p className="text-xl font-semibold text-slate-900">
                  {q.currency} {money(q.totalAmount)}
                </p>
              </div>
            </div>
          </section>

          {q.costingEnabled && (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Total buying cost", value: `${q.currency} ${money(totals.cost)}`, tone: "text-slate-900" },
                { label: "Selling (costed items)", value: `${q.currency} ${money(totals.costedSelling)}`, tone: "text-slate-900" },
                { label: "Profit", value: `${q.currency} ${money(totals.profit)}`, tone: totals.profit < 0 ? "text-red-600" : "text-emerald-700" },
                {
                  label: "Margin",
                  value: totals.cost > 0 ? `${pct((totals.profit / totals.cost) * 100)} on cost · ${totals.costedSelling > 0 ? pct((totals.profit / totals.costedSelling) * 100) : "—"} of selling` : "—",
                  tone: "text-slate-900",
                },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
                  <p className={`mt-1 text-base font-semibold ${card.tone}`}>{card.value}</p>
                </div>
              ))}
            </section>
          )}

          {!q.costingEnabled && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">This quotation was saved without a costing sheet, so only selling prices are available.</p>
          )}
          {q.costingEnabled && totals.uncosted > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {totals.uncosted} item{totals.uncosted === 1 ? " has" : "s have"} no buying cost entered, so {totals.uncosted === 1 ? "it isn't" : "they aren't"} included in the cost and profit figures.
            </p>
          )}

          <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className={`w-full text-sm ${q.costingEnabled ? "min-w-[1100px]" : "min-w-[560px]"}`}>
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5">Unit</th>
                  {q.costingEnabled && (
                    <>
                      <th className="px-3 py-2.5">Vendor</th>
                      <th className="px-3 py-2.5 text-right">Buying (unit)</th>
                      <th className="px-3 py-2.5 text-right">Buying total</th>
                      <th className="px-3 py-2.5 text-right">Margin on cost</th>
                    </>
                  )}
                  <th className="px-3 py-2.5 text-right">Selling (unit)</th>
                  <th className="px-3 py-2.5 text-right">Selling total</th>
                  {q.costingEnabled && (
                    <>
                      <th className="px-3 py-2.5 text-right">Profit</th>
                      <th className="px-3 py-2.5 text-right">% of selling</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-3 py-2.5 text-xs text-slate-400">{i + 1}</td>
                    <td className="max-w-[26rem] whitespace-pre-wrap px-3 py-2.5 text-slate-800">{r.item.description}</td>
                    <td className="px-3 py-2.5 text-right">{r.item.qty}</td>
                    <td className="px-3 py-2.5">{r.item.unit}</td>
                    {q.costingEnabled && (
                      <>
                        <td className="px-3 py-2.5">
                          <p className="text-slate-800">{r.item.vendorName || <span className="text-slate-400">—</span>}</p>
                          {r.item.vendorContact && <p className="text-xs text-slate-500">{r.item.vendorContact}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-right">{r.item.buyingCost != null ? money(r.item.buyingCost) : "—"}</td>
                        <td className="px-3 py-2.5 text-right">{r.buying != null ? money(r.buying) : "—"}</td>
                        <td className="px-3 py-2.5 text-right">{r.marginOnCost != null ? pct(r.marginOnCost) : "—"}</td>
                      </>
                    )}
                    <td className="px-3 py-2.5 text-right">{money(r.item.unitPrice)}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{money(r.selling)}</td>
                    {q.costingEnabled && (
                      <>
                        <td className={`px-3 py-2.5 text-right font-medium ${r.profit != null && r.profit < 0 ? "text-red-600" : "text-emerald-700"}`}>{r.profit != null ? money(r.profit) : "—"}</td>
                        <td className="px-3 py-2.5 text-right">{r.marginOnSelling != null ? pct(r.marginOnSelling) : "—"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-medium text-slate-800">
                <tr>
                  <td colSpan={q.costingEnabled ? 6 : 4} className="px-3 py-2.5 text-right text-slate-500">
                    Totals
                  </td>
                  {q.costingEnabled && (
                    <>
                      <td className="px-3 py-2.5 text-right">{money(totals.cost)}</td>
                      <td />
                    </>
                  )}
                  <td />
                  <td className="px-3 py-2.5 text-right">{money(q.subtotal)}</td>
                  {q.costingEnabled && (
                    <>
                      <td className={`px-3 py-2.5 text-right ${totals.profit < 0 ? "text-red-600" : "text-emerald-700"}`}>{money(totals.profit)}</td>
                      <td />
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
          </section>

          {q.costingEnabled && vendors.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">Buying cost by vendor</p>
              <p className="mb-3 text-xs text-slate-500">Where the spend is concentrated — the biggest lines are the best place to ask for a better price.</p>
              <div className="space-y-3">
                {vendors.map((v) => {
                  const barWidth = totals.cost > 0 ? (v.cost / totals.cost) * 100 : 0;
                  const amount = (
                    <>
                      {q.currency} {money(v.cost)} <span className="text-xs text-slate-400">({totals.cost > 0 ? pct(barWidth) : "0%"} · {v.items} item{v.items === 1 ? "" : "s"})</span>
                    </>
                  );
                  const bar = (
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-indigo-400" style={{ width: `${barWidth}%` }} />
                    </div>
                  );
                  return (
                    <div key={v.name} className="text-sm">
                      {/* Mobile: name + amount on one line, the bar as its own full-width line below — kept as
                          separate blocks (rather than one flex-wrap row) so the bar can't get squeezed to a sliver
                          fighting the name/amount for space. sm+: one row of name / bar / amount. */}
                      <div className="flex items-center justify-between gap-2 sm:hidden">
                        <span className="min-w-0 truncate text-slate-700">{v.name}</span>
                        <span className="shrink-0 text-right text-slate-800">{amount}</span>
                      </div>
                      <div className="mt-1.5 sm:hidden">{bar}</div>
                      <div className="hidden items-center gap-3 sm:flex">
                        <span className="w-48 shrink-0 truncate text-slate-700">{v.name}</span>
                        {bar}
                        <span className="w-44 shrink-0 text-right text-slate-800">{amount}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
