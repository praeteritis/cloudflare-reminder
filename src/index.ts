import PostalMime from "postal-mime";

type RecurrenceType = "none" | "interval";
type RecurrenceAnchor = "scheduled_time" | "completion_time";
type TaskStatus = "active" | "done" | "paused" | "cancelled";
type UserStatus = "active" | "banned";

interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  REMINDER_QUEUE?: Queue<ReminderDeliveryMessage>;
  RESEND_API_KEY: string;
  TIMEZONE: string;
  FROM_EMAIL: string;
  REPLY_EMAIL: string;
  ADMIN_TOKEN?: string;
  EMAIL_DELIVERY?: "resend" | "log";
  HEARTBEAT_URL?: string;
  LINUXDO_CLIENT_ID?: string;
  LINUXDO_CLIENT_SECRET?: string;
}

interface Task {
  id: string;
  user_id: string | null;
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
  recurrence_end_at_utc: string | null;
  nag_interval_minutes: number;
  max_nag_count: number;
  current_run_id: string | null;
  created_at_utc: string;
  updated_at_utc: string;
  deleted_at_utc: string | null;
}

interface ReminderRun {
  id: string;
  task_id: string;
  due_at_utc: string;
  status: "open" | "completed" | "cancelled";
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
  user_email: string | null;
  run_status: ReminderRun["status"] | null;
  run_sent_count: number | null;
  run_next_nag_at_utc: string | null;
  run_completed_at_utc: string | null;
}

interface TaskUpdateInput {
  recipient_email: string;
  title: string;
  body: string;
  timezone: string;
  first_due_at_utc: string;
  next_due_at_utc: string;
  recurrence_type: RecurrenceType;
  recurrence_interval_minutes: number | null;
  recurrence_anchor: RecurrenceAnchor;
  recurrence_end_at_utc: string | null;
  nag_interval_minutes: number;
  max_nag_count: number;
  updated_at_utc: string;
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
  recoveredDeliveries: number;
  queuedDeliveries: number;
  cleanupDeletedRows: number;
  backlog: boolean;
}

type ReminderDeliveryType = "reminder" | "nag";

interface ReminderDeliveryMessage {
  version: 1;
  deliveryKey: string;
  runId: string;
  taskId: string;
  type: ReminderDeliveryType;
  scheduledForUtc: string;
  enqueuedAtUtc: string;
}

interface EmailDeliveryJob {
  delivery_key: string;
  run_id: string;
  task_id: string;
  type: ReminderDeliveryType;
  scheduled_for_utc: string;
  status: "pending" | "queued" | "sending" | "retrying" | "sent" | "failed" | "dead_lettered" | "skipped";
  attempt_count: number;
  provider: string | null;
  provider_message_id: string | null;
  last_error_message: string | null;
  queued_at_utc: string | null;
  last_attempted_at_utc: string | null;
  sent_at_utc: string | null;
  created_at_utc: string;
  updated_at_utc: string;
}

interface EmailSendResult {
  success: boolean;
  provider: string;
  providerMessageId: string | null;
  errorMessage: string | null;
}

interface User {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  status: UserStatus;
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

interface AuthenticatedActor {
  type: "admin" | "user" | "system";
  userId?: string;
  email?: string;
}

interface AppSettings {
  allowRegistration: boolean;
  requireInvite: boolean;
  announcementText: string;
}

interface TaskUsage {
  used: number;
  limit: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  offset: number;
}

interface LinuxDoUser {
  id?: number | string;
  username?: string;
  name?: string;
  email?: string;
  avatar_template?: string;
  avatar_url?: string;
}

const RUN_ID_PATTERN = /\[R:(run_[A-Za-z0-9_-]+)\]/;
const DEFAULT_TIMEZONE = "Asia/Shanghai";
const DEFAULT_NAG_INTERVAL_MINUTES = 1440;
const DEFAULT_MAX_NAG_COUNT = 3;
const TASK_MAX_NAG_COUNT = 10;
const FAILED_SEND_RETRY_MINUTES = 1;
const MAX_LIST_LIMIT = 100;
const DUE_SCAN_LIMIT = 250;
const NAG_SCAN_LIMIT = 250;
const SCHEDULER_MAX_LOOPS = 6;
const DELIVERY_ENQUEUE_LIMIT = 500;
const DELIVERY_QUEUE_BATCH_SIZE = 100;
const DELIVERY_RETRY_BASE_SECONDS = 60;
const DELIVERY_RETRY_MAX_SECONDS = 30 * 60;
const DELIVERY_CLAIM_STALE_SECONDS = 2 * 60;
const DELIVERY_QUEUED_STALE_SECONDS = 5 * 60;
const DELIVERY_RETRYING_STALE_SECONDS = 30 * 60;
const DELIVERY_RECOVERY_LIMIT = 500;
const NORMAL_USER_TASK_LIMIT = 5;
const ADMIN_SESSION_COOKIE = "reminder_admin";
const USER_SESSION_COOKIE = "reminder_user";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const REMEMBER_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_HASH_ITERATIONS = 100_000;
const TASK_TITLE_MAX_CHARS = 20;
const TASK_BODY_MAX_CHARS = 200;
const TASK_TIMEZONE_MAX_CHARS = 64;
const TASK_MAX_INTERVAL_MINUTES = 366 * 24 * 60;
const LINUXDO_AUTHORIZE_URL = "https://connect.linux.do/oauth2/authorize";
const LINUXDO_TOKEN_URL = "https://connect.linux.do/oauth2/token";
const LINUXDO_USER_URL = "https://connect.linux.do/api/user";
const LOG_RETENTION_DAYS = 30;
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024;

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      processDueReminders(env)
        .then((summary) => pingHeartbeat(env, summary))
        .catch((error) => {
          console.warn(
            JSON.stringify({
              event: "scheduled_reminder_error",
              error: error instanceof Error ? error.message : String(error),
            })
          );
        })
    );
  },

  async queue(batch: MessageBatch<ReminderDeliveryMessage>, env: Env) {
    if (isDeadLetterQueue(batch.queue)) {
      await markDeadLetteredDeliveryMessages(env, batch.messages);
      batch.ackAll();
      return;
    }

    for (const message of batch.messages) {
      try {
        const result = await processReminderDeliveryMessage(env, message.body, message.attempts);
        if (result === "retry") {
          message.retry({ delaySeconds: calculateQueueRetryDelaySeconds(message.attempts) });
        } else {
          message.ack();
        }
      } catch (error) {
        console.warn(
          JSON.stringify({
            event: "queue_delivery_error",
            messageId: message.id,
            error: error instanceof Error ? error.message : String(error),
          })
        );
        message.retry({ delaySeconds: calculateQueueRetryDelaySeconds(message.attempts) });
      }
    }
  },

  async email(message: InboundEmailMessage, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      handleInboundReply(message, env).catch((error) => {
        console.warn(
          JSON.stringify({
            event: "inbound_reply_error",
            from: message.from,
            to: message.to,
            error: error instanceof Error ? error.message : String(error),
          })
        );
      })
    );
  },

  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return serveApp(request, env);
    }

    if (isAppRoute(url.pathname) && request.method === "GET" && acceptsHtml(request)) {
      return serveApp(request, env);
    }

    if (url.pathname === "/auth/session" && request.method === "GET") {
      const actor = await getAuthenticatedActor(request, env);
      const settings = await getAppSettings(env);
      return Response.json({
        ok: true,
        authenticated: Boolean(actor),
        isAdmin: actor?.type === "admin",
        userEmail: actor?.email ?? null,
        settings: toPublicSettings(settings),
      });
    }

    if (url.pathname === "/auth/login" && request.method === "POST") {
      try {
        return await handleAdminLogin(request, env);
      } catch (error) {
        return jsonError(error);
      }
    }

    if (url.pathname === "/auth/user-login" && request.method === "POST") {
      try {
        return await handleUserLogin(request, env);
      } catch (error) {
        return jsonError(error);
      }
    }

    if (url.pathname === "/auth/register" && request.method === "POST") {
      try {
        return await handleUserRegister(request, env);
      } catch (error) {
        return jsonError(error);
      }
    }

    if (url.pathname === "/auth/linuxdo/start" && request.method === "GET") {
      try {
        return await handleLinuxDoStart(request, env);
      } catch (error) {
        return jsonError(error);
      }
    }

    if (url.pathname === "/auth/linuxdo/callback" && request.method === "GET") {
      try {
        return await handleLinuxDoCallback(request, env);
      } catch (error) {
        return jsonError(error);
      }
    }

    if (url.pathname === "/auth/linuxdo/complete" && request.method === "POST") {
      try {
        return await handleLinuxDoComplete(request, env);
      } catch (error) {
        return jsonError(error);
      }
    }

    if (url.pathname === "/auth/logout" && request.method === "POST") {
      const actor = await getAuthenticatedActor(request, env);
      const headers = new Headers();
      headers.append("Set-Cookie", clearSessionCookie(request, ADMIN_SESSION_COOKIE));
      headers.append("Set-Cookie", clearSessionCookie(request, USER_SESSION_COOKIE));
      if (actor) {
        await logAudit(env, actor, "auth_logout", "session", actor.userId ?? "admin");
      }

      return Response.json(
        { ok: true },
        {
          headers,
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
      const actor: AuthenticatedActor = { type: "admin", email: "admin" };

      try {
        if (url.pathname === "/admin/process-due" && request.method === "POST") {
          const summary = await processDueReminders(env);
          await logAudit(env, actor, "admin_process_due", "system", "reminders", summary);
          return Response.json({ ok: true, ...summary });
        }

        if (url.pathname === "/admin/settings" && request.method === "GET") {
          return Response.json({ ok: true, settings: await getPublicSettings(env) });
        }

        if (url.pathname === "/admin/settings" && request.method === "PATCH") {
          const settings = await updateAppSettingsFromInput(env, await readJsonBody(request));
          await logAudit(env, actor, "admin_settings_update", "settings", "app");
          return Response.json({ ok: true, settings: toPublicSettings(settings) });
        }

        if (url.pathname === "/admin/invites" && request.method === "GET") {
          const page = await listInviteCodes(env, url);
          return Response.json({ ok: true, invites: page.items, page });
        }

        if (url.pathname === "/admin/invites" && request.method === "POST") {
          const invites = await createInviteCodes(env, actor, await readJsonBody(request));
          await logAudit(env, actor, "admin_invite_create", "invite", null, {
            count: invites.length,
            expiresAtUtc: invites[0]?.expiresAtUtc ?? null,
          });
          return Response.json({ ok: true, invites, invite: invites[0] ?? null }, { status: 201 });
        }

        const inviteCode = matchAdminInvitePath(url.pathname);
        if (inviteCode && request.method === "DELETE") {
          await deleteInviteCode(env, inviteCode);
          await logAudit(env, actor, "admin_invite_delete", "invite", inviteCode);
          return Response.json({ ok: true });
        }

        if (url.pathname === "/admin/invites/batch-delete" && request.method === "POST") {
          const result = await deleteInviteCodesFromInput(env, await readJsonBody(request));
          await logAudit(env, actor, "admin_invite_batch_delete", "invite", null, result);
          return Response.json({ ok: true, ...result });
        }

        if (url.pathname === "/admin/users" && request.method === "GET") {
          const page = await listAdminUsers(env, url);
          return Response.json({ ok: true, users: page.items, page });
        }

        if (url.pathname === "/admin/logs" && request.method === "GET") {
          const page = await listReminderExecutionLogs(env, url, "admin", undefined);
          return Response.json({ ok: true, logs: page.items, page });
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
          await logAudit(env, actor, "task_create", "task", task.id, {
            title: task.title,
            owner: task.user_id,
          });

          return Response.json({ ok: true, task: serializeTask(task) }, { status: 201 });
        }

        const taskUpdateId = matchTaskUpdatePath(url.pathname);
        if (taskUpdateId && request.method === "PATCH") {
          const input = await readJsonBody(request);
          const task = await updateTaskFromAdminInput(env, taskUpdateId, input);
          await logAudit(env, actor, "task_update", "task", task.id, { title: task.title });
          return Response.json({ ok: true, task: serializeTask(task) });
        }

        if (taskUpdateId && request.method === "DELETE") {
          const task = await softDeleteTask(env, taskUpdateId);
          await logAudit(env, actor, "task_delete", "task", task.id, { title: task.title });
          return Response.json({ ok: true, task: serializeTask(task) });
        }

        const statusAction = matchTaskStatusAction(url.pathname);
        if (statusAction && request.method === "POST") {
          const task = await setTaskStatus(env, statusAction.id, statusAction.status);
          await logAudit(env, actor, `task_${statusAction.status}`, "task", task.id, { title: task.title });
          return Response.json({ ok: true, task: serializeTask(task) });
        }

        const userId = matchAdminUserPath(url.pathname);
        if (userId && request.method === "PATCH") {
          const user = await updateAdminUser(env, userId, await readJsonBody(request));
          await logAudit(env, actor, "admin_user_update", "user", user.id, { email: user.email });
          return Response.json({ ok: true, user: serializeUser(user) });
        }

        const userAction = matchAdminUserAction(url.pathname);
        if (userAction && request.method === "POST") {
          const user = userAction.action === "ban"
            ? await banUser(env, userAction.id, await readJsonBody(request))
            : await unbanUser(env, userAction.id);
          await logAudit(env, actor, `admin_user_${userAction.action}`, "user", user.id, { email: user.email });
          return Response.json({ ok: true, user: serializeUser(user) });
        }

        if (userId && request.method === "DELETE") {
          const deleted = await deleteUserAndOwnedData(env, userId);
          await logAudit(env, actor, "admin_user_delete", "user", userId, deleted);
          return Response.json({ ok: true, deleted });
        }

        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      } catch (error) {
        return jsonError(error);
      }
    }

    if (url.pathname.startsWith("/user/")) {
      const actor = await getAuthenticatedActor(request, env);
      if (!actor || actor.type !== "user" || !actor.userId) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }

      try {
        if (url.pathname === "/user/tasks" && request.method === "GET") {
          const tasks = await listUserTasks(env, url, actor.userId);
          return Response.json({ ok: true, tasks, taskUsage: await getUserTaskUsage(env, actor.userId) });
        }

        if (url.pathname === "/user/logs" && request.method === "GET") {
          const page = await listReminderExecutionLogs(env, url, "user", actor.userId);
          return Response.json({ ok: true, logs: page.items, page });
        }

        if (url.pathname === "/user/tasks" && request.method === "POST") {
          const input = await readJsonBody(request);
          const task = buildTaskFromAdminInput(input, {
            timezone: env.TIMEZONE,
            now: new Date(),
          });

          task.user_id = actor.userId;
          await insertTaskForUser(env, task, actor.userId);
          await logAudit(env, actor, "task_create", "task", task.id, { title: task.title });

          return Response.json({ ok: true, task: serializeTask(task) }, { status: 201 });
        }

        const taskUpdateId = matchUserTaskUpdatePath(url.pathname);
        if (taskUpdateId && request.method === "PATCH") {
          const task = await updateTaskFromAdminInput(env, taskUpdateId, await readJsonBody(request), actor.userId);
          await logAudit(env, actor, "task_update", "task", task.id, { title: task.title });
          return Response.json({ ok: true, task: serializeTask(task) });
        }

        if (taskUpdateId && request.method === "DELETE") {
          const task = await softDeleteTask(env, taskUpdateId, actor.userId);
          await logAudit(env, actor, "task_delete", "task", task.id, { title: task.title });
          return Response.json({ ok: true, task: serializeTask(task) });
        }

        const statusAction = matchUserTaskStatusAction(url.pathname);
        if (statusAction && request.method === "POST") {
          const task = await setTaskStatus(env, statusAction.id, statusAction.status, actor.userId);
          await logAudit(env, actor, `task_${statusAction.status}`, "task", task.id, { title: task.title });
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
        "PATCH /admin/tasks/<task_id>",
        "DELETE /admin/tasks/<task_id>",
        "POST /admin/tasks/<task_id>/pause",
        "POST /admin/tasks/<task_id>/resume",
        "POST /admin/tasks/<task_id>/cancel",
        "GET /admin/users",
        "PATCH /admin/users/<user_id>",
        "POST /admin/users/<user_id>/ban",
        "POST /admin/users/<user_id>/unban",
        "DELETE /admin/users/<user_id>",
        "GET /admin/settings",
        "PATCH /admin/settings",
        "GET /admin/invites",
        "POST /admin/invites",
        "DELETE /admin/invites/<invite_code>",
        "POST /admin/invites/batch-delete",
        "GET /admin/logs?result=all&type=delivery&page=1&pageSize=20",
        "POST /admin/process-due",
      ],
    },
    userApi: {
      auth: "cookie session from /auth/register or /auth/user-login",
      taskLimit: NORMAL_USER_TASK_LIMIT,
      endpoints: [
        "POST /auth/register",
        "POST /auth/user-login",
        "GET /auth/linuxdo/start",
        "GET /auth/linuxdo/callback",
        "POST /auth/linuxdo/complete",
        "GET /user/tasks?status=all&limit=20",
        "POST /user/tasks",
        "PATCH /user/tasks/<task_id>",
        "DELETE /user/tasks/<task_id>",
        "POST /user/tasks/<task_id>/pause",
        "POST /user/tasks/<task_id>/resume",
        "POST /user/tasks/<task_id>/cancel",
        "GET /user/logs?result=all&type=delivery&page=1&pageSize=20",
      ],
    },
  };
}

