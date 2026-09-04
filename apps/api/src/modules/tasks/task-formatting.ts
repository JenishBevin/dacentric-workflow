import { DueDateStatus } from "@dacentric/types";

const DUE_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;

export function computeDueDateStatus(dueDate: Date | null, isCompleted: boolean): DueDateStatus {
  if (!dueDate) return DueDateStatus.NO_DUE_DATE;
  if (isCompleted) return DueDateStatus.ON_TRACK;
  const diff = dueDate.getTime() - Date.now();
  if (diff < 0) return DueDateStatus.OVERDUE;
  if (diff <= DUE_SOON_WINDOW_MS) return DueDateStatus.DUE_SOON;
  return DueDateStatus.ON_TRACK;
}
