import PostalMime from "postal-mime";
import { renderAdminPage, renderLoginPage } from "./admin-page";

type RecurrenceType = "none" | "interval";
type RecurrenceAnchor = "scheduled_time" | "completion_time";
type TaskStatus = "active" | "done" | "paused" | "cancelled";

interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  TIMEZONE: string;
  FROM_EMAIL: string;
  REPLY_EMAIL: string;
  ADMIN_TOKEN?: string;
  EMAIL_DELIVERY?: "resend" | "log";
}

interface Task {
  id: string;
  recipient_email: string;
  title: string;
  body: string;
  status: TaskStatus;
  timezone: string;
  first_due_at_utc: string;
  next_due_at_utc: string;
  recurrence_type: RecurrenceType;
  recurrence_interval_minutes: number | null;
  recurrence_anchor: RecurrenceAnchor;
  nag_interval_minutes: number;
  current_run_id: string | null;
  created_at_utc: string;
  updated_at_utc: string;
}

interface ReminderRun {
  id: string;
  task_id: string;
  due_at_utc: string;
  status: "open" | "completed";
  sent_count: number;
  last_sent_at_utc: string | null;
  next_nag_at_utc: string | null;
  completed_at_utc: string | null;
  completed_by: string | null;
  completion_email_sent_at_utc: string | null;
  created_at_utc: string;
  updated_at_utc: string;
}

interface TaskRunRow extends Task {
  run_id: string;
  run_due_at_utc: string;
  run_sent_count: number;
  run_next_nag_at_utc: string | null;
}

interface AdminTaskRow extends Task {
  run_status: "open" | "completed" | null;
  run_sent_count: number | null;
  run_next_nag_at_utc: string | null;
  run_completed_at_utc: string | null;
}

interface InboundEmailMessage {
  raw: ReadableStream;
  from?: string;
  to?: string;
  headers?: Headers;
}

interface ProcessingSummary {
  createdRuns: number;
  nagReminders: number;
}

const RUN_ID_PATTERN = /\[R:(run_[A-Za-z0-9_-]+)\]/;
const DEFAULT_TIMEZONE = "Asia/Shanghai";
const DEFAULT_NAG_INTERVAL_MINUTES = 1440;
const MAX_LIST_LIMIT = 100;
const ADMIN_SESSION_COOKIE = "reminder_admin";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const REMEMBER_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processDueReminders(env));
  },

  async email(message: InboundEmailMessage, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleInboundReply(message, env));
  },

  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return (await hasValidAdminSession(request, env)) ? renderAdminPage() : renderLoginPage();
    }

    if (url.pathname === "/auth/login" && request.method === "POST") {
      try {
        return await handleAdminLogin(request, env);
      } catch (error) {
        return jsonError(error);
      }
    }

    if (url.pathname === "/auth/logout" && request.method === "POST") {
      return Response.json(
        { ok: true },
        {
          headers: {
            "Set-Cookie": clearAdminSessionCookie(request),
          },
        }
      );
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json(healthPayload());
    }

    if (url.pathname.startsWith("/admin/")) {
      const authError = await authorizeAdminRequest(request, env);
      if (authError) {
        return authError;
      }

      try {
        if (url.pathname === "/admin/process-due" && request.method === "POST") {
          const summary = await processDueReminders(env);
          return Response.json({ ok: true, ...summary });
        }

        if (url.pathname === "/admin/tasks" && request.method === "GET") {
          const tasks = await listAdminTasks(env, url);
          return Response.json({ ok: true, tasks });
        }

        if (url.pathname === "/admin/tasks" && request.method === "POST") {
          const input = await readJsonBody(request);
          const task = buildTaskFromAdminInput(input, {
            timezone: env.TIMEZONE,
            now: new Date(),
          });

          await insertTask(env, task);

          return Response.json({ ok: true, task: serializeTask(task) }, { status: 201 });
        }

        const statusAction = matchTaskStatusAction(url.pathname);
        if (statusAction && request.method === "POST") {
          const task = await setTaskStatus(env, statusAction.id, statusAction.status);
          return Response.json({ ok: true, task: serializeTask(task) });
        }

        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      } catch (error) {
        return jsonError(error);
      }
    }

    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  },
};

