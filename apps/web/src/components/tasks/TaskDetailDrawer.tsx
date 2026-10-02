import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { useTask, useUpdateTask, useMoveTask, useSetAssignees, useWatcherMutations, useSetTaskTags, useApprovalMutations, useDuplicateTask, useDeleteTask, useAwardTask, useMarkTaskLost, useLostApprovalMutations, useRejectAccountsTask } from "../../api/tasks";
import { useBoardDetail, useServices } from "../../api/boards";
import { useTags, useCreateTag } from "../../api/misc";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { can, isAdmin, canSeeSecretAttachments } from "../../lib/permissions";
import { boardPath } from "../../lib/boardPath";
import { extractApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DiscussButton } from "../chat/DiscussButton";
import { CustomerPicker } from "../customers/CustomerPicker";
import { FollowUpMoveDialog, FollowUpChoice } from "../kanban/FollowUpMoveDialog";
import { Repeat, Link2, Copy, Trash2, Check, X as XIcon, BadgeCheck, ThumbsDown, Landmark, Receipt, Plus, PauseCircle } from "lucide-react";
import { format } from "date-fns";

// Stage names are editable, so "Submitted" may have been renamed (e.g.
// "Submitted / Follow-up") — try the exact name, then any name containing
// "submit", then whichever stage the board flags as its follow-up stage.
function findSubmittedStage(stages: any[]) {
  return (
    stages.find((s) => s.name.trim().toLowerCase() === "submitted") ??
    stages.find((s) => s.name.toLowerCase().includes("submit")) ??
    stages.find((s) => s.isFollowUpStage)
  );
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
  const { data: allTags } = useTags();
  const createTag = useCreateTag();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [followUpInput, setFollowUpInput] = useState("");
  const [wipConfirm, setWipConfirm] = useState<{ stageId: string; message: string; followUp?: FollowUpChoice } | null>(null);
  const [followUpPromptStageId, setFollowUpPromptStageId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [lostRejectOpen, setLostRejectOpen] = useState(false);
  const [lostRejectReason, setLostRejectReason] = useState("");
  const [lostRequestOpen, setLostRequestOpen] = useState(false);
  const [lostRequestReason, setLostRequestReason] = useState("");
  const [accountsRejectOpen, setAccountsRejectOpen] = useState(false);
  const [accountsRejectReason, setAccountsRejectReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mirrors task-access.ts exactly (assertCanEditTask/assertCanCollaborate/
  // assertCanDeleteTask) — a plain can(user, KEY) defaults to minScope "OWN",
  // but the backend only ever honors board Owner/Editor, the task's own
  // assignee, Admin, or an org-wide ALL-scope grant (e.g. Management). Using
  // just can(user, KEY) without "ALL" made these controls appear enabled for
  // most roles everywhere, then 403 the moment they weren't actually a
  // member/assignee of that specific board/task.
  const isAssignee = !!task?.assignees.some((a) => a.userId === user?.id);
  const boardRole = board?.members.find((m: any) => m.userId === user?.id)?.role;
  const canEdit = isAdmin(user) || boardRole === "OWNER" || boardRole === "EDITOR" || isAssignee || can(user, "EDIT_TASK", "ALL");
  // Saved quotations with their costing (vendors, buying costs, margins) are internal: Management and admins may review
  // them to negotiate costs, as may anyone who can edit the task. The API enforces the same rule.
  const canViewCosting = canEdit || isAdmin(user) || !!user?.roles.includes("MANAGEMENT");
  const canDelete = isAdmin(user) || boardRole === "OWNER" || can(user, "DELETE_TASK", "ALL");
  // setAssignees and moveTask are both gated by assertCanEditTask on the
  // backend, not a dedicated ASSIGN_TASK/MOVE_TASK check — those permission
  // keys only gate the coarse route-level middleware, not the real decision.
  const canAssign = canEdit;
  const canMove = canEdit;
  const canCollab = isAdmin(user) || isAssignee || can(user, "MANAGE_TASK_COLLAB", "ALL") || (!!boardRole && boardRole !== "VIEWER");
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

  async function submitFollowUp() {
    if (!followUpInput) return;
    await saveField({ followUpDate: followUpInput });
    setFollowUpInput("");
  }

  async function performMove(stageId: string, confirmWipOverride = false, followUp?: FollowUpChoice) {
    if (!taskId) return;
    // Follow-up stages need a date (and optionally an owner) first — ask, then move.
    if (!followUp && !confirmWipOverride && board?.stages.find((s: any) => s.id === stageId)?.isFollowUpStage) {
      setFollowUpPromptStageId(stageId);
      return;
    }
    try {
      await moveTask.mutateAsync({ taskId, stageId, confirmWipOverride, version: task?.version, ...followUp });
      setWipConfirm(null);
      setFollowUpPromptStageId(null);
    } catch (err) {
      const apiErr = extractApiError(err);
      if (apiErr.code === "CONFLICT" && /WIP limit/i.test(apiErr.message)) {
        setFollowUpPromptStageId(null);
        setWipConfirm({ stageId, message: apiErr.message, followUp });
      } else {
        push({ variant: "error", title: "Could not move task", description: apiErr.message });
      }
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
  const { data: services } = useServices();
  // On these pipeline boards, a task's own service is meaningful (it becomes the project's service when
  // Awarded), so it's directly editable. On an actual Project board it isn't — the whole project's service
  // is a separate field (Project Settings), so that's what's shown here, read-only, with a shortcut to it.
  const isPipelineBoard = ["Enquiry List", "Estimation", "Accounts", "Personal Tasks"].includes(task?.board?.name ?? "");
  const projectServiceName = services?.find((s: any) => s.id === board?.serviceId)?.name;

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
              <DiscussButton
                entityType="TASK"
                entityId={task.id}
                defaultName={task.title}
                candidates={[
                  ...task.assignees.map((a) => ({ userId: a.userId, name: a.name })),
                  ...task.watchers.map((w) => ({ userId: w.userId, name: w.name })),
                  ...(task.createdBy ? [{ userId: task.createdBy.id, name: task.createdBy.name }] : []),
                ].filter((p, i, arr) => p.userId !== user?.id && arr.findIndex((x) => x.userId === p.userId) === i)}
              />
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
                        const submittedStage = findSubmittedStage(stages);
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
                    const submittedStage = findSubmittedStage(stages);
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
          <section className="grid grid-cols-4 gap-3">
            <div>
              <Label>Project</Label>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{task.board?.name}</p>
            </div>
            <div>
              <Label>Service</Label>
              {isPipelineBoard ? (
                <Select
                  value={task.serviceId ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => saveField({ serviceId: e.target.value || null })}
                >
                  <option value="">No service</option>
                  {services?.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(`${boardPath(task.board?.name, task.boardId)}?settings=general`)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-600 hover:border-brand-300 hover:bg-brand-50/40"
                  title="Set for the whole project — opens Project Settings"
                >
                  <span className="truncate">{projectServiceName ?? "No service"}</span>
                  <span className="text-xs font-medium text-brand-600">Edit in Project Settings</span>
                </button>
              )}
            </div>
            <div>
              <Label>Customer</Label>
              <CustomerPicker
                value={task.customer}
                disabled={!canEdit}
                linkToDetail
                onChange={async (c) => {
                  await saveField({ customerId: c?.id ?? null });
                  push({ variant: "success", title: c ? "Customer linked." : "Customer unlinked." });
                }}
              />
            </div>
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

          {((task.board?.name === "Estimation" && canEdit) || (task.quotation && canViewCosting)) && (
            <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <Receipt className="h-4 w-4 text-slate-400" /> Quotation
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {task.quotation && canViewCosting && (
                  <Button variant="outline" size="sm" onClick={() => navigate(`/workflow/tasks/${task.id}/quotations`)}>
                    View quotations &amp; costing
                  </Button>
                )}
                {task.board?.name === "Estimation" && canEdit && task.quotation && (
                  <Button variant="outline" size="sm" onClick={() => navigate(`/workflow/tasks/${task.id}/quotation?history=1`)}>
                    Previous quotations
                  </Button>
                )}
                {task.board?.name === "Estimation" && canEdit && (
                  <Button variant="outline" size="sm" onClick={() => navigate(`/workflow/tasks/${task.id}/quotation?new=1`)}>
                    Create Quotation
                  </Button>
                )}
              </div>
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
            <div>
              <Label>Salesperson</Label>
              <PeoplePicker
                selected={task.salesperson ? [{ userId: task.salesperson.id, name: task.salesperson.name }] : []}
                onChange={(people) => saveField({ salespersonUserId: people.slice(-1)[0]?.userId ?? null })}
                disabled={!canEdit}
                placeholder="Search for a salesperson…"
              />
            </div>
          </section>

          {/* Dates */}
          <section className="grid grid-cols-2 gap-3">
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
          </section>

          {task.stage?.isFollowUpStage && (
            <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Label>Follow-up</Label>
              <p className="text-sm text-slate-700">
                {task.followUpDate ? (
                  <>
                    Next follow-up: <strong>{format(new Date(task.followUpDate), "d MMM yyyy")}</strong>
                  </>
                ) : (
                  "No follow-up date set yet — waiting on the client since this task moved here."
                )}
              </p>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <Input type="date" value={followUpInput} onChange={(e) => setFollowUpInput(e.target.value)} className="max-w-[10rem]" />
                  <Button size="sm" disabled={!followUpInput || updateTask.isPending} onClick={submitFollowUp}>
                    Set Follow-up Date
                  </Button>
                </div>
              )}
              <div>
                <Label>Follow-up assignee</Label>
                <PeoplePicker
                  selected={task.followUpAssignee ? [{ userId: task.followUpAssignee.id, name: task.followUpAssignee.name }] : []}
                  onChange={(people) => saveField({ followUpAssigneeUserId: people.slice(-1)[0]?.userId ?? null })}
                  disabled={!canEdit}
                  placeholder="Who is chasing the client?"
                />
                <p className="mt-1 text-xs text-slate-500">
                  {task.followUpAssignee ? "Counted in their Follow-up workload." : "No one named — counted against the task's assignees' Follow-up workload."}
                </p>
              </div>
            </section>
          )}

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

          {task.board?.name === "Estimation" && canSeeSecretAttachments(user) && (
            <SecretAttachmentsSection
              taskId={task.id}
              approvalStatus={task.quotationApprovalStatus}
              rejectionReason={task.quotationRejectionReason}
              decidedByName={task.quotationDecidedByName}
              canDecide={isAdmin(user) || can(user, "APPROVE_TASK", "ALL")}
            />
          )}

          <section>
            <ActivitySection taskId={task.id} />
          </section>
        </div>
      )}

      <FollowUpMoveDialog
        open={!!followUpPromptStageId}
        stageName={board?.stages.find((s: any) => s.id === followUpPromptStageId)?.name ?? "follow-up stage"}
        defaultAssignee={(() => {
          const primary = task?.assignees.find((a) => a.isPrimary) ?? task?.assignees[0];
          return primary ? { userId: primary.userId, name: primary.name } : null;
        })()}
        loading={moveTask.isPending}
        onCancel={() => setFollowUpPromptStageId(null)}
        onConfirm={(choice) => followUpPromptStageId && performMove(followUpPromptStageId, false, choice)}
      />

      <ConfirmDialog
        open={!!wipConfirm}
        title="WIP limit reached"
        message={wipConfirm?.message}
        confirmLabel="Move anyway"
        destructive={false}
        loading={moveTask.isPending}
        onCancel={() => setWipConfirm(null)}
        onConfirm={() => wipConfirm && performMove(wipConfirm.stageId, true, wipConfirm.followUp)}
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

    </Drawer>
  );
};
