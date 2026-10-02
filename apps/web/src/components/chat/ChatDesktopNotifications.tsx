import { useEffect, useRef } from "react";
import { useConversations } from "../../api/chat";
import { useChatLauncher } from "../../context/ChatLauncherContext";
import { useAuth } from "../../context/AuthContext";
import qplusIcon from "../../assets/qplus-icon.png";

const SUPPORTS_NOTIFICATIONS = typeof window !== "undefined" && "Notification" in window;

/**
 * A real OS-level desktop notification (same mechanism as
 * DesktopNotifications.tsx's generic bell notifications, kept separate
 * since chat has its own poll and its own "open to this thread" route via
 * ChatLauncherContext) the moment a conversation's last message changes to
 * one you didn't send — clicking it opens the chat widget straight to that
 * conversation, read or unread.
 */
export const ChatDesktopNotifications: React.FC = () => {
  const { user } = useAuth();
  // Always on, independent of whether the chat panel/list view is open —
  // shares the same ["chat-conversations"] query/poll the widget's own list
  // view uses, so this adds no extra network traffic when both are mounted.
  const { data: conversations } = useConversations(true);
  const { requestOpen } = useChatLauncher();
  const lastSeenRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (!SUPPORTS_NOTIFICATIONS || Notification.permission !== "default") return;
    Notification.requestPermission();
  }, []);

  useEffect(() => {
    if (!SUPPORTS_NOTIFICATIONS || !conversations) return;

    if (!lastSeenRef.current) {
      // First load is the existing backlog, not a fresh arrival — record it
      // as the baseline without popping anything.
      lastSeenRef.current = new Map(conversations.map((c: any) => [c.id, c.lastMessage?.createdAt ?? ""]));
      return;
    }

    for (const c of conversations) {
      const lastSeenAt = lastSeenRef.current.get(c.id);
      const arrivedAt: string | undefined = c.lastMessage?.createdAt;
      lastSeenRef.current.set(c.id, arrivedAt ?? "");
      if (!arrivedAt || arrivedAt === lastSeenAt) continue;
      if (c.lastMessage.senderId === user?.id) continue; // our own just-sent message
      if (Notification.permission !== "granted") continue;

      const body =
        c.lastMessage.kind === "CARD" ? "Started a discussion" : c.lastMessage.body || (c.lastMessage.hasAttachments ? "Sent an attachment" : "");

      try {
        const popup = new Notification(c.title, { body, icon: qplusIcon, tag: `chat-${c.id}` });
        popup.onclick = () => {
          window.focus();
          requestOpen(c.id, c.title, c.isGroup);
          popup.close();
        };
      } catch (err) {
        // Same platform caveat as DesktopNotifications.tsx — a nice-to-have
        // popup, not core behavior, so skip silently rather than crash.
        console.warn("Chat desktop notification popup not supported on this platform:", err);
      }
    }
  }, [conversations, user?.id, requestOpen]);

  return null;
};