async function serveApp(request: Request, env: Env): Promise<Response> {
  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return new Response(
    `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>邮件铃 Mailbell</title>
</head>
<body>
  <div id="root">React app assets are not available. Run npm run build before wrangler dev/deploy.</div>
</body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

function acceptsHtml(request: Request): boolean {
  return (request.headers.get("Accept") || "").includes("text/html");
}

function isAppRoute(pathname: string): boolean {
  return ["/tasks", "/users", "/settings", "/announcement", "/logs"].includes(pathname);
}

async function processDueReminders(env: Env): Promise<ProcessingSummary> {
  const now = new Date();
  const nowIso = now.toISOString();

  const createdRunResult = await runSchedulerLoop(() => createRunsForDueTasks(env, now, nowIso), DUE_SCAN_LIMIT);
  const nagReminderResult = await runSchedulerLoop(() => createJobsForDueNagReminders(env, nowIso), NAG_SCAN_LIMIT);
  const recoveredDeliveries = await recoverStaleDeliveryJobs(env, now);
  const queuedDeliveries = await enqueuePendingDeliveryJobs(env, nowIso);
  const cleanupDeletedRows = await cleanupExpiredOperationalRows(env, now);
  const backlog = createdRunResult.backlog || nagReminderResult.backlog;

  if (backlog) {
    console.warn(
      JSON.stringify({
        event: "scheduler_backlog",
        createdRuns: createdRunResult.total,
        nagReminders: nagReminderResult.total,
        maxLoops: SCHEDULER_MAX_LOOPS,
      })
    );
  }

  return {
    createdRuns: createdRunResult.total,
    nagReminders: nagReminderResult.total,
    recoveredDeliveries,
    queuedDeliveries,
    cleanupDeletedRows,
    backlog,
  };
}

async function runSchedulerLoop(
  processBatch: () => Promise<number>,
  batchSize: number
): Promise<{ total: number; backlog: boolean }> {
  let total = 0;
  let lastBatchCount = 0;

  for (let i = 0; i < SCHEDULER_MAX_LOOPS; i += 1) {
    const count = await processBatch();
    total += count;
    lastBatchCount = count;
    if (count < batchSize) {
      break;
    }
  }

  return { total, backlog: lastBatchCount >= batchSize };
}

async function cleanupExpiredOperationalRows(env: Env, now: Date): Promise<number> {
  const cutoffIso = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(`DELETE FROM send_logs WHERE created_at_utc < ?`).bind(cutoffIso),
    env.DB.prepare(`DELETE FROM audit_logs WHERE created_at_utc < ?`).bind(cutoffIso),
    env.DB.prepare(
      `DELETE FROM email_delivery_jobs
       WHERE updated_at_utc < ?
         AND status IN ('sent', 'failed', 'dead_lettered', 'skipped')`
    ).bind(cutoffIso),
    env.DB.prepare(
      `DELETE FROM reminder_runs
       WHERE updated_at_utc < ?
         AND status IN ('completed', 'cancelled')`
    ).bind(cutoffIso),
    env.DB.prepare(
      `DELETE FROM reminder_runs
       WHERE updated_at_utc < ?
         AND status = 'open'
         AND NOT EXISTS (
           SELECT 1
           FROM tasks
           WHERE tasks.current_run_id = reminder_runs.id
         )`
    ).bind(cutoffIso),
  ]);

  return results.reduce((total, result) => total + Number(result.meta.changes ?? 0), 0);
}

export async function pingHeartbeat(env: Pick<Env, "HEARTBEAT_URL">, summary: ProcessingSummary): Promise<void> {
  if (!env.HEARTBEAT_URL) {
    return;
  }

  try {
    const url = new URL(env.HEARTBEAT_URL);
    url.searchParams.set("createdRuns", String(summary.createdRuns));
    url.searchParams.set("nagReminders", String(summary.nagReminders));
    url.searchParams.set("recoveredDeliveries", String(summary.recoveredDeliveries));
    url.searchParams.set("queuedDeliveries", String(summary.queuedDeliveries));
    url.searchParams.set("cleanupDeletedRows", String(summary.cleanupDeletedRows));
    url.searchParams.set("backlog", summary.backlog ? "1" : "0");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "personal-mail-reminder/heartbeat",
      },
    });

    if (!response.ok) {
      console.warn(
        JSON.stringify({
          event: "heartbeat_failed",
          status: response.status,
        })
      );
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "heartbeat_error",
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

async function createRunsForDueTasks(env: Env, now: Date, nowIso: string): Promise<number> {
  const { results: tasks = [] } = await env.DB.prepare(
    `SELECT *
     FROM tasks
     WHERE status = 'active'
       AND deleted_at_utc IS NULL
       AND next_due_at_utc <= ?
       AND (current_run_id IS NULL OR current_run_id = '')
     ORDER BY next_due_at_utc ASC
     LIMIT ?`
  )
    .bind(nowIso, DUE_SCAN_LIMIT)
    .all<Task>();

  let createdCount = 0;

  for (const task of tasks) {
    const runId = makeId("run");
    const [acquireResult, insertRunResult] = await env.DB.batch([
      env.DB.prepare(
        `UPDATE tasks
         SET current_run_id = ?, updated_at_utc = ?
         WHERE id = ?
           AND status = 'active'
           AND deleted_at_utc IS NULL
           AND next_due_at_utc <= ?
           AND (current_run_id IS NULL OR current_run_id = '')`
      ).bind(runId, nowIso, task.id, nowIso),
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
         )
         SELECT ?, id, next_due_at_utc, 'open', 0, NULL, ?, ?
         FROM tasks
         WHERE id = ?
           AND current_run_id = ?
           AND status = 'active'
           AND deleted_at_utc IS NULL
           AND next_due_at_utc <= ?`
      ).bind(runId, nowIso, nowIso, task.id, runId, nowIso),
    ]);

    if (acquireResult.meta.changes === 0 || insertRunResult.meta.changes === 0) {
      await env.DB.prepare(
        `UPDATE tasks
         SET current_run_id = NULL, updated_at_utc = ?
         WHERE id = ? AND current_run_id = ?`
      )
        .bind(nowIso, task.id, runId)
        .run();
      continue;
    }

    createdCount += 1;
    await createEmailDeliveryJob(env, {
      deliveryKey: buildReminderDeliveryKey(runId, "reminder", task.next_due_at_utc),
      runId,
      taskId: task.id,
      type: "reminder",
      scheduledForUtc: task.next_due_at_utc,
      nowIso,
    });
  }

  return createdCount;
}