function healthPayload() {
  return {
    ok: true,
    service: "personal-mail-reminder",
    adminApi: {
      auth: "Authorization: Bearer <ADMIN_TOKEN>",
      endpoints: [
        "GET /admin/tasks?status=all&limit=20",
        "POST /admin/tasks",
        "POST /admin/tasks/<task_id>/pause",
        "POST /admin/tasks/<task_id>/resume",
        "POST /admin/tasks/<task_id>/cancel",
        "POST /admin/process-due",
      ],
    },
  };
}

async function processDueReminders(env: Env): Promise<ProcessingSummary> {
  const now = new Date();
  const nowIso = now.toISOString();

  const createdRuns = await createRunsForDueTasks(env, now, nowIso);
  const nagReminders = await sendDueNagReminders(env, now, nowIso);

  return { createdRuns, nagReminders };
}

async function createRunsForDueTasks(env: Env, now: Date, nowIso: string): Promise<number> {
  const { results: tasks = [] } = await env.DB.prepare(
    `SELECT *
     FROM tasks
     WHERE status = 'active'
       AND next_due_at_utc <= ?
       AND (current_run_id IS NULL OR current_run_id = '')
     ORDER BY next_due_at_utc ASC
     LIMIT 25`
  )
    .bind(nowIso)
    .all<Task>();

  for (const task of tasks) {
    const runId = makeId("run");
    const nextNagAt = addMinutes(now, task.nag_interval_minutes).toISOString();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO reminder_runs (
           id,
           task_id,
           due_at_utc,
           status,
           sent_count,
           next_nag_at_utc,
           created_at_utc,
           updated_at_utc
         ) VALUES (?, ?, ?, 'open', 0, ?, ?, ?)`
      ).bind(runId, task.id, task.next_due_at_utc, nextNagAt, nowIso, nowIso),
      env.DB.prepare(
        `UPDATE tasks
         SET current_run_id = ?, updated_at_utc = ?
         WHERE id = ? AND (current_run_id IS NULL OR current_run_id = '')`
      ).bind(runId, nowIso, task.id),
    ]);

    await sendReminderAndUpdateRun(env, task, runId, "reminder", now);
  }

  return tasks.length;
}

async function sendDueNagReminders(env: Env, now: Date, nowIso: string): Promise<number> {
  const { results: rows = [] } = await env.DB.prepare(
    `SELECT
       tasks.*,
       reminder_runs.id AS run_id,
       reminder_runs.due_at_utc AS run_due_at_utc,
       reminder_runs.sent_count AS run_sent_count,
       reminder_runs.next_nag_at_utc AS run_next_nag_at_utc
     FROM reminder_runs
     JOIN tasks ON tasks.id = reminder_runs.task_id
     WHERE reminder_runs.status = 'open'
       AND tasks.status = 'active'
       AND reminder_runs.next_nag_at_utc <= ?
     ORDER BY reminder_runs.next_nag_at_utc ASC
     LIMIT 25`
  )
    .bind(nowIso)
    .all<TaskRunRow>();

  for (const row of rows) {
    await sendReminderAndUpdateRun(env, row, row.run_id, "nag", now);
  }

  return rows.length;
}

async function sendReminderAndUpdateRun(
  env: Env,
  task: Task,
  runId: string,
  type: "reminder" | "nag",
  sentAt: Date
): Promise<void> {
  const sentAtIso = sentAt.toISOString();
  const nextNagAt = addMinutes(sentAt, task.nag_interval_minutes).toISOString();
  const success = await sendReminderEmail(env, task, runId, type);

  await env.DB.prepare(
    `UPDATE reminder_runs
     SET sent_count = sent_count + ?,
         last_sent_at_utc = CASE WHEN ? = 1 THEN ? ELSE last_sent_at_utc END,
         next_nag_at_utc = ?,
         updated_at_utc = ?
     WHERE id = ? AND status = 'open'`
  )
    .bind(success ? 1 : 0, success ? 1 : 0, sentAtIso, nextNagAt, sentAtIso, runId)
    .run();
}

async function sendReminderEmail(
  env: Env,
  task: Task,
  runId: string,
  type: "reminder" | "nag"
): Promise<boolean> {
  const subject = `[R:${runId}] ${task.title}`;
  const text = `${task.body}

---
完成后，请直接回复本邮件。
回复第一行只写：
1`;

  return sendEmail(env, {
    runId,
    taskId: task.id,
    type,
    to: task.recipient_email,
    subject,
    text,
  });
}

async function handleInboundReply(message: InboundEmailMessage, env: Env): Promise<void> {
  const parsed = await parseInboundEmail(message);
  const runId = extractRunId(parsed.subject);
  const firstLine = getFirstMeaningfulLine(parsed.text);

  if (!runId || firstLine !== "1") {
    return;
  }

  const row = await env.DB.prepare(
    `SELECT
       tasks.*,
       reminder_runs.id AS run_id,
       reminder_runs.due_at_utc AS run_due_at_utc,
       reminder_runs.sent_count AS run_sent_count,
       reminder_runs.next_nag_at_utc AS run_next_nag_at_utc
     FROM reminder_runs
     JOIN tasks ON tasks.id = reminder_runs.task_id
     WHERE reminder_runs.id = ?
       AND reminder_runs.status = 'open'
     LIMIT 1`
  )
    .bind(runId)
    .first<TaskRunRow>();

  if (!row) {
    return;
  }

  const completedAt = new Date();
  const completedAtIso = completedAt.toISOString();
  const completedBy = parsed.from || message.from || "";
  const nextDueAt = calculateNextDueAt(row, completedAt);

  const updates: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE reminder_runs
       SET status = 'completed',
           completed_at_utc = ?,
           completed_by = ?,
           updated_at_utc = ?
       WHERE id = ? AND status = 'open'`
    ).bind(completedAtIso, completedBy, completedAtIso, runId),
  ];

  if (nextDueAt) {
    updates.push(
      env.DB.prepare(
        `UPDATE tasks
         SET current_run_id = NULL,
             next_due_at_utc = ?,
             status = 'active',
             updated_at_utc = ?
         WHERE id = ?`
      ).bind(nextDueAt.toISOString(), completedAtIso, row.id)
    );
  } else {
    updates.push(
      env.DB.prepare(
        `UPDATE tasks
         SET current_run_id = NULL,
             status = 'done',
             updated_at_utc = ?
         WHERE id = ?`
      ).bind(completedAtIso, row.id)
    );
  }

  await env.DB.batch(updates);

  const completionSent = await sendCompletionEmail(env, row, runId, completedAt, nextDueAt);
  if (completionSent) {
    await env.DB.prepare(
      `UPDATE reminder_runs
       SET completion_email_sent_at_utc = ?, updated_at_utc = ?
       WHERE id = ?`
    )
      .bind(new Date().toISOString(), new Date().toISOString(), runId)
      .run();
  }
}

