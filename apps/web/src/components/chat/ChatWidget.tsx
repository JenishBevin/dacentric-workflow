import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, X, ArrowLeft, Plus, Paperclip, Send, Download, Search, Maximize2, Minimize2, Smile, Pencil, Trash2, ListTodo, Trello, ExternalLink, UserPlus, Check, Users, UserMinus, Crown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";
import {
  useConversations,
  useUnreadChatCount,
  useMessageableUsers,
  useStartConversation,
  useConversationMessages,
  useSendChatMessage,
  useMarkConversationRead,
  useEditChatMessage,
  useDeleteChatMessage,
  useDeleteConversation,
  useAddParticipants,
  useConversationDetail,
  useRemoveParticipant,
  downloadChatAttachment,
} from "../../api/chat";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useChatLauncher } from "../../context/ChatLauncherContext";
import { extractApiError } from "../../lib/apiClient";
import { Avatar, Spinner, EmptyState } from "../ui/primitives";
import { ConfirmDialog } from "../ui/ConfirmDialog";

const EDIT_WINDOW_MS = 60_000;

const STICKERS = [
  "😀", "😂", "😍", "😎", "🤔", "😭", "😡", "🥳",
  "😴", "😅", "🥰", "😇", "👍", "👎", "🙏", "👏",
  "🙌", "🤝", "👋", "💪", "❤️", "🔥", "💯", "🎉",
  "🚀", "⭐", "✅", "❌",
];

function isStickerOnly(text?: string | null) {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 16) return false;
  return /^(\p{Extended_Pictographic}|\s)+$/u.test(trimmed);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type View = { screen: "list" } | { screen: "new" } | { screen: "thread"; conversationId: string; title: string; isGroup?: boolean };

/** Floating 1:1 chat widget, mounted once at the layout level so it persists
 * across every page. Polling-based (no WebSocket infra) — matches the
 * Notifications pattern already used elsewhere in this app. */
