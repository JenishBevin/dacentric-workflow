import React, { useEffect, useRef, useState } from "react";
import { MessageSquare, ChevronDown, Plus, MessagesSquare } from "lucide-react";
import { Button, Input, Label, Checkbox, Avatar } from "../ui/primitives";
import { Modal } from "../ui/Modal";
import { useCreateGroupConversation, useGroupConversationsForEntity } from "../../api/chat";
import { useChatLauncher } from "../../context/ChatLauncherContext";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";

interface Person {
  userId: string;
  name: string;
}

interface Props {
  entityType: "TASK" | "BOARD";
  entityId: string;
  /** Prefills the group name — the task/project's own title, editable by
   * whoever creates the discussion ("group heading can be set by who
   * created this group"). */
  defaultName: string;
  /** Only people already tagged on this task/project — assignees/watchers/
   * reporter for a task, board members for a project. Not an org-wide search. */
  candidates: Person[];
}

/** "Discuss" — opens a popup to pick from the people already tagged on this
 * task/project and starts a named group chat with them, seeded with a card
 * describing the task/project. If a discussion already exists for this
 * task/project, the button becomes a dropdown offering "Start new" alongside
 * "Open" for each prior one, instead of only ever starting fresh threads. */
export const DiscussButton: React.FC<Props> = ({ entityType, entityId, defaultName, candidates }) => {
  const { push } = useToast();
  const { requestOpen } = useChatLauncher();
  const createGroup = useCreateGroupConversation();
  const { data: existing } = useGroupConversationsForEntity(entityType, entityId);
  const [createOpen, setCreateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function openCreateModal() {
    setName(defaultName);
    setSelected(new Set());
    setCreateOpen(true);
    setMenuOpen(false);
  }

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function submit() {
    if (!name.trim()) {
      push({ variant: "error", title: "Enter a name for this discussion." });
      return;
    }
    if (selected.size === 0) {
      push({ variant: "error", title: "Select at least one person to discuss this with." });
      return;
    }
    try {
      const conversation = await createGroup.mutateAsync({
        name: name.trim(),
        userIds: [...selected],
        entityType,
        entityId,
      });
      push({ variant: "success", title: "Discussion started." });
      requestOpen(conversation.id, name.trim());
      setCreateOpen(false);
    } catch (err) {
      push({ variant: "error", title: "Could not start discussion", description: extractApiError(err).message });
    }
  }

  const hasExisting = !!existing && existing.length > 0;

  return (
    <>
      <div className="relative" ref={menuRef}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => (hasExisting ? setMenuOpen((o) => !o) : openCreateModal())}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Discuss
          {hasExisting && <ChevronDown className="h-3 w-3" />}
        </Button>
        {menuOpen && hasExisting && (
          // Opens upward (bottom-full) — this button most commonly sits in
          // TaskDetailDrawer's sticky bottom-0 footer, where there's no
          // viewport room below it for a downward dropdown.
          <div className="absolute bottom-full left-0 z-20 mb-1 w-56 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
            <button
              type="button"
              onClick={openCreateModal}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-brand-600 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" /> Start new discussion
            </button>
            <div className="my-1 border-t border-slate-100" />
            <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Open existing</p>
            {existing!.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  requestOpen(c.id, c.name ?? "Discussion");
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
              >
                <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{c.name ?? "Discussion"}</span>
                <span className="shrink-0 text-xs text-slate-400">{c.participantCount}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Start a discussion"
        description="Only people already tagged on this can be added."
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <Label required>Group name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
          </div>
          <div>
            <Label required>Who's in it?</Label>
            {candidates.length === 0 ? (
              <p className="text-sm text-slate-400">No one else is tagged on this yet.</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {candidates.map((p) => (
                  <label key={p.userId} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm hover:bg-slate-50">
                    <Checkbox checked={selected.has(p.userId)} onChange={() => toggle(p.userId)} />
                    <Avatar name={p.name} size="xs" />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={createGroup.isPending}>
            Start discussion
          </Button>
        </div>
      </Modal>
    </>
  );
};
