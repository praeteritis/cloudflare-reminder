import { describe, expect, it } from "vitest";
import { calculateNextNagAt, calculateNextDueAt } from "./taskSchedule";
import type { Task } from "./types";

describe("calculateNextNagAt", () => {
  const baseTask: Pick<Task, "nag_interval_minutes"> = {
    nag_interval_minutes: 60,
  };

  it("calculates next nag time from successful send", () => {
    const lastSentAt = new Date("2026-06-09T10:00:00Z");
    const result = calculateNextNagAt(baseTask, lastSentAt, true);
    expect(result.toISOString()).toBe("2026-06-09T11:00:00.000Z");
  });

  it("handles different nag intervals on success", () => {
    const lastSentAt = new Date("2026-06-09T10:00:00Z");

    const task30 = { nag_interval_minutes: 30 };
    const result30 = calculateNextNagAt(task30, lastSentAt, true);
    expect(result30.toISOString()).toBe("2026-06-09T10:30:00.000Z");

    const task120 = { nag_interval_minutes: 120 };
    const result120 = calculateNextNagAt(task120, lastSentAt, true);
    expect(result120.toISOString()).toBe("2026-06-09T12:00:00.000Z");
  });

  it("uses shorter retry interval on failed send", () => {
    const lastSentAt = new Date("2026-06-09T10:00:00Z");
    const successResult = calculateNextNagAt(baseTask, lastSentAt, true);
    const failureResult = calculateNextNagAt(baseTask, lastSentAt, false);

    // Failed send should retry sooner than successful send
    expect(failureResult.getTime()).toBeLessThan(successResult.getTime());
  });

  it("handles zero nag interval on success", () => {
    const task = { nag_interval_minutes: 0 };
    const lastSentAt = new Date("2026-06-09T10:00:00Z");
    const result = calculateNextNagAt(task, lastSentAt, true);

    // Should return the same time (no additional nag)
    expect(result.toISOString()).toBe("2026-06-09T10:00:00.000Z");
  });

  it("uses fixed retry interval on failure regardless of nag setting", () => {
    const task1 = { nag_interval_minutes: 30 };
    const task2 = { nag_interval_minutes: 120 };
    const lastSentAt = new Date("2026-06-09T10:00:00Z");

    const result1 = calculateNextNagAt(task1, lastSentAt, false);
    const result2 = calculateNextNagAt(task2, lastSentAt, false);

    // Both should use the same retry interval on failure
    expect(result1.toISOString()).toBe(result2.toISOString());
  });

  it("handles very large intervals", () => {
    const task = { nag_interval_minutes: 10080 }; // 1 week
    const lastSentAt = new Date("2026-06-09T10:00:00Z");
    const result = calculateNextNagAt(task, lastSentAt, true);
    expect(result.toISOString()).toBe("2026-06-16T10:00:00.000Z");
  });
});

