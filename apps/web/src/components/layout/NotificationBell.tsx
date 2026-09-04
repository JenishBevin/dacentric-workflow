import React, { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";
import { useNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from "../../api/misc";
import { EmptyState, Spinner } from "../ui/primitives";

export const NotificationBell: React.FC = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();
  const navigate = useNavigate();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = data?.data?.unreadCount ?? 0;
  const items = data?.data?.items ?? [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[22rem] max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <button
              onClick={() => markAll.mutate()}
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all as read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <div className="flex justify-center py-8">
                <Spinner className="h-5 w-5" />
              </div>
            )}
            {!isLoading && items.length === 0 && <div className="p-6"><EmptyState title="No notifications" description="You're all caught up." /></div>}
            {items.map((n: any) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.isRead) markOne.mutate(n.id);
                  setOpen(false);
                  if (n.taskId) navigate(`/workflow/boards/${n.boardId ?? ""}?task=${n.taskId}`);
                }}
                className={clsx("flex w-full items-start gap-2 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50", !n.isRead && "bg-brand-50/40")}
              >
                <span className={clsx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-brand-500")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-700">{n.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
                </span>
                {!n.isRead && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