async function sendCompletionEmail(
  env: Env,
  task: Task,
  runId: string,
  completedAt: Date,
  nextDueAt: Date | null
): Promise<boolean> {
  const timezone = task.timezone || env.TIMEZONE || DEFAULT_TIMEZONE;
  const subject = `[已完成] ${task.title}`;
  const nextReminderLine = nextDueAt
    ? `下次提醒时间：${formatInTimezone(nextDueAt, timezone)}`
    : "这是一次性任务，后续不会继续提醒。";
  const text = `本次提醒任务已完成。

任务：${task.title}
完成时间：${formatInTimezone(completedAt, timezone)}
${nextReminderLine}`;

  return sendEmail(env, {
    runId,
    taskId: task.id,
    type: "completion",
    to: task.recipient_email,
    subject,
    text,
  });
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

  return next;
}

export function buildTaskFromAdminInput(
  input: unknown,
  options: { timezone?: string; now?: Date; id?: string } = {}
): Task {
  const record = requireRecord(input, "Request body");
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const timezone = readOptionalString(record, ["timezone"]) ?? options.timezone ?? DEFAULT_TIMEZONE;
  const recipientEmail = readRequiredString(record, ["recipientEmail", "recipient_email"], "recipientEmail");
  const title = readRequiredString(record, ["title"], "title");
  const body = readOptionalString(record, ["body"]) ?? title;
  const nagIntervalMinutes =
    readOptionalPositiveInteger(
      record,
      ["nagIntervalMinutes", "nag_interval_minutes", "nagMinutes", "nag"],
      "nagIntervalMinutes"
    ) ?? DEFAULT_NAG_INTERVAL_MINUTES;
  const recurrence = readOptionalRecord(record, ["recurrence"]);
  const recurrenceType = resolveRecurrenceType(record, recurrence);
  const recurrenceAnchor = resolveRecurrenceAnchor(record, recurrence);
  const recurrenceIntervalMinutes = resolveRecurrenceIntervalMinutes(record, recurrence, recurrenceType);
  const dueAt = resolveAdminDueAt(record, timezone, now);
  const id = options.id ?? readOptionalString(record, ["id"]) ?? makeId("task");

  if (!isValidTaskId(id)) {
    throw new AdminInputError("id must contain only letters, numbers, underscores, and hyphens");
  }

  if (!isValidEmail(recipientEmail)) {
    throw new AdminInputError("recipientEmail must be a valid email address");
  }

  return {
    id,
    recipient_email: recipientEmail,
    title,
    body,
    status: "active",
    timezone,
    first_due_at_utc: dueAt.toISOString(),
    next_due_at_utc: dueAt.toISOString(),
    recurrence_type: recurrenceType,
    recurrence_interval_minutes: recurrenceIntervalMinutes,
    recurrence_anchor: recurrenceAnchor,
    nag_interval_minutes: nagIntervalMinutes,
    current_run_id: null,
    created_at_utc: nowIso,
    updated_at_utc: nowIso,
  };
}

