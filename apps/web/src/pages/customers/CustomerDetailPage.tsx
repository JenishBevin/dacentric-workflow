import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  Building2,
  Plus,
  Pencil,
  User,
  Mail,
  Phone,
  FileText,
  Download,
  Trash2,
  History,
  Briefcase,
  Inbox,
  LifeBuoy,
  Package,
  Video,
} from "lucide-react";
import {
  useCustomerDetail,
  useUpdateCustomer,
  useAddContact,
  useUpdateContact,
  useDeleteContact,
  useUploadCustomerDocument,
  useDeleteCustomerDocument,
  useDownloadCustomerDocumentUrl,
  useAddProduct,
  useDeleteProduct,
  useAddInteraction,
  useDeleteInteraction,
} from "../../api/customers";
import { useCreateTicket } from "../../api/tickets";
import { Button, Input, Select, Textarea, Badge, Skeleton, ErrorState, Card } from "../../components/ui/primitives";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { CustomerStatus } from "../../lib/types";
import { can } from "../../lib/permissions";
import { useAuth } from "../../context/AuthContext";
import { isLocalhost } from "../../lib/isLocalhost";

const STATUS_TONE: Record<CustomerStatus, "green" | "slate" | "amber"> = {
  ACTIVE: "green",
  INACTIVE: "slate",
  PROSPECT: "amber",
};

const TICKET_STATUS_TONE: Record<string, "slate" | "amber" | "green"> = {
  OPEN: "slate",
  IN_PROGRESS: "amber",
  RESOLVED: "green",
  CLOSED: "slate",
};

const TICKET_PRIORITY_TONE: Record<string, "slate" | "amber" | "red"> = {
  LOW: "slate",
  MEDIUM: "slate",
  HIGH: "amber",
  URGENT: "red",
};

