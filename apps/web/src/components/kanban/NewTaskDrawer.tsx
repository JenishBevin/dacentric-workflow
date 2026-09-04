import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Drawer } from "../ui/Drawer";
import { Button, Input, Label, Select, Badge } from "../ui/primitives";
import { RichTextEditor } from "../ui/RichTextEditor";
import { PeoplePicker } from "../tasks/PeoplePicker";
import { useCreateTask } from "../../api/tasks";
import { useTags, useLinkedRecordSearch } from "../../api/misc";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { Board, BoardStage } from "../../lib/types";
import { X, Plus } from "lucide-react";

interface TaskPrefill {
  title: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assignees?: { userId: string; name: string }[];
  checklist?: string[];
  tagIds?: string[];
  defaultRecurring?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  board: Board & { stages: BoardStage[] };
  initialStageId?: string;
  /** Pre-populates the form — used by "Convert to Recurring", which creates a new
   *  recurring series seeded from an existing task rather than mutating it in place
   *  (the API only accepts recurrence configuration at task-creation time). */
  prefill?: TaskPrefill;
}

interface FormValues {
  title: string;
  description: string;
  stageId: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  startDate: string;
  dueDate: string;
  estimatedEffortHours: string;
  requiresApproval: boolean;
  approverUserId?: string;
  recurringEnabled: boolean;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
  customIntervalDays: string;
  endType: "NEVER" | "AFTER_N" | "ON_DATE";
  occurrencesLimit: string;
  endDate: string;
}

