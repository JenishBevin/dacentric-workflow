import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Landmark, BadgeCheck, X as XIcon, Search } from "lucide-react";
import { useAccountsPendingBoards, useApproveAccountsBoard, useRejectAccountsBoard } from "../../api/boards";
import { Skeleton, EmptyState, ErrorState, Button, Badge, Input } from "../../components/ui/primitives";
import { PriorityBadge } from "../../components/workflow/badges";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { format } from "date-fns";

/**
 * Every Project awarded straight from Estimation — the Project and its
 * ProcurementRecord already exist (Procurement and the Project team can see
 * and prepare against them), but stay gated behind Accounts sign-off here.
 * Approving just unlocks it (Lost/Complete become possible); rejecting
 * archives the Project and cancels its ProcurementRecord.
 */
export default function AccountsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch } = useAccountsPendingBoards(search);
  const { push } = useToast();
  const approve = useApproveAccountsBoard();
  const reject = useRejectAccountsBoard();

  const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const rows = data ?? [];

  async function handleApprove(row: { id: string; name: string }, e: React.MouseEvent) {
    e.stopPropagation();
    setApprovingId(row.id);
    try {
      await approve.mutateAsync(row.id);
      push({ variant: "success", title: "Approved.", description: `${row.name} can now proceed.` });
    } catch (err) {
      push({ variant: "error", title: "Could not approve", description: extractApiError(err).message });
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Accounts</h1>
        <p className="text-sm text-slate-500">
          Awarded projects waiting on Accounts sign-off — Procurement and the Project team already have full access, but can't mark them Lost or
          Completed until you decide.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects…" className="pl-9" />
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {isError && <ErrorState message={extractApiError(error).message} onRetry={() => refetch()} />}

      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState icon={<Landmark className="h-8 w-8" />} title="Nothing waiting on Accounts." description="Awarded Estimation tasks will show up here." />
      )}

      {!isLoading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Project</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Service</th>
                <th className="px-4 py-2.5">Quotation</th>
                <th className="px-4 py-2.5">Priority</th>
                <th className="px-4 py-2.5">Awarded</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} onClick={() => navigate(`/workflow/boards/${r.id}`)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-800">{r.name}</p>
                    <p className="font-mono text-xs text-slate-400">{r.boardId}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.customer?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.service ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {r.task?.totalAmount != null ? `${r.task.currency} ${Number(r.task.totalAmount).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-2.5">{r.task && <PriorityBadge priority={r.task.priority} />}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{format(new Date(r.createdAt), "d MMM yyyy")}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" loading={approvingId === r.id} onClick={(e) => handleApprove(r, e)}>
                        <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRejectTarget(r);
                          setRejectReason("");
                        }}
                      >
                        <XIcon className="h-3.5 w-3.5 text-red-500" /> Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject this project"
        description="This archives the project and cancels its procurement record. A reason is required."
      >
        <textarea
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Why is Accounts rejecting this?"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:focus-ring"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRejectTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!rejectReason.trim()}
            loading={reject.isPending}
            onClick={async () => {
              if (!rejectTarget) return;
              try {
                await reject.mutateAsync({ boardId: rejectTarget.id, reason: rejectReason.trim() });
                push({ variant: "success", title: "Project rejected." });
                setRejectTarget(null);
                setRejectReason("");
              } catch (err) {
                push({ variant: "error", title: "Could not reject project", description: extractApiError(err).message });
              }
            }}
          >
            Reject project
          </Button>
        </div>
      </Modal>
    </div>
  );
}
