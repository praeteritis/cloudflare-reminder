import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_PAGE_HTML, LOGIN_PAGE_HTML } from "./admin-page";
import {
  buildTaskFromAdminInput,
  calculateNextNagAt,
  calculateNextDueAt,
  extractRunId,
  formatInTimezone,
  getFirstMeaningfulLine,
  pingHeartbeat,
} from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task_1",
    recipient_email: "user@example.com",
    title: "测试提醒",
    body: "测试正文",
    status: "active",
    timezone: "Asia/Shanghai",
    first_due_at_utc: "2026-06-07T00:00:00.000Z",
    next_due_at_utc: "2026-06-07T00:00:00.000Z",
    recurrence_type: "none",
    recurrence_interval_minutes: null,
    recurrence_anchor: "scheduled_time",
    nag_interval_minutes: 5,
    current_run_id: null,
    created_at_utc: "2026-06-07T00:00:00.000Z",
    updated_at_utc: "2026-06-07T00:00:00.000Z",
    ...overrides,
  } as Parameters<typeof calculateNextDueAt>[0];
}

describe("reply parsing helpers", () => {
  it("extracts the reminder run id from the email subject", () => {
    expect(extractRunId("Re: [R:run_abc123XYZ] 测试提醒")).toBe("run_abc123XYZ");
  });

  it("returns null when a subject has no reminder run id", () => {
    expect(extractRunId("Re: 测试提醒")).toBeNull();
  });

  it("uses the first non-empty reply line as the completion command", () => {
    expect(getFirstMeaningfulLine("\r\n  1  \n\nquoted text")).toBe("1");
  });
});

describe("recurrence calculation", () => {
  it("does not schedule another reminder for one-time tasks", () => {
    const next = calculateNextDueAt(makeTask(), new Date("2026-06-07T01:00:00.000Z"));

    expect(next).toBeNull();
  });

  it("keeps interval tasks anchored to the scheduled time and skips missed slots", () => {
    const next = calculateNextDueAt(
      makeTask({
        recurrence_type: "interval",
        recurrence_interval_minutes: 60,
        recurrence_anchor: "scheduled_time",
      }),
      new Date("2026-06-07T03:30:00.000Z")
    );

    expect(next?.toISOString()).toBe("2026-06-07T04:00:00.000Z");
  });

  it("can anchor interval tasks to the completion time", () => {
    const next = calculateNextDueAt(
      makeTask({
        recurrence_type: "interval",
        recurrence_interval_minutes: 90,
        recurrence_anchor: "completion_time",
      }),
      new Date("2026-06-07T03:30:00.000Z")
    );

    expect(next?.toISOString()).toBe("2026-06-07T05:00:00.000Z");
  });
});

describe("nag retry scheduling", () => {
  it("uses the full nag interval after a successful send", () => {
    const next = calculateNextNagAt(
      makeTask({ nag_interval_minutes: 1440 }),
      new Date("2026-06-07T12:00:00.000Z"),
      true
    );

    expect(next.toISOString()).toBe("2026-06-08T12:00:00.000Z");
  });

  it("retries after one minute when sending fails", () => {
    const next = calculateNextNagAt(
      makeTask({ nag_interval_minutes: 1440 }),
      new Date("2026-06-07T12:00:00.000Z"),
      false
    );

    expect(next.toISOString()).toBe("2026-06-07T12:01:00.000Z");
  });
});

describe("cron heartbeat", () => {
  it("pings the configured heartbeat URL with processing summary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await pingHeartbeat(
      { HEARTBEAT_URL: "https://hc-ping.com/check-id" },
      { createdRuns: 2, nagReminders: 3 }
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://hc-ping.com/check-id?createdRuns=2&nagReminders=3");
    expect(init).toMatchObject({ method: "GET" });
  });

  it("does nothing when no heartbeat URL is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await pingHeartbeat({}, { createdRuns: 0, nagReminders: 0 });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("timezone formatting", () => {
  it("formats UTC timestamps as local Beijing/Shanghai time", () => {
    expect(formatInTimezone(new Date("2026-06-07T12:00:00.000Z"), "Asia/Shanghai")).toBe(
      "2026-06-07 20:00"
    );
  });
});

describe("admin task input", () => {
  it("builds a one-time task from a relative due time", () => {
    const task = buildTaskFromAdminInput(
      {
        recipientEmail: "user@example.com",
        title: "喝水",
        minutesFromNow: 15,
        nagIntervalMinutes: 30,
      },
      {
        id: "task_test",
        now: new Date("2026-06-07T12:00:00.000Z"),
        timezone: "Asia/Shanghai",
      }
    );

    expect(task).toMatchObject({
      id: "task_test",
      recipient_email: "user@example.com",
      title: "喝水",
      body: "喝水",
      status: "active",
      next_due_at_utc: "2026-06-07T12:15:00.000Z",
      recurrence_type: "none",
      recurrence_interval_minutes: null,
      nag_interval_minutes: 30,
    });
  });

  it("parses local Shanghai due times for interval tasks", () => {
    const task = buildTaskFromAdminInput(
      {
        recipientEmail: "user@example.com",
        title: "每日复盘",
        body: "写 3 行记录",
        dueAt: "2026-06-07 20:00",
        recurrence: {
          type: "interval",
          intervalMinutes: 1440,
          anchor: "completion_time",
        },
      },
      {
        id: "task_repeat",
        now: new Date("2026-06-07T10:00:00.000Z"),
        timezone: "Asia/Shanghai",
      }
    );

    expect(task.next_due_at_utc).toBe("2026-06-07T12:00:00.000Z");
    expect(task.recurrence_type).toBe("interval");
    expect(task.recurrence_interval_minutes).toBe(1440);
    expect(task.recurrence_anchor).toBe("completion_time");
  });

  it("rejects invalid admin task input", () => {
    expect(() =>
      buildTaskFromAdminInput(
        {
          recipientEmail: "not-an-email",
          title: "测试",
          minutesFromNow: 1,
        },
        { id: "task_bad", now: new Date("2026-06-07T12:00:00.000Z") }
      )
    ).toThrow("recipientEmail must be a valid email address");
  });
});

describe("admin page", () => {
  it("serves a management UI wired to the admin task API", () => {
    expect(ADMIN_PAGE_HTML).toContain('id="task-form"');
    expect(ADMIN_PAGE_HTML).toContain("/admin/tasks");
    expect(ADMIN_PAGE_HTML).toContain("/auth/logout");
    expect(ADMIN_PAGE_HTML).toContain('id="relative-unit"');
    expect(ADMIN_PAGE_HTML).toContain('id="nag-unit"');
    expect(ADMIN_PAGE_HTML).toContain('id="repeat-unit"');
  });

  it("serves a login UI wired to token authentication", () => {
    expect(LOGIN_PAGE_HTML).toContain('id="login-form"');
    expect(LOGIN_PAGE_HTML).toContain("/auth/login");
    expect(LOGIN_PAGE_HTML).toContain("Admin Token");
  });
});
