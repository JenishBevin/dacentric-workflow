import React, { useEffect, useState } from "react";
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
import { DependenciesSection } from "./DependenciesSection";
import { ActivitySection } from "./ActivitySection";
import { PriorityBadge, ApprovalStatusBadge } from "../workflow/badges";
import { useTask, useUpdateTask, useMoveTask, useSetAssignees, useWatcherMutations, useSetTaskTags, useApprovalMutations, useDuplicateTask, useDeleteTask } from "../../api/tasks";
import { useBoardDetail } from "../../api/boards";
import { useTags, useCreateTag } from "../../api/misc";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { can, isAdmin } from "../../lib/permissions";
import { extractApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Repeat, Link2, Copy, Trash2, Check, X as XIcon } from "lucide-react";
import { format } from "date-fns";

interface Props {
  taskId: string | null;
  onClose: () => void;
  onDeleted?: () => void;
}

/**
 * Full Task Detail Panel (Section 14/39): every field group the spec lists,
 * laid out as one scrollable drawer with clearly labelled sections (rather
 * than tabs) so nothing important is hidden by default — closer to how
 * enterprise work-management tools like this one present a task.
 */
export const TaskDetailDrawer: React.FC<Props> = ({ taskId, onClose, onDeleted }) => {
  const { user } = useAuth();
  const { push } = useToast();
  const { data: task, isLoading } = useTask(taskId ?? undefined);
  const { data: board } = useBoardDetail(task?.boardId);
  const updateTask = useUpdateTask(taskId ?? "");
  const moveTask = useMoveTask();
  const setAssignees = useSetAssignees();
  const watcherMutations = useWatcherMutations(taskId ?? "");
  const setTags = useSetTaskTags(taskId ?? "");
  const { approve, reject } = useApprovalMutations(taskId ?? "");
  const duplicateTask = useDuplicateTask();
  const deleteTask = useDeleteTask();
  const { data: allTags } = useTags();
  const createTag = useCreateTag();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [wipConfirm, setWipConfirm] = useState<{ stageId: string; message: string } | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

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
          {task && <ApprovalStatusBadge status={task.approvalStatus} />}
        </span>
      }
      subtitle={task?.board?.name}
      footer={
        task && (
          <div className="flex w-full items-center justify-between">
            <div className="flex gap-2">
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

          {/* Workflow */}
          <section className="grid grid-cols-2 gap-3">
            <div>
              <Label>Board</Label>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{task.board?.name}</p>
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
    </Drawer>
  );
};
