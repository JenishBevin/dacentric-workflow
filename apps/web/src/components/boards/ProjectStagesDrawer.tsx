import React, { useState } from "react";
import { Plus, X, GripVertical } from "lucide-react";
import { Drawer } from "../ui/Drawer";
import { Button, Input } from "../ui/primitives";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useAddProjectStage, useUpdateProjectStage, useDeleteProjectStage, useReorderProjectStages } from "../../api/boards";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { ProjectStage } from "../../lib/types";

/** Editor for the Projects page's kanban columns — same controls as a project's Settings → Stages tab
 *  (colour, name, WIP limit, reorder, delete), but for the company-wide project stages. */
export const ProjectStagesDrawer: React.FC<{ open: boolean; onClose: () => void; stages: ProjectStage[]; canAddStage: boolean }> = ({
  open,
  onClose,
  stages,
  canAddStage,
}) => {
  const { push } = useToast();
  const addStage = useAddProjectStage();
  const updateStage = useUpdateProjectStage();
  const deleteStage = useDeleteProjectStage();
  const reorderStages = useReorderProjectStages();
  const [newStageName, setNewStageName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ProjectStage | null>(null);

  function save(stageId: string, payload: { name?: string; color?: string; wipLimit?: number | null }) {
    updateStage.mutate({ stageId, ...payload }, { onError: (err) => push({ variant: "error", title: "Could not update stage", description: extractApiError(err).message }) });
  }

  function move(idx: number, delta: number) {
    const ids = stages.map((s) => s.id);
    [ids[idx], ids[idx + delta]] = [ids[idx + delta], ids[idx]];
    reorderStages.mutate(ids, { onError: (err) => push({ variant: "error", title: "Could not reorder stages", description: extractApiError(err).message }) });
  }

  return (
    <Drawer open={open} onClose={onClose} title="Project Stages" subtitle="Columns on the Projects kanban" widthClassName="md:w-[560px]">
      <div className="space-y-3">
        {canAddStage && (
          <div className="flex gap-2">
            <Input placeholder="New stage name" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} />
            <Button
              onClick={async () => {
                if (!newStageName.trim()) return;
                try {
                  await addStage.mutateAsync({ name: newStageName.trim() });
                  setNewStageName("");
                } catch (err) {
                  push({ variant: "error", title: "Could not add stage", description: extractApiError(err).message });
                }
              }}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {stages.map((stage, idx) => (
            // key includes the saved values so the uncontrolled inputs reset after a reorder/refetch
            <div key={`${stage.id}-${stage.name}-${stage.wipLimit}`} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5">
              <GripVertical className="h-4 w-4 text-slate-300" />
              <input
                type="color"
                defaultValue={stage.color}
                onBlur={(e) => e.target.value !== stage.color && save(stage.id, { color: e.target.value })}
                className="h-7 w-7 shrink-0 cursor-pointer rounded border-0"
                aria-label={`Colour for ${stage.name}`}
              />
              <input
                defaultValue={stage.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== stage.name && save(stage.id, { name: e.target.value.trim() })}
                className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-1 text-sm hover:border-slate-200 focus-visible:focus-ring"
                aria-label={`Name of ${stage.name}`}
              />
              <input
                type="number"
                min={1}
                placeholder="WIP"
                defaultValue={stage.wipLimit ?? ""}
                onBlur={(e) => {
                  const next = e.target.value ? Number(e.target.value) : null;
                  if (next !== stage.wipLimit) save(stage.id, { wipLimit: next });
                }}
                className="w-16 rounded border border-slate-200 px-1.5 py-1 text-xs"
                title="WIP limit"
              />
              <button disabled={idx === 0} onClick={() => move(idx, -1)} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move up">
                ↑
              </button>
              <button disabled={idx === stages.length - 1} onClick={() => move(idx, 1)} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move down">
                ↓
              </button>
              <button onClick={() => setConfirmDelete(stage)} className="text-slate-400 hover:text-red-500" aria-label={`Delete ${stage.name}`}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete stage"
        message={
          <>
            Delete the stage <strong>&ldquo;{confirmDelete?.name}&rdquo;</strong>? It must have no projects in it.
          </>
        }
        confirmLabel="Delete stage"
        loading={deleteStage.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await deleteStage.mutateAsync(confirmDelete.id);
            setConfirmDelete(null);
          } catch (err) {
            push({ variant: "error", title: "Could not delete stage", description: extractApiError(err).message });
            setConfirmDelete(null);
          }
        }}
      />
    </Drawer>
  );
};
