import { describe, expect, it } from "vitest";
import { buildTaskFromAdminInput, buildTaskUpdateFromAdminInput } from "./taskInput";
import { AdminInputError } from "./shared";

describe("buildTaskFromAdminInput", () => {
  it("defaults existing-style tasks to the built-in email channel", () => {
    const task = buildTaskFromAdminInput({
      recipientEmail: "user@example.com",
      title: "Reminder",
      minutesFromNow: 10,
    });
    expect(JSON.parse(task.notification_channel_ids || "[]")).toEqual(["email"]);
  });

  it("deduplicates selected notification channels", () => {
    const task = buildTaskFromAdminInput({
      recipientEmail: "user@example.com",
      title: "Reminder",
      minutesFromNow: 10,
      notificationChannelIds: ["email", "channel_123", "channel_123"],
    });
    expect(JSON.parse(task.notification_channel_ids || "[]")).toEqual(["email", "channel_123"]);
  });

  it("requires at least one notification channel", () => {
    expect(() => buildTaskFromAdminInput({
      recipientEmail: "user@example.com",
      title: "Reminder",
      minutesFromNow: 10,
      notificationChannelIds: [],
    })).toThrow("Select at least one valid notification channel");
  });

  it("does not require a recipient email when email delivery is not selected", () => {
    const task = buildTaskFromAdminInput({
      title: "Webhook reminder",
      minutesFromNow: 10,
      notificationChannelIds: ["channel_123"],
    });

    expect(task.recipient_email).toBe("");
    expect(JSON.parse(task.notification_channel_ids || "[]")).toEqual(["channel_123"]);
  });

  it("requires a recipient email when email delivery is selected", () => {
    expect(() => buildTaskFromAdminInput({
      title: "Email reminder",
      minutesFromNow: 10,
      notificationChannelIds: ["email"],
    })).toThrow("recipientEmail is required");
  });

  it("ignores a recipient email when email delivery is not selected", () => {
    const task = buildTaskFromAdminInput({
      recipientEmail: "not-an-email",
      title: "Webhook reminder",
      minutesFromNow: 10,
      notificationChannelIds: ["channel_123"],
    });

    expect(task.recipient_email).toBe("");
  });
  const now = new Date("2026-06-09T10:00:00Z");

  it("builds task with required fields only", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test reminder",
      dueAt: "2026-06-10T15:00:00+08:00",
    };

    const task = buildTaskFromAdminInput(input, { now });

    expect(task.recipient_email).toBe("user@example.com");
    expect(task.title).toBe("Test reminder");
    expect(task.body).toBe("Test reminder"); // defaults to title
    expect(task.status).toBe("active");
    expect(task.timezone).toBe("Asia/Shanghai");
    expect(task.recurrence_type).toBe("none");
    expect(task.nag_interval_minutes).toBe(1440); // DEFAULT_NAG_INTERVAL_MINUTES
    expect(task.max_nag_count).toBe(3);
  });

  it("builds task with all fields", () => {
    const input = {
      id: "task_custom123",
      recipientEmail: "user@example.com",
      title: "Custom reminder",
      body: "This is the body",
      timezone: "America/New_York",
      dueAt: "2026-06-10T15:00:00-05:00",
      nagIntervalMinutes: 30,
      maxNagCount: 5,
      recurrence: {
        type: "interval",
        intervalMinutes: 1440,
        anchor: "scheduled_time",
        endAt: "2026-12-31T23:59:59-05:00",
      },
    };

    const task = buildTaskFromAdminInput(input, { now });

    expect(task.id).toBe("task_custom123");
    expect(task.recipient_email).toBe("user@example.com");
    expect(task.title).toBe("Custom reminder");
    expect(task.body).toBe("This is the body");
    expect(task.timezone).toBe("Asia/Shanghai");
    expect(task.nag_interval_minutes).toBe(30);
    expect(task.max_nag_count).toBe(5);
    expect(task.recurrence_type).toBe("interval");
    expect(task.recurrence_interval_minutes).toBe(1440);
    expect(task.recurrence_anchor).toBe("scheduled_time");
    expect(task.recurrence_end_at_utc).not.toBeNull();
  });

  it("generates ID if not provided", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
    };

    const task = buildTaskFromAdminInput(input, { now });
    expect(task.id).toMatch(/^task_[a-f0-9]{16}$/);
  });

  it("accepts minutesFromNow for dueAt", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      minutesFromNow: 120,
    };

    const task = buildTaskFromAdminInput(input, { now });
    const expectedDueAt = new Date("2026-06-09T12:00:00Z");
    expect(task.first_due_at_utc).toBe(expectedDueAt.toISOString());
  });

  it("calculates the first reminder from a GMT+8 start time", () => {
    const task = buildTaskFromAdminInput({
      recipientEmail: "user@example.com",
      title: "Test",
      startAt: "2026-06-09T18:00",
      minutesFromNow: 60,
      notificationChannelIds: ["channel_123"],
    }, { now });

    expect(task.first_due_at_utc).toBe("2026-06-09T11:00:00.000Z");
  });

  it("keeps a past start time cadence and selects the next occurrence", () => {
    const task = buildTaskFromAdminInput({
      recipientEmail: "user@example.com",
      title: "Test",
      startAt: "2026-06-09T16:30",
      minutesFromNow: 60,
      notificationChannelIds: ["channel_123"],
    }, { now });

    expect(task.first_due_at_utc).toBe("2026-06-09T10:30:00.000Z");
  });

  it("throws when both dueAt and minutesFromNow provided", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
      minutesFromNow: 120,
    };

    expect(() => buildTaskFromAdminInput(input, { now })).toThrow(
      "Use only one of dueAt or minutesFromNow"
    );
  });

  it("throws when neither dueAt nor minutesFromNow provided", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
    };

    expect(() => buildTaskFromAdminInput(input, { now })).toThrow(
      "dueAt or minutesFromNow is required"
    );
  });

  it("throws for invalid email", () => {
    const input = {
      recipientEmail: "not-an-email",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
    };

    expect(() => buildTaskFromAdminInput(input, { now })).toThrow(
      "recipientEmail must be a valid email address"
    );
  });

  it("throws for invalid task ID", () => {
    const input = {
      id: "invalid@id",
      recipientEmail: "user@example.com",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
    };

    expect(() => buildTaskFromAdminInput(input, { now })).toThrow(
      "id must contain only letters, numbers, underscores, and hyphens"
    );
  });

  it("throws for missing required fields", () => {
    expect(() => buildTaskFromAdminInput({}, { now })).toThrow();
    expect(() =>
      buildTaskFromAdminInput({ recipientEmail: "user@example.com" }, { now })
    ).toThrow();
    expect(() =>
      buildTaskFromAdminInput({ title: "Test" }, { now })
    ).toThrow();
  });

  it("validates title max length", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "a".repeat(201),
      dueAt: "2026-06-10T15:00:00+08:00",
    };

    expect(() => buildTaskFromAdminInput(input, { now })).toThrow(
      AdminInputError
    );
  });

  it("validates body max length", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      body: "a".repeat(5001),
      dueAt: "2026-06-10T15:00:00+08:00",
    };

    expect(() => buildTaskFromAdminInput(input, { now })).toThrow(
      AdminInputError
    );
  });

  it("handles recurrence with interval", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Recurring task",
      dueAt: "2026-06-10T15:00:00+08:00",
      recurrence: {
        intervalMinutes: 60,
      },
    };

    const task = buildTaskFromAdminInput(input, { now });
    expect(task.recurrence_type).toBe("interval");
    expect(task.recurrence_interval_minutes).toBe(60);
  });

  it("throws when interval recurrence missing intervalMinutes", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
      recurrence: {
        type: "interval",
      },
    };

    expect(() => buildTaskFromAdminInput(input, { now })).toThrow(
      "recurrence.intervalMinutes is required for interval tasks"
    );
  });

  it("throws when recurrenceEndAt is before dueAt", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
      recurrence: {
        intervalMinutes: 60,
        endAt: "2026-06-09T15:00:00+08:00",
      },
    };

    expect(() => buildTaskFromAdminInput(input, { now })).toThrow(
      "recurrenceEndAt must be after the first reminder time"
    );
  });

  it("accepts completion_time anchor", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
      recurrence: {
        intervalMinutes: 60,
        anchor: "completion_time",
      },
    };

    const task = buildTaskFromAdminInput(input, { now });
    expect(task.recurrence_anchor).toBe("completion_time");
  });

  it("throws for invalid recurrence anchor", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
      recurrence: {
        intervalMinutes: 60,
        anchor: "invalid",
      },
    };

    expect(() => buildTaskFromAdminInput(input, { now })).toThrow(
      "recurrence anchor must be scheduled_time or completion_time"
    );
  });

  it("accepts alternative field names", () => {
    const input = {
      recipient_email: "user@example.com",
      title: "Test",
      due_at: "2026-06-10T15:00:00+08:00",
      nag_interval_minutes: 45,
      max_nag_count: 2,
    };

    const task = buildTaskFromAdminInput(input, { now });
    expect(task.recipient_email).toBe("user@example.com");
    expect(task.nag_interval_minutes).toBe(45);
    expect(task.max_nag_count).toBe(2);
  });

  it("parses dueAt without explicit timezone using default", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      dueAt: "2026-06-10 15:00",
    };

    const task = buildTaskFromAdminInput(input, { now });
    // Should default to Asia/Shanghai (+08:00)
    expect(task.first_due_at_utc).toBe("2026-06-10T07:00:00.000Z");
  });

  it("always interprets timezone-less dueAt as GMT+8", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      timezone: "America/New_York",
      dueAt: "2026-06-10 15:00",
    };

    const task = buildTaskFromAdminInput(input, { now });
    expect(task.timezone).toBe("Asia/Shanghai");
    expect(task.first_due_at_utc).toBe("2026-06-10T07:00:00.000Z");
  });

  it("validates nag interval max value", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
      nagIntervalMinutes: 999999,
    };

    expect(() => buildTaskFromAdminInput(input, { now })).toThrow(
      AdminInputError
    );
  });

  it("validates max nag count", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
      maxNagCount: 999,
    };

    expect(() => buildTaskFromAdminInput(input, { now })).toThrow(
      AdminInputError
    );
  });
});

