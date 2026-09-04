import React, { useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Plus, Paperclip, Trash2, Download, Ticket as TicketIcon } from "lucide-react";
import {
  useMyTickets,
  useAllTickets,
  useTicket,
  useCreateTicket,
  useUpdateTicketStatus,
  useUploadTicketAttachment,
  useDeleteTicketAttachment,
  ticketAttachmentUrl,
  TicketStatus,
  TicketPriority,
  Ticket,
} from "../api/tickets";
import { Badge, Button, Input, Label, Textarea, Select, Skeleton, EmptyState, Card, ErrorState } from "../components/ui/primitives";
import { PriorityBadge } from "../components/workflow/badges";
import { Drawer } from "../components/ui/Drawer";
import { useAuth } from "../context/AuthContext";
import { can } from "../lib/permissions";
import { useToast } from "../context/ToastContext";
import { extractApiError } from "../lib/apiClient";

const STATUS_TONE: Record<TicketStatus, "blue" | "amber" | "green" | "slate"> = {
  OPEN: "blue",
  IN_PROGRESS: "amber",
  RESOLVED: "green",
  CLOSED: "slate",
};
const STATUS_LABEL: Record<TicketStatus, string> = { OPEN: "Open", IN_PROGRESS: "In Progress", RESOLVED: "Resolved", CLOSED: "Closed" };
const SCREENSHOT_TYPES = "image/png,image/jpeg,image/gif,image/webp";
const MAX_SCREENSHOT_MB = 10;

function NewTicketDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { push } = useToast();
  const createTicket = useCreateTicket();
  const uploadAttachment = useUploadTicketAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [files, setFiles] = useState<File[]>([]);

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setFiles([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const ticket = await createTicket.mutateAsync({ title, description, priority });
      for (const file of files) {
        await uploadAttachment.mutateAsync({ ticketId: ticket.id, file }).catch((err) => {
          push({ variant: "error", title: `Could not attach ${file.name}`, description: extractApiError(err).message });
        });
      }
      push({ variant: "success", title: "Ticket submitted.", description: `${ticket.ticketId} — we'll get back to you.` });
      reset();
      onClose();
    } catch (err) {
      push({ variant: "error", title: "Could not submit ticket", description: extractApiError(err).message });
    }
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    const tooBig = picked.find((f) => f.size > MAX_SCREENSHOT_MB * 1024 * 1024);
    if (tooBig) {
      push({ variant: "error", title: "File too large", description: `${tooBig.name} is over ${MAX_SCREENSHOT_MB} MB.` });
      return;
    }
    setFiles((prev) => [...prev, ...picked]);
  }

  return (
    <Drawer open={open} onClose={onClose} title="Raise a Ticket" subtitle="Describe the issue you're running into. Screenshots are optional.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label required>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} placeholder="Short summary of the issue" />
        </div>
        <div>
          <Label required>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={5} maxLength={5000} placeholder="What happened, what you expected, and steps to reproduce if you have them." />
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </Select>
        </div>
        <div>
          <Label>Screenshots (optional)</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-4 w-4" /> Add screenshot
          </Button>
          <input ref={fileInputRef} type="file" accept={SCREENSHOT_TYPES} multiple className="hidden" onChange={onPickFiles} />
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">
                  <span className="truncate">{f.name}</span>
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="ml-2 shrink-0 text-slate-400 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-slate-400">PNG, JPG, GIF or WEBP. Up to {MAX_SCREENSHOT_MB} MB each.</p>
        </div>
        <Button type="submit" loading={createTicket.isPending || uploadAttachment.isPending} disabled={!title.trim() || !description.trim()}>
          Submit ticket
        </Button>
      </form>
    </Drawer>
  );
}