async function sendEmail(
  env: Env,
  input: {
    runId: string;
    taskId: string;
    type: "reminder" | "nag" | "completion";
    to: string;
    subject: string;
    text: string;
  }
): Promise<boolean> {
  const createdAt = new Date().toISOString();
  let providerMessageId: string | null = null;
  let errorMessage: string | null = null;
  let success = false;
  const provider = env.EMAIL_DELIVERY === "log" ? "log" : "resend";

  try {
    if (provider === "log") {
      providerMessageId = makeId("dry");
      success = true;
    } else {
      if (!env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured");
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.FROM_EMAIL,
          to: [input.to],
          reply_to: [env.REPLY_EMAIL],
          subject: input.subject,
          text: input.text,
        }),
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`Resend ${response.status}: ${responseText}`);
      }

      const payload = safeJsonParse(responseText) as { id?: string } | null;
      providerMessageId = payload?.id ?? null;
      success = true;
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  await env.DB.prepare(
    `INSERT INTO send_logs (
       run_id,
       task_id,
       type,
       recipient_email,
       subject,
       provider,
       provider_message_id,
       success,
       error_message,
       created_at_utc
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      input.runId,
      input.taskId,
      input.type,
      input.to,
      input.subject,
      provider,
      providerMessageId,
      success ? 1 : 0,
      errorMessage,
      createdAt
    )
    .run();

  return success;
}

async function parseInboundEmail(message: InboundEmailMessage): Promise<{
  subject: string;
  text: string;
  from: string;
}> {
  const parser = new PostalMime();
  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await parser.parse(raw);
  const from =
    parsed.from && "address" in parsed.from && parsed.from.address
      ? parsed.from.address
      : message.from || "";

  return {
    subject: parsed.subject || message.headers?.get("subject") || "",
    text: parsed.text || "",
    from,
  };
}

export function extractRunId(subject: string): string | null {
  const match = subject.match(RUN_ID_PATTERN);
  return match?.[1] ?? null;
}

export function getFirstMeaningfulLine(text: string): string {
  return (
    text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function formatInTimezone(date: Date, timezone: string): string {
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return formatted.replace("T", " ");
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AdminInputError("Content-Type must be application/json");
  }

  try {
    return await request.json();
  } catch {
    throw new AdminInputError("Request body must be valid JSON");
  }
}

async function insertTask(env: Env, task: Task): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO tasks (
       id,
       recipient_email,
       title,
       body,
       status,
       timezone,
       first_due_at_utc,
       next_due_at_utc,
       recurrence_type,
       recurrence_interval_minutes,
       recurrence_anchor,
       nag_interval_minutes,
       current_run_id,
       created_at_utc,
       updated_at_utc
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      task.id,
      task.recipient_email,
      task.title,
      task.body,
      task.status,
      task.timezone,
      task.first_due_at_utc,
      task.next_due_at_utc,
      task.recurrence_type,
      task.recurrence_interval_minutes,
      task.recurrence_anchor,
      task.nag_interval_minutes,
      task.current_run_id,
      task.created_at_utc,
      task.updated_at_utc
    )
    .run();
}

async function listAdminTasks(env: Env, url: URL) {
  const status = url.searchParams.get("status") || "active";
  const limit = readListLimit(url.searchParams.get("limit"));
  const select = `SELECT
       tasks.*,
       reminder_runs.status AS run_status,
       reminder_runs.sent_count AS run_sent_count,
       reminder_runs.next_nag_at_utc AS run_next_nag_at_utc,
       reminder_runs.completed_at_utc AS run_completed_at_utc
     FROM tasks
     LEFT JOIN reminder_runs ON reminder_runs.id = tasks.current_run_id`;
  const order = `ORDER BY
       CASE WHEN tasks.status = 'active' THEN 0 ELSE 1 END,
       tasks.next_due_at_utc ASC
     LIMIT ?`;

  if (status === "all") {
    const { results = [] } = await env.DB.prepare(`${select} ${order}`).bind(limit).all<AdminTaskRow>();
    return results.map(serializeTaskRow);
  }

  if (!isTaskStatus(status)) {
    throw new AdminInputError("status must be active, done, paused, cancelled, or all");
  }

  const { results = [] } = await env.DB.prepare(`${select} WHERE tasks.status = ? ${order}`)
    .bind(status, limit)
    .all<AdminTaskRow>();

  return results.map(serializeTaskRow);
}

async function setTaskStatus(env: Env, id: string, status: TaskStatus): Promise<Task> {
  const updatedAt = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE tasks
     SET status = ?, updated_at_utc = ?
     WHERE id = ?`
  )
    .bind(status, updatedAt, id)
    .run();

  const task = await env.DB.prepare(`SELECT * FROM tasks WHERE id = ? LIMIT 1`).bind(id).first<Task>();
  if (!task) {
    throw new AdminInputError("Task not found", 404);
  }

  return task;
}