async function createJobsForDueNagReminders(env: Env, nowIso: string): Promise<number> {
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
       AND tasks.deleted_at_utc IS NULL
       AND tasks.current_run_id = reminder_runs.id
       AND reminder_runs.next_nag_at_utc <= ?
     ORDER BY reminder_runs.next_nag_at_utc ASC
     LIMIT ?`
  )
    .bind(nowIso, NAG_SCAN_LIMIT)
    .all<TaskRunRow>();

  let createdCount = 0;

  for (const row of rows) {
    const scheduledForUtc = row.run_next_nag_at_utc ?? nowIso;
    await createEmailDeliveryJob(env, {
      deliveryKey: buildReminderDeliveryKey(row.run_id, "nag", scheduledForUtc),
      runId: row.run_id,
      taskId: row.id,
      type: "nag",
      scheduledForUtc,
      nowIso,
    });

    await env.DB.prepare(
      `UPDATE reminder_runs
       SET next_nag_at_utc = NULL,
           updated_at_utc = ?
       WHERE id = ?
         AND status = 'open'
         AND next_nag_at_utc = ?`
    )
      .bind(nowIso, row.run_id, scheduledForUtc)
      .run();

    createdCount += 1;
  }

  return createdCount;
}

async function updateRunAfterReminderDelivery(
  env: Env,
  task: TaskRunRow,
  runId: string,
  type: ReminderDeliveryType,
  sentAt: Date
): Promise<void> {
  const sentAtIso = sentAt.toISOString();

  if (hasReachedNagLimitAfterDelivery(task)) {
    await closeRunAfterMaxNagCount(env, task, runId, sentAt);
    return;
  }

  const nextNagAt = calculateNextNagAt(task, sentAt, true).toISOString();

  await env.DB.prepare(
    `UPDATE reminder_runs
     SET sent_count = sent_count + 1,
         last_sent_at_utc = ?,
         next_nag_at_utc = ?,
         updated_at_utc = ?
     WHERE id = ? AND status = 'open'`
  )
    .bind(sentAtIso, nextNagAt, sentAtIso, runId)
    .run();

  void type;
}

export function hasReachedNagLimitAfterDelivery(task: Pick<TaskRunRow, "run_sent_count" | "max_nag_count">): boolean {
  return Number(task.run_sent_count || 0) + 1 >= 1 + Number(task.max_nag_count || 0);
}

async function closeRunAfterMaxNagCount(env: Env, task: TaskRunRow, runId: string, completedAt: Date): Promise<void> {
  const completedAtIso = completedAt.toISOString();
  const nextDueAt = calculateNextDueAt(task, completedAt);
  const completedBy = "system:max_nag_count";
  const result = await env.DB.prepare(
    `UPDATE reminder_runs
     SET sent_count = sent_count + 1,
         last_sent_at_utc = ?,
         status = 'completed',
         next_nag_at_utc = NULL,
         completed_at_utc = ?,
         completed_by = ?,
         updated_at_utc = ?
     WHERE id = ?
       AND status = 'open'
       AND EXISTS (
         SELECT 1
         FROM tasks
         WHERE tasks.id = reminder_runs.task_id
           AND tasks.status = 'active'
           AND tasks.deleted_at_utc IS NULL
           AND tasks.current_run_id = reminder_runs.id
       )`
  )
    .bind(completedAtIso, completedAtIso, completedBy, completedAtIso, runId)
    .run();

  if (result.meta.changes === 0) {
    return;
  }

  if (nextDueAt) {
    await env.DB.prepare(
      `UPDATE tasks
       SET current_run_id = NULL,
           next_due_at_utc = ?,
           status = 'active',
           updated_at_utc = ?
       WHERE id = ? AND current_run_id = ?`
    )
      .bind(nextDueAt.toISOString(), completedAtIso, task.id, runId)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE tasks
       SET current_run_id = NULL,
           status = 'done',
           updated_at_utc = ?
       WHERE id = ? AND current_run_id = ?`
    )
      .bind(completedAtIso, task.id, runId)
      .run();
  }

  await logAudit(env, { type: "system", email: "system" }, "reminder_run_max_nag_reached", "task", task.id, {
    runId,
    sentCount: Number(task.run_sent_count || 0) + 1,
    maxNagCount: task.max_nag_count,
    nextDueAtUtc: nextDueAt?.toISOString() ?? null,
  });
}

export function buildReminderDeliveryKey(runId: string, type: ReminderDeliveryType, scheduledForUtc: string): string {
  return `${runId}:${type}:${scheduledForUtc}`;
}

async function createEmailDeliveryJob(
  env: Env,
  input: {
    deliveryKey: string;
    runId: string;
    taskId: string;
    type: ReminderDeliveryType;
    scheduledForUtc: string;
    nowIso: string;
  }
): Promise<boolean> {
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO email_delivery_jobs (
       delivery_key,
       run_id,
       task_id,
       type,
       scheduled_for_utc,
       status,
       attempt_count,
       created_at_utc,
       updated_at_utc
     ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`
  )
    .bind(
      input.deliveryKey,
      input.runId,
      input.taskId,
      input.type,
      input.scheduledForUtc,
      input.nowIso,
      input.nowIso
    )
    .run();

  return result.meta.changes > 0;
}

async function recoverStaleDeliveryJobs(env: Env, now: Date): Promise<number> {
  const nowIso = now.toISOString();
  const queuedStaleBeforeIso = new Date(now.getTime() - DELIVERY_QUEUED_STALE_SECONDS * 1000).toISOString();
  const sendingStaleBeforeIso = new Date(now.getTime() - DELIVERY_CLAIM_STALE_SECONDS * 1000).toISOString();
  const retryingStaleBeforeIso = new Date(now.getTime() - DELIVERY_RETRYING_STALE_SECONDS * 1000).toISOString();

  const { results: jobs = [] } = await env.DB.prepare(
    `SELECT delivery_key, status
     FROM email_delivery_jobs
     WHERE (
         status = 'queued' AND updated_at_utc <= ?
       ) OR (
         status = 'sending' AND updated_at_utc <= ?
       ) OR (
         status = 'retrying' AND updated_at_utc <= ?
       )
     ORDER BY updated_at_utc ASC
     LIMIT ?`
  )
    .bind(queuedStaleBeforeIso, sendingStaleBeforeIso, retryingStaleBeforeIso, DELIVERY_RECOVERY_LIMIT)
    .all<Pick<EmailDeliveryJob, "delivery_key" | "status">>();

  if (!jobs.length) {
    return 0;
  }

  await env.DB.batch(
    jobs.map((job) =>
      env.DB.prepare(
        `UPDATE email_delivery_jobs
         SET status = 'pending',
             last_error_message = ?,
             updated_at_utc = ?
         WHERE delivery_key = ?
           AND status = ?`
      ).bind(`recovered stale ${job.status} delivery`, nowIso, job.delivery_key, job.status)
    )
  );

  console.warn(
    JSON.stringify({
      event: "recovered_stale_delivery_jobs",
      count: jobs.length,
    })
  );

  return jobs.length;
}

async function enqueuePendingDeliveryJobs(env: Env, nowIso: string): Promise<number> {
  const { results: jobs = [] } = await env.DB.prepare(
    `SELECT *
     FROM email_delivery_jobs
     WHERE status = 'pending'
     ORDER BY scheduled_for_utc ASC, created_at_utc ASC
     LIMIT ?`
  )
    .bind(DELIVERY_ENQUEUE_LIMIT)
    .all<EmailDeliveryJob>();

  let queuedCount = 0;

  if (!env.REMINDER_QUEUE) {
    for (const job of jobs) {
      const result = await processReminderDeliveryMessage(env, toReminderDeliveryMessage(job, nowIso), 1);
      if (result !== "retry") {
        queuedCount += 1;
      }
    }
    return queuedCount;
  }

  for (const chunk of chunkArray(jobs, DELIVERY_QUEUE_BATCH_SIZE)) {
    try {
      await env.REMINDER_QUEUE.sendBatch(
        chunk.map((job) => ({
          body: toReminderDeliveryMessage(job, nowIso),
          contentType: "json" as const,
        }))
      );

      await env.DB.batch(
        chunk.map((job) =>
          env.DB.prepare(
            `UPDATE email_delivery_jobs
             SET status = 'queued',
                 queued_at_utc = ?,
                 last_error_message = NULL,
                 updated_at_utc = ?
             WHERE delivery_key = ?
               AND status = 'pending'`
          ).bind(nowIso, nowIso, job.delivery_key)
        )
      );
      queuedCount += chunk.length;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await env.DB.batch(
        chunk.map((job) =>
          env.DB.prepare(
            `UPDATE email_delivery_jobs
             SET last_error_message = ?,
                 updated_at_utc = ?
             WHERE delivery_key = ?
               AND status = 'pending'`
          ).bind(errorMessage, nowIso, job.delivery_key)
        )
      );
    }
  }

  return queuedCount;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function toReminderDeliveryMessage(job: EmailDeliveryJob, enqueuedAtUtc: string): ReminderDeliveryMessage {
  return {
    version: 1,
    deliveryKey: job.delivery_key,
    runId: job.run_id,
    taskId: job.task_id,
    type: job.type,
    scheduledForUtc: job.scheduled_for_utc,
    enqueuedAtUtc,
  };
}

async function processReminderDeliveryMessage(
  env: Env,
  body: unknown,
  queueAttempts: number
): Promise<"sent" | "already_done" | "retry"> {
  if (!isReminderDeliveryMessage(body)) {
    return "already_done";
  }

  await ensureEmailDeliveryJobFromMessage(env, body);

  const claim = await claimEmailDeliveryJob(env, body.deliveryKey);
  if (claim === "sent" || claim === "skipped" || claim === "dead_lettered") {
    return "already_done";
  }
  if (claim === "busy") {
    return "retry";
  }

  const row = await findOpenRunForDelivery(env, body.runId, body.taskId);
  if (!row) {
    await markEmailDeliveryJobSkipped(env, body.deliveryKey, "run is no longer open");
    return "already_done";
  }

  const result = await sendReminderEmail(env, row, body.runId, body.type, body.deliveryKey);
  const now = new Date();
  const nowIso = now.toISOString();

  if (!result.success) {
    await env.DB.prepare(
      `UPDATE email_delivery_jobs
       SET status = 'retrying',
           provider = ?,
           provider_message_id = ?,
           last_error_message = ?,
           updated_at_utc = ?
       WHERE delivery_key = ?
         AND status = 'sending'`
    )
      .bind(result.provider, result.providerMessageId, result.errorMessage, nowIso, body.deliveryKey)
      .run();
    console.warn(
      JSON.stringify({
        event: "reminder_delivery_failed",
        deliveryKey: body.deliveryKey,
        runId: body.runId,
        taskId: body.taskId,
        type: body.type,
        attemptCount: queueAttempts,
        error: result.errorMessage,
      })
    );
    return "retry";
  }

  await updateRunAfterReminderDelivery(env, row, body.runId, body.type, now);
  await env.DB.prepare(
    `UPDATE email_delivery_jobs
     SET status = 'sent',
         provider = ?,
         provider_message_id = ?,
         last_error_message = NULL,
         sent_at_utc = ?,
         updated_at_utc = ?
     WHERE delivery_key = ?`
  )
    .bind(result.provider, result.providerMessageId, nowIso, nowIso, body.deliveryKey)
    .run();

  void queueAttempts;
  return "sent";
}

export function isReminderDeliveryMessage(value: unknown): value is ReminderDeliveryMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.deliveryKey === "string" &&
    typeof record.runId === "string" &&
    typeof record.taskId === "string" &&
    (record.type === "reminder" || record.type === "nag") &&
    typeof record.scheduledForUtc === "string" &&
    typeof record.enqueuedAtUtc === "string"
  );
}

async function ensureEmailDeliveryJobFromMessage(env: Env, message: ReminderDeliveryMessage): Promise<void> {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO email_delivery_jobs (
       delivery_key,
       run_id,
       task_id,
       type,
       scheduled_for_utc,
       status,
       attempt_count,
       queued_at_utc,
       created_at_utc,
       updated_at_utc
     ) VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)`
  )
    .bind(
      message.deliveryKey,
      message.runId,
      message.taskId,
      message.type,
      message.scheduledForUtc,
      message.enqueuedAtUtc,
      message.enqueuedAtUtc,
      nowIso
    )
    .run();
}

