import React from "react";
import { useNotificationPreferences, useUpdateNotificationPreference } from "../../api/misc";
import { Checkbox, Skeleton, ErrorState } from "../../components/ui/primitives";
import { NotificationEvent } from "../../lib/types";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";

const EVENT_LABELS: Record<NotificationEvent, string> = {
  TASK_ASSIGNED: "Task assigned to me",
  TASK_REASSIGNED: "Task reassigned",
  TASK_DUE_TODAY: "Task due today",
  TASK_OVERDUE: "Task overdue",
  MENTION: "Someone @mentions me",
  APPROVAL_REQUESTED: "Approval requested from me",
  APPROVAL_APPROVED: "My task was approved",
  APPROVAL_REJECTED: "My task was rejected",
  TASK_ACTIVITY: "Activity on tasks I'm watching",
  CHECKLIST_ASSIGNED: "Checklist item assigned to me",
  ACCOUNT_LOCKED: "My account was locked",
};

interface Pref {
  event: NotificationEvent;
  inApp: boolean;
  email: boolean;
}

/** Section 32 / 6.9: per-event in-app and email notification preferences. */
export default function NotificationSettingsPage() {
  const { push } = useToast();
  const { data: prefs, isLoading, isError, refetch } = useNotificationPreferences();
  const update = useUpdateNotificationPreference();

  async function toggle(pref: Pref, field: "inApp" | "email", value: boolean) {
    try {
      await update.mutateAsync({ event: pref.event, inApp: field === "inApp" ? value : pref.inApp, email: field === "email" ? value : pref.email });
    } catch (err) {
      push({ variant: "error", title: "Could not update preference", description: extractApiError(err).message });
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full max-w-2xl" />;
  if (isError || !prefs) return <ErrorState message="Could not load notification preferences." onRetry={() => refetch()} />;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Notifications</h1>
        <p className="text-sm text-slate-500">Choose which events notify you in-app and by email.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span>Event</span>
          <span className="text-center">In-app</span>
          <span className="text-center">Email</span>
        </div>
        {(prefs as Pref[]).map((p) => (
          <div key={p.event} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm last:border-0">
            <span className="text-slate-700">{EVENT_LABELS[p.event] ?? p.event}</span>
            <span className="flex justify-center">
              <Checkbox checked={p.inApp} onChange={(e) => toggle(p, "inApp", e.target.checked)} aria-label={`${EVENT_LABELS[p.event]} in-app`} />
            </span>
            <span className="flex justify-center">
              <Checkbox checked={p.email} onChange={(e) => toggle(p, "email", e.target.checked)} aria-label={`${EVENT_LABELS[p.event]} email`} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
