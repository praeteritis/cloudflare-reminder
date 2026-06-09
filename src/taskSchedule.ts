import { FAILED_SEND_RETRY_MINUTES } from "./constants";
import { addMinutes } from "./shared";
import type { Task } from "./types";

export function calculateNextNagAt(task: Pick<Task, "nag_interval_minutes">, sentAt: Date, success: boolean): Date {
  return addMinutes(sentAt, success ? task.nag_interval_minutes : FAILED_SEND_RETRY_MINUTES);
}

export function calculateNextDueAt(task: Task, completedAt: Date): Date | null {
  if (task.recurrence_type !== "interval") {
    return null;
  }

  const intervalMinutes = task.recurrence_interval_minutes;
  if (!intervalMinutes || intervalMinutes <= 0) {
    return null;
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  const base =
    task.recurrence_anchor === "completion_time"
      ? completedAt
      : new Date(task.next_due_at_utc);
  let next = new Date(base.getTime() + intervalMs);

  if (task.recurrence_anchor === "scheduled_time") {
    while (next <= completedAt) {
      next = new Date(next.getTime() + intervalMs);
    }
  }

  if (task.recurrence_end_at_utc) {
    const endAt = new Date(task.recurrence_end_at_utc);
    if (!Number.isNaN(endAt.getTime()) && next > endAt) {
      return null;
    }
  }

  return next;
}
