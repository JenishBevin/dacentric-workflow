import React, { useMemo, useRef, useState } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { CalendarClock, Eye, Check, X as XIcon, Info, Plus, Paperclip, Download } from "lucide-react";
import {
  useHrmsLeaveRequests,
  useHrmsWorkload,
  useDecideLeaveRequest,
  useMyLeaveRequests,
  useApplyForLeave,
  useMyLeaveBalance,
  useEmployeeDirectory,
  downloadLeaveAttachment,
} from "../api/misc";
import { Badge, Button, Input, Label, Select, Textarea, Skeleton, EmptyState, Card, ErrorState } from "../components/ui/primitives";
import { PriorityBadge } from "../components/workflow/badges";
import { Drawer } from "../components/ui/Drawer";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { extractApiError } from "../lib/apiClient";

const STATUS_TONE: Record<string, "amber" | "green" | "red" | "blue"> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Awaiting HR",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const LEAVE_TYPE_LABEL: Record<string, string> = {
  ANNUAL: "Annual",
  SICK: "Sick",
  MATERNITY: "Maternity",
  PATERNITY: "Paternity",
  UNPAID: "Unpaid",
  EMERGENCY: "Emergency",
};
const LEAVE_TYPES = Object.keys(LEAVE_TYPE_LABEL);

function ApplyForLeaveDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { push } = useToast();
  const apply = useApplyForLeave();
  const { data: balance } = useMyLeaveBalance();
  const { data: directory } = useEmployeeDirectory();
  const [leaveType, setLeaveType] = useState("ANNUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [handoverToEmployeeId, setHandoverToEmployeeId] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSick = leaveType === "SICK";

  function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    setFiles((prev) => [...prev, ...selected]);
  }

  const dayCount = useMemo(() => {
    if (!startDate || !endDate) return null;
    const days = differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1;
    return days > 0 ? days : null;
  }, [startDate, endDate]);

  const selectedBalance = balance?.find((b: any) => b.leaveType === leaveType);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apply.mutateAsync({
        leaveType,
        startDate,
        endDate,
        reason: reason || undefined,
        handoverToEmployeeId: handoverToEmployeeId || undefined,
        handoverNotes: handoverNotes || undefined,
        files,
      });
      push({ variant: "success", title: "Leave request submitted.", description: "You'll be notified once it's decided." });
      setLeaveType("ANNUAL");
      setStartDate("");
      setEndDate("");
      setReason("");
      setHandoverToEmployeeId("");
      setHandoverNotes("");
      setFiles([]);
      onClose();
    } catch (err) {
      push({ variant: "error", title: "Could not submit request", description: extractApiError(err).message });
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Apply for Leave" subtitle="Submit a date range for HR or your manager to review.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label required>Leave type</Label>
          <Select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {LEAVE_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          {leaveType === "ANNUAL" && selectedBalance && (
            <p className="mt-1 text-xs text-slate-500">
              {selectedBalance.remaining === null
                ? "No balance cap for this leave type."
                : `${selectedBalance.remaining} of ${selectedBalance.entitlement} days remaining this year.`}
            </p>
          )}
        </div>
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
        {dayCount && <p className="text-xs text-slate-500">{dayCount} day{dayCount > 1 ? "s" : ""} total.</p>}
        {isSick && (
          <div>
            <Label required>Medical certificate</Label>
            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={onFilesSelected} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-3.5 w-3.5" /> Attach certificate
            </Button>
            {files.length === 0 && <p className="mt-1 text-xs text-amber-600">A medical certificate is required for sick leave.</p>}
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
        )}
        <div>
          <Label>Reason (optional)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="Annual leave, medical, etc." />
        </div>
        <div>
          <Label>Hand over to (optional)</Label>
          <Select value={handoverToEmployeeId} onChange={(e) => setHandoverToEmployeeId(e.target.value)}>
            <option value="">No handover</option>
            {directory?.map((e: any) => (
              <option key={e.employeeId} value={e.employeeId}>
                {e.name}
              </option>
            ))}
          </Select>
        </div>
        {handoverToEmployeeId && (
          <div>
            <Label>Handover notes</Label>
            <Textarea
              value={handoverNotes}
              onChange={(e) => setHandoverNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Pending tasks and instructions for the person covering you."
            />
          </div>
        )}
        <Button type="submit" loading={apply.isPending} disabled={!startDate || !endDate || (isSick && files.length === 0)}>
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

  // Single-stage approval: every request goes straight to HR (or a
  // System/Super Admin) — no Manager / Management stage.
  const isAdminUser = user?.roles.some((r) => ["SYSTEM_ADMIN", "SUPER_ADMIN"].includes(r)) ?? false;
  const isHr = user?.roles.includes("HR") ?? false;
  const isApprover = isAdminUser || isHr;
  const { data: pending, isLoading: pendingLoading } = useHrmsLeaveRequests({ enabled: isApprover });
  const decide = useDecideLeaveRequest();
  const { data: workload, isLoading: workloadLoading } = useHrmsWorkload(workloadFor ?? undefined);

  // HR is independent of the leave-approval workflow — they decide everyone
  // else's requests but don't apply for or track their own leave here.
  const showSelfService = !isHr;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Leave</h1>
          <p className="text-sm text-slate-500">
            {showSelfService ? "Apply for annual or other leave, and track your requests." : "Review and decide on employee leave requests."}
          </p>
        </div>
        {showSelfService && user?.employee && (
          <Button onClick={() => setApplyOpen(true)}>
            <Plus className="h-4 w-4" /> Apply for Leave
          </Button>
        )}
      </div>

      {showSelfService && !user?.employee && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Your account isn't linked to an employee record, so you can't apply for leave here. Ask your administrator to link one from
          Settings → Users.
        </div>
      )}

      {showSelfService && (
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        {format(new Date(r.startDate), "d MMM yyyy")} – {format(new Date(r.endDate), "d MMM yyyy")}
                      </p>
                      <Badge tone="slate">{LEAVE_TYPE_LABEL[r.leaveType] ?? r.leaveType}</Badge>
                      <span className="text-xs text-slate-400">
                        {r.numberOfDays} day{r.numberOfDays > 1 ? "s" : ""}
                      </span>
                    </div>
                    {r.reason && <p className="text-xs text-slate-500">{r.reason}</p>}
                    {r.handoverToEmployee && <p className="text-xs text-slate-500">Handover: {r.handoverToEmployee.fullName}</p>}
                    {r.attachments?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.attachments.map((a: any) => (
                          <button
                            key={a.id}
                            onClick={() => downloadLeaveAttachment(a.id, a.fileName)}
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-200"
                          >
                            <Download className="h-3 w-3" /> {a.fileName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {showSelfService && <ApplyForLeaveDrawer open={applyOpen} onClose={() => setApplyOpen(false)} />}

      {/* Approvals — HR / System Admin / Super Admin only */}
      {isApprover && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800">Pending Approvals</p>
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Every leave request goes straight to HR for approval. "View Current Workload" shows the employee's open Workflow tasks,
            read-only — any reassignment happens in Workflow itself, never here.
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
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-800">{r.employee?.fullName}</p>
                      <Badge tone="slate">{LEAVE_TYPE_LABEL[r.leaveType] ?? r.leaveType}</Badge>
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {format(new Date(r.startDate), "d MMM yyyy")} – {format(new Date(r.endDate), "d MMM yyyy")} · {r.numberOfDays} day
                      {r.numberOfDays > 1 ? "s" : ""}
                      {r.reason && <> · {r.reason}</>}
                    </p>
                    {r.handoverToEmployee && (
                      <p className="text-xs text-slate-500">
                        Handover: {r.handoverToEmployee.fullName}
                        {r.handoverNotes && <> — {r.handoverNotes}</>}
                      </p>
                    )}
                    {r.attachments?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.attachments.map((a: any) => (
                          <button
                            key={a.id}
                            onClick={() => downloadLeaveAttachment(a.id, a.fileName)}
                            className="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] text-slate-600 shadow-sm hover:bg-slate-50"
                          >
                            <Download className="h-3 w-3" /> {a.fileName}
                          </button>
                        ))}
                      </div>
                    )}
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
                  <div>
                    <p className="text-[11px] font-medium text-slate-400">{t.taskId}</p>
                    <p className="font-medium text-slate-800">{t.title}</p>
                  </div>
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
