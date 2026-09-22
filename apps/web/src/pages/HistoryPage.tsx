import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth } from "date-fns";
import { Download, Archive, Trello, Inbox, ChevronRight, RotateCcw } from "lucide-react";
import { useHistory } from "../api/history";
import { useRestoreTask } from "../api/tasks";
import { useSetBoardCompleted } from "../api/boards";
import { downloadExport } from "../api/misc";
import { Select, Button, Skeleton, ErrorState, EmptyState, Badge, Label } from "../components/ui/primitives";
import { Modal } from "../components/ui/Modal";
import { TaskDetailDrawer } from "../components/tasks/TaskDetailDrawer";
import { useBoardDetail } from "../api/boards";
import { useBoardTasks } from "../api/tasks";
import { useToast } from "../context/ToastContext";
import { extractApiError } from "../lib/apiClient";
import clsx from "clsx";

const STATUS_TONE: Record<string, "green" | "amber" | "red"> = {
  COMPLETED: "green",
  IN_PROGRESS: "amber",
  LOST: "red",
};
const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completed",
  IN_PROGRESS: "In Progress",
  LOST: "Lost",
};

type DatePreset = "today" | "week" | "month" | "custom" | null;

/** Project/Task History — a unified, filterable ledger of every completed
 * Project and every resolved Enquiry. Projects move here once manually
 * marked Completed; Enquiries move here once moved to the "Lost" stage. */
export default function HistoryPage() {
  const { push } = useToast();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  // A history row is a closed chapter — it no longer shows up on the live
  // Projects/Estimation/Enquiries pages, so opening one navigates nowhere;
  // it just pops up a read-only summary right here instead.
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
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

  const filters = {
    type: (type || undefined) as "PROJECT" | "TASK" | undefined,
    status: (status || undefined) as "COMPLETED" | "IN_PROGRESS" | "LOST" | undefined,
    dateFrom,
    dateTo,
  };

  const { data, isLoading, isError, refetch } = useHistory(filters);
  const rows = data ?? [];

  const restoreTask = useRestoreTask();
  const setBoardCompleted = useSetBoardCompleted();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function handleRestore(r: any, e: React.MouseEvent) {
    e.stopPropagation();
    setRestoringId(r.id);
    try {
      if (r.kind === "PROJECT") {
        await setBoardCompleted.mutateAsync({ boardId: r.id, completed: false });
        push({ variant: "success", title: "Project restored.", description: `${r.name} is active again.` });
      } else {
        await restoreTask.mutateAsync(r.id);
        push({ variant: "success", title: "Restored.", description: `${r.name} is back where it came from.` });
      }
    } catch (err) {
      push({ variant: "error", title: "Could not restore", description: extractApiError(err).message });
    } finally {
      setRestoringId(null);
    }
  }

  function selectPreset(next: DatePreset) {
    setPreset((p) => (p === next ? null : next));
  }

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`history-row-${highlightId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, rows]);

  function openRow(r: any) {
    if (r.kind === "PROJECT") setOpenProjectId(r.id);
    else setOpenTaskId(r.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Project/Task History</h1>
          <p className="text-sm text-slate-500">Completed projects and resolved enquiries — filterable and exportable.</p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            downloadExport("/exports/history", filters, "history-export.xlsx").catch((err) =>
              push({ variant: "error", title: "Export failed", description: extractApiError(err).message })
            )
          }
        >
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          <div>
            <Label className="!mb-0.5 !text-xs">Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="!py-1.5 !text-xs">
              <option value="">Projects &amp; Enquiries</option>
              <option value="PROJECT">Projects only</option>
              <option value="TASK">Enquiries only</option>
            </Select>
          </div>
          <div>
            <Label className="!mb-0.5 !text-xs">Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!py-1.5 !text-xs">
              <option value="">All statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="IN_PROGRESS">Not completed</option>
              <option value="LOST">Lost</option>
            </Select>
          </div>
        </div>

        <div>
          <Label className="!mb-1 !text-xs">Date</Label>
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
        </div>
      </div>

      {isLoading && <Skeleton className="h-96 w-full" />}
      {isError && <ErrorState message="Could not load history." onRetry={() => refetch()} />}
      {rows.length === 0 && !isLoading && !isError && (
        <EmptyState icon={<Archive className="h-8 w-8" />} title="Nothing matches these filters." description="Completed projects and resolved enquiries will show up here." />
      )}

      {rows.length > 0 && (
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">ID</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Service</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr
                  key={`${r.kind}-${r.id}`}
                  id={`history-row-${r.id}`}
                  onClick={() => openRow(r)}
                  className={clsx(
                    "cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50",
                    r.id === highlightId && "bg-amber-50 ring-2 ring-inset ring-amber-300"
                  )}
                >
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      {r.kind === "PROJECT" ? <Trello className="h-3.5 w-3.5" /> : <Inbox className="h-3.5 w-3.5" />}
                      {r.kind === "PROJECT" ? "Project" : r.board === "Estimation" ? "Estimation" : "Enquiry"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400">{r.code}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.service ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{format(new Date(r.eventDate), "d MMM yyyy")}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      {(r.status === "COMPLETED" || r.status === "LOST") && (
                        <Button variant="outline" size="sm" loading={restoringId === r.id} onClick={(e) => handleRestore(r, e)}>
                          <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                          Restore to {r.kind === "PROJECT" ? "Project" : r.board === "Estimation" ? "Estimation" : "Enquiry"}
                        </Button>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openTaskId && <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}

      {openProjectId && <HistoryProjectSummary boardId={openProjectId} onClose={() => setOpenProjectId(null)} />}
    </div>
  );
}

/** Read-only project summary for a History row — deliberately not the live
 * BoardKanbanPage (no edit affordances, no "Mark as Completed", no
 * Procurement toggle that would navigate away): this project's chapter is
 * already closed, so this just shows what it was, task list included. */
function HistoryProjectSummary({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const { data: board, isLoading, isError } = useBoardDetail(boardId);
  const { data: tasks } = useBoardTasks(boardId);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const isLost = board?.accountsApprovalStatus === "REJECTED";
  const status = isLost ? "Lost" : board?.isCompleted ? "Completed" : "In Progress";
  const statusTone = isLost ? "red" : board?.isCompleted ? "green" : "amber";

  return (
    <Modal open onClose={onClose} title={board?.name ?? "Project"} size="lg">
      {isLoading && <Skeleton className="h-48 w-full" />}
      {isError && <ErrorState message="Could not load this project." />}
      {board && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">{board.boardId}</span>
            <Badge tone={statusTone as any}>{status}</Badge>
            {board.service?.name && <Badge tone="slate">{board.service.name}</Badge>}
          </div>
          {board.customer && (
            <p className="text-sm text-slate-600">
              Customer: <span className="font-medium text-slate-800">{board.customer.name}</span>{" "}
              <span className="text-slate-400">· {board.customer.customerId}</span>
            </p>
          )}

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Tasks ({tasks?.length ?? 0})</p>
            <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
              {(tasks ?? []).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setOpenTaskId(t.id)}
                  className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="mr-1.5 text-xs text-slate-400">{t.taskId}</span>
                    {t.title}
                  </span>
                  <Badge tone="slate">{t.stage?.name}</Badge>
                </button>
              ))}
              {(tasks ?? []).length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-400">No tasks on this project.</p>}
            </div>
          </div>
        </div>
      )}

      {openTaskId && <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </Modal>
  );
}
