import React, { useState } from "react";
import { format } from "date-fns";
import { ArrowRightLeft, Banknote, Building2, FileText, FileUp, Flag, History, Power, StickyNote, Trash2, UserPlus, type LucideIcon } from "lucide-react";
import { useAddHistoryNote, useDeleteHistoryNote, useEmployeeHistory, type EmployeeHistoryEntry, type HrEmployee } from "../../api/hr";
import { Button, Card, EmptyState, ErrorState, Input, Label, Skeleton, Textarea } from "../ui/primitives";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { fmtDate } from "../../lib/hrFormat";

const EVENT_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  JOINED: { icon: UserPlus, tone: "bg-emerald-100 text-emerald-700" },
  DESIGNATION_CHANGE: { icon: ArrowRightLeft, tone: "bg-indigo-100 text-indigo-700" },
  DEPARTMENT_CHANGE: { icon: Building2, tone: "bg-blue-100 text-blue-700" },
  SALARY_REVISION: { icon: Banknote, tone: "bg-amber-100 text-amber-800" },
  STATUS_CHANGE: { icon: Power, tone: "bg-red-100 text-red-700" },
  LETTER_ISSUED: { icon: FileText, tone: "bg-purple-100 text-purple-700" },
  DOCUMENT_UPLOADED: { icon: FileUp, tone: "bg-sky-100 text-sky-700" },
  NOTE: { icon: StickyNote, tone: "bg-slate-100 text-slate-600" },
};
const FALLBACK_STYLE = { icon: Flag, tone: "bg-slate-100 text-slate-600" };

export function EmployeeHistoryTab({ employee }: { employee: HrEmployee }) {
  const { push } = useToast();
  const { data: entries, isLoading, isError, refetch } = useEmployeeHistory(employee.id);
  const addNote = useAddHistoryNote(employee.id);
  const removeNote = useDeleteHistoryNote();

  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [eventDate, setEventDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [deleteTarget, setDeleteTarget] = useState<EmployeeHistoryEntry | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!title.trim()) {
      push({ variant: "error", title: "A note title is required." });
      return;
    }
    try {
      await addNote.mutateAsync({ title: title.trim(), details: details.trim() || undefined, eventDate: eventDate || undefined });
      push({ variant: "success", title: "Note added." });
      setTitle("");
      setDetails("");
      setEventDate(format(new Date(), "yyyy-MM-dd"));
    } catch (err) {
      push({ variant: "error", title: "Could not add note", description: extractApiError(err).message });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await removeNote.mutateAsync(deleteTarget.id);
      push({ variant: "success", title: "Note deleted." });
      setDeleteTarget(null);
    } catch (err) {
      push({ variant: "error", title: "Could not delete note", description: extractApiError(err).message });
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Add a note</h3>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label required>Title</Label>
            <Input value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="e.g. Completed probation" />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={eventDate} onChange={(ev) => setEventDate(ev.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <Label>Details</Label>
            <Textarea rows={2} value={details} onChange={(ev) => setDetails(ev.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" loading={addNote.isPending}>
              Add note
            </Button>
          </div>
        </form>
      </Card>

      {isLoading && <Skeleton className="h-48 w-full" />}
      {isError && <ErrorState message="Could not load history." onRetry={() => refetch()} />}
      {entries && entries.length === 0 && <EmptyState icon={<History className="h-8 w-8" />} title="No history recorded yet." />}

      {entries && entries.length > 0 && (
        <Card className="p-4 sm:p-5">
          <ol className="relative space-y-5 border-l border-slate-200 pl-6">
            {entries.map((entry) => {
              const style = EVENT_STYLE[entry.eventType] ?? FALLBACK_STYLE;
              const Icon = style.icon;
              return (
                <li key={entry.id} className="relative">
                  <span className={`absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white ${style.tone}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{entry.title}</p>
                      <p className="text-xs text-slate-400">
                        {fmtDate(entry.eventDate)}
                        {entry.createdByName ? ` · by ${entry.createdByName}` : ""}
                      </p>
                      {entry.details && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{entry.details}</p>}
                    </div>
                    {entry.eventType === "NOTE" && (
                      <Button variant="ghost" size="sm" className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDeleteTarget(entry)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Delete note</span>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete note?"
        message={
          <>
            Delete the note <span className="font-medium text-slate-900">{deleteTarget?.title}</span> from {employee.fullName}'s history?
          </>
        }
        confirmLabel="Delete note"
        loading={removeNote.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