async function claimEmailDeliveryJob(
  env: Env,
  deliveryKey: string
): Promise<"claimed" | "sent" | "busy" | "skipped" | "dead_lettered"> {
  const job = await env.DB.prepare(`SELECT * FROM email_delivery_jobs WHERE delivery_key = ? LIMIT 1`)
    .bind(deliveryKey)
    .first<EmailDeliveryJob>();

  if (!job) {
    return "busy";
  }
  if (job.status === "sent") {
    return "sent";
  }
  if (job.status === "skipped") {
    return "skipped";
  }
  if (job.status === "dead_lettered") {
    return "dead_lettered";
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const staleBeforeIso = new Date(now.getTime() - DELIVERY_CLAIM_STALE_SECONDS * 1000).toISOString();
  const result = await env.DB.prepare(
    `UPDATE email_delivery_jobs
     SET status = 'sending',
         attempt_count = attempt_count + 1,
         last_attempted_at_utc = ?,
         updated_at_utc = ?
     WHERE delivery_key = ?
       AND status <> 'sent'
       AND status <> 'skipped'
       AND status <> 'dead_lettered'
       AND (status <> 'sending' OR updated_at_utc <= ?)`
  )
    .bind(nowIso, nowIso, deliveryKey, staleBeforeIso)
    .run();

  return result.meta.changes > 0 ? "claimed" : "busy";
}

async function findOpenRunForDelivery(env: Env, runId: string, taskId: string): Promise<TaskRunRow | null> {
  return env.DB.prepare(
    `SELECT
       tasks.*,
       reminder_runs.id AS run_id,
       reminder_runs.due_at_utc AS run_due_at_utc,
       reminder_runs.sent_count AS run_sent_count,
       reminder_runs.next_nag_at_utc AS run_next_nag_at_utc
     FROM reminder_runs
     JOIN tasks ON tasks.id = reminder_runs.task_id
     WHERE reminder_runs.id = ?
       AND tasks.id = ?
       AND reminder_runs.status = 'open'
       AND tasks.status = 'active'
       AND tasks.deleted_at_utc IS NULL
       AND tasks.current_run_id = reminder_runs.id
     LIMIT 1`
  )
    .bind(runId, taskId)
    .first<TaskRunRow>();
}

async function markEmailDeliveryJobSkipped(env: Env, deliveryKey: string, reason: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE email_delivery_jobs
     SET status = 'skipped',
         last_error_message = ?,
         updated_at_utc = ?
     WHERE delivery_key = ?
       AND status <> 'sent'`
  )
    .bind(reason, nowIso, deliveryKey)
    .run();
}

export async function markDeadLetteredDeliveryMessages(
  env: Env,
  messages: readonly Message<ReminderDeliveryMessage>[]
): Promise<void> {
  const nowIso = new Date().toISOString();
  let deadLetteredCount = 0;
  for (const message of messages) {
    if (!isReminderDeliveryMessage(message.body)) {
      continue;
    }

    await env.DB.prepare(
      `UPDATE email_delivery_jobs
       SET status = 'dead_lettered',
           last_error_message = ?,
           updated_at_utc = ?
       WHERE delivery_key = ?
         AND status <> 'sent'`
    )
      .bind(`dead letter queue after ${message.attempts} attempts`, nowIso, message.body.deliveryKey)
      .run();
    deadLetteredCount += 1;

    await closeRunAfterDeadLetteredDelivery(env, message.body, message.attempts, nowIso);
  }

  if (deadLetteredCount > 0) {
    console.warn(
      JSON.stringify({
        event: "delivery_dead_lettered",
        count: deadLetteredCount,
      })
    );
  }
}

async function closeRunAfterDeadLetteredDelivery(
  env: Env,
  body: ReminderDeliveryMessage,
  attempts: number,
  nowIso: string
): Promise<void> {
  const row = await findOpenRunForDelivery(env, body.runId, body.taskId);
  if (!row) {
    return;
  }

  const nextDueAt = calculateNextDueAt(row, new Date(nowIso));
  const cancelResult = await env.DB.prepare(
    `UPDATE reminder_runs
     SET status = 'cancelled',
         next_nag_at_utc = NULL,
         updated_at_utc = ?
     WHERE id = ?
       AND status = 'open'
       AND EXISTS (
         SELECT 1
         FROM tasks
         WHERE tasks.id = reminder_runs.task_id
           AND tasks.status = 'active'
           AND tasks.deleted_at_utc IS NULL
           AND tasks.current_run_id = reminder_runs.id
       )`
  )
    .bind(nowIso, body.runId)
    .run();

  if (cancelResult.meta.changes === 0) {
    return;
  }

  if (nextDueAt) {
    await env.DB.prepare(
      `UPDATE tasks
       SET current_run_id = NULL,
           next_due_at_utc = ?,
           status = 'active',
           updated_at_utc = ?
       WHERE id = ? AND current_run_id = ?`
    )
      .bind(nextDueAt.toISOString(), nowIso, row.id, body.runId)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE tasks
       SET current_run_id = NULL,
           status = 'paused',
           updated_at_utc = ?
       WHERE id = ? AND current_run_id = ?`
    )
      .bind(nowIso, row.id, body.runId)
      .run();
  }

  await logAudit(env, { type: "system", email: "system" }, "reminder_run_dead_lettered", "task", row.id, {
    runId: body.runId,
    deliveryKey: body.deliveryKey,
    deliveryType: body.type,
    attempts,
    nextDueAtUtc: nextDueAt?.toISOString() ?? null,
  });
}

function isDeadLetterQueue(queueName: string): boolean {
  return queueName.endsWith("-dlq");
}

function calculateQueueRetryDelaySeconds(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(DELIVERY_RETRY_BASE_SECONDS * 2 ** exponent, DELIVERY_RETRY_MAX_SECONDS);
}

export function calculateNextNagAt(task: Pick<Task, "nag_interval_minutes">, sentAt: Date, success: boolean): Date {
  return addMinutes(sentAt, success ? task.nag_interval_minutes : FAILED_SEND_RETRY_MINUTES);
}

async function sendReminderEmail(
  env: Env,
  task: Task,
  runId: string,
  type: ReminderDeliveryType,
  idempotencyKey: string
): Promise<EmailSendResult> {
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
    idempotencyKey,
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
       AND tasks.status = 'active'
       AND tasks.deleted_at_utc IS NULL
       AND tasks.current_run_id = reminder_runs.id
     LIMIT 1`
  )
    .bind(runId)
    .first<TaskRunRow>();

  if (!row) {
    return;
  }

  if (!sameEmailAddress(parsed.from, row.recipient_email)) {
    console.warn(
      JSON.stringify({
        event: "inbound_reply_sender_mismatch",
        runId,
        from: parsed.from,
        expected: row.recipient_email,
      })
    );
    await logAudit(env, { type: "system", email: "system" }, "inbound_reply_sender_mismatch", "task", row.id, {
      runId,
      from: parsed.from,
      expected: row.recipient_email,
    });
    return;
  }

  const completedAt = new Date();
  const completedAtIso = completedAt.toISOString();
  const completedBy = parsed.from || message.from || "";
  const nextDueAt = calculateNextDueAt(row, completedAt);

  const completionResult = await env.DB.prepare(
    `UPDATE reminder_runs
     SET status = 'completed',
         completed_at_utc = ?,
         completed_by = ?,
         updated_at_utc = ?
     WHERE id = ?
       AND status = 'open'
       AND EXISTS (
         SELECT 1
         FROM tasks
         WHERE tasks.id = reminder_runs.task_id
           AND tasks.status = 'active'
           AND tasks.deleted_at_utc IS NULL
           AND tasks.current_run_id = reminder_runs.id
       )`
  )
    .bind(completedAtIso, completedBy, completedAtIso, runId)
    .run();

  if (completionResult.meta.changes === 0) {
    return;
  }

  if (nextDueAt) {
    await env.DB.prepare(
      `UPDATE tasks
       SET current_run_id = NULL,
           next_due_at_utc = ?,
           status = 'active',
           updated_at_utc = ?
       WHERE id = ? AND current_run_id = ?`
    )
      .bind(nextDueAt.toISOString(), completedAtIso, row.id, runId)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE tasks
       SET current_run_id = NULL,
           status = 'done',
           updated_at_utc = ?
       WHERE id = ? AND current_run_id = ?`
    )
      .bind(completedAtIso, row.id, runId)
      .run();
  }

  await logAudit(env, { type: "system", email: "system" }, "task_completed_by_email", "task", row.id, {
    runId,
    completedBy,
  });

  const completionEmailResult = await sendCompletionEmail(env, row, runId, completedAt, nextDueAt);
  if (completionEmailResult.success) {
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
): Promise<EmailSendResult> {
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

  if (task.recurrence_end_at_utc) {
    const endAt = new Date(task.recurrence_end_at_utc);
    if (!Number.isNaN(endAt.getTime()) && next > endAt) {
      return null;
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
  const maxNagCount =
    readOptionalNonNegativeInteger(
      record,
      ["maxNagCount", "max_nag_count", "nagMaxCount", "nag_max_count"],
      "maxNagCount"
    ) ?? DEFAULT_MAX_NAG_COUNT;
  const recurrence = readOptionalRecord(record, ["recurrence"]);
  const recurrenceType = resolveRecurrenceType(record, recurrence);
  const recurrenceAnchor = resolveRecurrenceAnchor(record, recurrence);
  const recurrenceIntervalMinutes = resolveRecurrenceIntervalMinutes(record, recurrence, recurrenceType);
  const dueAt = resolveAdminDueAt(record, timezone, now);
  const recurrenceEndAt = resolveRecurrenceEndAt(record, recurrence, timezone, recurrenceType);
  const id = options.id ?? readOptionalString(record, ["id"]) ?? makeId("task");

  if (!isValidTaskId(id)) {
    throw new AdminInputError("id must contain only letters, numbers, underscores, and hyphens");
  }

  if (!isValidEmail(recipientEmail)) {
    throw new AdminInputError("recipientEmail must be a valid email address");
  }
  assertMaxCharacters(title, TASK_TITLE_MAX_CHARS, "title");
  assertMaxCharacters(body, TASK_BODY_MAX_CHARS, "body");
  assertMaxCharacters(timezone, TASK_TIMEZONE_MAX_CHARS, "timezone");
  assertMaxInteger(nagIntervalMinutes, TASK_MAX_INTERVAL_MINUTES, "nagIntervalMinutes");
  assertMaxInteger(maxNagCount, TASK_MAX_NAG_COUNT, "maxNagCount");
  if (recurrenceIntervalMinutes !== null) {
    assertMaxInteger(recurrenceIntervalMinutes, TASK_MAX_INTERVAL_MINUTES, "recurrence.intervalMinutes");
  }
  if (recurrenceEndAt && recurrenceEndAt <= dueAt) {
    throw new AdminInputError("recurrenceEndAt must be after the first reminder time");
  }

  return {
    id,
    user_id: null,
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
    recurrence_end_at_utc: recurrenceEndAt?.toISOString() ?? null,
    nag_interval_minutes: nagIntervalMinutes,
    max_nag_count: maxNagCount,
    current_run_id: null,
    created_at_utc: nowIso,
    updated_at_utc: nowIso,
    deleted_at_utc: null,
  };
}

export function buildTaskUpdateFromAdminInput(
  input: unknown,
  options: { timezone?: string; now?: Date } = {}
): TaskUpdateInput {
  const parsed = buildTaskFromAdminInput(input, {
    timezone: options.timezone,
    now: options.now,
    id: "task_update",
  });

  return {
    recipient_email: parsed.recipient_email,
    title: parsed.title,
    body: parsed.body,
    timezone: parsed.timezone,
    first_due_at_utc: parsed.first_due_at_utc,
    next_due_at_utc: parsed.next_due_at_utc,
    recurrence_type: parsed.recurrence_type,
    recurrence_interval_minutes: parsed.recurrence_interval_minutes,
    recurrence_anchor: parsed.recurrence_anchor,
    recurrence_end_at_utc: parsed.recurrence_end_at_utc,
    nag_interval_minutes: parsed.nag_interval_minutes,
    max_nag_count: parsed.max_nag_count,
    updated_at_utc: parsed.updated_at_utc,
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
    idempotencyKey?: string;
  }
): Promise<EmailSendResult> {
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
          ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: env.FROM_EMAIL,
          to: [input.to],
          reply_to: [env.REPLY_EMAIL],
          subject: input.subject,
          text: input.text,
        }),
      });

      const responseText = await readLimitedText(response, MAX_PROVIDER_RESPONSE_BYTES, "Email provider response is too large");
      if (!response.ok) {
        const responsePayload = safeJsonParse(responseText) as { message?: string; name?: string } | null;
        console.warn(
          JSON.stringify({
            event: "resend_send_failed",
            status: response.status,
            error: responsePayload?.message ?? responsePayload?.name ?? responseText.slice(0, 200),
          })
        );
        throw new Error(`Email provider rejected request with status ${response.status}`);
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
       delivery_key,
       created_at_utc
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      input.idempotencyKey ?? null,
      createdAt
    )
    .run();

  await logAudit(
    env,
    { type: "system", email: "system" } as AuthenticatedActor,
    success ? "email_send_success" : "email_send_failed",
    "task",
    input.taskId,
    {
      runId: input.runId,
      type: input.type,
      to: input.to,
      subject: input.subject,
      deliveryKey: input.idempotencyKey ?? null,
      error: errorMessage,
    }
  );

  return {
    success,
    provider,
    providerMessageId,
    errorMessage,
  };
}