describe("buildTaskUpdateFromAdminInput", () => {
  const now = new Date("2026-06-09T10:00:00Z");

  it("builds task update from input", () => {
    const input = {
      recipientEmail: "updated@example.com",
      title: "Updated title",
      body: "Updated body",
      dueAt: "2026-06-11T15:00:00+08:00",
      nagIntervalMinutes: 90,
      maxNagCount: 5,
    };

    const update = buildTaskUpdateFromAdminInput(input, { now });

    expect(update.recipient_email).toBe("updated@example.com");
    expect(update.title).toBe("Updated title");
    expect(update.body).toBe("Updated body");
    expect(update.nag_interval_minutes).toBe(90);
    expect(update.max_nag_count).toBe(5);
    expect(update.updated_at_utc).toBeTruthy();
  });

  it("includes recurrence fields in update", () => {
    const input = {
      recipientEmail: "user@example.com",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
      recurrence: {
        type: "interval",
        intervalMinutes: 120,
        anchor: "completion_time",
      },
    };

    const update = buildTaskUpdateFromAdminInput(input, { now });

    expect(update.recurrence_type).toBe("interval");
    expect(update.recurrence_interval_minutes).toBe(120);
    expect(update.recurrence_anchor).toBe("completion_time");
  });

  it("validates input same as buildTaskFromAdminInput", () => {
    const input = {
      recipientEmail: "invalid-email",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
    };

    expect(() => buildTaskUpdateFromAdminInput(input, { now })).toThrow(
      "recipientEmail must be a valid email address"
    );
  });

  it("does not include id in update", () => {
    const input = {
      id: "task_custom123",
      recipientEmail: "user@example.com",
      title: "Test",
      dueAt: "2026-06-10T15:00:00+08:00",
    };

    const update = buildTaskUpdateFromAdminInput(input, { now });

    // TaskUpdateInput should not have id field
    expect("id" in update).toBe(false);
  });
});