const INTERACTION_ICON: Record<string, React.ElementType> = { EMAIL: Mail, CALL: Phone, MEETING: Video };
const INTERACTION_LABEL: Record<string, string> = { EMAIL: "Email", CALL: "Call", MEETING: "Meeting" };

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
  const updateContact = useUpdateContact(customerId ?? "");
  const deleteContact = useDeleteContact(customerId ?? "");
  const uploadDoc = useUploadCustomerDocument(customerId ?? "");
  const deleteDoc = useDeleteCustomerDocument(customerId ?? "");
  const createTicket = useCreateTicket();
  const addProduct = useAddProduct(customerId ?? "");
  const deleteProduct = useDeleteProduct(customerId ?? "");
  const addInteraction = useAddInteraction(customerId ?? "");
  const deleteInteraction = useDeleteInteraction(customerId ?? "");

  const canManage = can(user, "CRM_ERP_LINKING", "OWN");

  const [contactOpen, setContactOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactDesignation, setContactDesignation] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileIndustry, setProfileIndustry] = useState("");
  const [profileCountry, setProfileCountry] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileVatNumber, setProfileVatNumber] = useState("");
  const [profileMainContactName, setProfileMainContactName] = useState("");
  const [profileDesignation, setProfileDesignation] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileAlternateContact, setProfileAlternateContact] = useState("");

  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketPriority, setTicketPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");

  const [productOpen, setProductOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [productQuantity, setProductQuantity] = useState("");
  const [productAmount, setProductAmount] = useState("");
  const [productPurchasedAt, setProductPurchasedAt] = useState("");
  const [productNotes, setProductNotes] = useState("");

  const [interactionOpen, setInteractionOpen] = useState(false);
  const [interactionType, setInteractionType] = useState<"EMAIL" | "CALL" | "MEETING">("CALL");
  const [interactionSubject, setInteractionSubject] = useState("");
  const [interactionOccurredAt, setInteractionOccurredAt] = useState("");
  const [interactionNotes, setInteractionNotes] = useState("");

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !customer) return <ErrorState message="Could not load this customer." onRetry={() => refetch()} />;

  function resetContactForm() {
    setEditingContactId(null);
    setContactName("");
    setContactDesignation("");
    setContactEmail("");
    setContactPhone("");
  }

  function openAddContact() {
    resetContactForm();
    setContactOpen(true);
  }

  function openEditContact(c: { id: string; name: string; designation: string | null; email: string | null; phone: string | null }) {
    setEditingContactId(c.id);
    setContactName(c.name);
    setContactDesignation(c.designation ?? "");
    setContactEmail(c.email ?? "");
    setContactPhone(c.phone ?? "");
    setContactOpen(true);
  }

  async function submitContact() {
    if (!contactName.trim()) {
      push({ variant: "error", title: "Contact name is required." });
      return;
    }
    try {
      if (editingContactId) {
        await updateContact.mutateAsync({ contactId: editingContactId, name: contactName.trim(), designation: contactDesignation, email: contactEmail, phone: contactPhone });
        push({ variant: "success", title: "Contact updated." });
      } else {
        await addContact.mutateAsync({ name: contactName.trim(), designation: contactDesignation, email: contactEmail, phone: contactPhone });
        push({ variant: "success", title: "Contact added." });
      }
      resetContactForm();
      setContactOpen(false);
    } catch (err) {
      push({ variant: "error", title: editingContactId ? "Could not update contact" : "Could not add contact", description: extractApiError(err).message });
    }
  }

  function openEditProfile() {
    setProfileName(customer.name);
    setProfileIndustry(customer.industry ?? "");
    setProfileCountry(customer.country ?? "");
    setProfileWebsite(customer.website ?? "");
    setProfileAddress(customer.address ?? "");
    setProfileVatNumber(customer.vatNumber ?? "");
    setProfileMainContactName(customer.mainContactName ?? "");
    setProfileDesignation(customer.designation ?? "");
    setProfileEmail(customer.email ?? "");
    setProfilePhone(customer.phone ?? "");
    setProfileAlternateContact(customer.alternateContact ?? "");
    setProfileOpen(true);
  }

  async function submitProfile() {
    if (!profileName.trim()) {
      push({ variant: "error", title: "Company name is required." });
      return;
    }
    try {
      await updateCustomer.mutateAsync({
        name: profileName.trim(),
        industry: profileIndustry,
        country: profileCountry,
        website: profileWebsite,
        address: profileAddress,
        vatNumber: profileVatNumber,
        mainContactName: profileMainContactName,
        designation: profileDesignation,
        email: profileEmail,
        phone: profilePhone,
        alternateContact: profileAlternateContact,
      });
      push({ variant: "success", title: "Customer updated." });
      setProfileOpen(false);
    } catch (err) {
      push({ variant: "error", title: "Could not update customer", description: extractApiError(err).message });
    }
  }

  async function submitTicket() {
    if (!ticketTitle.trim() || !ticketDescription.trim()) {
      push({ variant: "error", title: "Title and description are required." });
      return;
    }
    try {
      await createTicket.mutateAsync({ title: ticketTitle.trim(), description: ticketDescription.trim(), priority: ticketPriority, customerId });
      await refetch();
      push({ variant: "success", title: "Ticket logged." });
      setTicketTitle("");
      setTicketDescription("");
      setTicketPriority("MEDIUM");
      setTicketOpen(false);
    } catch (err) {
      push({ variant: "error", title: "Could not log ticket", description: extractApiError(err).message });
    }
  }

  async function submitProduct() {
    if (!productName.trim()) {
      push({ variant: "error", title: "Product name is required." });
      return;
    }
    try {
      await addProduct.mutateAsync({
        name: productName.trim(),
        quantity: productQuantity ? Number(productQuantity) : undefined,
        amount: productAmount ? Number(productAmount) : undefined,
        purchasedAt: productPurchasedAt || undefined,
        notes: productNotes || undefined,
      });
      push({ variant: "success", title: "Product added." });
      setProductName("");
      setProductQuantity("");
      setProductAmount("");
      setProductPurchasedAt("");
      setProductNotes("");
      setProductOpen(false);
    } catch (err) {
      push({ variant: "error", title: "Could not add product", description: extractApiError(err).message });
    }
  }

  async function submitInteraction() {
    if (!interactionSubject.trim() || !interactionOccurredAt) {
      push({ variant: "error", title: "Subject and date are required." });
      return;
    }
    try {
      await addInteraction.mutateAsync({
        type: interactionType,
        subject: interactionSubject.trim(),
        occurredAt: interactionOccurredAt,
        notes: interactionNotes || undefined,
      });
      push({ variant: "success", title: "Activity logged." });
      setInteractionSubject("");
      setInteractionOccurredAt("");
      setInteractionNotes("");
      setInteractionType("CALL");
      setInteractionOpen(false);
    } catch (err) {
      push({ variant: "error", title: "Could not log activity", description: extractApiError(err).message });
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
          <div className="flex items-center gap-2">
            {canManage && (
              <Button variant="outline" size="sm" onClick={openEditProfile}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
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
          <div>
            <p className="text-xs text-slate-400">Main Contact</p>
            <p className="text-slate-700">
              {customer.mainContactName ?? "—"}
              {customer.designation ? ` (${customer.designation})` : ""}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Email</p>
            <p className="text-slate-700">{customer.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Phone</p>
            <p className="text-slate-700">{customer.phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Alternate Number</p>
            <p className="text-slate-700">{customer.alternateContact ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">VAT Number</p>
            <p className="text-slate-700">{customer.vatNumber ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Address</p>
            <p className="text-slate-700">{customer.address ?? "—"}</p>
          </div>
          {customer.website && (
            <div>
              <p className="text-xs text-slate-400">Website</p>
              <a href={customer.website} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                {customer.website}
              </a>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Contacts */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Contacts</p>
            {canManage && (
              <Button variant="ghost" size="sm" onClick={openAddContact}>
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
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                      onClick={() => openEditContact(c)}
                      aria-label="Edit contact"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                      onClick={() => deleteContact.mutateAsync(c.id)}
                      aria-label="Remove contact"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
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

        {isLocalhost && (
          <>
            {/* Support Tickets */}
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">
                  <LifeBuoy className="mr-1.5 inline h-4 w-4 text-slate-400" /> Support Tickets
                </p>
                {canManage && (
                  <Button variant="ghost" size="sm" onClick={() => setTicketOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Log Ticket
                  </Button>
                )}
              </div>
              {customer.tickets.items.length === 0 && <p className="text-sm text-slate-400">No support tickets yet.</p>}
              <div className="space-y-1.5">
                {customer.tickets.items.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{t.title}</p>
                      <p className="font-mono text-xs text-slate-400">{t.ticketId}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge tone={TICKET_PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                      <Badge tone={TICKET_STATUS_TONE[t.status]}>{t.status.replace("_", " ")}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Products Purchased */}
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">
                  <Package className="mr-1.5 inline h-4 w-4 text-slate-400" /> Products Purchased
                </p>
                {canManage && (
                  <Button variant="ghost" size="sm" onClick={() => setProductOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                )}
              </div>
              {customer.products.length === 0 && <p className="text-sm text-slate-400">No products recorded yet.</p>}
              <div className="space-y-2">
                {customer.products.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">
                        {[p.quantity != null && `Qty ${p.quantity}`, p.amount != null && `AED ${p.amount.toLocaleString()}`, p.purchasedAt && format(new Date(p.purchasedAt), "d MMM yyyy")]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    {canManage && (
                      <button
                        className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                        onClick={() => deleteProduct.mutateAsync(p.id)}
                        aria-label="Remove product"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Activity Log — Emails / Calls / Meetings */}
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">
                  <Video className="mr-1.5 inline h-4 w-4 text-slate-400" /> Emails, Calls &amp; Meetings
                </p>
                {canManage && (
                  <Button variant="ghost" size="sm" onClick={() => setInteractionOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Log Activity
                  </Button>
                )}
              </div>
              {customer.interactions.length === 0 && <p className="text-sm text-slate-400">No activity logged yet.</p>}
              <div className="space-y-2">
                {customer.interactions.map((i) => {
                  const Icon = INTERACTION_ICON[i.type];
                  return (
                    <div key={i.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 p-2.5">
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{i.subject}</p>
                          <p className="text-xs text-slate-400">
                            {INTERACTION_LABEL[i.type]} · {format(new Date(i.occurredAt), "d MMM yyyy, HH:mm")} · {i.loggedBy.name}
                          </p>
                        </div>
                      </div>
                      {canManage && (
                        <button
                          className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                          onClick={() => deleteInteraction.mutateAsync(i.id)}
                          aria-label="Remove activity"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
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

      <Modal open={contactOpen} onClose={() => { setContactOpen(false); resetContactForm(); }} title={editingContactId ? "Edit Contact" : "Add Contact"}>
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
            <Button variant="outline" onClick={() => { setContactOpen(false); resetContactForm(); }}>
              Cancel
            </Button>
            <Button onClick={submitContact} loading={addContact.isPending || updateContact.isPending}>
              {editingContactId ? "Save Changes" : "Add Contact"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="Edit Customer" size="lg">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Company / Customer Name <span className="text-red-500">*</span>
            </label>
            <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Industry</label>
              <Input value={profileIndustry} onChange={(e) => setProfileIndustry(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
              <Input value={profileCountry} onChange={(e) => setProfileCountry(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Website</label>
            <Input value={profileWebsite} onChange={(e) => setProfileWebsite(e.target.value)} placeholder="https://example.com" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Address</label>
            <Input value={profileAddress} onChange={(e) => setProfileAddress(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">VAT Number</label>
            <Input value={profileVatNumber} onChange={(e) => setProfileVatNumber(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Main Contact Person</label>
              <Input value={profileMainContactName} onChange={(e) => setProfileMainContactName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Designation</label>
              <Input value={profileDesignation} onChange={(e) => setProfileDesignation(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <Input type="email" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
              <Input value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Alternate Number</label>
            <Input value={profileAlternateContact} onChange={(e) => setProfileAlternateContact(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setProfileOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitProfile} loading={updateCustomer.isPending}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {isLocalhost && (
        <>
          <Modal open={ticketOpen} onClose={() => setTicketOpen(false)} title="Log Support Ticket">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input value={ticketTitle} onChange={(e) => setTicketTitle(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Description <span className="text-red-500">*</span>
                </label>
                <Textarea rows={4} value={ticketDescription} onChange={(e) => setTicketDescription(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Priority</label>
                <Select value={ticketPriority} onChange={(e) => setTicketPriority(e.target.value as typeof ticketPriority)}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setTicketOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submitTicket} loading={createTicket.isPending}>
                  Log Ticket
                </Button>
              </div>
            </div>
          </Modal>

          <Modal open={productOpen} onClose={() => setProductOpen(false)} title="Add Product Purchased">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Quantity</label>
                  <Input type="number" min="1" value={productQuantity} onChange={(e) => setProductQuantity(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Amount</label>
                  <Input type="number" min="0" step="0.01" value={productAmount} onChange={(e) => setProductAmount(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Purchase Date</label>
                <Input type="date" value={productPurchasedAt} onChange={(e) => setProductPurchasedAt(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <Textarea rows={3} value={productNotes} onChange={(e) => setProductNotes(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setProductOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submitProduct} loading={addProduct.isPending}>
                  Add Product
                </Button>
              </div>
            </div>
          </Modal>

          <Modal open={interactionOpen} onClose={() => setInteractionOpen(false)} title="Log Activity">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
                <Select value={interactionType} onChange={(e) => setInteractionType(e.target.value as typeof interactionType)}>
                  <option value="EMAIL">Email</option>
                  <option value="CALL">Call</option>
                  <option value="MEETING">Meeting</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Subject <span className="text-red-500">*</span>
                </label>
                <Input value={interactionSubject} onChange={(e) => setInteractionSubject(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Date &amp; Time <span className="text-red-500">*</span>
                </label>
                <Input type="datetime-local" value={interactionOccurredAt} onChange={(e) => setInteractionOccurredAt(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <Textarea rows={3} value={interactionNotes} onChange={(e) => setInteractionNotes(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setInteractionOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submitInteraction} loading={addInteraction.isPending}>
                  Log Activity
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}
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