async function logAudit(
  env: Env,
  actor: AuthenticatedActor,
  action: string,
  targetType: string | null = null,
  targetId: string | null = null,
  details: unknown = null
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (
         actor_type,
         actor_id,
         actor_email,
         action,
         target_type,
         target_id,
         details,
         created_at_utc
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        actor.type,
        actor.userId ?? null,
        actor.email ?? null,
        action,
        targetType,
        targetId,
        details === null || details === undefined ? null : JSON.stringify(details),
        new Date().toISOString()
      )
      .run();
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "audit_log_failed",
        action,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

async function listAuditLogs(
  env: Env,
  url: URL,
  scope: "admin" | "user",
  userId?: string
) {
  const pagination = readPagination(url, 20);
  const action = url.searchParams.get("action");
  const since = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const clauses = ["created_at_utc >= ?"];
  const params: unknown[] = [since];

  if (action && action !== "all") {
    clauses.push("action = ?");
    params.push(action);
  }

  if (scope === "user") {
    clauses.push("actor_type = 'user'");
    clauses.push("actor_id = ?");
    clauses.push("action NOT LIKE 'admin_%'");
    params.push(userId || "");
  }

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM audit_logs
     WHERE ${clauses.join(" AND ")}`
  )
    .bind(...params)
    .first<{ count: number }>();

  params.push(pagination.pageSize, pagination.offset);

  const { results = [] } = await env.DB.prepare(
    `SELECT *
     FROM audit_logs
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at_utc DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...params)
    .all<{
      id: number;
      actor_type: string;
      actor_id: string | null;
      actor_email: string | null;
      action: string;
      target_type: string | null;
      target_id: string | null;
      details: string | null;
      created_at_utc: string;
    }>();

  return makePagedResult(
    results.map((row) => ({
      id: row.id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      actorEmail: row.actor_email,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details ? safeJsonParse(row.details) : null,
      createdAtUtc: row.created_at_utc,
    })),
    pagination,
    Number(countRow?.count ?? 0)
  );
}

async function listReminderExecutionLogs(
  env: Env,
  url: URL,
  scope: "admin" | "user",
  userId?: string
) {
  const pagination = readPagination(url, 20);
  const result = url.searchParams.get("result");
  const type = url.searchParams.get("type");
  const since = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const clauses = ["send_logs.created_at_utc >= ?"];
  const params: unknown[] = [since];

  if (result === "success" || result === "failed") {
    clauses.push("send_logs.success = ?");
    params.push(result === "success" ? 1 : 0);
  }

  if (type === "delivery") {
    clauses.push("send_logs.type IN ('reminder', 'nag')");
  } else if (type === "reminder" || type === "nag" || type === "completion") {
    clauses.push("send_logs.type = ?");
    params.push(type);
  }

  if (scope === "user") {
    clauses.push("tasks.user_id = ?");
    params.push(userId || "");
  }

  const from = `FROM send_logs
    LEFT JOIN tasks ON tasks.id = send_logs.task_id
    LEFT JOIN users ON users.id = tasks.user_id
    LEFT JOIN reminder_runs ON reminder_runs.id = send_logs.run_id`;

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     ${from}
     WHERE ${clauses.join(" AND ")}`
  )
    .bind(...params)
    .first<{ count: number }>();

  const queryParams = [...params, pagination.pageSize, pagination.offset];
  const { results = [] } = await env.DB.prepare(
    `SELECT
       send_logs.id,
       send_logs.run_id,
       send_logs.task_id,
       send_logs.type,
       send_logs.recipient_email,
       send_logs.subject,
       send_logs.provider,
       send_logs.provider_message_id,
       send_logs.success,
       send_logs.error_message,
       send_logs.created_at_utc,
       tasks.title AS task_title,
       users.email AS user_email,
       reminder_runs.due_at_utc AS due_at_utc,
       reminder_runs.status AS run_status
     ${from}
     WHERE ${clauses.join(" AND ")}
     ORDER BY send_logs.created_at_utc DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...queryParams)
    .all<{
      id: number;
      run_id: string | null;
      task_id: string | null;
      type: "reminder" | "nag" | "completion";
      recipient_email: string;
      subject: string;
      provider: string;
      provider_message_id: string | null;
      success: number;
      error_message: string | null;
      created_at_utc: string;
      task_title: string | null;
      user_email: string | null;
      due_at_utc: string | null;
      run_status: string | null;
    }>();

  return makePagedResult(
    results.map((row) => ({
      id: row.id,
      runId: row.run_id,
      taskId: row.task_id,
      taskTitle: row.task_title,
      ownerEmail: row.user_email,
      type: row.type,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      provider: row.provider,
      providerMessageId: row.provider_message_id,
      success: Boolean(row.success),
      status: row.success ? "success" : "failed",
      errorMessage: row.error_message,
      dueAtUtc: row.due_at_utc,
      runStatus: row.run_status,
      createdAtUtc: row.created_at_utc,
    })),
    pagination,
    Number(countRow?.count ?? 0)
  );
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

function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

function sameEmailAddress(left: string, right: string): boolean {
  return normalizeEmailAddress(left) === normalizeEmailAddress(right);
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

async function readLimitedText(source: Request | Response, maxBytes: number, tooLargeMessage: string): Promise<string> {
  const contentLength = source.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new AdminInputError(tooLargeMessage, 413);
    }
  }

  if (!source.body) {
    return "";
  }

  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new AdminInputError(tooLargeMessage, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(combined);
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AdminInputError("Content-Type must be application/json");
  }

  const bodyText = await readLimitedText(request, MAX_JSON_BODY_BYTES, "Request body is too large");
  if (!bodyText.trim()) {
    throw new AdminInputError("Request body must be valid JSON");
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new AdminInputError("Request body must be valid JSON");
  }
}

async function getAppSettings(env: Env): Promise<AppSettings> {
  const { results = [] } = await env.DB.prepare(`SELECT key, value FROM app_settings`).all<{
    key: string;
    value: string;
  }>();
  const values = new Map(results.map((row) => [row.key, row.value]));

  return {
    allowRegistration: values.get("allow_registration") !== "false",
    requireInvite: values.get("require_invite") === "true",
    announcementText: values.get("announcement_text") || "",
  };
}

async function getPublicSettings(env: Env) {
  return toPublicSettings(await getAppSettings(env));
}

function toPublicSettings(settings: AppSettings) {
  return {
    allowRegistration: settings.allowRegistration,
    requireInvite: settings.requireInvite,
    announcementText: settings.announcementText,
  };
}

async function updateAppSettingsFromInput(env: Env, input: unknown): Promise<AppSettings> {
  const record = requireRecord(input, "Request body");
  const existing = await getAppSettings(env);
  const next: AppSettings = {
    allowRegistration: readOptionalBoolean(record, ["allowRegistration", "allow_registration"]) ?? existing.allowRegistration,
    requireInvite: readOptionalBoolean(record, ["requireInvite", "require_invite"]) ?? existing.requireInvite,
    announcementText: readOptionalStringAllowEmpty(record, ["announcementText", "announcement_text"]) ?? existing.announcementText,
  };
  const nowIso = new Date().toISOString();

  await env.DB.batch([
    upsertSetting(env, "allow_registration", String(next.allowRegistration), nowIso),
    upsertSetting(env, "require_invite", String(next.requireInvite), nowIso),
    upsertSetting(env, "announcement_text", next.announcementText, nowIso),
  ]);

  return next;
}

function upsertSetting(env: Env, key: string, value: string, updatedAt: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at_utc)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_utc = excluded.updated_at_utc`
  ).bind(key, value, updatedAt);
}

function assertRegistrationAllowed(settings: AppSettings, inviteCode: string | null): void {
  if (!settings.allowRegistration) {
    throw new AdminInputError("当前暂未开放注册", 403);
  }

  if (settings.requireInvite && !inviteCode) {
    throw new AdminInputError("邀请码必填", 403);
  }
}

async function insertTask(env: Env, task: Task): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO tasks (
       id,
       user_id,
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
       recurrence_end_at_utc,
       nag_interval_minutes,
       max_nag_count,
       current_run_id,
       created_at_utc,
       updated_at_utc,
       deleted_at_utc
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      task.id,
      task.user_id,
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
      task.recurrence_end_at_utc,
      task.nag_interval_minutes,
      task.max_nag_count,
      task.current_run_id,
      task.created_at_utc,
      task.updated_at_utc,
      task.deleted_at_utc
    )
    .run();
}

async function insertTaskForUser(env: Env, task: Task, userId: string): Promise<void> {
  const activeTaskCount = await countUserLimitedTasks(env, userId);
  assertNormalUserTaskLimit(activeTaskCount);
  await insertTask(env, task);
}

async function getUserTaskUsage(env: Env, userId: string): Promise<TaskUsage> {
  return {
    used: await countUserLimitedTasks(env, userId),
    limit: NORMAL_USER_TASK_LIMIT,
  };
}

async function countUserLimitedTasks(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM tasks
     WHERE user_id = ?
       AND deleted_at_utc IS NULL`
  )
    .bind(userId)
    .first<{ count: number }>();

  return Number(row?.count ?? 0);
}

export function assertNormalUserTaskLimit(currentTaskCount: number): void {
  if (currentTaskCount >= NORMAL_USER_TASK_LIMIT) {
    throw new AdminInputError(`普通用户最多只能创建 ${NORMAL_USER_TASK_LIMIT} 个任务`, 403);
  }
}

async function softDeleteTask(env: Env, id: string, userId?: string): Promise<Task> {
  if (!isValidTaskId(id)) {
    throw new AdminInputError("Task not found", 404);
  }

  const existing = userId ? await findTaskById(env, id, userId) : await findAdminTaskById(env, id);
  if (!existing || existing.deleted_at_utc) {
    throw new AdminInputError("Task not found", 404);
  }

  const deletedAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  statements.push(
    env.DB.prepare(
      `UPDATE reminder_runs
       SET status = 'cancelled',
           next_nag_at_utc = NULL,
           updated_at_utc = ?
       WHERE task_id = ? AND status = 'open'`
    ).bind(deletedAt, existing.id)
  );

  statements.push(
    env.DB.prepare(
      `UPDATE tasks
       SET status = 'cancelled',
           current_run_id = NULL,
           deleted_at_utc = ?,
           updated_at_utc = ?
       WHERE id = ?`
    ).bind(deletedAt, deletedAt, id)
  );

  await env.DB.batch(statements);

  const task = userId ? await findTaskById(env, id, userId, true) : await findAdminTaskById(env, id, true);
  if (!task) {
    throw new AdminInputError("Task not found", 404);
  }

  return task;
}

async function listAdminTasks(env: Env, url: URL) {
  const status = url.searchParams.get("status") || "active";
  const limit = readListLimit(url.searchParams.get("limit"));
  const select = `SELECT
       tasks.*,
       users.email AS user_email,
       reminder_runs.status AS run_status,
       reminder_runs.sent_count AS run_sent_count,
       reminder_runs.next_nag_at_utc AS run_next_nag_at_utc,
       reminder_runs.completed_at_utc AS run_completed_at_utc
    FROM tasks
     LEFT JOIN users ON users.id = tasks.user_id
     LEFT JOIN reminder_runs ON reminder_runs.id = tasks.current_run_id`;
  const order = `ORDER BY
       CASE WHEN tasks.status = 'active' THEN 0 ELSE 1 END,
       tasks.next_due_at_utc ASC
     LIMIT ?`;

  if (status === "all") {
    const { results = [] } = await env.DB.prepare(`${select} WHERE tasks.deleted_at_utc IS NULL AND tasks.user_id IS NULL ${order}`)
      .bind(limit)
      .all<AdminTaskRow>();
    return results.map(serializeTaskRow);
  }

  if (!isTaskStatus(status)) {
    throw new AdminInputError("status must be active, done, paused, cancelled, or all");
  }

  const { results = [] } = await env.DB.prepare(`${select} WHERE tasks.deleted_at_utc IS NULL AND tasks.user_id IS NULL AND tasks.status = ? ${order}`)
    .bind(status, limit)
    .all<AdminTaskRow>();

  return results.map(serializeTaskRow);
}

async function listUserTasks(env: Env, url: URL, userId: string) {
  const status = url.searchParams.get("status") || "active";
  const limit = readListLimit(url.searchParams.get("limit"));
  const select = `SELECT
       tasks.*,
       users.email AS user_email,
       reminder_runs.status AS run_status,
       reminder_runs.sent_count AS run_sent_count,
       reminder_runs.next_nag_at_utc AS run_next_nag_at_utc,
       reminder_runs.completed_at_utc AS run_completed_at_utc
     FROM tasks
     LEFT JOIN users ON users.id = tasks.user_id
     LEFT JOIN reminder_runs ON reminder_runs.id = tasks.current_run_id
     WHERE tasks.user_id = ?
       AND tasks.deleted_at_utc IS NULL`;
  const order = `ORDER BY
       CASE WHEN tasks.status = 'active' THEN 0 ELSE 1 END,
       tasks.next_due_at_utc ASC
     LIMIT ?`;

  if (status === "all") {
    const { results = [] } = await env.DB.prepare(`${select} ${order}`).bind(userId, limit).all<AdminTaskRow>();
    return results.map(serializeTaskRow);
  }

  if (!isTaskStatus(status)) {
    throw new AdminInputError("status must be active, done, paused, cancelled, or all");
  }

  const { results = [] } = await env.DB.prepare(`${select} AND tasks.status = ? ${order}`)
    .bind(userId, status, limit)
    .all<AdminTaskRow>();

  return results.map(serializeTaskRow);
}