function matchTaskStatusAction(pathname: string): { id: string; status: TaskStatus } | null {
  const match = pathname.match(/^\/admin\/tasks\/([^/]+)\/(pause|resume|cancel)$/);
  if (!match) {
    return null;
  }

  const action = match[2];
  return {
    id: decodeURIComponent(match[1]),
    status: action === "resume" ? "active" : action === "pause" ? "paused" : "cancelled",
  };
}

function serializeTaskRow(row: AdminTaskRow) {
  const task = serializeTask(row);

  return {
    ...task,
    currentRun: row.current_run_id
      ? {
          id: row.current_run_id,
          status: row.run_status,
          sentCount: row.run_sent_count ?? 0,
          nextNagAtUtc: row.run_next_nag_at_utc,
          completedAtUtc: row.run_completed_at_utc,
        }
      : null,
  };
}

function serializeTask(task: Task) {
  return {
    id: task.id,
    recipientEmail: task.recipient_email,
    title: task.title,
    body: task.body,
    status: task.status,
    timezone: task.timezone,
    firstDueAtUtc: task.first_due_at_utc,
    nextDueAtUtc: task.next_due_at_utc,
    recurrenceType: task.recurrence_type,
    recurrenceIntervalMinutes: task.recurrence_interval_minutes,
    recurrenceAnchor: task.recurrence_anchor,
    nagIntervalMinutes: task.nag_interval_minutes,
    currentRunId: task.current_run_id,
    createdAtUtc: task.created_at_utc,
    updatedAtUtc: task.updated_at_utc,
  };
}

function resolveAdminDueAt(record: Record<string, unknown>, timezone: string, now: Date): Date {
  const minutesFromNow = readOptionalPositiveInteger(
    record,
    ["minutesFromNow", "minutes_from_now"],
    "minutesFromNow"
  );
  const dueAtValue = readOptionalString(record, ["dueAt", "due_at", "dueAtUtc", "due_at_utc"]);

  if (minutesFromNow && dueAtValue) {
    throw new AdminInputError("Use only one of dueAt or minutesFromNow");
  }

  if (minutesFromNow) {
    return addMinutes(now, minutesFromNow);
  }

  if (!dueAtValue) {
    throw new AdminInputError("dueAt or minutesFromNow is required");
  }

  return parseAdminDueAt(dueAtValue, timezone);
}

