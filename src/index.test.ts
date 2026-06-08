import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import {
  buildTaskFromAdminInput,
  buildTaskUpdateFromAdminInput,
  calculateNextNagAt,
  calculateNextDueAt,
  assertNormalUserTaskLimit,
  extractRunId,
  formatInTimezone,
  getFirstMeaningfulLine,
  pingHeartbeat,
} from "./index";

interface MockUserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  status: "active" | "banned";
  linuxdo_id: string | null;
  linuxdo_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  last_login_at_utc: string | null;
  banned_at_utc: string | null;
  banned_reason: string | null;
  created_at_utc: string;
  updated_at_utc: string;
}

interface MockInviteRow {
  code: string;
  used_by: string | null;
  expires_at_utc: string | null;
}

interface MockPendingRow {
  token: string;
  provider: string;
  profile_json: string;
  expires_at_utc: string;
  created_at_utc: string;
}

class MockD1Database {
  settings = new Map<string, string>([
    ["allow_registration", "true"],
    ["require_invite", "true"],
  ]);
  users: MockUserRow[] = [];
  invites: MockInviteRow[] = [{ code: "INVITE", used_by: null, expires_at_utc: "2099-01-01T00:00:00.000Z" }];
  pending: MockPendingRow[] = [];

  prepare(sql: string) {
    return new MockD1Statement(this, sql);
  }
}

class MockD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: MockD1Database,
    private readonly sql: string
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async all<T>() {
    if (this.sql.includes("FROM app_settings")) {
      return {
        results: Array.from(this.db.settings.entries()).map(([key, value]) => ({ key, value })) as T[],
      };
    }

    return { results: [] as T[] };
  }

  async first<T>() {
    const compactSql = this.sql.replace(/\s+/g, " ");

    if (compactSql.includes("FROM users WHERE linuxdo_id")) {
      return (this.db.users.find((user) => user.linuxdo_id === this.values[0]) ?? null) as T | null;
    }

    if (compactSql.includes("FROM users WHERE email")) {
      return (this.db.users.find((user) => user.email === this.values[0]) ?? null) as T | null;
    }

    if (compactSql.includes("FROM users WHERE id")) {
      return (this.db.users.find((user) => user.id === this.values[0]) ?? null) as T | null;
    }

    if (compactSql.includes("FROM invite_codes WHERE code")) {
      return (this.db.invites.find((invite) => invite.code === this.values[0]) ?? null) as T | null;
    }

    if (compactSql.includes("FROM oauth_pending")) {
      return (
        this.db.pending.find((pending) => pending.token === this.values[0] && pending.provider === this.values[1]) ?? null
      ) as T | null;
    }

    return null;
  }

  async run() {
    const compactSql = this.sql.replace(/\s+/g, " ");

    if (compactSql.includes("INSERT INTO oauth_pending")) {
      const [token, provider, profileJson, expiresAtUtc, createdAtUtc] = this.values as string[];
      this.db.pending.push({
        token,
        provider,
        profile_json: profileJson,
        expires_at_utc: expiresAtUtc,
        created_at_utc: createdAtUtc,
      });
      return { meta: { changes: 1 } };
    }

    if (compactSql.includes("INSERT INTO users")) {
      const [
        id,
        email,
        passwordHash,
        passwordSalt,
        status,
        linuxdoId,
        linuxdoUsername,
        displayName,
        avatarUrl,
        lastLoginAtUtc,
        createdAtUtc,
        updatedAtUtc,
      ] = this.values as string[];
      this.db.users.push({
        id,
        email,
        password_hash: passwordHash,
        password_salt: passwordSalt,
        status: status as "active",
        linuxdo_id: linuxdoId,
        linuxdo_username: linuxdoUsername,
        display_name: displayName,
        avatar_url: avatarUrl,
        last_login_at_utc: lastLoginAtUtc,
        banned_at_utc: null,
        banned_reason: null,
        created_at_utc: createdAtUtc,
        updated_at_utc: updatedAtUtc,
      });
      return { meta: { changes: 1 } };
    }

    if (compactSql.includes("UPDATE invite_codes")) {
      const [usedBy, usedAtUtc, code] = this.values as string[];
      const invite = this.db.invites.find((row) => row.code === code && row.used_by === null);
      if (!invite) {
        return { meta: { changes: 0 } };
      }
      invite.used_by = usedBy;
      void usedAtUtc;
      return { meta: { changes: 1 } };
    }

    if (compactSql.includes("DELETE FROM oauth_pending")) {
      this.db.pending = this.db.pending.filter((pending) => pending.token !== this.values[0]);
      return { meta: { changes: 1 } };
    }

    if (compactSql.includes("UPDATE users SET last_login_at_utc")) {
      const [, updatedAtUtc, userId] = this.values as string[];
      const user = this.db.users.find((row) => row.id === userId);
      if (user) {
        user.last_login_at_utc = updatedAtUtc;
        user.updated_at_utc = updatedAtUtc;
      }
      return { meta: { changes: user ? 1 : 0 } };
    }

    return { meta: { changes: 1 } };
  }
}