async function setTaskStatus(env: Env, id: string, status: TaskStatus, userId?: string): Promise<Task> {
  const updatedAt = new Date().toISOString();
  const ownership = userId ? " AND user_id = ?" : " AND user_id IS NULL";
  const taskParams = userId ? [status, status, updatedAt, id, userId] : [status, status, updatedAt, id];
  const statements: D1PreparedStatement[] = [];

  if (status !== "active") {
    statements.push(
      env.DB.prepare(
        `UPDATE reminder_runs
         SET status = 'cancelled',
             next_nag_at_utc = NULL,
             updated_at_utc = ?
         WHERE task_id = ? AND status = 'open'`
      ).bind(updatedAt, id)
    );
  }

  statements.push(
    env.DB.prepare(
      `UPDATE tasks
       SET status = ?,
           current_run_id = CASE WHEN ? = 'active' THEN current_run_id ELSE NULL END,
           updated_at_utc = ?
       WHERE id = ?${ownership}`
    ).bind(...taskParams)
  );

  await env.DB.batch(statements);

  const task = userId ? await findTaskById(env, id, userId) : await findAdminTaskById(env, id);
  if (!task) {
    throw new AdminInputError("Task not found", 404);
  }

  return task;
}

async function updateTaskFromAdminInput(env: Env, id: string, input: unknown, userId?: string): Promise<Task> {
  if (!isValidTaskId(id)) {
    throw new AdminInputError("Task not found", 404);
  }

  const existing = userId ? await findTaskById(env, id, userId) : await findAdminTaskById(env, id);
  if (!existing) {
    throw new AdminInputError("Task not found", 404);
  }

  const update = buildTaskUpdateFromAdminInput(input, {
    timezone: env.TIMEZONE,
    now: new Date(),
  });
  const statements: D1PreparedStatement[] = [];

  statements.push(
    env.DB.prepare(
      `UPDATE reminder_runs
       SET status = 'cancelled',
           next_nag_at_utc = NULL,
           updated_at_utc = ?
       WHERE task_id = ? AND status = 'open'`
    ).bind(update.updated_at_utc, existing.id)
  );

  statements.push(
    env.DB.prepare(
      `UPDATE tasks
       SET recipient_email = ?,
           title = ?,
           body = ?,
           timezone = ?,
           first_due_at_utc = ?,
           next_due_at_utc = ?,
           recurrence_type = ?,
           recurrence_interval_minutes = ?,
           recurrence_anchor = ?,
           recurrence_end_at_utc = ?,
           nag_interval_minutes = ?,
           max_nag_count = ?,
           current_run_id = NULL,
           updated_at_utc = ?
       WHERE id = ?`
    ).bind(
      update.recipient_email,
      update.title,
      update.body,
      update.timezone,
      update.first_due_at_utc,
      update.next_due_at_utc,
      update.recurrence_type,
      update.recurrence_interval_minutes,
      update.recurrence_anchor,
      update.recurrence_end_at_utc,
      update.nag_interval_minutes,
      update.max_nag_count,
      update.updated_at_utc,
      id
    )
  );

  await env.DB.batch(statements);

  const task = userId ? await findTaskById(env, id, userId) : await findAdminTaskById(env, id);
  if (!task) {
    throw new AdminInputError("Task not found", 404);
  }

  return task;
}

async function findTaskById(env: Env, id: string, userId?: string, includeDeleted = false): Promise<Task | null> {
  const deletedFilter = includeDeleted ? "" : " AND deleted_at_utc IS NULL";
  if (userId) {
    return env.DB.prepare(`SELECT * FROM tasks WHERE id = ? AND user_id = ?${deletedFilter} LIMIT 1`)
      .bind(id, userId)
      .first<Task>();
  }

  return env.DB.prepare(`SELECT * FROM tasks WHERE id = ?${deletedFilter} LIMIT 1`).bind(id).first<Task>();
}

async function findAdminTaskById(env: Env, id: string, includeDeleted = false): Promise<Task | null> {
  const deletedFilter = includeDeleted ? "" : " AND deleted_at_utc IS NULL";
  return env.DB.prepare(`SELECT * FROM tasks WHERE id = ? AND user_id IS NULL${deletedFilter} LIMIT 1`)
    .bind(id)
    .first<Task>();
}

function matchTaskUpdatePath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/tasks\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function matchUserTaskUpdatePath(pathname: string): string | null {
  const match = pathname.match(/^\/user\/tasks\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
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

function matchUserTaskStatusAction(pathname: string): { id: string; status: TaskStatus } | null {
  const match = pathname.match(/^\/user\/tasks\/([^/]+)\/(pause|resume|cancel)$/);
  if (!match) {
    return null;
  }

  const action = match[2];
  return {
    id: decodeURIComponent(match[1]),
    status: action === "resume" ? "active" : action === "pause" ? "paused" : "cancelled",
  };
}

function matchAdminUserPath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/users\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function matchAdminUserAction(pathname: string): { id: string; action: "ban" | "unban" } | null {
  const match = pathname.match(/^\/admin\/users\/([^/]+)\/(ban|unban)$/);
  if (!match) {
    return null;
  }

  return {
    id: decodeURIComponent(match[1]),
    action: match[2] as "ban" | "unban",
  };
}

function matchAdminInvitePath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/invites\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function serializeTaskRow(row: AdminTaskRow) {
  const task = serializeTask(row);

  return {
    ...task,
    userEmail: row.user_email,
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
    userId: task.user_id,
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
    recurrenceEndAtUtc: task.recurrence_end_at_utc,
    nagIntervalMinutes: task.nag_interval_minutes,
    maxNagCount: task.max_nag_count,
    currentRunId: task.current_run_id,
    createdAtUtc: task.created_at_utc,
    updatedAtUtc: task.updated_at_utc,
    deletedAtUtc: task.deleted_at_utc,
  };
}

async function listAdminUsers(env: Env, url: URL) {
  const pagination = readPagination(url, 20);
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM users`).first<{ count: number }>();
  const { results = [] } = await env.DB.prepare(
    `SELECT
       users.*,
       COUNT(tasks.id) AS task_count
     FROM users
     LEFT JOIN tasks ON tasks.user_id = users.id AND tasks.deleted_at_utc IS NULL
     GROUP BY users.id
     ORDER BY users.created_at_utc DESC
     LIMIT ? OFFSET ?`
  )
    .bind(pagination.pageSize, pagination.offset)
    .all<User & { task_count: number }>();

  return makePagedResult(
    results.map((user) => ({
      ...serializeUser(user),
      taskCount: Number(user.task_count || 0),
      taskLimit: NORMAL_USER_TASK_LIMIT,
    })),
    pagination,
    Number(totalRow?.count ?? 0)
  );
}

function serializeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    linuxdoId: user.linuxdo_id,
    linuxdoUsername: user.linuxdo_username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    lastLoginAtUtc: user.last_login_at_utc,
    bannedAtUtc: user.banned_at_utc,
    bannedReason: user.banned_reason,
    createdAtUtc: user.created_at_utc,
    updatedAtUtc: user.updated_at_utc,
  };
}

async function updateAdminUser(env: Env, id: string, input: unknown): Promise<User> {
  const existing = await findUserById(env, id);
  if (!existing) {
    throw new AdminInputError("User not found", 404);
  }

  const record = requireRecord(input, "Request body");
  const email = readOptionalString(record, ["email"])?.toLowerCase() ?? existing.email;
  const displayName = readOptionalString(record, ["displayName", "display_name"]) ?? existing.display_name ?? "";
  const status = readOptionalString(record, ["status"]) ?? existing.status;

  if (!isValidEmail(email)) {
    throw new AdminInputError("email must be a valid email address");
  }

  if (status !== "active" && status !== "banned") {
    throw new AdminInputError("status must be active or banned");
  }

  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE users
     SET email = ?,
         display_name = ?,
         status = ?,
         updated_at_utc = ?
     WHERE id = ?`
  )
    .bind(email, displayName || null, status, updatedAt, id)
    .run();

  if (status === "banned" && existing.status !== "banned") {
    await invalidateUserTasks(env, id, updatedAt);
  }

  const user = await findUserById(env, id);
  if (!user) {
    throw new AdminInputError("User not found", 404);
  }

  return user;
}

async function banUser(env: Env, id: string, input: unknown): Promise<User> {
  const existing = await findUserById(env, id);
  if (!existing) {
    throw new AdminInputError("User not found", 404);
  }

  const record = input ? requireRecord(input, "Request body") : {};
  const reason = readOptionalString(record, ["reason", "bannedReason", "banned_reason"]) ?? "";
  const nowIso = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE users
     SET status = 'banned',
         banned_at_utc = ?,
         banned_reason = ?,
         updated_at_utc = ?
     WHERE id = ?`
  )
    .bind(nowIso, reason, nowIso, id)
    .run();

  await invalidateUserTasks(env, id, nowIso);

  const user = await findUserById(env, id);
  if (!user) {
    throw new AdminInputError("User not found", 404);
  }

  return user;
}

async function unbanUser(env: Env, id: string): Promise<User> {
  const existing = await findUserById(env, id);
  if (!existing) {
    throw new AdminInputError("User not found", 404);
  }

  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE users
     SET status = 'active',
         banned_at_utc = NULL,
         banned_reason = NULL,
         updated_at_utc = ?
     WHERE id = ?`
  )
    .bind(nowIso, id)
    .run();

  const user = await findUserById(env, id);
  if (!user) {
    throw new AdminInputError("User not found", 404);
  }

  return user;
}

async function invalidateUserTasks(env: Env, userId: string, updatedAt: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE reminder_runs
       SET status = 'cancelled',
           next_nag_at_utc = NULL,
           updated_at_utc = ?
       WHERE status = 'open'
         AND task_id IN (SELECT id FROM tasks WHERE user_id = ?)`
    ).bind(updatedAt, userId),
    env.DB.prepare(
      `UPDATE tasks
       SET status = 'cancelled',
           current_run_id = NULL,
           updated_at_utc = ?
       WHERE user_id = ?
         AND deleted_at_utc IS NULL`
    ).bind(updatedAt, userId),
  ]);
}

async function deleteUserAndOwnedData(env: Env, userId: string) {
  const user = await findUserById(env, userId);
  if (!user) {
    throw new AdminInputError("User not found", 404);
  }

  const deleted = {
    email: user.email,
    taskCount: await countUserLimitedTasks(env, userId),
  };

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM send_logs WHERE task_id IN (SELECT id FROM tasks WHERE user_id = ?)`).bind(userId),
    env.DB.prepare(`DELETE FROM reminder_runs WHERE task_id IN (SELECT id FROM tasks WHERE user_id = ?)`).bind(userId),
    env.DB.prepare(`DELETE FROM tasks WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM audit_logs WHERE actor_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId),
  ]);

  return deleted;
}

async function findUserById(env: Env, id: string): Promise<User | null> {
  return env.DB.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).bind(id).first<User>();
}

async function listInviteCodes(env: Env, url: URL) {
  const pagination = readPagination(url, 20);
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM invite_codes`).first<{ count: number }>();
  const { results = [] } = await env.DB.prepare(
    `SELECT invite_codes.*, users.email AS used_by_email
     FROM invite_codes
     LEFT JOIN users ON users.id = invite_codes.used_by
     ORDER BY invite_codes.created_at_utc DESC
     LIMIT ? OFFSET ?`
  )
    .bind(pagination.pageSize, pagination.offset)
    .all<{
    code: string;
    created_by: string | null;
    created_at_utc: string;
    expires_at_utc: string | null;
    used_by: string | null;
    used_by_email: string | null;
    used_at_utc: string | null;
  }>();

  return makePagedResult(
    results.map((row) => ({
      code: row.code,
      createdBy: row.created_by,
      createdAtUtc: row.created_at_utc,
      expiresAtUtc: row.expires_at_utc,
      expired: Boolean(row.expires_at_utc && row.expires_at_utc <= new Date().toISOString()),
      usedBy: row.used_by,
      usedByEmail: row.used_by_email,
      usedAtUtc: row.used_at_utc,
    })),
    pagination,
    Number(totalRow?.count ?? 0)
  );
}

