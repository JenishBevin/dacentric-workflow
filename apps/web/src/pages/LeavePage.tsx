import React, { useState } from "react";
import { format } from "date-fns";
import { CalendarClock, Eye, Check, X as XIcon, Info, Plus } from "lucide-react";
import { useHrmsLeaveRequests, useHrmsWorkload, useDecideLeaveRequest, useMyLeaveRequests, useApplyForLeave } from "../api/misc";
import { Badge, Button, Input, Label, Textarea, Skeleton, EmptyState, Card, ErrorState } from "../components/ui/primitives";
import { PriorityBadge } from "../components/workflow/badges";
import { Drawer } from "../components/ui/Drawer";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { extractApiError } from "../lib/apiClient";

const STATUS_TONE: Record<string, "amber" | "green" | "red"> = { PENDING: "amber", APPROVED: "green", REJECTED: "red" };

function ApplyForLeaveDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { push } = useToast();
  const apply = useApplyForLeave();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apply.mutateAsync({ startDate, endDate, reason: reason || undefined });
      push({ variant: "success", title: "Leave request submitted.", description: "You'll be notified once it's decided." });
      setStartDate("");
      setEndDate("");
      setReason("");
      onClose();
    } catch (err) {
      push({ variant: "error", title: "Could not submit request", description: extractApiError(err).message });
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Apply for Leave" subtitle="Submit a date range for HR or your manager to review.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label required>Start date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div>
            <Label required>End date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || undefined} required />
          </div>
        </div>
        <div>
          <Label>Reason (optional)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="Annual leave, medical, etc." />
        </div>
        <Button type="submit" loading={apply.isPending} disabled={!startDate || !endDate}>
          Submit request
        </Button>
      </form>
    </Drawer>
  );
}

/**
 * Section 31 / UC-12 — apply-for-leave is a real, working flow: any user
 * with a linked Employee record can submit a request here and track its
 * status. Deciding it stays restricted to HR/Manager/Admin below. The
 * "View Current Workload" panel on that approval side remains the one
 * deliberate Workflow integration point from the original minimal-HRMS
 * scope — everything else here (apply, track, approve) is the real flow
 * the requirements ask for, not a demo stand-in.
 */
export default function LeavePage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [applyOpen, setApplyOpen] = useState(false);
  const [workloadFor, setWorkloadFor] = useState<string | null>(null);

  const { data: myRequests, isLoading: myLoading, isError: myError, refetch: refetchMine } = useMyLeaveRequests();

  const isApprover = user?.roles.some((r) => ["HR", "MANAGER", "SYSTEM_ADMIN", "SUPER_ADMIN"].includes(r)) ?? false;
  const { data: pending, isLoading: pendingLoading } = useHrmsLeaveRequests({ enabled: isApprover });
  const decide = useDecideLeaveRequest();
  const { data: workload, isLoading: workloadLoading } = useHrmsWorkload(workloadFor ?? undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Leave</h1>
          <p className="text-sm text-slate-500">Apply for annual or other leave, and track your requests.</p>
        </div>
        {user?.employee && (
          <Button onClick={() => setApplyOpen(true)}>
            <Plus className="h-4 w-4" /> Apply for Leave
          </Button>
        )}
      </div>

      {!user?.employee && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Your account isn't linked to an employee record, so you can't apply for leave here. Ask your administrator to link one from
          Settings → Users.
        </div>
      )}

      {/* My requests */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-800">My Requests</p>
        {myLoading && <Skeleton className="h-24 w-full" />}
        {myError && <ErrorState message="Could not load your leave requests." onRetry={() => refetchMine()} />}
        {myRequests && myRequests.length === 0 && (
          <EmptyState icon={<CalendarClock className="h-8 w-8" />} title="No leave requests yet." description={user?.employee ? "Apply above to submit one." : undefined} />
        )}
        {myRequests && myRequests.length > 0 && (
          <div className="space-y-2">
            {myRequests.map((r: any) => (
              <Card key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {format(new Date(r.startDate), "d MMM yyyy")} – {format(new Date(r.endDate), "d MMM yyyy")}
                  </p>
                  {r.reason && <p className="text-xs text-slate-500">{r.reason}</p>}
                </div>
                <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ApplyForLeaveDrawer open={applyOpen} onClose={() => setApplyOpen(false)} />

      {/* Approvals — HR / Manager / System Admin / Super Admin only */}
      {isApprover && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800">Pending Approvals</p>
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            "View Current Workload" shows the employee's open Workflow tasks, read-only — any reassignment happens in Workflow itself,
            never here.
          </div>

          {pendingLoading && <Skeleton className="h-40 w-full" />}
          {pending && pending.length === 0 && (
            <EmptyState icon={<CalendarClock className="h-8 w-8" />} title="No pending leave requests." description="Nothing needs a decision right now." />
          )}
          {pending && pending.length > 0 && (
            <div className="space-y-2">
              {pending.map((r: any) => (
                <Card key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-800">{r.employee?.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {format(new Date(r.startDate), "d MMM yyyy")} – {format(new Date(r.endDate), "d MMM yyyy")}
                      {r.reason && <> · {r.reason}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setWorkloadFor(r.id)}>
                      <Eye className="h-3.5 w-3.5" /> View Current Workload
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await decide.mutateAsync({ id: r.id, decision: "APPROVED" });
                          push({ variant: "success", title: "Leave approved." });
                        } catch (err) {
                          push({ variant: "error", title: "Could not approve leave", description: extractApiError(err).message });
                        }
                      }}
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={async () => {
                        try {
                          await decide.mutateAsync({ id: r.id, decision: "REJECTED" });
                          push({ variant: "success", title: "Leave rejected." });
                        } catch (err) {
                          push({ variant: "error", title: "Could not reject leave", description: extractApiError(err).message });
                        }
                      }}
                    >
                      <XIcon className="h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <Drawer
        open={!!workloadFor}
        onClose={() => setWorkloadFor(null)}
        title={workload?.employee?.name ?? "Current Workload"}
        subtitle={
          <span className="flex items-center gap-1.5">
            <Badge tone="slate">Read-only</Badge> Reassignment happens in Workflow, not here.
          </span>
        }
      >
        {workloadLoading && <Skeleton className="h-40 w-full" />}
        {workload && (
          <div className="space-y-2">
            {workload.tasks.length === 0 && <p className="text-sm text-slate-400">No open Workflow tasks for this employee.</p>}
            {workload.tasks.map((t: any) => (
              <div key={t.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800">{t.title}</p>
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{t.board}</span>
                  <Badge tone="slate">{t.stage}</Badge>
                  {t.dueDate && <span>Due {format(new Date(t.dueDate), "d MMM")}</span>}
                  {t.estimatedEffortHours != null && <span>{t.estimatedEffortHours}h</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
