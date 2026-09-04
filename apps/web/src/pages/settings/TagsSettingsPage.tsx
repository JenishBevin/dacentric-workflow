import React, { useState } from "react";
import { Plus, Trash2, Tags as TagsIcon } from "lucide-react";
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from "../../api/misc";
import { Button, Input, Skeleton, ErrorState, EmptyState } from "../../components/ui/primitives";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { can } from "../../lib/permissions";
import { useAuth } from "../../context/AuthContext";

interface Tag {
  id: string;
  name: string;
  color: string;
}

const PALETTE = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#d97706", "#059669", "#0891b2", "#475569"];

/** Section 20: organization-wide tags, permission-controlled creation. */
export default function TagsSettingsPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [search, setSearch] = useState("");
  const { data: tags, isLoading, isError, refetch } = useTags(search);
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);

  const canManage = can(user, "MANAGE_ROLES", "ALL") || can(user, "CREATE_BOARD"); // Workflow Manager / Admin

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await createTag.mutateAsync({ name: newName.trim(), color: newColor });
      setNewName("");
    } catch (err) {
      push({ variant: "error", title: "Could not create tag", description: extractApiError(err).message });
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Tags</h1>
        <p className="text-sm text-slate-500">Organization-wide labels used to classify and filter tasks and boards.</p>
      </div>

      <Input placeholder="Search tags…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {canManage && (
        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex-1">
            <Input placeholder="New tag name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
          </div>
          <div className="flex gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className="h-7 w-7 rounded-full ring-offset-2"
                style={{ background: c, outline: newColor === c ? `2px solid ${c}` : undefined, boxShadow: newColor === c ? "0 0 0 2px white, 0 0 0 4px " + c : undefined }}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
          <Button onClick={handleCreate} loading={createTag.isPending}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      )}

      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && <ErrorState message="Could not load tags." onRetry={() => refetch()} />}
      {tags && tags.length === 0 && <EmptyState icon={<TagsIcon className="h-8 w-8" />} title="No tags yet." description={canManage ? "Create your first tag above." : "Ask a manager to create some tags."} />}

      {tags && tags.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {(tags as Tag[]).map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
              <input
                defaultValue={t.name}
                disabled={!canManage}
                onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && updateTag.mutate({ tagId: t.id, name: e.target.value.trim() })}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-slate-200 focus-visible:focus-ring disabled:hover:border-transparent"
              />
              {canManage && (
                <input
                  type="color"
                  defaultValue={t.color}
                  onChange={(e) => updateTag.mutate({ tagId: t.id, color: e.target.value })}
                  className="h-6 w-6 cursor-pointer rounded border-0"
                  aria-label={`Change colour for ${t.name}`}
                />
              )}
              {canManage && (
                <button onClick={() => setPendingDelete(t)} className="text-slate-300 hover:text-red-500" aria-label={`Delete ${t.name}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete tag"
        message={
          <>
            Are you sure you want to delete the tag <strong>&ldquo;{pendingDelete?.name}&rdquo;</strong>? It will be removed from every task and board that uses it.
          </>
        }
        confirmLabel="Delete tag"
        loading={deleteTag.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteTag.mutateAsync(pendingDelete.id);
          } catch (err) {
            push({ variant: "error", title: "Could not delete tag", description: extractApiError(err).message });
          }
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
