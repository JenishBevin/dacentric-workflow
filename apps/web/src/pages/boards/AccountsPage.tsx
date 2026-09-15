import React, { useState } from "react";
import { Landmark, BadgeCheck, X as XIcon } from "lucide-react";
import { useAccountsBoard } from "../../api/boards";
import { useBoardTasks, useAwardTask, useRejectAccountsTask } from "../../api/tasks";
import { Spinner, EmptyState, ErrorState, Skeleton, Button, Badge, AvatarGroup } from "../../components/ui/primitives";
import { PriorityBadge } from "../../components/workflow/badges";
import { Modal } from "../../components/ui/Modal";
import { TaskDetailDrawer } from "../../components/tasks/TaskDetailDrawer";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { TaskSummary } from "../../lib/types";

/**
 * Sits between Estimation and Projects: a Qualified Estimation task lands
 * here for Accounts sign-off. Deliberately a flat list, not a Kanban board —
 * Accounts approves or rejects, it doesn't drag tasks between work stages.
 * Approving hands the task to both Procurement and Projects at once (see
 * awardTask's three-stage pipeline); rejecting ends it here.
 */
export default function AccountsPage() {
  const { data: board, isLoading, isError, error, refetch } = useAccountsBoard();
  const { data: tasks, isLoading: tasksLoading } = useBoardTasks(board?.id);
  const { push } = useToast();
  const awardTask = useAwardTask();
  const rejectAccountsTask = useRejectAccountsTask();

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TaskSummary | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function handleApprove(task: TaskSummary, e: React.MouseEvent) {
    e.stopPropagation();
    setApprovingId(task.id);
    try {
      const result = await awardTask.mutateAsync(task.id);
      push({ variant: "success", title: "Approved — project and procurement created.", description: result.name });
    } catch (err) {
      push({ variant: "error", title: "Could not approve", description: extractApiError(err).message });
    } finally {
      setApprovingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <ErrorState message={extractApiError(error).message} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Landmark className="h-8 w-8" />}
          title="Accounts isn't set up yet"
          description="Ask a Manager or Administrator to open Accounts once — it only needs to happen the first time."
        />
      </div>
    );
  }

  const rows = tasks ?? [];
  const isRejected = (t: TaskSummary) => t.stage?.name?.toLowerCase() === "rejected";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Accounts</h1>
        <p className="text-sm text-slate-500">Qualified estimations waiting on Accounts sign-off — approving sends them to Procurement and Projects at once.</p>
      </div>

      {tasksLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!tasksLoading && rows.length === 0 && (
        <EmptyState icon={<Landmark className="h-8 w-8" />} title="Nothing waiting on Accounts." description="Qualified Estimation tasks will show up here." />
      )}

      {!tasksLoading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">ID</th>
                <th className="px-4 py-2.5">Title</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Service</th>
                <th className="px-4 py-2.5">Assignees</th>
                <th className="px-4 py-2.5">Priority</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} onClick={() => setOpenTaskId(t.id)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400">{t.taskId}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{t.title}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{t.customer?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{t.service?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">{t.assignees.length > 0 && <AvatarGroup names={t.assignees.map((a) => a.name)} max={3} />}</td>
                  <td className="px-4 py-2.5">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td className="px-4 py-2.5">{isRejected(t) ? <Badge tone="red">Rejected</Badge> : <Badge tone="amber">Pending</Badge>}</td>
                  <td className="px-4 py-2.5">
                    {!isRejected(t) && (
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" loading={approvingId === t.id} onClick={(e) => handleApprove(t, e)}>
                          <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRejectTarget(t);
                            setRejectReason("");
                          }}
                        >
                          <XIcon className="h-3.5 w-3.5 text-red-500" /> Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} onDeleted={() => setOpenTaskId(null)} />

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject this task"
        description="A reason is required and will be recorded on the task's activity log."
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
            loading={rejectAccountsTask.isPending}
            onClick={async () => {
              if (!rejectTarget) return;
              try {
                await rejectAccountsTask.mutateAsync({ taskId: rejectTarget.id, reason: rejectReason.trim() });
                push({ variant: "success", title: "Task rejected." });
                setRejectTarget(null);
                setRejectReason("");
              } catch (err) {
                push({ variant: "error", title: "Could not reject task", description: extractApiError(err).message });
              }
            }}
          >
            Reject task
          </Button>
        </div>
      </Modal>
    </div>
  );
}
