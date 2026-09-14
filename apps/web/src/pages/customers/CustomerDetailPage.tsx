import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Building2, Plus, User, Mail, Phone, FileText, Download, Trash2, History, Briefcase, Inbox } from "lucide-react";
import {
  useCustomerDetail,
  useUpdateCustomer,
  useAddContact,
  useDeleteContact,
  useUploadCustomerDocument,
  useDeleteCustomerDocument,
  useDownloadCustomerDocumentUrl,
} from "../../api/customers";
import { Button, Input, Select, Badge, Skeleton, ErrorState, Card } from "../../components/ui/primitives";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { CustomerStatus } from "../../lib/types";
import { can } from "../../lib/permissions";
import { useAuth } from "../../context/AuthContext";

const STATUS_TONE: Record<CustomerStatus, "green" | "slate" | "amber"> = {
  ACTIVE: "green",
  INACTIVE: "slate",
  PROSPECT: "amber",
};

const ACTION_LABEL: Record<string, string> = {
  CREATE: "created",
  EDIT: "updated",
  DELETE: "deleted",
  MOVE: "moved",
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { user } = useAuth();
  const { push } = useToast();
  const { data: customer, isLoading, isError, refetch } = useCustomerDetail(customerId);
  const updateCustomer = useUpdateCustomer(customerId ?? "");
  const addContact = useAddContact(customerId ?? "");
  const deleteContact = useDeleteContact(customerId ?? "");
  const uploadDoc = useUploadCustomerDocument(customerId ?? "");
  const deleteDoc = useDeleteCustomerDocument(customerId ?? "");

  const canManage = can(user, "CRM_ERP_LINKING", "OWN");

  const [contactOpen, setContactOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactDesignation, setContactDesignation] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !customer) return <ErrorState message="Could not load this customer." onRetry={() => refetch()} />;

  async function submitContact() {
    if (!contactName.trim()) {
      push({ variant: "error", title: "Contact name is required." });
      return;
    }
    try {
      await addContact.mutateAsync({ name: contactName.trim(), designation: contactDesignation, email: contactEmail, phone: contactPhone });
      push({ variant: "success", title: "Contact added." });
      setContactName("");
      setContactDesignation("");
      setContactEmail("");
      setContactPhone("");
      setContactOpen(false);
    } catch (err) {
      push({ variant: "error", title: "Could not add contact", description: extractApiError(err).message });
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/workflow/customers" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> All Customers
      </Link>

      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{customer.name}</h1>
              <p className="font-mono text-xs text-slate-400">{customer.customerId}</p>
            </div>
          </div>
          {canManage && (
            <Select
              value={customer.status}
              onChange={async (e) => {
                await updateCustomer.mutateAsync({ status: e.target.value });
                push({ variant: "success", title: "Status updated." });
              }}
              className="w-36"
            >
              <option value="PROSPECT">Prospect</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-slate-400">Status</p>
            <Badge tone={STATUS_TONE[customer.status]}>{customer.status}</Badge>
          </div>
          <div>
            <p className="text-xs text-slate-400">Account Manager</p>
            <p className="text-slate-700">{customer.accountManager?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Industry</p>
            <p className="text-slate-700">{customer.industry ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Country</p>
            <p className="text-slate-700">{customer.country ?? "—"}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Contacts */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Contacts</p>
            {canManage && (
              <Button variant="ghost" size="sm" onClick={() => setContactOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            )}
          </div>
          {customer.contacts.length === 0 && <p className="text-sm text-slate-400">No contacts yet.</p>}
          <div className="space-y-2">
            {customer.contacts.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <User className="h-3.5 w-3.5 text-slate-400" /> {c.name}
                    {c.isPrimary && <Badge tone="indigo">Primary</Badge>}
                  </p>
                  {c.designation && <p className="text-xs text-slate-500">{c.designation}</p>}
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-400">
                    {c.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {c.email}
                      </span>
                    )}
                    {c.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </span>
                    )}
                  </div>
                </div>
                {canManage && (
                  <button
                    className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                    onClick={() => deleteContact.mutateAsync(c.id)}
                    aria-label="Remove contact"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Enquiries */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">
              <Inbox className="mr-1.5 inline h-4 w-4 text-slate-400" /> Enquiries
            </p>
            <p className="text-xs text-slate-400">
              {customer.enquiries.total} total · {customer.enquiries.won} won · {customer.enquiries.open} open
            </p>
          </div>
          {customer.enquiries.items.length === 0 && <p className="text-sm text-slate-400">No enquiries linked yet.</p>}
          <div className="space-y-1.5">
            {customer.enquiries.items.map((t) => (
              <Link
                key={t.id}
                to={`/workflow/boards/${t.board.id}?task=${t.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-sm hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{t.title}</p>
                  <p className="text-xs text-slate-400">
                    {t.taskId}
                    {t.enquiryRecord && <> · {t.enquiryRecord.enquiryId}</>}
                    {t.estimationRecord && <> · {t.estimationRecord.estimationId}</>}
                  </p>
                </div>
                <Badge tone={t.stage.isTerminal ? (t.stage.name.toLowerCase().includes("lost") ? "red" : "green") : "slate"}>{t.stage.name}</Badge>
              </Link>
            ))}
          </div>
        </Card>

        {/* Projects */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">
              <Briefcase className="mr-1.5 inline h-4 w-4 text-slate-400" /> Projects
            </p>
            <p className="text-xs text-slate-400">
              {customer.projects.total} total · {customer.projects.completed} completed · {customer.projects.inProgress} in progress
            </p>
          </div>
          {customer.projects.items.length === 0 && <p className="text-sm text-slate-400">No projects linked yet.</p>}
          <div className="space-y-1.5">
            {customer.projects.items.map((b) => (
              <Link
                key={b.id}
                to={`/workflow/boards/${b.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-sm hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{b.name}</p>
                  <p className="text-xs text-slate-400">
                    {b.boardId} · {b._count.tasks} task{b._count.tasks === 1 ? "" : "s"}
                  </p>
                </div>
                <Badge tone={b.isCompleted ? "green" : "slate"}>{b.isCompleted ? "Completed" : "In Progress"}</Badge>
              </Link>
            ))}
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold text-slate-800">
            <History className="mr-1.5 inline h-4 w-4 text-slate-400" /> Recent Activity
          </p>
          {customer.recentActivity.length === 0 && <p className="text-sm text-slate-400">No activity recorded yet.</p>}
          <div className="space-y-0">
            {customer.recentActivity.map((entry, idx) => (
              <div key={entry.id} className="relative flex gap-3 pb-3 pl-1">
                {idx !== customer.recentActivity.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" />}
                <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                <div className="min-w-0 flex-1 text-xs">
                  <span className="font-medium text-slate-700">{entry.actorName}</span>{" "}
                  <span className="text-slate-500">
                    {ACTION_LABEL[entry.action] ?? entry.action.toLowerCase()} {entry.entityType.toLowerCase()}
                    {entry.field ? ` — ${entry.field}` : ""}
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-400">{format(new Date(entry.createdAt), "d MMM yyyy, HH:mm")}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Documents */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">
            <FileText className="mr-1.5 inline h-4 w-4 text-slate-400" /> Documents
          </p>
          {canManage && (
            <label className="cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
              Upload
              <input
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    await uploadDoc.mutateAsync(file);
                    push({ variant: "success", title: "Document uploaded." });
                  } catch (err) {
                    push({ variant: "error", title: "Upload failed", description: extractApiError(err).message });
                  }
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        {customer.documents.length === 0 && <p className="text-sm text-slate-400">No documents uploaded yet.</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {customer.documents.map((d) => (
            <DocumentRow key={d.id} document={d} customerId={customerId!} canManage={canManage} onDelete={() => deleteDoc.mutateAsync(d.id)} />
          ))}
        </div>
      </Card>

      <Modal open={contactOpen} onClose={() => setContactOpen(false)} title="Add Contact">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Name <span className="text-red-500">*</span>
            </label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Designation</label>
            <Input value={contactDesignation} onChange={(e) => setContactDesignation(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setContactOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitContact} loading={addContact.isPending}>
              Add Contact
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const DocumentRow: React.FC<{ document: any; customerId: string; canManage: boolean; onDelete: () => void }> = ({
  document,
  customerId,
  canManage,
  onDelete,
}) => {
  const url = useDownloadCustomerDocumentUrl(customerId, document.id);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-800">{document.fileName}</p>
        <p className="text-xs text-slate-400">
          {formatBytes(document.fileSizeBytes)} · {document.uploadedBy.name}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <a href={url} target="_blank" rel="noreferrer" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Download">
          <Download className="h-3.5 w-3.5" />
        </a>
        {canManage && (
          <button onClick={onDelete} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500" aria-label="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
