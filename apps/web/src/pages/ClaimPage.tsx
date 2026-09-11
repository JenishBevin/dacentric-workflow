import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { format } from "date-fns";
import { Receipt, Plus, Paperclip, Download, Check, X as XIcon, CheckCircle2, Info } from "lucide-react";
import { useMyClaims, useActionableClaims, useSubmitClaim, useDecideClaim, useSettleClaim, downloadClaimAttachment } from "../api/claims";
import { Badge, Button, Input, Label, Textarea, Skeleton, EmptyState, Card, ErrorState } from "../components/ui/primitives";
import { Drawer } from "../components/ui/Drawer";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { extractApiError } from "../lib/apiClient";

const STATUS_TONE: Record<string, "amber" | "green" | "red" | "blue"> = {
  PENDING: "amber",
  MANAGEMENT_APPROVED: "blue",
  SETTLED: "green",
  REJECTED: "red",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Awaiting Management",
  MANAGEMENT_APPROVED: "Awaiting Settlement",
  SETTLED: "Settled",
  REJECTED: "Rejected",
};

function formatAmount(amount: number) {
  return `AED ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SubmitClaimDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { push } = useToast();
  const submit = useSubmitClaim();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    setFiles((prev) => [...prev, ...selected]);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    try {
      await submit.mutateAsync({ amount: Number(amount), reason, expenseDate, files });
      push({ variant: "success", title: "Claim submitted.", description: "You'll be notified once it's decided." });
      setAmount("");
      setExpenseDate("");
      setReason("");
      setFiles([]);
      onClose();
    } catch (err) {
      push({ variant: "error", title: "Could not submit claim", description: extractApiError(err).message });
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Claim an Expense" subtitle="Submit a bill you paid on behalf of the company for reimbursement.">
      <form onSubmit={submitForm} className="space-y-4">
        <div>
          <Label required>Amount (AED)</Label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <Label required>Expense date</Label>
          <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} required />
        </div>
        <div>
          <Label required>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="What was this expense for?" required />
        </div>
        <div>
          <Label required>Proof of bill</Label>
          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={onFilesSelected} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-3.5 w-3.5" /> Attach photo or scan
          </Button>
          {files.length > 0 && (
            <div className="mt-2 space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                  <span className="truncate">{f.name}</span>
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} aria-label={`Remove ${f.name}`}>
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <Button type="submit" loading={submit.isPending} disabled={!amount || !expenseDate || !reason.trim() || files.length === 0}>
          Submit claim
        </Button>
      </form>
    </Drawer>
  );
}

/** Section: "Claim" option under the Request menu, alongside Leave.
 * Two-stage: Management approves, then Accounts settles it with the next
 * salary run — Accounts' stage is a settlement record, not a second
 * approve/reject gate. */
export default function ClaimPage({ highlightClaimId }: { highlightClaimId?: string | null }) {
  const { user } = useAuth();
  const { push } = useToast();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: myClaims, isLoading: myLoading, isError: myError, refetch: refetchMine } = useMyClaims();

  const isAdminUser = user?.roles.some((r) => ["SYSTEM_ADMIN", "SUPER_ADMIN"].includes(r)) ?? false;
  const isManagementTier = isAdminUser || (user?.roles.includes("MANAGEMENT") ?? false);
  const isAccountsTier = isAdminUser || (user?.roles.includes("ACCOUNTS") ?? false);
  const isApprover = isManagementTier || isAccountsTier;
  const { data: actionable, isLoading: actionableLoading } = useActionableClaims(isApprover);

  useEffect(() => {
    if (!highlightClaimId) return;
    const el = document.getElementById(`claim-${highlightClaimId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightClaimId, myClaims, actionable]);

  const decide = useDecideClaim();
  const settle = useSettleClaim();

  async function approve(id: string) {
    try {
      await decide.mutateAsync({ id, decision: "APPROVED" });
      push({ variant: "success", title: "Sent on to Accounts for settlement." });
    } catch (err) {
      push({ variant: "error", title: "Could not approve claim", description: extractApiError(err).message });
    }
  }

  async function confirmReject() {
    if (!rejectingId || !rejectReason.trim()) return;
    try {
      await decide.mutateAsync({ id: rejectingId, decision: "REJECTED", reason: rejectReason.trim() });
      push({ variant: "success", title: "Claim rejected." });
      setRejectingId(null);
      setRejectReason("");
    } catch (err) {
      push({ variant: "error", title: "Could not reject claim", description: extractApiError(err).message });
    }
  }

  async function settleOne(id: string) {
    try {
      await settle.mutateAsync(id);
      push({ variant: "success", title: "Claim marked as settled." });
    } catch (err) {
      push({ variant: "error", title: "Could not settle claim", description: extractApiError(err).message });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Expense Claims</h2>
          <p className="text-sm text-slate-500">Claim a bill you paid on behalf of the company, and track its approval.</p>
        </div>
        {user?.employee && (
          <Button onClick={() => setSubmitOpen(true)}>
            <Plus className="h-4 w-4" /> Claim Expense
          </Button>
        )}
      </div>

      {!user?.employee && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Your account isn't linked to an employee record, so you can't submit a claim here. Ask your administrator to link one from
          Settings → Users.
        </div>
      )}

      {/* My claims */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-800">My Claims</p>
        {myLoading && <Skeleton className="h-24 w-full" />}
        {myError && <ErrorState message="Could not load your claims." onRetry={() => refetchMine()} />}
        {myClaims && myClaims.length === 0 && (
          <EmptyState icon={<Receipt className="h-8 w-8" />} title="No claims yet." description={user?.employee ? "Claim above to submit one." : undefined} />
        )}
        {myClaims && myClaims.length > 0 && (
          <div className="space-y-2">
            {myClaims.map((c: any) => (
              <Card
                key={c.id}
                id={`claim-${c.id}`}
                className={clsx(
                  "flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between",
                  c.id === highlightClaimId && "ring-2 ring-brand-500"
                )}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{formatAmount(c.amount)}</p>
                    <span className="text-xs text-slate-400">{c.claimId}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {format(new Date(c.expenseDate), "d MMM yyyy")} · {c.reason}
                  </p>
                  {c.status === "REJECTED" && c.rejectReason && <p className="mt-1 text-xs text-red-600">Reason: {c.rejectReason}</p>}
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
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>

      <SubmitClaimDrawer open={submitOpen} onClose={() => setSubmitOpen(false)} />

      {/* Approvals / settlement — Management / Accounts / Admin only */}
      {isApprover && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800">Pending Approvals &amp; Settlement</p>
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Management approves first, then Accounts settles it with the next salary run.
          </div>

          {actionableLoading && <Skeleton className="h-40 w-full" />}
          {actionable && actionable.length === 0 && (
            <EmptyState icon={<Receipt className="h-8 w-8" />} title="Nothing needs a decision right now." />
          )}
          {actionable && actionable.length > 0 && (
            <div className="space-y-2">
              {actionable.map((c: any) => {
                const canDecide = c.status === "PENDING" && isManagementTier;
                const canSettle = c.status === "MANAGEMENT_APPROVED" && isAccountsTier;
                return (
                  <Card
                    key={c.id}
                    id={`claim-${c.id}`}
                    className={clsx(
                      "flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between",
                      c.id === highlightClaimId && "ring-2 ring-brand-500"
                    )}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-800">{c.employee?.fullName}</p>
                        <Badge tone="slate">{formatAmount(c.amount)}</Badge>
                        <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {format(new Date(c.expenseDate), "d MMM yyyy")} · {c.reason}
                      </p>
                      {c.attachments?.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {c.attachments.map((a: any) => (
                            <button
                              key={a.id}
                              onClick={() => downloadClaimAttachment(a.id, a.fileName)}
                              className="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] text-slate-600 shadow-sm hover:bg-slate-50"
                            >
                              <Download className="h-3 w-3" /> {a.fileName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {canDecide && (
                        <>
                          <Button size="sm" loading={decide.isPending} onClick={() => approve(c.id)}>
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => setRejectingId(c.id)}>
                            <XIcon className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </>
                      )}
                      {canSettle && (
                        <Button size="sm" loading={settle.isPending} onClick={() => settleOne(c.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Mark Settled
                        </Button>
                      )}
                      {!canDecide && !canSettle && (
                        <span className="text-xs text-slate-400">Waiting on {c.status === "PENDING" ? "Management" : "Accounts"}</span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Modal
        open={!!rejectingId}
        onClose={() => {
          setRejectingId(null);
          setRejectReason("");
        }}
        title="Reject claim"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setRejectingId(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" loading={decide.isPending} disabled={!rejectReason.trim()} onClick={confirmReject}>
              Reject claim
            </Button>
          </>
        }
      >
        <Label required>Reason</Label>
        <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} maxLength={1000} placeholder="Why is this claim being rejected?" />
      </Modal>
    </div>
  );
}
