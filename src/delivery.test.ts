import { describe, expect, it } from "vitest";
import {
  hasReachedNagLimitAfterDelivery,
  buildReminderDeliveryKey,
  isReminderDeliveryMessage,
  isDeadLetterQueue,
  calculateQueueRetryDelaySeconds,
} from "./delivery";
import type { ReminderDeliveryMessage, TaskRunRow } from "./types";

describe("hasReachedNagLimitAfterDelivery", () => {
  it("returns false when sent count is below max", () => {
    const task: Pick<TaskRunRow, "run_sent_count" | "max_nag_count"> = {
      run_sent_count: 2,
      max_nag_count: 5,
    };
    expect(hasReachedNagLimitAfterDelivery(task)).toBe(false);
  });

  it("returns true when sent count equals max", () => {
    const task: Pick<TaskRunRow, "run_sent_count" | "max_nag_count"> = {
      run_sent_count: 5,
      max_nag_count: 5,
    };
    expect(hasReachedNagLimitAfterDelivery(task)).toBe(true);
  });

  it("returns true when sent count exceeds max", () => {
    const task: Pick<TaskRunRow, "run_sent_count" | "max_nag_count"> = {
      run_sent_count: 6,
      max_nag_count: 5,
    };
    expect(hasReachedNagLimitAfterDelivery(task)).toBe(true);
  });

  it("returns true when max nag count is zero and no sends yet", () => {
    const task: Pick<TaskRunRow, "run_sent_count" | "max_nag_count"> = {
      run_sent_count: 0,
      max_nag_count: 0,
    };
    // With max_nag_count = 0, even initial reminder (sent_count 0) reaches limit
    expect(hasReachedNagLimitAfterDelivery(task)).toBe(true);
  });

  it("returns true after first send when max is zero", () => {
    const task: Pick<TaskRunRow, "run_sent_count" | "max_nag_count"> = {
      run_sent_count: 1,
      max_nag_count: 0,
    };
    expect(hasReachedNagLimitAfterDelivery(task)).toBe(true);
  });
});

describe("buildReminderDeliveryKey", () => {
  it("builds delivery key with all components", () => {
    const key = buildReminderDeliveryKey(
      "run_abc123",
      "reminder",
      "2026-06-09T10:00:00.000Z"
    );
    expect(key).toBe("run_abc123:reminder:2026-06-09T10:00:00.000Z");
  });

  it("builds delivery key for nag type", () => {
    const key = buildReminderDeliveryKey(
      "run_xyz789",
      "nag",
      "2026-06-09T11:00:00.000Z"
    );
    expect(key).toBe("run_xyz789:nag:2026-06-09T11:00:00.000Z");
  });

  it("uses exact timestamp for uniqueness", () => {
    const timestamp1 = "2026-06-09T10:00:00.000Z";
    const timestamp2 = "2026-06-09T10:00:01.000Z";
    const key1 = buildReminderDeliveryKey("run_abc", "reminder", timestamp1);
    const key2 = buildReminderDeliveryKey("run_abc", "reminder", timestamp2);
    expect(key1).not.toBe(key2);
  });
});

