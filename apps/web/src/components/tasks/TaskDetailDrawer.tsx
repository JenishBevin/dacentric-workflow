import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Drawer } from "../ui/Drawer";
import {
  Button,
  Input,
  Label,
  Select,
  Badge,
  Checkbox,
  Skeleton,
  Avatar,
} from "../ui/primitives";
import { RichTextEditor } from "../ui/RichTextEditor";
import { Modal } from "../ui/Modal";
import { PeoplePicker } from "./PeoplePicker";
import { ChecklistSection } from "./ChecklistSection";
import { CommentsSection } from "./CommentsSection";
import { AttachmentsSection } from "./AttachmentsSection";
import { SecretAttachmentsSection } from "./SecretAttachmentsSection";
import { DependenciesSection } from "./DependenciesSection";
import { ActivitySection } from "./ActivitySection";
import { PriorityBadge, ApprovalStatusBadge } from "../workflow/badges";
import { useTask, useUpdateTask, useMoveTask, useSetAssignees, useWatcherMutations, useSetTaskTags, useApprovalMutations, useDuplicateTask, useDeleteTask, useAwardTask, useMarkTaskLost, useLostApprovalMutations, useRejectAccountsTask, useSaveEstimationQuote } from "../../api/tasks";
import { useBoardDetail } from "../../api/boards";
import { useTags, useCreateTag } from "../../api/misc";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { can, isAdmin, canSeeSecretAttachments } from "../../lib/permissions";
import { extractApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Repeat, Link2, Copy, Trash2, Check, X as XIcon, BadgeCheck, ThumbsDown, Landmark, Receipt, Plus, PauseCircle } from "lucide-react";
import { format } from "date-fns";
import clsx from "clsx";
import { useCustomerDetail } from "../../api/customers";
import { generateQuotationPdf, DEFAULT_PAYMENT_TERMS, DEFAULT_NOTES, DEFAULT_GENERAL_TERMS } from "../../lib/quotationPdf";

interface QuoteLineItemForm {
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
}

function emptyLineItem(): QuoteLineItemForm {
  return { description: "", qty: "1", unit: "Nos", unitPrice: "" };
}

// e.g. "QPTS-2026-0006" -> "QPTS/QN/2026-0006" — the quotation's suggested
// reference number, still editable in the popup before it's saved.
function defaultQuotationRef(estimationId?: string | null): string {
  return estimationId ? estimationId.replace(/^QPTS-/, "QPTS/QN/") : "";
}

interface Props {
  taskId: string | null;
  onClose: () => void;
  onDeleted?: () => void;
  /** Opened from a read-only context (Project/Task History's summary) —
   *  this record is a closed chapter, so none of the workflow-transition
   *  buttons (Qualified/Submit/Awarded/Lost/Approve/Reject) render. */
  readOnly?: boolean;
}

/**
 * Full Task Detail Panel (Section 14/39): every field group the spec lists,
 * laid out as one scrollable drawer with clearly labelled sections (rather
 * than tabs) so nothing important is hidden by default — closer to how
 * enterprise work-management tools like this one present a task.
 */