function TicketDetailDrawer({ ticketId, onClose, canManage }: { ticketId: string | null; onClose: () => void; canManage: boolean }) {
  const { push } = useToast();
  const { data: ticket, isLoading } = useTicket(ticketId ?? undefined);
  const updateStatus = useUpdateTicketStatus();
  const uploadAttachment = useUploadTicketAttachment();
  const deleteAttachment = useDeleteTicketAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<TicketStatus>("OPEN");
  const [resolutionNote, setResolutionNote] = useState("");

  React.useEffect(() => {
    if (ticket) {
      setStatus(ticket.status);
      setResolutionNote(ticket.resolutionNote ?? "");
    }
  }, [ticket?.id]);

  async function saveStatus() {
    if (!ticket) return;
    try {
      await updateStatus.mutateAsync({ ticketId: ticket.id, status, resolutionNote: resolutionNote || undefined });
      push({ variant: "success", title: "Ticket updated." });
    } catch (err) {
      push({ variant: "error", title: "Could not update ticket", description: extractApiError(err).message });
    }
  }

  async function onAddFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !ticket) return;
    if (file.size > MAX_SCREENSHOT_MB * 1024 * 1024) {
      push({ variant: "error", title: "File too large", description: `Screenshots must be ${MAX_SCREENSHOT_MB} MB or smaller.` });
      return;
    }
    try {
      await uploadAttachment.mutateAsync({ ticketId: ticket.id, file });
    } catch (err) {
      push({ variant: "error", title: "Could not attach screenshot", description: extractApiError(err).message });
    }
  }

  return (
    <Drawer open={!!ticketId} onClose={onClose} title={ticket?.ticketId ?? "Ticket"} subtitle={ticket?.title}>
      {isLoading && <Skeleton className="h-40 w-full" />}
      {ticket && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge>
            <PriorityBadge priority={ticket.priority} />
            {ticket.createdBy && <span className="text-xs text-slate-400">by {ticket.createdBy.name}</span>}
            <span className="text-xs text-slate-400">{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
          </div>

          <p className="whitespace-pre-wrap text-sm text-slate-700">{ticket.description}</p>

          {ticket.resolutionNote && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-600">Resolution</p>
              {ticket.resolutionNote}
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Screenshots</p>
              <Button type="button" variant="ghost" size="sm" loading={uploadAttachment.isPending} onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-3.5 w-3.5" /> Add
              </Button>
              <input ref={fileInputRef} type="file" accept={SCREENSHOT_TYPES} className="hidden" onChange={onAddFile} />
            </div>
            {(!ticket.attachments || ticket.attachments.length === 0) && <p className="text-xs text-slate-400">No screenshots attached.</p>}
            {ticket.attachments && ticket.attachments.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {ticket.attachments.map((a) => (
                  <div key={a.id} className="group relative overflow-hidden rounded-lg border border-slate-200">
                    <a href={ticketAttachmentUrl(ticket.id, a.id)} target="_blank" rel="noreferrer">
                      <img src={ticketAttachmentUrl(ticket.id, a.id)} alt={a.fileName} className="h-24 w-full object-cover" />
                    </a>
                    <div className="flex items-center justify-between bg-slate-50 px-2 py-1">
                      <span className="truncate text-[11px] text-slate-500">{a.fileName}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <a href={ticketAttachmentUrl(ticket.id, a.id)} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-700">
                          <Download className="h-3 w-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => deleteAttachment.mutate({ ticketId: ticket.id, attachmentId: a.id })}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canManage && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Update Status</p>
              <Select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </Select>
              <Textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} rows={3} maxLength={2000} placeholder="Resolution note (optional)" />
              <Button size="sm" loading={updateStatus.isPending} onClick={saveStatus}>
                Save
              </Button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function TicketRow({ ticket, onClick, showRequester }: { ticket: Ticket; onClick: () => void; showRequester?: boolean }) {
  return (
    <Card onClick={onClick} className="flex cursor-pointer flex-col gap-2 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">{ticket.ticketId}</span>
          <p className="truncate font-medium text-slate-800">{ticket.title}</p>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {showRequester && ticket.createdBy && <>{ticket.createdBy.name} · </>}
          {format(new Date(ticket.createdAt), "d MMM yyyy")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <PriorityBadge priority={ticket.priority} />
        <Badge tone={STATUS_TONE[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge>
      </div>
    </Card>
  );
}

export default function TicketsPage() {
  const { user } = useAuth();
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [view, setView] = useState<"mine" | "all">("mine");

  const isManager = can(user, "MANAGE_TICKETS", "ALL");

  const { data: myTickets, isLoading: myLoading, isError: myError, refetch: refetchMine } = useMyTickets();
  const { data: allTickets, isLoading: allLoading, isError: allError, refetch: refetchAll } = useAllTickets(statusFilter, { enabled: isManager && view === "all" });

  const rows = view === "all" ? allTickets : myTickets;
  const isLoading = view === "all" ? allLoading : myLoading;
  const isError = view === "all" ? allError : myError;
  const refetch = view === "all" ? refetchAll : refetchMine;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Support Tickets</h1>
          <p className="text-sm text-slate-500">Report an issue you're running into — a screenshot helps but isn't required.</p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> Raise a Ticket
        </Button>
      </div>

      {isManager && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5">
            <button
              onClick={() => setView("mine")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${view === "mine" ? "bg-brand-600 text-white" : "text-slate-500"}`}
            >
              My Tickets
            </button>
            <button
              onClick={() => setView("all")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${view === "all" ? "bg-brand-600 text-white" : "text-slate-500"}`}
            >
              All Tickets
            </button>
          </div>
          {view === "all" && (
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TicketStatus | "")} className="!w-40">
              <option value="">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </Select>
          )}
        </div>
      )}

      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && <ErrorState message="Could not load tickets." onRetry={() => refetch()} />}
      {rows && rows.length === 0 && (
        <EmptyState icon={<TicketIcon className="h-8 w-8" />} title={view === "all" ? "No tickets match this filter." : "No tickets yet."} description={view === "mine" ? "Raise one above if something's not working." : undefined} />
      )}
      {rows && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((t) => (
            <TicketRow key={t.id} ticket={t} onClick={() => setDetailId(t.id)} showRequester={view === "all"} />
          ))}
        </div>
      )}

      <NewTicketDrawer open={newOpen} onClose={() => setNewOpen(false)} />
      <TicketDetailDrawer ticketId={detailId} onClose={() => setDetailId(null)} canManage={isManager} />
    </div>
  );
}
