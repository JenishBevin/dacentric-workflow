import React, { useState } from "react";
import { Drawer } from "../ui/Drawer";
import { Button, Input, Label, Select, Textarea } from "../ui/primitives";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Plus, X, GripVertical } from "lucide-react";
import {
  useUpdateBoard,
  useAddStage,
  useUpdateStage,
  useDeleteStage,
  useReorderStages,
  useAddBoardMember,
  useUpdateBoardMemberRole,
  useRemoveBoardMember,
  useArchiveBoard,
  useDeleteBoard,
} from "../../api/boards";
import { useEmployeeDirectory } from "../../api/misc";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/apiClient";
import { useQueryClient } from "@tanstack/react-query";

type Tab = "general" | "stages" | "members" | "templates";

export const BoardSettingsDrawer: React.FC<{ open: boolean; onClose: () => void; board: any; initialTab?: Tab }> = ({
  open,
  onClose,
  board,
  initialTab = "general",
}) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { push } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const updateBoard = useUpdateBoard(board.id);
  const addStage = useAddStage(board.id);
  const updateStage = useUpdateStage(board.id);
  const deleteStage = useDeleteStage(board.id);
  const reorderStages = useReorderStages(board.id);
  const addMember = useAddBoardMember(board.id);
  const updateMemberRole = useUpdateBoardMemberRole(board.id);
  const removeMember = useRemoveBoardMember(board.id);
  const archiveBoard = useArchiveBoard();
  const deleteBoard = useDeleteBoard();

  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description ?? "");
  const [confirmDeleteBoard, setConfirmDeleteBoard] = useState(false);
  const [confirmDeleteStage, setConfirmDeleteStage] = useState<{ id: string; name: string; taskCount?: number } | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const { data: employees } = useEmployeeDirectory(memberQuery);
  const [newStageName, setNewStageName] = useState("");
  const [templateName, setTemplateName] = useState("");

  const stages = [...(board.stages ?? [])].sort((a: any, b: any) => a.position - b.position);

  return (
    <Drawer open={open} onClose={onClose} title="Board Settings" subtitle={board.name} widthClassName="md:w-[640px]">
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(["general", "stages", "members", "templates"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-medium capitalize ${tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <div className="space-y-4">
          <div>
            <Label required>Board name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button
            onClick={async () => {
              try {
                await updateBoard.mutateAsync({ name, description, version: board.version });
                push({ variant: "success", title: "Board updated." });
              } catch (err) {
                push({ variant: "error", title: "Could not save", description: extractApiError(err).message });
              }
            }}
            loading={updateBoard.isPending}
          >
            Save changes
          </Button>

          {board.linkedRecord && (
            <div className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-700">Linked record</p>
              <p className="text-slate-500">{board.linkedRecord.name}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={async () => {
                  await updateBoard.mutateAsync({ linkedRecordId: null, linkedRecordType: null });
                  push({ variant: "success", title: "Board unlinked." });
                }}
              >
                Unlink record
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
            <p className="text-sm font-semibold text-red-800">Danger Zone</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await archiveBoard.mutateAsync({ boardId: board.id, archived: !board.isArchived });
                  push({ variant: "success", title: board.isArchived ? "Board unarchived." : "Board archived." });
                }}
              >
                {board.isArchived ? "Unarchive Board" : "Archive Board"}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setConfirmDeleteBoard(true)}>
                Delete Board
              </Button>
            </div>
          </div>
        </div>
      )}

      {tab === "stages" && (
        <div className="space-y-3">
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

          <div className="space-y-2">
            {stages.map((stage: any, idx: number) => (
              <div key={stage.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5">
                <GripVertical className="h-4 w-4 text-slate-300" />
                <input
                  type="color"
                  value={stage.color}
                  onChange={(e) => updateStage.mutate({ stageId: stage.id, color: e.target.value } as any)}
                  className="h-7 w-7 shrink-0 cursor-pointer rounded border-0"
                  aria-label={`Colour for ${stage.name}`}
                />
                <input
                  defaultValue={stage.name}
                  onBlur={(e) => e.target.value !== stage.name && updateStage.mutate({ stageId: stage.id, name: e.target.value } as any)}
                  className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-1 text-sm hover:border-slate-200 focus-visible:focus-ring"
                />
                <input
                  type="number"
                  min={1}
                  placeholder="WIP"
                  defaultValue={stage.wipLimit ?? ""}
                  onBlur={(e) => updateStage.mutate({ stageId: stage.id, wipLimit: e.target.value ? Number(e.target.value) : null } as any)}
                  className="w-16 rounded border border-slate-200 px-1.5 py-1 text-xs"
                  title="WIP limit"
                />
                <label className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
                  <input
                    type="checkbox"
                    defaultChecked={stage.isTerminal}
                    onChange={(e) => updateStage.mutate({ stageId: stage.id, isTerminal: e.target.checked } as any)}
                  />
                  Done stage
                </label>
                <button
                  disabled={idx === 0}
                  onClick={() => {
                    const ids = stages.map((s: any) => s.id);
                    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                    reorderStages.mutate(ids);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  disabled={idx === stages.length - 1}
                  onClick={() => {
                    const ids = stages.map((s: any) => s.id);
                    [ids[idx + 1], ids[idx]] = [ids[idx], ids[idx + 1]];
                    reorderStages.mutate(ids);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                >
                  ↓
                </button>
                <button onClick={() => setConfirmDeleteStage({ id: stage.id, name: stage.name })} className="text-slate-400 hover:text-red-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "members" && (
        <div className="space-y-3">
          <Input placeholder="Search people to add…" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} />
          {memberQuery && employees && (
            <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200">
              {employees
                .filter((e) => !board.members.some((m: any) => m.userId === e.userId))
                .map((e) => (
                  <button
                    key={e.userId}
                    onClick={async () => {
                      await addMember.mutateAsync({ userId: e.userId, role: "EDITOR" });
                      setMemberQuery("");
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span>{e.name}</span>
                    <span className="text-xs text-slate-400">{e.department}</span>
                  </button>
                ))}
            </div>
          )}
          <div className="space-y-1.5">
            {board.members.map((m: any) => (
              <div key={m.userId} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                <span className="flex-1 truncate text-sm text-slate-700">{m.user?.name ?? m.name}</span>
                <Select
                  value={m.role}
                  onChange={(e) => updateMemberRole.mutate({ userId: m.userId, role: e.target.value })}
                  className="!w-32"
                >
                  <option value="OWNER">Owner</option>
                  <option value="EDITOR">Editor</option>
                  <option value="VIEWER">Viewer</option>
                  <option value="COMMENTER">Commenter</option>
                </Select>
                <button
                  onClick={async () => {
                    try {
                      await removeMember.mutateAsync(m.userId);
                    } catch (err) {
                      push({ variant: "error", title: "Could not remove member", description: extractApiError(err).message });
                    }
                  }}
                  className="text-slate-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "templates" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Save this board's current stage structure as a reusable template for future boards.</p>
          <div className="flex gap-2">
            <Input placeholder="Template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
            <Button
              onClick={async () => {
                if (!templateName.trim()) return;
                try {
                  await api.post(`/boards/${board.id}/save-as-template`, { name: templateName.trim() });
                  qc.invalidateQueries({ queryKey: ["board-templates"] });
                  push({ variant: "success", title: "Template saved." });
                  setTemplateName("");
                } catch (err) {
                  push({ variant: "error", title: "Could not save template", description: extractApiError(err).message });
                }
              }}
            >
              Save as template
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteBoard}
        title="Delete board"
        message={
          <>
            Are you sure you want to delete the board <strong>&ldquo;{board.name}&rdquo;</strong>? This cannot be undone.
          </>
        }
        confirmLabel="Delete board"
        loading={deleteBoard.isPending}
        onCancel={() => setConfirmDeleteBoard(false)}
        onConfirm={async () => {
          try {
            await deleteBoard.mutateAsync({ boardId: board.id, confirmCascade: true });
            push({ variant: "success", title: "Board deleted." });
            navigate("/workflow/boards");
          } catch (err) {
            push({ variant: "error", title: "Could not delete board", description: extractApiError(err).message });
          }
        }}
      />

      <ConfirmDialog
        open={!!confirmDeleteStage}
        title="Delete stage"
        message={
          <>
            Are you sure you want to delete the stage <strong>&ldquo;{confirmDeleteStage?.name}&rdquo;</strong>? Tasks must be moved out of it
            first.
          </>
        }
        confirmLabel="Delete stage"
        loading={deleteStage.isPending}
        onCancel={() => setConfirmDeleteStage(null)}
        onConfirm={async () => {
          if (!confirmDeleteStage) return;
          try {
            await deleteStage.mutateAsync(confirmDeleteStage.id);
            setConfirmDeleteStage(null);
          } catch (err) {
            push({ variant: "error", title: "Could not delete stage", description: extractApiError(err).message });
            setConfirmDeleteStage(null);
          }
        }}
      />
    </Drawer>
  );
};