function makeEnv(db = new MockD1Database()) {
  return {
    DB: db,
    RESEND_API_KEY: "test",
    TIMEZONE: "Asia/Shanghai",
    FROM_EMAIL: "noreply@example.com",
    REPLY_EMAIL: "reply@example.com",
    ADMIN_TOKEN: "secret",
    LINUXDO_CLIENT_ID: "client",
    LINUXDO_CLIENT_SECRET: "secret",
  } as unknown as Parameters<typeof worker.fetch>[1];
}

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

  it("builds an update payload for an existing task", () => {
    const update = buildTaskUpdateFromAdminInput(
      {
        recipientEmail: "new@example.com",
        title: "更新后的提醒",
        body: "新的正文",
        dueAt: "2026-06-08 09:30",
        nagIntervalMinutes: 60,
        recurrence: {
          type: "interval",
          intervalMinutes: 2880,
          anchor: "scheduled_time",
        },
      },
      {
        now: new Date("2026-06-07T12:00:00.000Z"),
        timezone: "Asia/Shanghai",
      }
    );

    expect(update).toMatchObject({
      recipient_email: "new@example.com",
      title: "更新后的提醒",
      body: "新的正文",
      next_due_at_utc: "2026-06-08T01:30:00.000Z",
      recurrence_type: "interval",
      recurrence_interval_minutes: 2880,
      recurrence_anchor: "scheduled_time",
      nag_interval_minutes: 60,
    });
  });
});

describe("normal user task limits", () => {
  it("allows normal users below the task limit", () => {
    expect(() => assertNormalUserTaskLimit(4)).not.toThrow();
  });

  it("rejects normal users at the task limit", () => {
    expect(() => assertNormalUserTaskLimit(5)).toThrow("普通用户最多只能创建 5 个任务");
  });
});

describe("Linux.do OAuth flow", () => {
  it("starts Linux.do OAuth without requiring an invite code first", async () => {
    const response = await worker.fetch(new Request("https://reminder.test/auth/linuxdo/start"), makeEnv());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("https://connect.linux.do/oauth2/authorize");
  });

  it("redirects new Linux.do users to an invite completion step", async () => {
    const db = new MockD1Database();
    const env = makeEnv(db);
    const start = await worker.fetch(new Request("https://reminder.test/auth/linuxdo/start"), env);
    const state = new URL(start.headers.get("location") || "").searchParams.get("state");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 42, username: "neo", name: "Neo" })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request(`https://reminder.test/auth/linuxdo/callback?code=ok&state=${encodeURIComponent(state || "")}`),
      env
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("linuxdoPending=");
    expect(db.pending).toHaveLength(1);
    expect(db.users).toHaveLength(0);
  });

  it("completes pending Linux.do registration with an invite code", async () => {
    const db = new MockD1Database();
    db.pending.push({
      token: "pending_1",
      provider: "linuxdo",
      profile_json: JSON.stringify({ id: 42, username: "neo", name: "Neo" }),
      expires_at_utc: "2099-01-01T00:00:00.000Z",
      created_at_utc: "2026-06-08T00:00:00.000Z",
    });

    const response = await worker.fetch(
      new Request("https://reminder.test/auth/linuxdo/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken: "pending_1", inviteCode: "INVITE" }),
      }),
      makeEnv(db)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("reminder_user=");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(db.users).toHaveLength(1);
    expect(db.invites[0].used_by).toBe(db.users[0].id);
    expect(db.pending).toHaveLength(0);
  });
});

describe("app shell", () => {
  it("serves the React asset entry when an assets binding is configured", async () => {
    const assets = {
      fetch: vi.fn(async () => new Response("<!doctype html><div id=\"root\"></div>", { headers: { "Content-Type": "text/html" } })),
    };

    const response = await worker.fetch(new Request("https://reminder.test/tasks", { headers: { Accept: "text/html" } }), {
      ...makeEnv(),
      ASSETS: assets as unknown as Fetcher,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="root"');
    expect(assets.fetch).toHaveBeenCalled();
  });

  it("returns public session settings for unauthenticated visitors", async () => {
    const response = await worker.fetch(new Request("https://reminder.test/auth/session"), makeEnv());
    const payload = await response.json<{
      authenticated: boolean;
      isAdmin: boolean;
      settings: { allowRegistration: boolean; requireInvite: boolean };
    }>();

    expect(payload.authenticated).toBe(false);
    expect(payload.isAdmin).toBe(false);
    expect(payload.settings.allowRegistration).toBe(true);
    expect(payload.settings.requireInvite).toBe(true);
  });
});
