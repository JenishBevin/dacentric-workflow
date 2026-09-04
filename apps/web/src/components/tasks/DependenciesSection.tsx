import React, { useState } from "react";
import { X, Link2, ArrowRight, ArrowLeft } from "lucide-react";
import { Input, Badge } from "../ui/primitives";
import { useDependencyMutations, useTaskSearch } from "../../api/tasks";
import { TaskSummary } from "../../lib/types";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";

/**
 * Section 22: Blocked By / Blocks. When dependency enforcement is on, the
 * backend rejects moving this task to a terminal (Done) stage while an
 * active "Blocked By" link remains open — see tasks.service.moveTask.
 */
export const DependenciesSection: React.FC<{ task: TaskSummary; canEdit: boolean }> = ({ task, canEdit }) => {
  const { push } = useToast();
  const { add, remove } = useDependencyMutations(task.id);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"BLOCKED_BY" | "BLOCKS">("BLOCKED_BY");
  const { data: results } = useTaskSearch(query);

  async function addDependency(targetTaskId: string) {
    try {
      await add.mutateAsync({ type: mode, taskId: targetTaskId });
      setQuery("");
    } catch (err) {
      push({ variant: "error", title: "Could not add dependency", description: extractApiError(err).message });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-500">Dependencies</p>

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <ArrowLeft className="h-3.5 w-3.5" /> Blocked by
        </p>
        <div className="space-y-1">
          {task.blockedBy.map((d) => (
            <DependencyRow key={d.id} taskId={d.taskId} title={d.title} isCompleted={d.isCompleted} canEdit={canEdit} onRemove={() => remove.mutate(d.id)} />
          ))}
          {task.blockedBy.length === 0 && <p className="text-xs text-slate-400">Nothing is blocking this task.</p>}
        </div>
      </div>

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <ArrowRight className="h-3.5 w-3.5" /> Blocks
        </p>
        <div className="space-y-1">
          {task.blocks.map((d) => (
            <DependencyRow key={d.id} taskId={d.taskId} title={d.title} isCompleted={d.isCompleted} canEdit={canEdit} onRemove={() => remove.mutate(d.id)} />
          ))}
          {task.blocks.length === 0 && <p className="text-xs text-slate-400">This task doesn't block anything.</p>}
        </div>
      </div>

      {canEdit && (
        <div className="rounded-lg border border-slate-200 p-2.5">
          <div className="mb-1.5 flex gap-1 text-xs">
            <button
              onClick={() => setMode("BLOCKED_BY")}
              className={`rounded-full px-2.5 py-1 ${mode === "BLOCKED_BY" ? "bg-brand-100 text-brand-700" : "text-slate-500 hover:bg-slate-100"}`}
            >
              Add "Blocked By"
            </button>
            <button
              onClick={() => setMode("BLOCKS")}
              className={`rounded-full px-2.5 py-1 ${mode === "BLOCKS" ? "bg-brand-100 text-brand-700" : "text-slate-500 hover:bg-slate-100"}`}
            >
              Add "Blocks"
            </button>
          </div>
          <Input placeholder="Search tasks by title or ID…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {results && results.length > 0 && (
            <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200">
              {results
                .filter((r: any) => r.id !== task.id)
                .map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => addDependency(r.id)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="truncate">{r.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">{r.taskId}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DependencyRow: React.FC<{ taskId: string; title: string; isCompleted: boolean; canEdit: boolean; onRemove: () => void }> = ({
  taskId,
  title,
  isCompleted,
  canEdit,
  onRemove,
}) => (
  <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
    <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
    <span className="text-xs text-slate-400">{taskId}</span>
    <span className="min-w-0 flex-1 truncate">{title}</span>
    <Badge tone={isCompleted ? "green" : "slate"}>{isCompleted ? "Done" : "Open"}</Badge>
    {canEdit && (
      <button onClick={onRemove} className="text-slate-300 hover:text-red-500" aria-label="Remove dependency">
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
);