async function createInviteCodes(env: Env, actor: AuthenticatedActor, input: unknown) {
  const record = input ? requireRecord(input, "Request body") : {};
  const count = readOptionalPositiveInteger(record, ["count"], "count") ?? 1;
  if (count > 100) {
    throw new AdminInputError("count must be 100 or less");
  }

  const expiresAt = readOptionalString(record, ["expiresAt", "expires_at", "expiresAtUtc", "expires_at_utc"]);
  const expiresAtUtc = expiresAt ? parseInviteExpiresAt(expiresAt) : null;
  const nowIso = new Date().toISOString();
  const invites = Array.from({ length: count }, () => ({
    code: makeInviteCode(),
    createdBy: actor.email || actor.userId || "admin",
    createdAtUtc: nowIso,
    expiresAtUtc,
    expired: false,
    usedBy: null,
    usedByEmail: null,
    usedAtUtc: null,
  }));

  await env.DB.batch(
    invites.map((invite) =>
      env.DB.prepare(
        `INSERT INTO invite_codes (code, created_by, created_at_utc, expires_at_utc)
         VALUES (?, ?, ?, ?)`
      ).bind(invite.code, invite.createdBy, invite.createdAtUtc, invite.expiresAtUtc)
    )
  );

  return invites;
}

async function deleteInviteCode(env: Env, code: string): Promise<void> {
  const existing = await env.DB.prepare(`SELECT used_by FROM invite_codes WHERE code = ? LIMIT 1`)
    .bind(code)
    .first<{ used_by: string | null }>();
  if (!existing) {
    throw new AdminInputError("Invite code not found", 404);
  }
  if (existing.used_by) {
    throw new AdminInputError("已使用的邀请码不能删除", 409);
  }

  await env.DB.prepare(`DELETE FROM invite_codes WHERE code = ?`).bind(code).run();
}

async function deleteInviteCodesFromInput(env: Env, input: unknown) {
  const record = requireRecord(input, "Request body");
  const codesValue = record.codes;
  if (!Array.isArray(codesValue)) {
    throw new AdminInputError("codes must be an array");
  }
  const codes = codesValue
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  if (!codes.length) {
    throw new AdminInputError("codes is required");
  }
  if (codes.length > 100) {
    throw new AdminInputError("codes must contain 100 or fewer items");
  }
  const uniqueCodes = Array.from(new Set(codes));

  const placeholders = uniqueCodes.map(() => "?").join(", ");
  const { results: existingCodes = [] } = await env.DB.prepare(
    `SELECT code, used_by
     FROM invite_codes
     WHERE code IN (${placeholders})`
  )
    .bind(...uniqueCodes)
    .all<{ code: string; used_by: string | null }>();

  const deletableCodes = existingCodes.filter((row) => !row.used_by).map((row) => row.code);
  if (deletableCodes.length) {
    await env.DB.batch(
      deletableCodes.map((code) =>
        env.DB.prepare(`DELETE FROM invite_codes WHERE code = ? AND used_by IS NULL`).bind(code)
      )
    );
  }

  return { deleted: deletableCodes.length, skipped: codes.length - deletableCodes.length };
}

function parseInviteExpiresAt(value: string): string {
  const normalized = value.trim();
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new AdminInputError("expiresAt must be a valid date");
  }
  if (date <= new Date()) {
    throw new AdminInputError("expiresAt must be in the future");
  }

  return date.toISOString();
}

async function assertInviteCodeAvailable(env: Env, settings: AppSettings, code: string | null): Promise<void> {
  assertRegistrationAllowed(settings, code);
  if (!settings.requireInvite) {
    return;
  }

  const invite = await env.DB.prepare(`SELECT used_by, expires_at_utc FROM invite_codes WHERE code = ? LIMIT 1`)
    .bind(code)
    .first<{ used_by: string | null; expires_at_utc: string | null }>();

  if (!invite || invite.used_by) {
    throw new AdminInputError("邀请码不正确或已被使用", 403);
  }
  if (invite.expires_at_utc && invite.expires_at_utc <= new Date().toISOString()) {
    throw new AdminInputError("邀请码已过期", 403);
  }
}

async function consumeInviteCode(env: Env, settings: AppSettings, code: string | null, userId: string): Promise<void> {
  if (!settings.requireInvite) {
    return;
  }

  const result = await env.DB.prepare(
    `UPDATE invite_codes
     SET used_by = ?,
         used_at_utc = ?
     WHERE code = ?
       AND used_by IS NULL
       AND (expires_at_utc IS NULL OR expires_at_utc > ?)`
  )
    .bind(userId, new Date().toISOString(), code, new Date().toISOString())
    .run();
  const changes = Number((result.meta as { changes?: number } | undefined)?.changes ?? 0);
  if (changes < 1) {
    throw new AdminInputError("邀请码不正确或已被使用", 403);
  }
}

function makeInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
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
    throw new AdminInputError(
      `dueAt without an explicit timezone currently requires "${DEFAULT_TIMEZONE}"; include an explicit offset such as 2026-06-07T20:00:00+08:00`
    );
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

function resolveRecurrenceEndAt(
  record: Record<string, unknown>,
  recurrence: Record<string, unknown> | null,
  timezone: string,
  recurrenceType: RecurrenceType
): Date | null {
  if (recurrenceType === "none") {
    return null;
  }

  const value =
    readOptionalString(recurrence, ["endAt", "end_at", "endAtUtc", "end_at_utc"]) ??
    readOptionalString(record, ["recurrenceEndAt", "recurrence_end_at", "recurrenceEndAtUtc", "recurrence_end_at_utc"]);

  return value ? parseAdminDueAt(value, timezone) : null;
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

function countCharacters(value: string): number {
  return Array.from(value).length;
}

function assertMaxCharacters(value: string, maxCharacters: number, displayName: string): void {
  if (countCharacters(value) > maxCharacters) {
    throw new AdminInputError(`${displayName} must be ${maxCharacters} characters or fewer`);
  }
}

function assertMaxInteger(value: number, maxValue: number, displayName: string): void {
  if (value > maxValue) {
    throw new AdminInputError(`${displayName} must be ${maxValue} or less`);
  }
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

function readOptionalStringAllowEmpty(record: Record<string, unknown> | null, names: string[]): string | null {
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

    return value.trim();
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

function readOptionalNonNegativeInteger(
  record: Record<string, unknown>,
  names: string[],
  displayName: string
): number | null {
  for (const name of names) {
    if (!(name in record)) {
      continue;
    }

    const value = record[name];
    const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    if (!Number.isInteger(number) || number < 0) {
      throw new AdminInputError(`${displayName} must be a non-negative integer`);
    }

    return number;
  }

  return null;
}

function readOptionalBoolean(record: Record<string, unknown>, names: string[]): boolean | null {
  for (const name of names) {
    if (!(name in record)) {
      continue;
    }

    const value = record[name];
    if (typeof value !== "boolean") {
      throw new AdminInputError(`${name} must be a boolean`);
    }

    return value;
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

function readPagination(url: URL, defaultPageSize = 20): Pagination {
  const pageValue = url.searchParams.get("page") || "1";
  const pageSizeValue = url.searchParams.get("pageSize") || url.searchParams.get("limit") || String(defaultPageSize);
  const page = Number(pageValue);
  const pageSize = Number(pageSizeValue);

  if (!Number.isInteger(page) || page <= 0) {
    throw new AdminInputError("page must be a positive integer");
  }

  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new AdminInputError("pageSize must be a positive integer");
  }

  const cappedPageSize = Math.min(pageSize, MAX_LIST_LIMIT);
  return {
    page,
    pageSize: cappedPageSize,
    offset: (page - 1) * cappedPageSize,
  };
}

function makePagedResult<T>(items: T[], pagination: Pagination, total: number) {
  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    hasPrev: pagination.page > 1,
    hasNext: pagination.offset + items.length < total,
  };
}

function hasExplicitTimezone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function isValidEmail(value: string): boolean {
  if (value.length > 254 || value.includes("..")) {
    return false;
  }

  const parts = value.split("@");
  if (parts.length !== 2) {
    return false;
  }

  const [localPart, domain] = parts;
  if (!localPart || localPart.length > 64 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)) {
    return false;
  }

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) {
    return false;
  }

  return labels[labels.length - 1].length >= 2;
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

async function handleUserRegister(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    return Response.json({ ok: false, error: "ADMIN_TOKEN is not configured" }, { status: 500 });
  }

  const input = requireRecord(await readJsonBody(request), "Request body");
  const email = normalizeEmail(readRequiredString(input, ["email"], "email"));
  const password = readRequiredString(input, ["password"], "password");
  const inviteCode = readOptionalString(input, ["inviteCode", "invite_code"]);
  const remember = input.remember === true;
  const settings = await getAppSettings(env);

  validateUserCredentials(email, password);
  await assertInviteCodeAvailable(env, settings, inviteCode);

  const existing = await findUserByEmail(env, email);
  if (existing) {
    throw new AdminInputError("该邮箱已注册", 409);
  }

  const nowIso = new Date().toISOString();
  const user: User = {
    id: makeId("user"),
    email,
    ...(await hashPassword(password)),
    status: "active",
    linuxdo_id: null,
    linuxdo_username: null,
    display_name: null,
    avatar_url: null,
    last_login_at_utc: nowIso,
    banned_at_utc: null,
    banned_reason: null,
    created_at_utc: nowIso,
    updated_at_utc: nowIso,
  };

  await env.DB.prepare(
    `INSERT INTO users (
       id,
       email,
       password_hash,
       password_salt,
       status,
       last_login_at_utc,
       created_at_utc,
       updated_at_utc
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      user.id,
      user.email,
      user.password_hash,
      user.password_salt,
      user.status,
      user.last_login_at_utc,
      user.created_at_utc,
      user.updated_at_utc
    )
    .run();
  await consumeInviteCode(env, settings, inviteCode, user.id);

  const maxAge = remember ? REMEMBER_SESSION_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS;
  const cookie = await createUserSessionCookie(request, env, user, maxAge);

  await logAudit(env, { type: "user", userId: user.id, email: user.email }, "auth_register", "user", user.id);

  return Response.json(
    { ok: true },
    {
      status: 201,
      headers: {
        "Set-Cookie": cookie,
      },
    }
  );
}

async function handleUserLogin(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    return Response.json({ ok: false, error: "ADMIN_TOKEN is not configured" }, { status: 500 });
  }

  const input = requireRecord(await readJsonBody(request), "Request body");
  const email = normalizeEmail(readRequiredString(input, ["email"], "email"));
  const password = readRequiredString(input, ["password"], "password");
  const remember = input.remember === true;
  const user = await findUserByEmail(env, email);

  if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
    return Response.json({ ok: false, error: "邮箱或密码不正确" }, { status: 401 });
  }

  if (user.status === "banned") {
    return Response.json({ ok: false, error: "账号已被封禁" }, { status: 403 });
  }

  await markUserLogin(env, user.id);
  const maxAge = remember ? REMEMBER_SESSION_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS;
  const cookie = await createUserSessionCookie(request, env, user, maxAge);
  await logAudit(env, { type: "user", userId: user.id, email: user.email }, "auth_login", "user", user.id);

  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": cookie,
      },
    }
  );
}

async function handleLinuxDoStart(request: Request, env: Env): Promise<Response> {
  const clientId = requireLinuxDoClientId(env);
  const url = new URL(request.url);
  const inviteCode = url.searchParams.get("inviteCode")?.trim() || "";

  const state = await createSignedOAuthState(env, {
    exp: Date.now() + 10 * 60 * 1000,
    inviteCode,
  });
  const redirect = new URL(LINUXDO_AUTHORIZE_URL);
  redirect.searchParams.set("response_type", "code");
  redirect.searchParams.set("client_id", clientId);
  redirect.searchParams.set("redirect_uri", linuxDoRedirectUri(request));
  redirect.searchParams.set("state", state);

  return Response.redirect(redirect.toString(), 302);
}

async function handleLinuxDoCallback(request: Request, env: Env): Promise<Response> {
  const clientId = requireLinuxDoClientId(env);
  const clientSecret = requireLinuxDoClientSecret(env);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    throw new AdminInputError("Linux.do OAuth callback is missing code or state");
  }

  const statePayload = await verifySignedOAuthState(env, state);
  const token = await exchangeLinuxDoCode(request, clientId, clientSecret, code);
  const profile = await fetchLinuxDoUser(token);
  const existing = await findExistingLinuxDoUser(env, profile);

  if (existing) {
    const user = await updateAndReturnLinuxDoUser(env, existing.id, profile);
    return completeLinuxDoLogin(request, env, user);
  }

  const settings = await getAppSettings(env);
  if (!settings.allowRegistration) {
    return redirectToLoginWithParams(request, { linuxdoError: "当前暂未开放注册" });
  }

  if (settings.requireInvite && !statePayload.inviteCode) {
    const pending = await createOAuthPending(env, "linuxdo", profile);
    return redirectToLoginWithParams(request, { linuxdoPending: pending.token });
  }

  const user = await createLinuxDoUser(env, profile, statePayload.inviteCode || "");
  return completeLinuxDoLogin(request, env, user);
}

async function handleLinuxDoComplete(request: Request, env: Env): Promise<Response> {
  const input = requireRecord(await readJsonBody(request), "Request body");
  const pendingToken = readRequiredString(input, ["pendingToken", "pending_token"], "pendingToken");
  const inviteCode = readRequiredString(input, ["inviteCode", "invite_code"], "inviteCode");
  const pending = await readOAuthPending(env, pendingToken, "linuxdo");
  const profile = safeJsonParse(pending.profile_json) as LinuxDoUser | null;

  if (!profile?.id) {
    throw new AdminInputError("OAuth session is invalid", 400);
  }

  const existing = await findExistingLinuxDoUser(env, profile);
  if (existing) {
    await deleteOAuthPending(env, pendingToken);
    const user = await updateAndReturnLinuxDoUser(env, existing.id, profile);
    return completeLinuxDoLogin(request, env, user);
  }

  const user = await createLinuxDoUser(env, profile, inviteCode);
  await deleteOAuthPending(env, pendingToken);

  return completeLinuxDoLogin(request, env, user);
}

async function completeLinuxDoLogin(request: Request, env: Env, user: User): Promise<Response> {
  if (user.status === "banned") {
    return Response.json({ ok: false, error: "账号已被封禁" }, { status: 403 });
  }

  await markUserLogin(env, user.id);
  await logAudit(env, { type: "user", userId: user.id, email: user.email }, "auth_linuxdo_login", "user", user.id, {
    linuxdoId: user.linuxdo_id,
  });

  const cookie = await createUserSessionCookie(request, env, user, REMEMBER_SESSION_MAX_AGE_SECONDS);
  if (request.method === "POST") {
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
  }

  return new Response(null, { status: 302, headers: { "Location": "/", "Set-Cookie": cookie } });
}

async function exchangeLinuxDoCode(
  request: Request,
  clientId: string,
  clientSecret: string,
  code: string
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: linuxDoRedirectUri(request),
  });
  const response = await fetch(LINUXDO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": createOAuthBasicAuthorization(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Linux.do token exchange failed: ${response.status} ${text}`);
  }

  const payload = safeJsonParse(text) as { access_token?: string } | null;
  if (!payload?.access_token) {
    throw new Error("Linux.do token response is missing access_token");
  }

  return payload.access_token;
}