function parseAdminDueAt(value: string, timezone: string): Date {
  const normalized = value.trim().replace(" ", "T");
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
    ? `${normalized}:00`
    : normalized;
  const withTimezone = hasExplicitTimezone(withSeconds)
    ? withSeconds
    : appendDefaultTimezoneOffset(withSeconds, timezone);
  const date = new Date(withTimezone);

  if (Number.isNaN(date.getTime())) {
    throw new AdminInputError("dueAt must be a valid date");
  }

  return date;
}

function appendDefaultTimezoneOffset(value: string, timezone: string): string {
  if (timezone !== DEFAULT_TIMEZONE) {
    throw new AdminInputError('dueAt without an explicit timezone currently requires "Asia/Shanghai"');
  }

  return `${value}+08:00`;
}

function resolveRecurrenceType(
  record: Record<string, unknown>,
  recurrence: Record<string, unknown> | null
): RecurrenceType {
  const type =
    readOptionalString(recurrence, ["type"]) ??
    readOptionalString(record, ["recurrenceType", "recurrence_type"]);
  const interval =
    readOptionalPositiveInteger(
      recurrence ?? {},
      ["intervalMinutes", "interval_minutes", "repeatMinutes", "repeat_minutes"],
      "recurrence.intervalMinutes"
    ) ??
    readOptionalPositiveInteger(
      record,
      ["recurrenceIntervalMinutes", "recurrence_interval_minutes", "repeatMinutes", "repeat_minutes"],
      "recurrenceIntervalMinutes"
    );

  if (!type && interval) {
    return "interval";
  }

  if (!type) {
    return "none";
  }

  if (type !== "none" && type !== "interval") {
    throw new AdminInputError("recurrence type must be none or interval");
  }

  return type;
}

function resolveRecurrenceAnchor(
  record: Record<string, unknown>,
  recurrence: Record<string, unknown> | null
): RecurrenceAnchor {
  const anchor =
    readOptionalString(recurrence, ["anchor"]) ??
    readOptionalString(record, ["recurrenceAnchor", "recurrence_anchor"]) ??
    "scheduled_time";

  if (anchor !== "scheduled_time" && anchor !== "completion_time") {
    throw new AdminInputError("recurrence anchor must be scheduled_time or completion_time");
  }

  return anchor;
}

function resolveRecurrenceIntervalMinutes(
  record: Record<string, unknown>,
  recurrence: Record<string, unknown> | null,
  recurrenceType: RecurrenceType
): number | null {
  const interval =
    readOptionalPositiveInteger(
      recurrence ?? {},
      ["intervalMinutes", "interval_minutes", "repeatMinutes", "repeat_minutes"],
      "recurrence.intervalMinutes"
    ) ??
    readOptionalPositiveInteger(
      record,
      ["recurrenceIntervalMinutes", "recurrence_interval_minutes", "repeatMinutes", "repeat_minutes"],
      "recurrenceIntervalMinutes"
    );

  if (recurrenceType === "none") {
    return null;
  }

  if (!interval) {
    throw new AdminInputError("recurrence.intervalMinutes is required for interval tasks");
  }

  return interval;
}

function readRequiredString(
  record: Record<string, unknown> | null,
  names: string[],
  displayName: string
): string {
  const value = readOptionalString(record, names);
  if (!value) {
    throw new AdminInputError(`${displayName} is required`);
  }

  return value;
}