describe("calculateNextDueAt", () => {
  it("returns null for non-recurring tasks", () => {
    const task: Task = {
      id: "task_1",
      user_id: null,
      recipient_email: "user@example.com",
      title: "Test",
      body: "Test",
      status: "active",
      timezone: "Asia/Shanghai",
      first_due_at_utc: "2026-06-09T10:00:00.000Z",
      next_due_at_utc: "2026-06-09T10:00:00.000Z",
      recurrence_type: "none",
      recurrence_interval_minutes: null,
      recurrence_anchor: "scheduled_time",
      recurrence_end_at_utc: null,
      nag_interval_minutes: 60,
      max_nag_count: 3,
      current_run_id: null,
      created_at_utc: "2026-06-09T09:00:00.000Z",
      updated_at_utc: "2026-06-09T09:00:00.000Z",
      deleted_at_utc: null,
    };

    const result = calculateNextDueAt(task, new Date("2026-06-09T10:00:00Z"));
    expect(result).toBeNull();
  });

  it("calculates next occurrence for interval recurrence with scheduled_time anchor", () => {
    const task: Task = {
      id: "task_1",
      user_id: null,
      recipient_email: "user@example.com",
      title: "Test",
      body: "Test",
      status: "active",
      timezone: "Asia/Shanghai",
      first_due_at_utc: "2026-06-09T10:00:00.000Z",
      next_due_at_utc: "2026-06-09T10:00:00.000Z",
      recurrence_type: "interval",
      recurrence_interval_minutes: 120,
      recurrence_anchor: "scheduled_time",
      recurrence_end_at_utc: null,
      nag_interval_minutes: 60,
      max_nag_count: 3,
      current_run_id: null,
      created_at_utc: "2026-06-09T09:00:00.000Z",
      updated_at_utc: "2026-06-09T09:00:00.000Z",
      deleted_at_utc: null,
    };

    const result = calculateNextDueAt(task, new Date("2026-06-09T10:00:00Z"));
    expect(result?.toISOString()).toBe("2026-06-09T12:00:00.000Z");
  });

  it("calculates next occurrence for interval recurrence with completion_time anchor", () => {
    const task: Task = {
      id: "task_1",
      user_id: null,
      recipient_email: "user@example.com",
      title: "Test",
      body: "Test",
      status: "active",
      timezone: "Asia/Shanghai",
      first_due_at_utc: "2026-06-09T10:00:00.000Z",
      next_due_at_utc: "2026-06-09T10:00:00.000Z",
      recurrence_type: "interval",
      recurrence_interval_minutes: 60,
      recurrence_anchor: "completion_time",
      recurrence_end_at_utc: null,
      nag_interval_minutes: 60,
      max_nag_count: 3,
      current_run_id: null,
      created_at_utc: "2026-06-09T09:00:00.000Z",
      updated_at_utc: "2026-06-09T09:00:00.000Z",
      deleted_at_utc: null,
    };

    const completedAt = new Date("2026-06-09T11:30:00Z");
    const result = calculateNextDueAt(task, completedAt);
    expect(result?.toISOString()).toBe("2026-06-09T12:30:00.000Z");
  });

  it("skips past occurrences when using scheduled_time anchor and completion is late", () => {
    const task: Task = {
      id: "task_1",
      user_id: null,
      recipient_email: "user@example.com",
      title: "Test",
      body: "Test",
      status: "active",
      timezone: "Asia/Shanghai",
      first_due_at_utc: "2026-06-09T10:00:00.000Z",
      next_due_at_utc: "2026-06-09T10:00:00.000Z",
      recurrence_type: "interval",
      recurrence_interval_minutes: 60,
      recurrence_anchor: "scheduled_time",
      recurrence_end_at_utc: null,
      nag_interval_minutes: 60,
      max_nag_count: 3,
      current_run_id: null,
      created_at_utc: "2026-06-09T09:00:00.000Z",
      updated_at_utc: "2026-06-09T09:00:00.000Z",
      deleted_at_utc: null,
    };

    // Complete task 3 hours late
    const completedAt = new Date("2026-06-09T13:00:00Z");
    const result = calculateNextDueAt(task, completedAt);

    // Should skip 11:00 and 12:00, next is 14:00
    expect(result?.toISOString()).toBe("2026-06-09T14:00:00.000Z");
  });

  it("returns null when next occurrence exceeds recurrence end time", () => {
    const task: Task = {
      id: "task_1",
      user_id: null,
      recipient_email: "user@example.com",
      title: "Test",
      body: "Test",
      status: "active",
      timezone: "Asia/Shanghai",
      first_due_at_utc: "2026-06-09T10:00:00.000Z",
      next_due_at_utc: "2026-06-09T10:00:00.000Z",
      recurrence_type: "interval",
      recurrence_interval_minutes: 120,
      recurrence_anchor: "scheduled_time",
      recurrence_end_at_utc: "2026-06-09T11:00:00.000Z",
      nag_interval_minutes: 60,
      max_nag_count: 3,
      current_run_id: null,
      created_at_utc: "2026-06-09T09:00:00.000Z",
      updated_at_utc: "2026-06-09T09:00:00.000Z",
      deleted_at_utc: null,
    };

    const result = calculateNextDueAt(task, new Date("2026-06-09T10:00:00Z"));
    expect(result).toBeNull();
  });

  it("allows next occurrence at exactly recurrence end time", () => {
    const task: Task = {
      id: "task_1",
      user_id: null,
      recipient_email: "user@example.com",
      title: "Test",
      body: "Test",
      status: "active",
      timezone: "Asia/Shanghai",
      first_due_at_utc: "2026-06-09T10:00:00.000Z",
      next_due_at_utc: "2026-06-09T10:00:00.000Z",
      recurrence_type: "interval",
      recurrence_interval_minutes: 120,
      recurrence_anchor: "scheduled_time",
      recurrence_end_at_utc: "2026-06-09T12:00:00.000Z",
      nag_interval_minutes: 60,
      max_nag_count: 3,
      current_run_id: null,
      created_at_utc: "2026-06-09T09:00:00.000Z",
      updated_at_utc: "2026-06-09T09:00:00.000Z",
      deleted_at_utc: null,
    };

    const result = calculateNextDueAt(task, new Date("2026-06-09T10:00:00Z"));
    expect(result?.toISOString()).toBe("2026-06-09T12:00:00.000Z");
  });

  it("handles daily recurrence", () => {
    const task: Task = {
      id: "task_1",
      user_id: null,
      recipient_email: "user@example.com",
      title: "Test",
      body: "Test",
      status: "active",
      timezone: "Asia/Shanghai",
      first_due_at_utc: "2026-06-09T10:00:00.000Z",
      next_due_at_utc: "2026-06-09T10:00:00.000Z",
      recurrence_type: "interval",
      recurrence_interval_minutes: 1440, // 24 hours
      recurrence_anchor: "scheduled_time",
      recurrence_end_at_utc: null,
      nag_interval_minutes: 60,
      max_nag_count: 3,
      current_run_id: null,
      created_at_utc: "2026-06-09T09:00:00.000Z",
      updated_at_utc: "2026-06-09T09:00:00.000Z",
      deleted_at_utc: null,
    };

    const result = calculateNextDueAt(task, new Date("2026-06-09T10:00:00Z"));
    expect(result?.toISOString()).toBe("2026-06-10T10:00:00.000Z");
  });

  it("handles weekly recurrence", () => {
    const task: Task = {
      id: "task_1",
      user_id: null,
      recipient_email: "user@example.com",
      title: "Test",
      body: "Test",
      status: "active",
      timezone: "Asia/Shanghai",
      first_due_at_utc: "2026-06-09T10:00:00.000Z",
      next_due_at_utc: "2026-06-09T10:00:00.000Z",
      recurrence_type: "interval",
      recurrence_interval_minutes: 10080, // 7 days
      recurrence_anchor: "scheduled_time",
      recurrence_end_at_utc: null,
      nag_interval_minutes: 60,
      max_nag_count: 3,
      current_run_id: null,
      created_at_utc: "2026-06-09T09:00:00.000Z",
      updated_at_utc: "2026-06-09T09:00:00.000Z",
      deleted_at_utc: null,
    };

    const result = calculateNextDueAt(task, new Date("2026-06-09T10:00:00Z"));
    expect(result?.toISOString()).toBe("2026-06-16T10:00:00.000Z");
  });

  it("returns null when recurrence interval is null despite type being interval", () => {
    const task: Task = {
      id: "task_1",
      user_id: null,
      recipient_email: "user@example.com",
      title: "Test",
      body: "Test",
      status: "active",
      timezone: "Asia/Shanghai",
      first_due_at_utc: "2026-06-09T10:00:00.000Z",
      next_due_at_utc: "2026-06-09T10:00:00.000Z",
      recurrence_type: "interval",
      recurrence_interval_minutes: null,
      recurrence_anchor: "scheduled_time",
      recurrence_end_at_utc: null,
      nag_interval_minutes: 60,
      max_nag_count: 3,
      current_run_id: null,
      created_at_utc: "2026-06-09T09:00:00.000Z",
      updated_at_utc: "2026-06-09T09:00:00.000Z",
      deleted_at_utc: null,
    };

    const result = calculateNextDueAt(task, new Date("2026-06-09T10:00:00Z"));
    expect(result).toBeNull();
  });

  it("returns null when recurrence interval is zero", () => {
    const task: Task = {
      id: "task_1",
      user_id: null,
      recipient_email: "user@example.com",
      title: "Test",
      body: "Test",
      status: "active",
      timezone: "Asia/Shanghai",
      first_due_at_utc: "2026-06-09T10:00:00.000Z",
      next_due_at_utc: "2026-06-09T10:00:00.000Z",
      recurrence_type: "interval",
      recurrence_interval_minutes: 0,
      recurrence_anchor: "scheduled_time",
      recurrence_end_at_utc: null,
      nag_interval_minutes: 60,
      max_nag_count: 3,
      current_run_id: null,
      created_at_utc: "2026-06-09T09:00:00.000Z",
      updated_at_utc: "2026-06-09T09:00:00.000Z",
      deleted_at_utc: null,
    };

    const result = calculateNextDueAt(task, new Date("2026-06-09T10:00:00Z"));
    expect(result).toBeNull();
  });
});