/** Section 11/14/15: the Create Task form, with the full field-group set from Section 39 that applies at creation time. */
export const NewTaskDrawer: React.FC<Props> = ({ open, onClose, board, initialStageId, prefill }) => {
  const { push } = useToast();
  const createTask = useCreateTask();
  const { data: allTags } = useTags();

  const [assignees, setAssignees] = useState<{ userId: string; name: string }[]>([]);
  const [watchers, setWatchers] = useState<{ userId: string; name: string }[]>([]);
  const [approver, setApprover] = useState<{ userId: string; name: string }[]>([]);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [recordQuery, setRecordQuery] = useState("");
  const [linkedRecord, setLinkedRecord] = useState<{ id: string; type: string; name: string } | null>(null);
  const { data: records } = useLinkedRecordSearch(recordQuery);
  const [dirty, setDirty] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      stageId: initialStageId ?? board.stages[0]?.id,
      priority: "MEDIUM",
      requiresApproval: false,
      recurringEnabled: false,
      frequency: "WEEKLY",
      endType: "NEVER",
    },
  });

  const requiresApproval = watch("requiresApproval");
  const recurringEnabled = watch("recurringEnabled");
  const frequency = watch("frequency");
  const endType = watch("endType");
  const startDate = watch("startDate");

  function resetAll() {
    reset({ stageId: initialStageId ?? board.stages[0]?.id, priority: "MEDIUM", requiresApproval: false, recurringEnabled: false, frequency: "WEEKLY", endType: "NEVER" });
    setAssignees([]);
    setWatchers([]);
    setApprover([]);
    setChecklist([]);
    setNewChecklistItem("");
    setTagIds([]);
    setLinkedRecord(null);
    setRecordQuery("");
    setDescription("");
    setDirty(false);
  }

  const close = () => {
    if (dirty && !window.confirm("Discard this new task?")) return;
    resetAll();
    onClose();
  };

  const [description, setDescription] = useState("");

  // Apply prefill data (e.g. "Convert to Recurring") each time the drawer opens with one.
  useEffect(() => {
    if (open && prefill) {
      reset({
        stageId: initialStageId ?? board.stages[0]?.id,
        title: prefill.title,
        priority: prefill.priority ?? "MEDIUM",
        requiresApproval: false,
        recurringEnabled: !!prefill.defaultRecurring,
        frequency: "WEEKLY",
        endType: "NEVER",
      });
      setDescription(prefill.description ?? "");
      setAssignees(prefill.assignees ?? []);
      setChecklist(prefill.checklist ?? []);
      setTagIds(prefill.tagIds ?? []);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill]);

  const onSubmit = async (values: FormValues) => {
    if (assignees.length === 0) {
      push({ variant: "error", title: "At least one assignee is required." });
      return;
    }
    if (values.requiresApproval && approver.length === 0) {
      push({ variant: "error", title: "Select an approver when Requires Approval is on." });
      return;
    }
    if (values.startDate && values.dueDate && values.dueDate < values.startDate) {
      push({ variant: "error", title: "Due Date cannot be before Start Date." });
      return;
    }
    try {
      await createTask.mutateAsync({
        boardId: board.id,
        stageId: values.stageId,
        title: values.title,
        description: description || undefined,
        priority: values.priority,
        assigneeUserIds: assignees.map((a) => a.userId),
        watcherUserIds: watchers.map((w) => w.userId),
        startDate: values.startDate || undefined,
        dueDate: values.dueDate || undefined,
        estimatedEffortHours: values.estimatedEffortHours ? Number(values.estimatedEffortHours) : undefined,
        checklist: checklist.map((text) => ({ text })),
        tagIds,
        linkedRecordId: linkedRecord?.id,
        linkedRecordType: linkedRecord?.type,
        requiresApproval: values.requiresApproval,
        approverUserId: values.requiresApproval ? approver[0]?.userId : undefined,
        recurring: values.recurringEnabled
          ? {
              frequency: values.frequency,
              customIntervalDays: values.frequency === "CUSTOM" ? Number(values.customIntervalDays || 7) : undefined,
              endType: values.endType,
              occurrencesLimit: values.endType === "AFTER_N" ? Number(values.occurrencesLimit || 1) : undefined,
              endDate: values.endType === "ON_DATE" ? values.endDate : undefined,
            }
          : undefined,
      });
      push({ variant: "success", title: "Task created." });
      resetAll();
      onClose();
    } catch (err) {
      push({ variant: "error", title: "Could not create task", description: extractApiError(err).message });
    }
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Create task"
      subtitle={board.name}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} loading={isSubmitting}>
            Create task
          </Button>
        </>
      }
    >
      <form onChange={() => setDirty(true)} onSubmit={(e) => e.preventDefault()} className="space-y-6">
        <section className="space-y-3">
          <div>
            <Label required>Title</Label>
            <Input maxLength={150} error={errors.title?.message} {...register("title", { required: "Title is required.", maxLength: { value: 150, message: "Maximum 150 characters." } })} />
          </div>
          <div>
            <Label>Description</Label>
            <RichTextEditor value={description} onChange={setDescription} placeholder="What needs to be done?" />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div>
            <Label required>Stage</Label>
            <Select {...register("stageId", { required: true })}>
              {[...board.stages].sort((a, b) => a.position - b.position).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select {...register("priority")}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </Select>
          </div>
        </section>

        <section>
          <Label required>Assignee(s)</Label>
          <PeoplePicker selected={assignees} onChange={setAssignees} primaryUserId={assignees[0]?.userId} placeholder="Add an assignee…" />
          <p className="mt-1 text-[11px] text-slate-400">The first person you add becomes the Primary Assignee.</p>
          <div className="mt-3">
            <Label>Watchers</Label>
            <PeoplePicker selected={watchers} onChange={setWatchers} excludeUserIds={assignees.map((a) => a.userId)} placeholder="Add a watcher…" />
          </div>
        </section>

        <section className="grid grid-cols-3 gap-3">
          <div>
            <Label>Start Date</Label>
            <Input type="date" {...register("startDate")} />
          </div>
          <div>
            <Label>Due Date</Label>
            <Input type="date" min={startDate || undefined} {...register("dueDate")} />
          </div>
          <div>
            <Label>Estimated Effort (hrs)</Label>
            <Input type="number" min={0} step={0.5} {...register("estimatedEffortHours")} />
          </div>
        </section>

        <section>
          <Label>Checklist</Label>
          <div className="space-y-1.5">
            {checklist.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{item}</span>
                <button type="button" onClick={() => setChecklist((c) => c.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2">
            <Input
              placeholder="Add a checklist item…"
              value={newChecklistItem}
              onChange={(e) => setNewChecklistItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newChecklistItem.trim()) {
                  e.preventDefault();
                  setChecklist((c) => [...c, newChecklistItem.trim()]);
                  setNewChecklistItem("");
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (newChecklistItem.trim()) {
                  setChecklist((c) => [...c, newChecklistItem.trim()]);
                  setNewChecklistItem("");
                }
              }}
              className="shrink-0 rounded-lg border border-slate-300 px-3 text-slate-500 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </section>

        <section>
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-1.5">
            {allTags?.map((t: any) => {
              const isOn = tagIds.includes(t.id);
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTagIds((prev) => (isOn ? prev.filter((id) => id !== t.id) : [...prev, t.id]))}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={isOn ? { background: `${t.color}22`, color: t.color, borderColor: t.color } : { borderColor: "#e2e8f0", color: "#64748b" }}
                >
                  {t.name}
                </button>
              );
            })}
            {(!allTags || allTags.length === 0) && <p className="text-xs text-slate-400">No tags yet — create some from Settings → Tags.</p>}
          </div>
        </section>

        <section>
          <Label>Linked Record</Label>
          <Input placeholder="Search customers, leads, orders, invoices…" value={recordQuery} onChange={(e) => setRecordQuery(e.target.value)} />
          {records && records.length > 0 && (
            <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200">
              {records.map((r: any) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setLinkedRecord({ id: r.id, type: r.recordType, name: r.name });
                    setRecordQuery(`${r.name} (${r.externalRef})`);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>{r.name}</span>
                  <span className="text-xs text-slate-400">{r.recordType}</span>
                </button>
              ))}
            </div>
          )}
          {linkedRecord && (
            <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-xs">
              <span>
                {linkedRecord.name} · <Badge tone="indigo">{linkedRecord.type}</Badge>
              </span>
              <button type="button" onClick={() => { setLinkedRecord(null); setRecordQuery(""); }} className="text-slate-400 hover:text-red-500">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" {...register("requiresApproval")} /> Requires Approval
          </label>
          {requiresApproval && (
            <div>
              <Label required>Approver</Label>
              <PeoplePicker selected={approver} onChange={(p) => setApprover(p.slice(-1))} placeholder="Search for an approver…" />
            </div>
          )}
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" {...register("recurringEnabled")} /> Recurring
          </label>
          {recurringEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequency</Label>
                <Select {...register("frequency")}>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="CUSTOM">Custom</option>
                </Select>
              </div>
              {frequency === "CUSTOM" && (
                <div>
                  <Label>Repeat every (days)</Label>
                  <Input type="number" min={1} {...register("customIntervalDays")} />
                </div>
              )}
              <div>
                <Label>End condition</Label>
                <Select {...register("endType")}>
                  <option value="NEVER">Never</option>
                  <option value="AFTER_N">After N occurrences</option>
                  <option value="ON_DATE">On a date</option>
                </Select>
              </div>
              {endType === "AFTER_N" && (
                <div>
                  <Label>Occurrences</Label>
                  <Input type="number" min={1} {...register("occurrencesLimit")} />
                </div>
              )}
              {endType === "ON_DATE" && (
                <div>
                  <Label>End date</Label>
                  <Input type="date" {...register("endDate")} />
                </div>
              )}
              <p className="col-span-2 text-[11px] text-slate-400">
                Each generated occurrence gets its own Task ID and shares this Series ID for traceability (Section 23).
              </p>
            </div>
          )}
        </section>
      </form>
    </Drawer>
  );
};