function readOptionalString(record: Record<string, unknown> | null, names: string[]): string | null {
  if (!record) {
    return null;
  }

  for (const name of names) {
    if (!(name in record)) {
      continue;
    }

    const value = record[name];
    if (typeof value !== "string") {
      throw new AdminInputError(`${name} must be a string`);
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function readOptionalPositiveInteger(
  record: Record<string, unknown>,
  names: string[],
  displayName: string
): number | null {
  for (const name of names) {
    if (!(name in record)) {
      continue;
    }

    const value = record[name];
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isInteger(number) || number <= 0) {
      throw new AdminInputError(`${displayName} must be a positive integer`);
    }

    return number;
  }

  return null;
}

function readOptionalRecord(record: Record<string, unknown>, names: string[]): Record<string, unknown> | null {
  for (const name of names) {
    if (!(name in record)) {
      continue;
    }

    return requireRecord(record[name], name);
  }

  return null;
}

function requireRecord(value: unknown, displayName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminInputError(`${displayName} must be an object`);
  }

  return value as Record<string, unknown>;
}

function readListLimit(value: string | null): number {
  if (!value) {
    return 50;
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new AdminInputError("limit must be a positive integer");
  }

  return Math.min(limit, MAX_LIST_LIMIT);
}

function hasExplicitTimezone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidTaskId(value: string): boolean {
  return /^[A-Za-z0-9_-]{3,80}$/.test(value);
}

function isTaskStatus(value: string): value is TaskStatus {
  return value === "active" || value === "done" || value === "paused" || value === "cancelled";
}

async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    return Response.json({ ok: false, error: "ADMIN_TOKEN is not configured" }, { status: 500 });
  }

  const input = requireRecord(await readJsonBody(request), "Request body");
  const token = readRequiredString(input, ["token"], "token");
  const remember = input.remember === true;

  if (!constantTimeEqual(token, env.ADMIN_TOKEN)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const maxAge = remember ? REMEMBER_SESSION_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS;
  const cookie = await createAdminSessionCookie(request, env, maxAge);

  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": cookie,
      },
    }
  );
}

async function authorizeAdminRequest(request: Request, env: Env): Promise<Response | null> {
  if (!env.ADMIN_TOKEN) {
    return Response.json({ ok: false, error: "ADMIN_TOKEN is not configured" }, { status: 500 });
  }

  const authorization = request.headers.get("authorization") || "";
  const expected = `Bearer ${env.ADMIN_TOKEN}`;
  if (authorization) {
    return constantTimeEqual(authorization, expected)
      ? null
      : Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (await hasValidAdminSession(request, env)) {
    return null;
  }

  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

async function hasValidAdminSession(request: Request, env: Env): Promise<boolean> {
  if (!env.ADMIN_TOKEN) {
    return false;
  }

  const value = readCookie(request, ADMIN_SESSION_COOKIE);
  if (!value) {
    return false;
  }

  const parts = value.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [payload, signature] = parts;
  if (!(await verifySessionSignature(env.ADMIN_TOKEN, payload, signature))) {
    return false;
  }

  const parsed = safeJsonParse(decodeBase64UrlToString(payload)) as { exp?: number } | null;
  return typeof parsed?.exp === "number" && parsed.exp > Date.now();
}

async function createAdminSessionCookie(
  request: Request,
  env: Env,
  maxAgeSeconds: number
): Promise<string> {
  const payload = encodeBase64UrlString(JSON.stringify({ exp: Date.now() + maxAgeSeconds * 1000 }));
  const signature = await signSessionPayload(env.ADMIN_TOKEN || "", payload);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return `${ADMIN_SESSION_COOKIE}=${payload}.${signature}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict${secure}`;
}

function clearAdminSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}

async function signSessionPayload(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

  return encodeBase64UrlBytes(new Uint8Array(signature));
}

async function verifySessionSignature(
  secret: string,
  payload: string,
  signature: string
): Promise<boolean> {
  const expected = await signSessionPayload(secret, payload);
  return constantTimeEqual(signature, expected);
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const chunk of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = chunk.trim().split("=");
    if (rawName === name) {
      return rawValue.join("=") || null;
    }
  }

  return null;
}

function encodeBase64UrlString(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeBase64UrlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64UrlToString(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

  try {
    return atob(padded);
  } catch {
    return "";
  }
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const actualBytes = encoder.encode(actual);
  const expectedBytes = encoder.encode(expected);
  const length = Math.max(actualBytes.length, expectedBytes.length);
  let diff = actualBytes.length ^ expectedBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }

  return diff === 0;
}

function jsonError(error: unknown): Response {
  if (error instanceof AdminInputError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, error: message }, { status: 500 });
}

class AdminInputError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}
