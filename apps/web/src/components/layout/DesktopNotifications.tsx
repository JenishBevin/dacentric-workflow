import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../api/misc";
import qplusIcon from "../../assets/qplus-icon.png";

const SUPPORTS_NOTIFICATIONS = typeof window !== "undefined" && "Notification" in window;

/**
 * No UI of its own — pops a real OS-level desktop notification for each
 * newly-arrived notification while the tab is open, on top of the existing
 * in-app bell (NotificationBell.tsx). Shares that same 15s poll via
 * useNotifications() rather than adding a second one.
 */
export const DesktopNotifications: React.FC = () => {
  const { data } = useNotifications();
  const navigate = useNavigate();
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!SUPPORTS_NOTIFICATIONS || Notification.permission !== "default") return;
    Notification.requestPermission();
  }, []);

  useEffect(() => {
    if (!SUPPORTS_NOTIFICATIONS) return;
    const items: any[] = data?.data?.items ?? [];

    if (!seenIds.current) {
      // First load after mount is the existing backlog, not a fresh
      // arrival — record it as the baseline without popping anything.
      seenIds.current = new Set(items.map((n) => n.id));
      return;
    }

    for (const n of items) {
      if (seenIds.current.has(n.id)) continue;
      seenIds.current.add(n.id);
      if (n.isRead || Notification.permission !== "granted") continue;

      const popup = new Notification(n.title, {
        body: new Date(n.createdAt).toLocaleString(),
        icon: qplusIcon,
        tag: n.id,
      });
      popup.onclick = () => {
        window.focus();
        if (n.taskId) navigate(`/workflow/boards/${n.boardId ?? ""}?task=${n.taskId}`);
        popup.close();
      };
    }
  }, [data, navigate]);

  return null;
};