export const TaskDetailDrawer: React.FC<Props> = ({ taskId, onClose, onDeleted, readOnly }) => {
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const { data: task, isLoading } = useTask(taskId ?? undefined);
  const { data: board } = useBoardDetail(task?.boardId);
  const updateTask = useUpdateTask(taskId ?? "");
  const moveTask = useMoveTask();
  const setAssignees = useSetAssignees();
  const watcherMutations = useWatcherMutations(taskId ?? "");
  const setTags = useSetTaskTags(taskId ?? "");
  const { approve, reject } = useApprovalMutations(taskId ?? "");
  const lostApproval = useLostApprovalMutations(taskId ?? "");
  const duplicateTask = useDuplicateTask();
  const deleteTask = useDeleteTask();
  const awardTask = useAwardTask();
  const markTaskLost = useMarkTaskLost();
  const rejectAccountsTask = useRejectAccountsTask();
  const saveQuote = useSaveEstimationQuote();
  const { data: allTags } = useTags();
  const createTag = useCreateTag();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [wipConfirm, setWipConfirm] = useState<{ stageId: string; message: string } | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [lostRejectOpen, setLostRejectOpen] = useState(false);
  const [lostRejectReason, setLostRejectReason] = useState("");
  const [lostRequestOpen, setLostRequestOpen] = useState(false);
  const [lostRequestReason, setLostRequestReason] = useState("");
  const [accountsRejectOpen, setAccountsRejectOpen] = useState(false);
  const [accountsRejectReason, setAccountsRejectReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [quoteTitle, setQuoteTitle] = useState("");
  const [quoteRef, setQuoteRef] = useState("");
  const [quoteRecipientName, setQuoteRecipientName] = useState("");
  const [quoteRecipientCompany, setQuoteRecipientCompany] = useState("");
  const [quoteRecipientLocation, setQuoteRecipientLocation] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("AED");
  const [quoteVatRate, setQuoteVatRate] = useState("5");
  const [quoteValidityDays, setQuoteValidityDays] = useState("7");
  const [quotePaymentTerms, setQuotePaymentTerms] = useState(DEFAULT_PAYMENT_TERMS);
  const [quoteNotes, setQuoteNotes] = useState(DEFAULT_NOTES);
  const [quoteGeneralTerms, setQuoteGeneralTerms] = useState(DEFAULT_GENERAL_TERMS);
  const [quotePreparerName, setQuotePreparerName] = useState("");
  const [quotePreparerDesignation, setQuotePreparerDesignation] = useState("");
  const [quotePreparerMobile, setQuotePreparerMobile] = useState("");
  const [quoteLineItems, setQuoteLineItems] = useState<QuoteLineItemForm[]>([emptyLineItem()]);
  const [quoteGenerating, setQuoteGenerating] = useState(false);
  const { data: quoteCustomer } = useCustomerDetail(task?.customerId ?? undefined);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const canEdit = can(user, "EDIT_TASK") || task?.createdById === user?.id;
  const canDelete = can(user, "DELETE_TASK");
  const canAssign = can(user, "ASSIGN_TASK");
  const canMove = can(user, "MOVE_TASK");
  const canCollab = can(user, "MANAGE_TASK_COLLAB");
  const canCreateTags = can(user, "CREATE_BOARD"); // tag creation is permission-controlled (Section 20); linking existing tags is not.
  const isApprover = !!task && (task.approverUserId === user?.id || isAdmin(user));

  async function saveField(payload: Record<string, unknown>) {
    if (!taskId) return;
    try {
      await updateTask.mutateAsync({ ...payload, version: task?.version });
    } catch (err) {
      push({ variant: "error", title: "Could not save changes", description: extractApiError(err).message });
    }
  }

  async function performMove(stageId: string, confirmWipOverride = false) {
    if (!taskId) return;
    try {
      await moveTask.mutateAsync({ taskId, stageId, confirmWipOverride, version: task?.version });
      setWipConfirm(null);
    } catch (err) {
      const apiErr = extractApiError(err);
      if (apiErr.code === "CONFLICT" && /WIP limit/i.test(apiErr.message)) {
        setWipConfirm({ stageId, message: apiErr.message });
      } else {
        push({ variant: "error", title: "Could not move task", description: apiErr.message });
      }
    }
  }

  function openQuotation() {
    if (task?.quotation) {
      setQuoteTitle(task.quotation.title ?? "");
      setQuoteRef(task.quotation.quotationRef ?? defaultQuotationRef(task.estimationId));
      setQuoteRecipientName(task.quotation.recipientName ?? "");
      setQuoteRecipientCompany(task.quotation.recipientCompany ?? "");
      setQuoteRecipientLocation(task.quotation.recipientLocation ?? "");
      setQuoteCurrency(task.quotation.currency);
      setQuoteVatRate(String(task.quotation.vatRate));
      setQuoteValidityDays(String(task.quotation.validityDays ?? 7));
      setQuotePaymentTerms(task.quotation.paymentTerms ?? DEFAULT_PAYMENT_TERMS);
      setQuoteNotes(task.quotation.notes ?? DEFAULT_NOTES);
      setQuoteGeneralTerms(task.quotation.generalTerms ?? DEFAULT_GENERAL_TERMS);
      setQuotePreparerName(task.quotation.preparerName ?? user?.name ?? "");
      setQuotePreparerDesignation(task.quotation.preparerDesignation ?? user?.employee?.jobTitle ?? "");
      setQuotePreparerMobile(task.quotation.preparerMobile ?? "");
      setQuoteLineItems(
        task.quotation.lineItems.length
          ? task.quotation.lineItems.map((li) => ({ description: li.description, qty: String(li.qty), unit: li.unit, unitPrice: String(li.unitPrice) }))
          : [emptyLineItem()]
      );
    } else {
      setQuoteTitle("");
      setQuoteRef(defaultQuotationRef(task?.estimationId));
      setQuoteRecipientName(quoteCustomer?.mainContactName ?? "");
      setQuoteRecipientCompany(quoteCustomer?.name ?? "");
      setQuoteRecipientLocation(quoteCustomer?.city || quoteCustomer?.address || "");
      setQuoteCurrency("AED");
      setQuoteVatRate("5");
      setQuoteValidityDays("7");
      setQuotePaymentTerms(DEFAULT_PAYMENT_TERMS);
      setQuoteNotes(DEFAULT_NOTES);
      setQuoteGeneralTerms(DEFAULT_GENERAL_TERMS);
      setQuotePreparerName(user?.name ?? "");
      setQuotePreparerDesignation(user?.employee?.jobTitle ?? "");
      setQuotePreparerMobile("");
      setQuoteLineItems([emptyLineItem()]);
    }
    setQuotationOpen(true);
  }

  function handleQuoteCurrencyChange(currency: string) {
    setQuoteCurrency(currency);
    setQuoteVatRate(currency === "AED" ? "5" : "0");
  }

  function updateLineItem(index: number, patch: Partial<QuoteLineItemForm>) {
    setQuoteLineItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addLineItem() {
    setQuoteLineItems((rows) => [...rows, emptyLineItem()]);
  }

  function removeLineItem(index: number) {
    setQuoteLineItems((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
  }

  const parsedLineItems = quoteLineItems
    .map((row) => ({ description: row.description.trim(), qty: Number(row.qty), unit: row.unit.trim() || "Nos", unitPrice: Number(row.unitPrice) }))
    .filter((row) => row.description && Number.isFinite(row.qty) && row.qty > 0 && Number.isFinite(row.unitPrice) && row.unitPrice >= 0);

  const quoteSubtotal = parsedLineItems.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const quoteVatAmount = (quoteSubtotal * (Number(quoteVatRate) || 0)) / 100;
  const quoteTotal = quoteSubtotal + quoteVatAmount;

  async function submitQuotation(mode: "with" | "without" | "both" = "with") {
    if (!taskId) return;
    if (!quoteTitle.trim()) {
      push({ variant: "error", title: "Enter a title for the proposal." });
      return;
    }
    if (parsedLineItems.length === 0) {
      push({ variant: "error", title: "Add at least one line item with a description, quantity and unit price." });
      return;
    }
    const vatRate = Number.isNaN(Number(quoteVatRate)) ? 0 : Number(quoteVatRate);
    const validityDays = Number.isNaN(Number(quoteValidityDays)) || Number(quoteValidityDays) <= 0 ? 7 : Number(quoteValidityDays);
    setQuoteGenerating(true);
    try {
      const quotationRef = quoteRef.trim() || defaultQuotationRef(task?.estimationId);
      const saved = await saveQuote.mutateAsync({
        taskId,
        currency: quoteCurrency,
        title: quoteTitle.trim(),
        quotationRef,
        recipientName: quoteRecipientName.trim() || undefined,
        recipientCompany: quoteRecipientCompany.trim() || undefined,
        recipientLocation: quoteRecipientLocation.trim() || undefined,
        lineItems: parsedLineItems,
        vatRate,
        validityDays,
        paymentTerms: quotePaymentTerms.trim() || undefined,
        notes: quoteNotes.trim() || undefined,
        generalTerms: quoteGeneralTerms.trim() || undefined,
        preparerName: quotePreparerName.trim() || undefined,
        preparerDesignation: quotePreparerDesignation.trim() || undefined,
        preparerMobile: quotePreparerMobile.trim() || undefined,
      });
      const pdfInput = {
        refId: quotationRef,
        projectName: task?.title ?? "",
        title: quoteTitle.trim(),
        recipientName: quoteRecipientName.trim(),
        recipientCompany: quoteRecipientCompany.trim(),
        recipientLocation: quoteRecipientLocation.trim(),
        currency: quoteCurrency,
        lineItems: parsedLineItems,
        vatRate,
        subtotal: saved.subtotal,
        vatAmount: saved.vatAmount ?? 0,
        totalAmount: saved.totalAmount ?? 0,
        validityDays,
        paymentTerms: quotePaymentTerms.trim() || DEFAULT_PAYMENT_TERMS,
        notes: quoteNotes.trim() || DEFAULT_NOTES,
        generalTerms: quoteGeneralTerms.trim() || DEFAULT_GENERAL_TERMS,
        preparerName: quotePreparerName.trim(),
        preparerDesignation: quotePreparerDesignation.trim(),
        preparerMobile: quotePreparerMobile.trim(),
      };
      if (mode === "with" || mode === "both") await generateQuotationPdf({ ...pdfInput, hidePrices: false });
      if (mode === "without" || mode === "both") await generateQuotationPdf({ ...pdfInput, hidePrices: true });
      push({ variant: "success", title: "Quotation downloaded.", description: "Upload the PDF to this task's Attachments below." });
      setQuotationOpen(false);
    } catch (err) {
      push({ variant: "error", title: "Could not create quotation", description: extractApiError(err).message });
    } finally {
      setQuoteGenerating(false);
    }
  }

  async function handleAssigneesChange(people: { userId: string; name: string }[]) {
    if (!taskId) return;
    if (people.length === 0) {
      push({ variant: "error", title: "At least one assignee is required." });
      return;
    }
    try {
      await setAssignees.mutateAsync({ taskId, assigneeUserIds: people.map((p) => p.userId) });
    } catch (err) {
      push({ variant: "error", title: "Could not update assignees", description: extractApiError(err).message });
    }
  }

  async function handleWatchersChange(people: { userId: string; name: string }[]) {
    if (!task) return;
    const currentIds = task.watchers.map((w) => w.userId);
    const newIds = people.map((p) => p.userId);
    const toAdd = newIds.filter((id) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id) => !newIds.includes(id));
    for (const id of toAdd) await watcherMutations.add.mutateAsync(id).catch((err) => push({ variant: "error", title: "Could not add watcher", description: extractApiError(err).message }));
    for (const id of toRemove) await watcherMutations.remove.mutateAsync(id).catch((err) => push({ variant: "error", title: "Could not remove watcher", description: extractApiError(err).message }));
  }

  async function handleTagToggle(tagId: string, isOn: boolean) {
    if (!task) return;
    const current = task.tags.map((t) => t.id);
    const next = isOn ? [...current, tagId] : current.filter((id) => id !== tagId);
    try {
      await setTags.mutateAsync(next);
    } catch (err) {
      push({ variant: "error", title: "Could not update tags", description: extractApiError(err).message });
    }
  }

  const stages = [...(board?.stages ?? [])].sort((a: any, b: any) => a.position - b.position);

  return (
    <Drawer
      open={!!taskId}
      onClose={onClose}
      widthClassName="md:w-[820px] md:max-w-[95vw]"
      title={
        <span className="flex items-center gap-2">
          <span className="text-slate-400">{task?.taskId ?? "…"}</span>
          {task?.enquiryId && <span className="text-brand-500">· {task.enquiryId}</span>}
          {task?.estimationId && <span className="text-indigo-500">· {task.estimationId}</span>}
          {task && <ApprovalStatusBadge status={task.approvalStatus} />}
        </span>
      }
      subtitle={task?.board?.name}
      footer={
        task && (
          <div className="flex w-full items-center justify-between">
            <div className="flex gap-2">
              {!readOnly && (
              <>
              {/* Enquiry List: Qualified is available any time before the enquiry
                  is dragged into Lost — New excluded, per Section design. */}
              {task.board?.name === "Enquiry List" &&
                task.stage?.name?.toLowerCase() !== "new" &&
                task.stage?.name?.toLowerCase() !== "lost" && (
                <Button
                  variant="outline"
                  size="sm"
                  loading={awardTask.isPending}
                  onClick={async () => {
                    try {
                      const result = await awardTask.mutateAsync(task.id);
                      if (result.kind === "moved-to-estimation") {
                        push({ variant: "success", title: "Qualified — moved to Estimation.", description: result.name });
                        onClose();
                        navigate(`/workflow/estimation`);
                      }
                    } catch (err) {
                      push({ variant: "error", title: "Could not award", description: extractApiError(err).message });
                    }
                  }}
                >
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> Qualified
                </Button>
              )}

              {/* Enquiry List and Estimation: Lost — and its Management
                  approval — only ever shows once the card is actually sitting
                  in the Lost column (dragged, or moved via the Stage picker).
                  Requesting approval from here; a reject sends it back to
                  whichever stage it came from. Once APPROVED it's a closed
                  record in Project/Task History — no buttons at all, same as
                  every other resolved task/project. */}
              {(task.board?.name === "Enquiry List" || task.board?.name === "Estimation") &&
                task.stage?.name?.trim().toLowerCase() === "lost" &&
                task.lostApprovalStatus !== "APPROVED" && (
                <>
                  {task.lostApprovalStatus === "PENDING_APPROVAL" ? (
                    can(user, "APPROVE_TASK", "ALL") || isAdmin(user) ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          loading={lostApproval.approve.isPending}
                          onClick={async () => {
                            try {
                              await lostApproval.approve.mutateAsync();
                              push({ variant: "success", title: "Lost request approved.", description: "Moved to Project/Task History." });
                              onClose();
                            } catch (err) {
                              push({ variant: "error", title: "Could not approve", description: extractApiError(err).message });
                            }
                          }}
                        >
                          <ThumbsDown className="h-3.5 w-3.5 text-red-500" /> Approve Lost
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setLostRejectOpen(true)}>
                          <XIcon className="h-3.5 w-3.5 text-slate-500" /> Reject
                        </Button>
                      </>
                    ) : (
                      <Badge tone="amber">Pending Lost approval</Badge>
                    )
                  ) : (
                    <Button variant="outline" size="sm" loading={markTaskLost.isPending} onClick={() => setLostRequestOpen(true)}>
                      <ThumbsDown className="h-3.5 w-3.5 text-red-500" /> Lost
                    </Button>
                  )}
                </>
              )}

              {(task.board?.name === "Estimation" || task.board?.name === "Accounts") &&
                task.stage?.name?.toLowerCase() !== "lost" &&
                task.stage?.name?.toLowerCase() !== "rejected" &&
                task.stage?.name?.trim().toLowerCase() !== "hold" &&
                !(task.board?.name === "Estimation" && task.stage?.name?.toLowerCase() === "new") && (
                <>
                  {task.board?.name === "Estimation" && task.stage?.name?.trim().toLowerCase() === "in progress" ? (
                    // "In Progress" doesn't Award straight to a Project anymore —
                    // it just moves to the "Submitted" stage; Awarding (creating
                    // the real Project) still happens from there, same as before.
                    <Button
                      variant="outline"
                      size="sm"
                      loading={moveTask.isPending}
                      onClick={async () => {
                        const submittedStage = stages.find((s: any) => s.name.trim().toLowerCase() === "submitted");
                        if (!submittedStage) {
                          push({ variant: "error", title: 'No "Submitted" stage found on this board.' });
                          return;
                        }
                        await performMove(submittedStage.id);
                      }}
                    >
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> Submit
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={awardTask.isPending}
                      onClick={async () => {
                        try {
                          const result = await awardTask.mutateAsync(task.id);
                          if (result.kind === "project-created-pending-approval") {
                            push({
                              variant: "success",
                              title: "Awarded — sent to Accounts, Procurement, and the Project team.",
                              description: `${result.name} is now waiting on Accounts sign-off.`,
                            });
                            onClose();
                            navigate(`/workflow/boards/${result.id}`);
                          } else if (result.kind === "project-created") {
                            push({ variant: "success", title: "Approved — project and procurement created.", description: result.name });
                            onClose();
                            navigate(`/workflow/boards/${result.id}`);
                          }
                        } catch (err) {
                          push({
                            variant: "error",
                            title: task.board?.name === "Accounts" ? "Could not approve" : "Could not award",
                            description: extractApiError(err).message,
                          });
                        }
                      }}
                    >
                      {task.board?.name === "Accounts" ? (
                        <>
                          <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> Approve
                        </>
                      ) : (
                        <>
                          <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> Awarded
                        </>
                      )}
                    </Button>
                  )}
                  {/* Submitted can also be parked on Hold instead of moving
                      forward — pauses it without touching Lost/Awarded. */}
                  {task.board?.name === "Estimation" && (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={moveTask.isPending}
                      onClick={async () => {
                        const holdStage = stages.find((s: any) => s.name.trim().toLowerCase() === "hold");
                        if (!holdStage) {
                          push({ variant: "error", title: 'No "Hold" stage found on this board.' });
                          return;
                        }
                        await performMove(holdStage.id);
                      }}
                    >
                      <PauseCircle className="h-3.5 w-3.5 text-amber-600" /> Hold
                    </Button>
                  )}
                  {/* Accounts needs a reason up front, recorded directly (no
                      approval chain of its own — Accounts sign-off IS the
                      approval). Estimation's Lost now goes through the same
                      Management-approval gate as Enquiry List — moving the
                      Stage picker to "Lost" surfaces that block above, so
                      there's no direct one-click Lost action here anymore. */}
                  {task.board?.name === "Accounts" && (
                    <Button variant="outline" size="sm" onClick={() => setAccountsRejectOpen(true)}>
                      <XIcon className="h-3.5 w-3.5 text-red-500" /> Reject
                    </Button>
                  )}
                </>
              )}

              {/* Hold is a dead end except back to Submitted — no Awarded,
                  no Lost, nothing else, while it's parked. */}
              {task.board?.name === "Estimation" && task.stage?.name?.trim().toLowerCase() === "hold" && (
                <Button
                  variant="outline"
                  size="sm"
                  loading={moveTask.isPending}
                  onClick={async () => {
                    const submittedStage = stages.find((s: any) => s.name.trim().toLowerCase() === "submitted");
                    if (!submittedStage) {
                      push({ variant: "error", title: 'No "Submitted" stage found on this board.' });
                      return;
                    }
                    await performMove(submittedStage.id);
                  }}
                >
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> Back to Submit
                </Button>
              )}
              </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await duplicateTask.mutateAsync(task.id);
                    push({ variant: "success", title: "Task duplicated." });
                  } catch (err) {
                    push({ variant: "error", title: "Could not duplicate task", description: extractApiError(err).message });
                  }
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </Button>
              {canDelete && (
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" /> Delete
                </Button>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        )
      }
    >
      {isLoading || !task ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Basic Information */}
          <section className="space-y-2">
            <Input
              value={title}
              maxLength={150}
              disabled={!canEdit}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== task.title && saveField({ title: title.trim() })}
              className="!text-base !font-semibold"
              aria-label="Task title"
            />
            <p className="text-right text-[11px] text-slate-400">{title.length}/150</p>
            <RichTextEditor
              value={description}
              disabled={!canEdit}
              onChange={setDescription}
              placeholder="Describe this task…"
            />
            {description !== (task.description ?? "") && canEdit && (
              <div className="flex justify-end">
                <Button size="sm" onClick={() => saveField({ description })} loading={updateTask.isPending}>
                  Save description
                </Button>
              </div>
            )}
            {task.taskType === "RECURRING_INSTANCE" && (
              <Badge tone="purple">
                <Repeat className="h-3 w-3" /> Part of a recurring series
              </Badge>
            )}
          </section>

          {board?.accountsApprovalStatus === "PENDING" && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Landmark className="h-4 w-4 shrink-0" />
              Waiting for approval from the Accounts department — this can't be marked Lost or Completed until then.
            </div>
          )}

          {/* Workflow */}
          <section
            className={clsx(
              "grid gap-3",
              ["grid-cols-2", "grid-cols-3", "grid-cols-4"][(task.service ? 1 : 0) + (task.customer ? 1 : 0)]
            )}
          >
            <div>
              <Label>Project</Label>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{task.board?.name}</p>
            </div>
            {task.service && (
              <div>
                <Label>Service</Label>
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{task.service.name}</p>
              </div>
            )}
            {task.customer && (
              <div>
                <Label>Customer</Label>
                <Link
                  to={`/workflow/customers/${task.customer.id}`}
                  className="block truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-brand-700 hover:bg-slate-100"
                >
                  {task.customer.name} <span className="text-slate-400">· {task.customer.customerId}</span>
                </Link>
              </div>
            )}
            <div>
              <Label>Stage</Label>
              <Select value={task.stageId} disabled={!canMove} onChange={(e) => performMove(e.target.value)}>
                {stages.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={task.priority} disabled={!canEdit} onChange={(e) => saveField({ priority: e.target.value })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </div>
            <div className="flex items-end">
              <PriorityBadge priority={task.priority} />
            </div>
          </section>

          {task.board?.name === "Estimation" && canEdit && (
            <section className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <Receipt className="h-4 w-4 text-slate-400" /> Quotation
              </p>
              <Button variant="outline" size="sm" onClick={openQuotation}>
                Create Quotation
              </Button>
            </section>
          )}

          {/* Assignment */}
          <section className="space-y-3">
            <div>
              <Label required>Assignee(s)</Label>
              <PeoplePicker
                selected={task.assignees.map((a) => ({ userId: a.userId, name: a.name }))}
                onChange={handleAssigneesChange}
                primaryUserId={task.assignees.find((a) => a.isPrimary)?.userId}
                disabled={!canAssign}
                placeholder="Add an assignee…"
              />
              <p className="mt-1 text-[11px] text-slate-400">The first person selected becomes the Primary Assignee.</p>
            </div>
            <div>
              <Label>Reporter / Created By</Label>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Avatar name={task.createdBy?.name ?? "—"} size="xs" /> {task.createdBy?.name ?? "Unknown"}
              </div>
            </div>
            <div>
              <Label>Watchers</Label>
              <PeoplePicker
                selected={task.watchers.map((w) => ({ userId: w.userId, name: w.name }))}
                onChange={handleWatchersChange}
                excludeUserIds={task.assignees.map((a) => a.userId)}
                placeholder="Add a watcher…"
              />
              <p className="mt-1 text-[11px] text-slate-400">Watchers get activity notifications but never count toward workload or My Tasks.</p>
            </div>
          </section>

          {/* Dates */}
          <section className="grid grid-cols-3 gap-3">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                disabled={!canEdit}
                defaultValue={task.startDate?.slice(0, 10) ?? ""}
                onBlur={(e) => saveField({ startDate: e.target.value || null })}
              />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input
                type="date"
                disabled={!canEdit}
                defaultValue={task.dueDate?.slice(0, 10) ?? ""}
                onBlur={(e) => saveField({ dueDate: e.target.value || null })}
              />
            </div>
            <div>
              <Label>Estimated Effort (hrs)</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                disabled={!canEdit}
                defaultValue={task.estimatedEffortHours ?? ""}
                onBlur={(e) => saveField({ estimatedEffortHours: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </section>

          <section>
            <ChecklistSection task={task} canEdit={canCollab} />
          </section>

          <section>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {task.tags.map((t) => (
                <button key={t.id} onClick={() => canEdit && handleTagToggle(t.id, false)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${t.color}22`, color: t.color }}>
                  {t.name}
                  {canEdit && <XIcon className="h-3 w-3" />}
                </button>
              ))}
            </div>
            {canEdit && (
              <div className="mt-2">
                <Input placeholder="Search or create a tag…" value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} />
                {tagQuery && (
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200">
                    {allTags
                      ?.filter((t: any) => t.name.toLowerCase().includes(tagQuery.toLowerCase()) && !task.tags.some((x) => x.id === t.id))
                      .map((t: any) => (
                        <button key={t.id} onClick={() => { handleTagToggle(t.id, true); setTagQuery(""); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} /> {t.name}
                        </button>
                      ))}
                    {canCreateTags && allTags && !allTags.some((t: any) => t.name.toLowerCase() === tagQuery.toLowerCase()) && (
                      <button
                        onClick={async () => {
                          try {
                            const created = await createTag.mutateAsync({ name: tagQuery.trim() });
                            await handleTagToggle(created.id, true);
                            setTagQuery("");
                          } catch (err) {
                            push({ variant: "error", title: "Could not create tag", description: extractApiError(err).message });
                          }
                        }}
                        className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-left text-sm text-brand-600 hover:bg-brand-50"
                      >
                        + Create tag "{tagQuery}"
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {task.linkedRecord && (
            <section>
              <Label>Linked Record</Label>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-slate-400" />
                  {task.linkedRecord.name} <Badge tone="indigo">{task.linkedRecord.type}</Badge>
                </span>
                <span className="text-xs text-slate-400">{task.linkedRecord.externalRef}</span>
              </div>
            </section>
          )}

          <section>
            <DependenciesSection task={task} canEdit={canEdit} />
          </section>

          {task.requiresApproval && (
            <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-sm font-medium text-amber-900">Approval</p>
              <p className="text-xs text-amber-800">
                This task requires approval before it can be marked Done. Current status: <ApprovalStatusBadge status={task.approvalStatus} />
              </p>
              {task.approvalStatus === "PENDING_APPROVAL" && isApprover && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await approve.mutateAsync();
                        push({ variant: "success", title: "Task approved." });
                      } catch (err) {
                        push({ variant: "error", title: "Could not approve task", description: extractApiError(err).message });
                      }
                    }}
                    loading={approve.isPending}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setRejectOpen(true)}>
                    <XIcon className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              )}
            </section>
          )}

          <section>
            <CommentsSection taskId={task.id} />
          </section>

          <section>
            <AttachmentsSection taskId={task.id} canDelete={canCollab} />
          </section>

          {task.board?.name === "Estimation" && canSeeSecretAttachments(user) && <SecretAttachmentsSection taskId={task.id} />}

          <section>
            <ActivitySection taskId={task.id} />
          </section>
        </div>
      )}

      <ConfirmDialog
        open={!!wipConfirm}
        title="WIP limit reached"
        message={wipConfirm?.message}
        confirmLabel="Move anyway"
        destructive={false}
        loading={moveTask.isPending}
        onCancel={() => setWipConfirm(null)}
        onConfirm={() => wipConfirm && performMove(wipConfirm.stageId, true)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete task"
        message={
          task && (
            <>
              Are you sure you want to delete <strong>&ldquo;{task.title}&rdquo;</strong> ({task.taskId})? This cannot be undone.
            </>
          )
        }
        confirmLabel="Delete task"
        loading={deleteTask.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!task) return;
          try {
            await deleteTask.mutateAsync(task.id);
            push({ variant: "success", title: "Task deleted." });
            setConfirmDelete(false);
            onDeleted?.();
            onClose();
          } catch (err) {
            push({ variant: "error", title: "Could not delete task", description: extractApiError(err).message });
          }
        }}
      />

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject task" description="A rejection reason is required and will be shared with the assignee.">
        <textarea
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Explain what needs to change…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:focus-ring"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRejectOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!rejectReason.trim()}
            loading={reject.isPending}
            onClick={async () => {
              try {
                await reject.mutateAsync(rejectReason.trim());
                push({ variant: "success", title: "Task rejected." });
                setRejectOpen(false);
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

      <Modal
        open={lostRejectOpen}
        onClose={() => setLostRejectOpen(false)}
        title="Reject Lost request"
        description="A reason is required and will be shared with the assignees."
      >
        <textarea
          rows={3}
          value={lostRejectReason}
          onChange={(e) => setLostRejectReason(e.target.value)}
          placeholder="Explain why this shouldn't be marked Lost…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:focus-ring"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setLostRejectOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!lostRejectReason.trim()}
            loading={lostApproval.reject.isPending}
            onClick={async () => {
              try {
                await lostApproval.reject.mutateAsync(lostRejectReason.trim());
                push({ variant: "success", title: "Lost request rejected." });
                setLostRejectOpen(false);
                setLostRejectReason("");
              } catch (err) {
                push({ variant: "error", title: "Could not reject", description: extractApiError(err).message });
              }
            }}
          >
            Reject request
          </Button>
        </div>
      </Modal>

      <Modal
        open={lostRequestOpen}
        onClose={() => {
          setLostRequestOpen(false);
          setLostRequestReason("");
        }}
        title="Mark as Lost"
        description="A reason is required — this goes to Management for approval before the task actually moves to Lost."
      >
        <textarea
          rows={3}
          value={lostRequestReason}
          onChange={(e) => setLostRequestReason(e.target.value)}
          placeholder="Why is this Lost?"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:focus-ring"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setLostRequestOpen(false);
              setLostRequestReason("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!lostRequestReason.trim()}
            loading={markTaskLost.isPending}
            onClick={async () => {
              if (!task) return;
              try {
                await markTaskLost.mutateAsync({ taskId: task.id, reason: lostRequestReason.trim() });
                push({ variant: "success", title: "Lost approval requested.", description: "Sent to Management for review." });
                setLostRequestOpen(false);
                setLostRequestReason("");
              } catch (err) {
                push({ variant: "error", title: "Could not request Lost", description: extractApiError(err).message });
              }
            }}
          >
            Submit request
          </Button>
        </div>
      </Modal>

      <Modal
        open={accountsRejectOpen}
        onClose={() => {
          setAccountsRejectOpen(false);
          setAccountsRejectReason("");
        }}
        title="Reject this task"
        description="A reason is required and will be recorded on the task's activity log."
      >
        <textarea
          rows={3}
          value={accountsRejectReason}
          onChange={(e) => setAccountsRejectReason(e.target.value)}
          placeholder="Why is Accounts rejecting this?"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:focus-ring"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setAccountsRejectOpen(false);
              setAccountsRejectReason("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!accountsRejectReason.trim()}
            loading={rejectAccountsTask.isPending}
            onClick={async () => {
              if (!task) return;
              try {
                await rejectAccountsTask.mutateAsync({ taskId: task.id, reason: accountsRejectReason.trim() });
                push({ variant: "success", title: "Task rejected." });
                setAccountsRejectOpen(false);
                setAccountsRejectReason("");
                onClose();
              } catch (err) {
                push({ variant: "error", title: "Could not reject task", description: extractApiError(err).message });
              }
            }}
          >
            Reject task
          </Button>
        </div>
      </Modal>

      <Modal
        open={quotationOpen}
        onClose={() => setQuotationOpen(false)}
        title="Create Quotation"
        description="Fills the company's standard proposal template — download the PDF, then attach it below."
        size="lg"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Label required>Title</Label>
              <Input
                placeholder="e.g. Proposal For Supply and Installation of Server"
                value={quoteTitle}
                onChange={(e) => setQuoteTitle(e.target.value)}
                className="py-2.5"
              />
            </div>
            <div>
              <Label>Reference No.</Label>
              <Input placeholder="QPTS/QN/2026-0006" value={quoteRef} onChange={(e) => setQuoteRef(e.target.value)} className="py-2.5" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Recipient name</Label>
              <Input placeholder="Mr. Dilip" value={quoteRecipientName} onChange={(e) => setQuoteRecipientName(e.target.value)} className="py-2.5" />
            </div>
            <div>
              <Label>Recipient company</Label>
              <Input placeholder="Telal Resort" value={quoteRecipientCompany} onChange={(e) => setQuoteRecipientCompany(e.target.value)} className="py-2.5" />
            </div>
            <div>
              <Label>Location</Label>
              <Input placeholder="Al Ain" value={quoteRecipientLocation} onChange={(e) => setQuoteRecipientLocation(e.target.value)} className="py-2.5" />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label required>Line items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="h-3.5 w-3.5" /> Add item
              </Button>
            </div>
            <div className="space-y-3">
              {quoteLineItems.map((row, i) => (
                <div key={i} className="rounded-lg border border-slate-300 bg-slate-50/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Item {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeLineItem(i)}
                      disabled={quoteLineItems.length === 1}
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                  <div className="mt-2">
                    <Label className="!text-xs">Description</Label>
                    <textarea
                      rows={2}
                      placeholder="Item description"
                      value={row.description}
                      onChange={(e) => updateLineItem(i, { description: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:focus-ring"
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    <div>
                      <Label className="!text-xs">Qty</Label>
                      <Input type="number" min="0" step="1" placeholder="1" value={row.qty} onChange={(e) => updateLineItem(i, { qty: e.target.value })} className="py-2.5" />
                    </div>
                    <div>
                      <Label className="!text-xs">Unit</Label>
                      <Input placeholder="Nos" value={row.unit} onChange={(e) => updateLineItem(i, { unit: e.target.value })} className="py-2.5" />
                    </div>
                    <div>
                      <Label className="!text-xs">Unit price</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={row.unitPrice}
                        onChange={(e) => updateLineItem(i, { unitPrice: e.target.value })}
                        className="py-2.5"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Currency</Label>
              <Select value={quoteCurrency} onChange={(e) => handleQuoteCurrencyChange(e.target.value)} className="py-2.5">
                <option value="AED">AED</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="SAR">SAR</option>
              </Select>
            </div>
            <div>
              <Label>VAT %</Label>
              <Input type="number" min="0" max="100" step="0.01" value={quoteVatRate} onChange={(e) => setQuoteVatRate(e.target.value)} className="py-2.5" />
            </div>
            <div>
              <Label>Offer validity (days)</Label>
              <Input type="number" min="1" step="1" value={quoteValidityDays} onChange={(e) => setQuoteValidityDays(e.target.value)} className="py-2.5" />
            </div>
          </div>

          <div>
            <Label>Payment terms</Label>
            <textarea
              rows={2}
              value={quotePaymentTerms}
              onChange={(e) => setQuotePaymentTerms(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus-visible:focus-ring"
            />
            <p className="mt-1 text-[11px] text-slate-400">One line per item.</p>
          </div>

          <div>
            <Label>Notes</Label>
            <textarea
              rows={3}
              value={quoteNotes}
              onChange={(e) => setQuoteNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus-visible:focus-ring"
            />
            <p className="mt-1 text-[11px] text-slate-400">One line per item — numbered automatically.</p>
          </div>

          <div>
            <Label>General Terms and Conditions</Label>
            <textarea
              rows={5}
              value={quoteGeneralTerms}
              onChange={(e) => setQuoteGeneralTerms(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus-visible:focus-ring"
            />
            <p className="mt-1 text-[11px] text-slate-400">One line per item — numbered automatically.</p>
          </div>

          <div>
            <Label className="!mb-2">Thanks &amp; Regards</Label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="!text-xs">Name</Label>
                <Input placeholder="Preparer name" value={quotePreparerName} onChange={(e) => setQuotePreparerName(e.target.value)} className="py-2.5" />
              </div>
              <div>
                <Label className="!text-xs">Designation</Label>
                <Input placeholder="Assistant Manager" value={quotePreparerDesignation} onChange={(e) => setQuotePreparerDesignation(e.target.value)} className="py-2.5" />
              </div>
              <div>
                <Label className="!text-xs">Mobile</Label>
                <Input placeholder="+971 5xxxxxxxx" value={quotePreparerMobile} onChange={(e) => setQuotePreparerMobile(e.target.value)} className="py-2.5" />
              </div>
            </div>
          </div>

          {parsedLineItems.length > 0 && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {quoteCurrency} {quoteSubtotal.toLocaleString()}
              {Number(quoteVatRate) > 0 && (
                <>
                  {" "}
                  + {quoteVatRate}% VAT ({quoteCurrency} {quoteVatAmount.toLocaleString()})
                </>
              )}
              {" = "}
              <span className="font-semibold">
                {quoteCurrency} {quoteTotal.toLocaleString()}
              </span>
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setQuotationOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => submitQuotation("without")} loading={saveQuote.isPending || quoteGenerating}>
              Download without Price
            </Button>
            <Button variant="outline" onClick={() => submitQuotation("both")} loading={saveQuote.isPending || quoteGenerating}>
              Download Both
            </Button>
            <Button onClick={() => submitQuotation("with")} loading={saveQuote.isPending || quoteGenerating}>
              Download with Price
            </Button>
          </div>
        </div>
      </Modal>
    </Drawer>
  );
};
