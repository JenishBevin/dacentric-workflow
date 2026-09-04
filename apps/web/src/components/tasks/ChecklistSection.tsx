import React, { useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { Input, Checkbox, Select } from "../ui/primitives";
import { ChecklistProgress } from "../workflow/badges";
import { useChecklistMutations } from "../../api/tasks";
import { useEmployeeDirectory } from "../../api/misc";
import { TaskSummary } from "../../lib/types";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import clsx from "clsx";

interface Props {
  task: TaskSummary;
  canEdit: boolean;
}

/** Section 18: add/edit/delete/complete checklist items, optional owner, progress counter. */
export const ChecklistSection: React.FC<Props> = ({ task, canEdit }) => {
  const { push } = useToast();
  const { add, update, remove } = useChecklistMutations(task.id);
  const [newText, setNewText] = useState("");
  const [ownerPickerFor, setOwnerPickerFor] = useState<string | null>(null);
  const { data: employees } = useEmployeeDirectory("");

  const items = [...task.checklist].sort((a, b) => a.position - b.position);

  async function handleAdd() {
    if (!newText.trim()) return;
    try {
      await add.mutateAsync({ text: newText.trim() });
      setNewText("");
    } catch (err) {
      push({ variant: "error", title: "Could not add checklist item", description: extractApiError(err).message });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">Checklist</p>
        <ChecklistProgress done={task.checklistProgress.done} total={task.checklistProgress.total} />
      </div>

      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="group flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
            <Checkbox
              checked={item.isComplete}
              disabled={!canEdit}
              onChange={(e) => update.mutate({ itemId: item.id, isComplete: e.target.checked })}
            />
            <input
              defaultValue={item.text}
              disabled={!canEdit}
              onBlur={(e) => e.target.value.trim() && e.target.value !== item.text && update.mutate({ itemId: item.id, text: e.target.value.trim() })}
              className={clsx("min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm", item.isComplete && "text-slate-400 line-through", canEdit && "hover:border-slate-200 focus-visible:focus-ring")}
            />
            {canEdit && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setOwnerPickerFor(ownerPickerFor === item.id ? null : item.id)}
                  className="whitespace-nowrap text-[11px] text-slate-400 hover:text-brand-600"
                >
                  {item.ownerName ?? "Assign owner"}
                </button>
                {ownerPickerFor === item.id && (
                  <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <button
                      onClick={() => {
                        update.mutate({ itemId: item.id, ownerId: null });
                        setOwnerPickerFor(null);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-50"
                    >
                      No owner
                    </button>
                    {employees?.map((e) => (
                      <button
                        key={e.userId}
                        onClick={() => {
                          update.mutate({ itemId: item.id, ownerId: e.userId });
                          setOwnerPickerFor(null);
                        }}
                        className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                      >
                        {e.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {canEdit && (
              <button onClick={() => remove.mutate(item.id)} className="shrink-0 text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100" aria-label="Delete checklist item">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="py-2 text-xs text-slate-400">No checklist items yet.</p>}
      </div>

      {canEdit && (
        <div className="flex gap-2">
          <Input
            placeholder="Add a checklist item…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button onClick={handleAdd} className="shrink-0 rounded-lg border border-slate-300 px-3 text-slate-500 hover:bg-slate-50" aria-label="Add checklist item">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};