describe("isReminderDeliveryMessage", () => {
  it("validates correct message structure", () => {
    const message: ReminderDeliveryMessage = {
      version: 1,
      deliveryKey: "run_abc:reminder:2026-06-09T10:00:00.000Z",
      runId: "run_abc123",
      taskId: "task_xyz789",
      type: "reminder",
      scheduledForUtc: "2026-06-09T10:00:00.000Z",
      enqueuedAtUtc: "2026-06-09T09:50:00.000Z",
    };
    expect(isReminderDeliveryMessage(message)).toBe(true);
  });

  it("validates nag type message", () => {
    const message: ReminderDeliveryMessage = {
      version: 1,
      deliveryKey: "run_abc:nag:2026-06-09T11:00:00.000Z",
      runId: "run_abc123",
      taskId: "task_xyz789",
      type: "nag",
      scheduledForUtc: "2026-06-09T11:00:00.000Z",
      enqueuedAtUtc: "2026-06-09T10:50:00.000Z",
    };
    expect(isReminderDeliveryMessage(message)).toBe(true);
  });

  it("rejects message with wrong version", () => {
    const message = {
      version: 2,
      deliveryKey: "run_abc:reminder:2026-06-09T10:00:00.000Z",
      runId: "run_abc123",
      taskId: "task_xyz789",
      type: "reminder",
      scheduledForUtc: "2026-06-09T10:00:00.000Z",
      enqueuedAtUtc: "2026-06-09T09:50:00.000Z",
    };
    expect(isReminderDeliveryMessage(message)).toBe(false);
  });

  it("rejects message with missing fields", () => {
    const message = {
      version: 1,
      deliveryKey: "run_abc:reminder:2026-06-09T10:00:00.000Z",
      runId: "run_abc123",
      // missing taskId
      type: "reminder",
      scheduledForUtc: "2026-06-09T10:00:00.000Z",
      enqueuedAtUtc: "2026-06-09T09:50:00.000Z",
    };
    expect(isReminderDeliveryMessage(message)).toBe(false);
  });

  it("rejects message with invalid type", () => {
    const message = {
      version: 1,
      deliveryKey: "run_abc:invalid:2026-06-09T10:00:00.000Z",
      runId: "run_abc123",
      taskId: "task_xyz789",
      type: "invalid",
      scheduledForUtc: "2026-06-09T10:00:00.000Z",
      enqueuedAtUtc: "2026-06-09T09:50:00.000Z",
    };
    expect(isReminderDeliveryMessage(message)).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isReminderDeliveryMessage(null)).toBe(false);
    expect(isReminderDeliveryMessage(undefined)).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isReminderDeliveryMessage("string")).toBe(false);
    expect(isReminderDeliveryMessage(123)).toBe(false);
    expect(isReminderDeliveryMessage(true)).toBe(false);
  });

  it("rejects message with wrong field types", () => {
    const message = {
      version: 1,
      deliveryKey: 123, // should be string
      runId: "run_abc123",
      taskId: "task_xyz789",
      type: "reminder",
      scheduledForUtc: "2026-06-09T10:00:00.000Z",
      enqueuedAtUtc: "2026-06-09T09:50:00.000Z",
    };
    expect(isReminderDeliveryMessage(message)).toBe(false);
  });
});

describe("isDeadLetterQueue", () => {
  it("identifies dead letter queue by name suffix", () => {
    expect(isDeadLetterQueue("my-queue-dlq")).toBe(true);
    expect(isDeadLetterQueue("reminder-queue-dlq")).toBe(true);
  });

  it("rejects regular queue names", () => {
    expect(isDeadLetterQueue("my-queue")).toBe(false);
    expect(isDeadLetterQueue("reminder-queue")).toBe(false);
    expect(isDeadLetterQueue("")).toBe(false);
  });

  it("is case sensitive - only lowercase dlq", () => {
    expect(isDeadLetterQueue("queue-dlq")).toBe(true);
    expect(isDeadLetterQueue("queue-DLQ")).toBe(false);
    expect(isDeadLetterQueue("queue-Dlq")).toBe(false);
  });
});

describe("calculateQueueRetryDelaySeconds", () => {
  it("calculates exponential backoff with base delay", () => {
    // DELIVERY_RETRY_BASE_SECONDS = 60
    expect(calculateQueueRetryDelaySeconds(0)).toBe(60); // base delay
    expect(calculateQueueRetryDelaySeconds(1)).toBe(60); // 60 * 2^0 = 60
    expect(calculateQueueRetryDelaySeconds(2)).toBe(120); // 60 * 2^1 = 120
    expect(calculateQueueRetryDelaySeconds(3)).toBe(240); // 60 * 2^2 = 240
  });

  it("caps delay at maximum", () => {
    // DELIVERY_RETRY_MAX_SECONDS = 30 * 60 = 1800
    expect(calculateQueueRetryDelaySeconds(10)).toBe(1800); // max delay
    expect(calculateQueueRetryDelaySeconds(20)).toBe(1800); // still max
    expect(calculateQueueRetryDelaySeconds(100)).toBe(1800); // still max
  });

  it("calculates intermediate delays correctly", () => {
    // Verify exponential growth before hitting max
    const delay4 = calculateQueueRetryDelaySeconds(4); // 60 * 2^3 = 480
    const delay5 = calculateQueueRetryDelaySeconds(5); // 60 * 2^4 = 960
    const delay6 = calculateQueueRetryDelaySeconds(6); // 60 * 2^5 = 1920 -> capped to 1800

    expect(delay4).toBe(480);
    expect(delay5).toBe(960);
    expect(delay6).toBe(1800); // capped
    expect(delay5).toBe(delay4 * 2);
  });

  it("handles first few attempts in sequence", () => {
    const delays = [0, 1, 2, 3, 4].map(calculateQueueRetryDelaySeconds);
    // attempts 0: 60, 1: 60, 2: 120, 3: 240, 4: 480
    expect(delays).toEqual([60, 60, 120, 240, 480]);
  });
});