export const ChatWidget: React.FC = () => {
  const { user } = useAuth();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [view, setView] = useState<View>({ screen: "list" });
  const [userSearch, setUserSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showStickers, setShowStickers] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState<string | null>(null);
  const [pendingDeleteConversation, setPendingDeleteConversation] = useState(false);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [addPeopleSearch, setAddPeopleSearch] = useState("");
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [showMembers, setShowMembers] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const stickerRef = useRef<HTMLDivElement>(null);
  const addPeopleRef = useRef<HTMLDivElement>(null);
  const membersRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: unreadCount } = useUnreadChatCount();
  const { data: conversations, isLoading: conversationsLoading } = useConversations(open && view.screen === "list");
  const { data: messageableUsers } = useMessageableUsers(userSearch, open && view.screen === "new");
  const startConversation = useStartConversation();
  const conversationId = view.screen === "thread" ? view.conversationId : null;
  const { data: messages, isLoading: messagesLoading } = useConversationMessages(conversationId);
  const sendMessage = useSendChatMessage(conversationId);
  const markRead = useMarkConversationRead();
  const editMessage = useEditChatMessage(conversationId);
  const deleteMessage = useDeleteChatMessage(conversationId);
  const deleteConversation = useDeleteConversation();
  const addParticipants = useAddParticipants(conversationId);
  const { data: addPeopleCandidates } = useMessageableUsers(addPeopleSearch, open && view.screen === "thread" && showAddPeople);
  const { data: conversationDetail } = useConversationDetail(open && view.screen === "thread" && view.isGroup ? conversationId : null);
  const removeParticipant = useRemoveParticipant(conversationId);
  const { pendingOpen, clearPendingOpen } = useChatLauncher();

  // A "Discuss" button elsewhere in the app just created a group conversation
  // and wants this globally-mounted widget to jump straight to it.
  useEffect(() => {
    if (!pendingOpen) return;
    setOpen(true);
    setView({ screen: "thread", conversationId: pendingOpen.conversationId, title: pendingOpen.title, isGroup: true });
    clearPendingOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpen]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // ConfirmDialog renders via a portal into document.body, outside this
      // panel's DOM subtree — without this guard, clicking its buttons would
      // register as an "outside click" and close the whole widget.
      if ((e.target as Element)?.closest?.('[role="dialog"]')) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (stickerRef.current && !stickerRef.current.contains(e.target as Node)) setShowStickers(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (addPeopleRef.current && !addPeopleRef.current.contains(e.target as Node)) setShowAddPeople(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (membersRef.current && !membersRef.current.contains(e.target as Node)) setShowMembers(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    setShowAddPeople(false);
    setAddPeopleSearch("");
    setSelectedToAdd(new Set());
    setShowMembers(false);
  }, [conversationId]);

  useEffect(() => {
    if (conversationId) markRead.mutate(conversationId);
    // Only re-run when the thread or its message count changes — marking
    // read on every render (e.g. from markRead's own mutation state) would
    // loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages?.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  function openConversation(id: string, title: string, isGroup?: boolean) {
    setView({ screen: "thread", conversationId: id, title, isGroup });
  }

  async function handleStartConversation(userId: string, name: string) {
    try {
      const conversation = await startConversation.mutateAsync(userId);
      setUserSearch("");
      openConversation(conversation.id, name);
    } catch (err) {
      push({ variant: "error", title: "Could not start conversation", description: extractApiError(err).message });
    }
  }

  function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setPendingFiles((prev) => [...prev, ...files]);
  }

  function insertSticker(sticker: string) {
    setDraft((prev) => (prev ? `${prev} ${sticker}` : sticker));
    setShowStickers(false);
  }

  function startEdit(m: any) {
    setEditingId(m.id);
    setEditDraft(m.body ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  async function saveEdit(messageId: string) {
    if (!editDraft.trim()) return;
    try {
      await editMessage.mutateAsync({ messageId, body: editDraft.trim() });
      cancelEdit();
    } catch (err) {
      push({ variant: "error", title: "Could not edit message", description: extractApiError(err).message });
    }
  }

  async function confirmDeleteMessage() {
    if (!pendingDeleteMessageId) return;
    try {
      await deleteMessage.mutateAsync(pendingDeleteMessageId);
      setPendingDeleteMessageId(null);
    } catch (err) {
      push({ variant: "error", title: "Could not delete message", description: extractApiError(err).message });
    }
  }

  function toggleSelectedToAdd(userId: string) {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function submitAddParticipants() {
    if (selectedToAdd.size === 0) return;
    try {
      await addParticipants.mutateAsync([...selectedToAdd]);
      push({ variant: "success", title: "Added to the discussion." });
      setSelectedToAdd(new Set());
      setAddPeopleSearch("");
      setShowAddPeople(false);
    } catch (err) {
      push({ variant: "error", title: "Could not add people", description: extractApiError(err).message });
    }
  }

  async function handleRemoveParticipant(userId: string) {
    try {
      await removeParticipant.mutateAsync(userId);
      if (userId === user!.id) {
        push({ variant: "success", title: "You left the discussion." });
        setShowMembers(false);
        setView({ screen: "list" });
      } else {
        push({ variant: "success", title: "Removed from the discussion." });
      }
    } catch (err) {
      push({ variant: "error", title: "Could not remove", description: extractApiError(err).message });
    }
  }

  async function confirmDeleteConversation() {
    if (!conversationId) return;
    try {
      await deleteConversation.mutateAsync(conversationId);
      setPendingDeleteConversation(false);
      setView({ screen: "list" });
    } catch (err) {
      push({ variant: "error", title: "Could not delete conversation", description: extractApiError(err).message });
    }
  }

  async function submitMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() && pendingFiles.length === 0) return;
    try {
      await sendMessage.mutateAsync({ body: draft.trim() || undefined, files: pendingFiles });
      setDraft("");
      setPendingFiles([]);
    } catch (err) {
      push({ variant: "error", title: "Could not send message", description: extractApiError(err).message });
    }
  }

  if (!user) return null;

  const sizeControl = (
    <button
      onClick={() => setMaximized((m) => !m)}
      className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
      aria-label={maximized ? "Minimize chat" : "Maximize chat"}
    >
      {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </button>
  );

  return (
    // z-[60] — deliberately above Drawer/Modal's z-50 (ui/Drawer.tsx,
    // ui/Modal.tsx). The "Discuss" button opens this widget from inside an
    // open Task Detail Drawer, which the user may keep open at the same
    // time — without this, the widget opened correctly in state but
    // rendered invisible underneath the still-open drawer.
    <div className="fixed bottom-20 right-4 z-[60] sm:bottom-4" ref={panelRef}>
      {open && (
        <div
          className={clsx(
            "mb-3 flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl",
            maximized ? "h-[80vh] w-[50vw]" : "h-[30rem] w-[22rem]"
          )}
        >
          {view.screen === "thread" ? (
            <div className="relative flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
              <button onClick={() => setView({ screen: "list" })} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Back to conversations">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <Avatar name={view.title} size="sm" />
              <p className="truncate text-sm font-semibold text-slate-900">{view.title}</p>
              <div className="ml-auto flex items-center gap-1">
                {view.isGroup && (
                  <button
                    onClick={() => setShowMembers((s) => !s)}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                    aria-label="See who's in this discussion"
                  >
                    <Users className="h-4 w-4" />
                  </button>
                )}
                {view.isGroup && (
                  <button
                    onClick={() => setShowAddPeople((s) => !s)}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                    aria-label="Add people to this discussion"
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setPendingDeleteConversation(true)}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500"
                  aria-label="Delete conversation"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {sizeControl}
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Close chat">
                <X className="h-4 w-4" />
              </button>

              {showAddPeople && view.isGroup && (
                <div
                  ref={addPeopleRef}
                  className="absolute right-2 top-full z-10 mt-1 flex w-64 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
                >
                  <div className="border-b border-slate-100 p-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        autoFocus
                        value={addPeopleSearch}
                        onChange={(e) => setAddPeopleSearch(e.target.value)}
                        placeholder="Search people…"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:focus-ring"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {(addPeopleCandidates ?? []).length === 0 && (
                      <p className="px-3 py-4 text-center text-xs text-slate-400">No people found</p>
                    )}
                    {(addPeopleCandidates ?? []).map((u: any) => {
                      const isSelected = selectedToAdd.has(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleSelectedToAdd(u.id)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                        >
                          <Avatar name={u.name} size="xs" />
                          <span className="min-w-0 flex-1 truncate text-slate-700">{u.name}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex justify-end border-t border-slate-100 p-2">
                    <button
                      type="button"
                      onClick={submitAddParticipants}
                      disabled={selectedToAdd.size === 0 || addParticipants.isPending}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      Add{selectedToAdd.size > 0 ? ` (${selectedToAdd.size})` : ""}
                    </button>
                  </div>
                </div>
              )}

              {showMembers && view.isGroup && (
                <div
                  ref={membersRef}
                  className="absolute right-2 top-full z-10 mt-1 flex w-64 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
                >
                  <p className="border-b border-slate-100 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {conversationDetail ? `${conversationDetail.participants.length} people` : "People"}
                  </p>
                  <div className="max-h-56 overflow-y-auto">
                    {!conversationDetail && (
                      <div className="flex justify-center py-4">
                        <Spinner className="h-4 w-4" />
                      </div>
                    )}
                    {conversationDetail?.participants.map((p) => {
                      const isCreator = p.userId === conversationDetail.createdById;
                      const isSelf = p.userId === user.id;
                      const canRemove = isSelf || conversationDetail.createdById === user.id;
                      return (
                        <div key={p.userId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                          <Avatar name={p.name} size="xs" />
                          <span className="min-w-0 flex-1 truncate text-slate-700">
                            {p.name}
                            {isSelf && <span className="text-slate-400"> (you)</span>}
                          </span>
                          {isCreator && <Crown className="h-3 w-3 shrink-0 text-amber-500" aria-label="Started this discussion" />}
                          {canRemove && (
                            <button
                              type="button"
                              onClick={() => handleRemoveParticipant(p.userId)}
                              disabled={removeParticipant.isPending}
                              className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                              aria-label={isSelf ? "Leave this discussion" : `Remove ${p.name}`}
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-900">Messages</p>
              <div className="flex items-center gap-1">
                {view.screen === "list" ? (
                  <button onClick={() => setView({ screen: "new" })} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="New conversation">
                    <Plus className="h-4 w-4" />
                  </button>
                ) : (
                  <button onClick={() => setView({ screen: "list" })} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Back to conversations">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                {sizeControl}
                <button onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Close chat">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {view.screen === "list" && (
            <div className="flex-1 overflow-y-auto">
              {conversationsLoading && (
                <div className="flex justify-center py-8">
                  <Spinner className="h-5 w-5" />
                </div>
              )}
              {!conversationsLoading && (conversations ?? []).length === 0 && (
                <div className="p-6">
                  <EmptyState title="No conversations yet" description="Start one with the + button above." />
                </div>
              )}
              {(conversations ?? []).map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id, c.title, c.isGroup)}
                  className="flex w-full items-center gap-2.5 border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <Avatar name={c.title} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">{c.title}</p>
                      {c.lastMessage && (
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {formatDistanceToNow(new Date(c.lastMessage.createdAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {c.lastMessage
                        ? c.lastMessage.kind === "CARD"
                          ? "📋 Discussion started"
                          : c.lastMessage.body ?? (c.lastMessage.hasAttachments ? "📎 Attachment" : "")
                        : "No messages yet"}
                    </p>
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">
                      {c.unreadCount > 99 ? "99+" : c.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {view.screen === "new" && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-slate-100 p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search people…"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:focus-ring"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {(messageableUsers ?? []).length === 0 && (
                  <div className="p-6">
                    <EmptyState title="No people found" />
                  </div>
                )}
                {(messageableUsers ?? []).map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => handleStartConversation(u.id, u.name)}
                    disabled={startConversation.isPending}
                    className="flex w-full items-center gap-2.5 border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Avatar name={u.name} size="sm" />
                    <p className="truncate text-sm font-medium text-slate-800">{u.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {view.screen === "thread" && (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {messagesLoading && (
                  <div className="flex justify-center py-8">
                    <Spinner className="h-5 w-5" />
                  </div>
                )}
                {(messages ?? []).map((m: any) => {
                  if (m.kind === "CARD" && m.metadata) {
                    const card = m.metadata as { entityType: "TASK" | "BOARD"; code: string; title: string; subtitle?: string; path: string };
                    return (
                      <div key={m.id} className="group flex justify-center">
                        <Link
                          to={card.path}
                          className="flex w-full max-w-[90%] items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-left hover:bg-brand-100"
                        >
                          <span className="mt-0.5 shrink-0 text-brand-600">
                            {card.entityType === "TASK" ? <ListTodo className="h-4 w-4" /> : <Trello className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1 text-[11px] font-medium text-brand-500">
                              {card.code}
                              {card.subtitle && <span>· {card.subtitle}</span>}
                            </span>
                            <span className="block truncate text-sm font-medium text-slate-800">{card.title}</span>
                          </span>
                          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400 opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      </div>
                    );
                  }
                  const isMine = m.sender.id === user.id;
                  const sticker = isStickerOnly(m.body) && !(m.attachments?.length > 0);
                  const isEditing = editingId === m.id;
                  const canEdit = isMine && !(m.attachments?.length > 0) && Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS;
                  return (
                    <div key={m.id} className={clsx("group flex items-end gap-1", isMine ? "justify-end" : "justify-start")}>
                      {isMine && !isEditing && (
                        <div className="mb-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          {canEdit && (
                            <button
                              onClick={() => startEdit(m)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              aria-label="Edit message"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            onClick={() => setPendingDeleteMessageId(m.id)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500"
                            aria-label="Delete message"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      {isEditing ? (
                        <div className="max-w-[80%] flex-1 rounded-xl border border-slate-200 bg-white p-2">
                          <textarea
                            autoFocus
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                saveEdit(m.id);
                              } else if (e.key === "Escape") {
                                cancelEdit();
                              }
                            }}
                            rows={1}
                            className="w-full resize-none border-none p-0 text-sm text-slate-800 focus:outline-none focus:ring-0"
                          />
                          <div className="mt-1 flex justify-end gap-1">
                            <button onClick={cancelEdit} className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100">
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEdit(m.id)}
                              disabled={!editDraft.trim() || editMessage.isPending}
                              className="rounded bg-brand-600 px-2 py-0.5 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : sticker ? (
                        <div className="max-w-[80%]">
                          <p className="text-4xl leading-none">{m.body}</p>
                          <p className={clsx("mt-1 text-[10px] text-slate-400", isMine ? "text-right" : "text-left")}>
                            {m.editedAt && <span className="italic">edited · </span>}
                            {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      ) : (
                        <div className={clsx("max-w-[80%] rounded-xl px-3 py-2 text-sm", isMine ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800")}>
                          {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                          {m.attachments?.length > 0 && (
                            <div className={clsx("space-y-1", m.body && "mt-1.5")}>
                              {m.attachments.map((a: any) => (
                                <button
                                  key={a.id}
                                  onClick={() => downloadChatAttachment(a.id, a.fileName)}
                                  className={clsx(
                                    "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs",
                                    isMine ? "bg-white/15 hover:bg-white/25" : "bg-white hover:bg-slate-50"
                                  )}
                                >
                                  <Download className="h-3 w-3 shrink-0" />
                                  <span className="min-w-0 flex-1 truncate">{a.fileName}</span>
                                  <span className={clsx("shrink-0", isMine ? "text-white/70" : "text-slate-400")}>{formatBytes(a.fileSizeBytes)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <p className={clsx("mt-1 text-right text-[10px]", isMine ? "text-white/70" : "text-slate-400")}>
                            {m.editedAt && <span className="italic">edited · </span>}
                            {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      )}
                      {!isMine && !isEditing && (
                        <div className="mb-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => setPendingDeleteMessageId(m.id)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500"
                            aria-label="Delete message"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={submitMessage} className="border-t border-slate-100 p-2">
                {pendingFiles.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {pendingFiles.map((f, i) => (
                      <span key={i} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                        {f.name}
                        <button type="button" onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))} aria-label={`Remove ${f.name}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative flex items-end gap-1.5">
                  {showStickers && (
                    <div ref={stickerRef} className="absolute bottom-full left-0 z-10 mb-1.5 grid w-56 grid-cols-7 gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                      {STICKERS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => insertSticker(s)}
                          className="rounded-md p-1 text-lg hover:bg-slate-100"
                          aria-label={`Insert ${s}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFilesSelected} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Attach files"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowStickers((s) => !s)}
                    className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Stickers"
                  >
                    <Smile className="h-4 w-4" />
                  </button>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitMessage(e as unknown as React.FormEvent);
                      }
                    }}
                    rows={1}
                    placeholder="Type a message…"
                    className="max-h-24 flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:focus-ring"
                  />
                  <button
                    type="submit"
                    disabled={sendMessage.isPending || (!draft.trim() && pendingFiles.length === 0)}
                    className="shrink-0 rounded-lg bg-brand-600 p-2 text-white hover:bg-brand-700 disabled:opacity-50"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl hover:bg-brand-700"
        aria-label={open ? "Close chat" : `Open chat${unreadCount ? `, ${unreadCount} unread` : ""}`}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && !!unreadCount && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <ConfirmDialog
        open={!!pendingDeleteMessageId}
        title="Delete message"
        message={`This will remove the message from your view only — ${view.screen === "thread" ? (view.isGroup ? "the rest of the group" : view.title) : "the other person"} will still see it.`}
        confirmLabel="Delete for me"
        loading={deleteMessage.isPending}
        onConfirm={confirmDeleteMessage}
        onCancel={() => setPendingDeleteMessageId(null)}
      />
      <ConfirmDialog
        open={pendingDeleteConversation}
        title={view.screen === "thread" && view.isGroup ? "Leave this view of the discussion" : "Delete conversation"}
        message={`This removes ${view.screen === "thread" && view.isGroup ? `"${view.title}"` : `your conversation with ${view.screen === "thread" ? view.title : "this person"}`} from your inbox only — they'll still see it, and it'll come back for you if a new message arrives.`}
        confirmLabel="Delete for me"
        loading={deleteConversation.isPending}
        onConfirm={confirmDeleteConversation}
        onCancel={() => setPendingDeleteConversation(false)}
      />
    </div>
  );
};