async function fetchLinuxDoUser(accessToken: string): Promise<LinuxDoUser> {
  const response = await fetch(LINUXDO_USER_URL, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Linux.do user request failed: ${response.status} ${text}`);
  }

  const profile = safeJsonParse(text) as LinuxDoUser | null;
  if (!profile?.id) {
    throw new Error("Linux.do user response is missing id");
  }

  return profile;
}

async function findExistingLinuxDoUser(env: Env, profile: LinuxDoUser): Promise<User | null> {
  const linuxdoId = String(profile.id);
  const byLinuxDo = await findUserByLinuxDoId(env, linuxdoId);
  if (byLinuxDo) {
    return byLinuxDo;
  }

  return profile.email ? findUserByEmail(env, normalizeEmail(profile.email)) : null;
}

async function updateAndReturnLinuxDoUser(env: Env, userId: string, profile: LinuxDoUser): Promise<User> {
  const avatarUrl = normalizeLinuxDoAvatar(profile.avatar_url || profile.avatar_template || null);
  await updateLinuxDoProfile(env, userId, profile, avatarUrl, new Date().toISOString());

  const user = await findUserById(env, userId);
  if (!user) {
    throw new AdminInputError("User not found", 404);
  }
  if (user.status === "banned") {
    throw new AdminInputError("账号已被封禁", 403);
  }

  return user;
}

async function createLinuxDoUser(env: Env, profile: LinuxDoUser, inviteCode: string): Promise<User> {
  const linuxdoId = String(profile.id);
  const nowIso = new Date().toISOString();
  const email = profile.email ? normalizeEmail(profile.email) : `linuxdo-${linuxdoId}@linuxdo.local`;
  const avatarUrl = normalizeLinuxDoAvatar(profile.avatar_url || profile.avatar_template || null);

  const settings = await getAppSettings(env);
  await assertInviteCodeAvailable(env, settings, inviteCode);

  const user: User = {
    id: makeId("user"),
    email,
    password_hash: "",
    password_salt: "",
    status: "active",
    linuxdo_id: linuxdoId,
    linuxdo_username: profile.username || null,
    display_name: profile.name || profile.username || null,
    avatar_url: avatarUrl,
    last_login_at_utc: nowIso,
    banned_at_utc: null,
    banned_reason: null,
    created_at_utc: nowIso,
    updated_at_utc: nowIso,
  };

  await env.DB.prepare(
    `INSERT INTO users (
       id,
       email,
       password_hash,
       password_salt,
       status,
       linuxdo_id,
       linuxdo_username,
       display_name,
       avatar_url,
       last_login_at_utc,
       created_at_utc,
       updated_at_utc
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      user.id,
      user.email,
      user.password_hash,
      user.password_salt,
      user.status,
      user.linuxdo_id,
      user.linuxdo_username,
      user.display_name,
      user.avatar_url,
      user.last_login_at_utc,
      user.created_at_utc,
      user.updated_at_utc
    )
    .run();
  await consumeInviteCode(env, settings, inviteCode, user.id);

  return user;
}

async function createOAuthPending(env: Env, provider: string, profile: LinuxDoUser) {
  const token = makeId("oauth");
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO oauth_pending (
       token,
       provider,
       profile_json,
       expires_at_utc,
       created_at_utc
     ) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(token, provider, JSON.stringify(profile), expiresAt, nowIso)
    .run();

  return {
    token,
    provider,
    expiresAtUtc: expiresAt,
    createdAtUtc: nowIso,
  };
}

async function readOAuthPending(env: Env, token: string, provider: string) {
  const pending = await env.DB.prepare(
    `SELECT *
     FROM oauth_pending
     WHERE token = ?
       AND provider = ?
     LIMIT 1`
  )
    .bind(token, provider)
    .first<{
      token: string;
      provider: string;
      profile_json: string;
      expires_at_utc: string;
      created_at_utc: string;
    }>();

  if (!pending || pending.expires_at_utc <= new Date().toISOString()) {
    throw new AdminInputError("OAuth session has expired", 400);
  }

  return pending;
}

async function deleteOAuthPending(env: Env, token: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM oauth_pending WHERE token = ?`).bind(token).run();
}

function redirectToLoginWithParams(request: Request, params: Record<string, string>): Response {
  const redirect = new URL("/", request.url);
  for (const [key, value] of Object.entries(params)) {
    redirect.searchParams.set(key, value);
  }

  return Response.redirect(redirect.toString(), 302);
}

async function updateLinuxDoProfile(
  env: Env,
  userId: string,
  profile: LinuxDoUser,
  avatarUrl: string | null,
  updatedAt: string
): Promise<void> {
  await env.DB.prepare(
    `UPDATE users
     SET linuxdo_id = ?,
         linuxdo_username = ?,
         display_name = COALESCE(?, display_name),
         avatar_url = ?,
         last_login_at_utc = ?,
         updated_at_utc = ?
     WHERE id = ?`
  )
    .bind(
      String(profile.id),
      profile.username || null,
      profile.name || profile.username || null,
      avatarUrl,
      updatedAt,
      updatedAt,
      userId
    )
    .run();
}

async function createSignedOAuthState(env: Env, payload: { exp: number; inviteCode: string }): Promise<string> {
  const encoded = encodeBase64UrlString(JSON.stringify(payload));
  const signature = await signSessionPayload(env.ADMIN_TOKEN || "", encoded);
  return `${encoded}.${signature}`;
}

async function verifySignedOAuthState(env: Env, value: string): Promise<{ exp: number; inviteCode: string }> {
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !(await verifySessionSignature(env.ADMIN_TOKEN || "", payload, signature))) {
    throw new AdminInputError("Invalid OAuth state", 400);
  }

  const parsed = safeJsonParse(decodeBase64UrlToString(payload)) as { exp?: number; inviteCode?: string } | null;
  if (typeof parsed?.exp !== "number" || parsed.exp <= Date.now()) {
    throw new AdminInputError("OAuth state has expired", 400);
  }

  return {
    exp: parsed.exp,
    inviteCode: parsed.inviteCode || "",
  };
}

function linuxDoRedirectUri(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/auth/linuxdo/callback`;
}

function requireLinuxDoClientId(env: Env): string {
  const clientId = env.LINUXDO_CLIENT_ID?.trim();
  if (!clientId) {
    throw new AdminInputError("LINUXDO_CLIENT_ID is not configured", 500);
  }

  return clientId;
}

function requireLinuxDoClientSecret(env: Env): string {
  const clientSecret = env.LINUXDO_CLIENT_SECRET?.trim();
  if (!clientSecret) {
    throw new AdminInputError("LINUXDO_CLIENT_SECRET is not configured", 500);
  }

  return clientSecret;
}

function createOAuthBasicAuthorization(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

function normalizeLinuxDoAvatar(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return `https://linux.do${value.replace("{size}", "96")}`;
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

async function getAuthenticatedActor(request: Request, env: Env): Promise<AuthenticatedActor | null> {
  if (await hasValidAdminSession(request, env)) {
    return { type: "admin", email: "admin" };
  }

  return getValidUserSession(request, env);
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

async function getValidUserSession(request: Request, env: Env): Promise<AuthenticatedActor | null> {
  if (!env.ADMIN_TOKEN) {
    return null;
  }

  const value = readCookie(request, USER_SESSION_COOKIE);
  if (!value) {
    return null;
  }

  const parts = value.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts;
  if (!(await verifySessionSignature(env.ADMIN_TOKEN, payload, signature))) {
    return null;
  }

  const parsed = safeJsonParse(decodeBase64UrlToString(payload)) as {
    exp?: number;
    uid?: string;
    email?: string;
  } | null;

  if (
    typeof parsed?.exp !== "number" ||
    parsed.exp <= Date.now() ||
    !parsed.uid ||
    !isValidEmail(parsed.email || "")
  ) {
    return null;
  }

  const user = await findUserById(env, parsed.uid);
  if (!user || user.status !== "active") {
    return null;
  }

  return { type: "user", userId: parsed.uid, email: user.email };
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

async function createUserSessionCookie(
  request: Request,
  env: Env,
  user: Pick<User, "id" | "email">,
  maxAgeSeconds: number
): Promise<string> {
  const payload = encodeBase64UrlString(
    JSON.stringify({
      exp: Date.now() + maxAgeSeconds * 1000,
      uid: user.id,
      email: user.email,
    })
  );
  const signature = await signSessionPayload(env.ADMIN_TOKEN || "", payload);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return `${USER_SESSION_COOKIE}=${payload}.${signature}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}

function clearSessionCookie(request: Request, name: string): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}

function validateUserCredentials(email: string, password: string): void {
  if (!isValidEmail(email)) {
    throw new AdminInputError("email must be a valid email address");
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new AdminInputError(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
}

async function findUserByEmail(env: Env, email: string): Promise<User | null> {
  return env.DB.prepare(`SELECT * FROM users WHERE email = ? LIMIT 1`).bind(email).first<User>();
}

async function findUserByLinuxDoId(env: Env, linuxdoId: string): Promise<User | null> {
  return env.DB.prepare(`SELECT * FROM users WHERE linuxdo_id = ? LIMIT 1`).bind(linuxdoId).first<User>();
}

async function markUserLogin(env: Env, userId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE users
     SET last_login_at_utc = ?,
         updated_at_utc = ?
     WHERE id = ?`
  )
    .bind(nowIso, nowIso, userId)
    .run();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function hashPassword(password: string, salt = makePasswordSalt()): Promise<{
  password_hash: string;
  password_salt: string;
}> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: decodeBase64UrlToBytes(salt),
      iterations: PASSWORD_HASH_ITERATIONS,
    },
    key,
    256
  );

  return {
    password_hash: encodeBase64UrlBytes(new Uint8Array(bits)),
    password_salt: salt,
  };
}

async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const { password_hash: actualHash } = await hashPassword(password, salt);
  return constantTimeEqual(actualHash, expectedHash);
}

function makePasswordSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return encodeBase64UrlBytes(bytes);
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

function decodeBase64UrlToBytes(value: string): Uint8Array {
  const decoded = decodeBase64UrlToString(value);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
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
