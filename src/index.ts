import {
  ADMIN_SESSION_COOKIE,
  USER_SESSION_COOKIE,
} from "./constants";
import {
  clearSessionCookie,
  jsonError,
  readJsonBody,
} from "./shared";
import {
  calculateQueueRetryDelaySeconds,
  handleInboundReply,
  isDeadLetterQueue,
  markDeadLetteredDeliveryMessages,
  pingHeartbeat,
  processDueReminders,
  processReminderDeliveryMessage,
} from "./delivery";
import { buildTaskFromAdminInput } from "./taskInput";
import {
  errorMessageForLog,
  handleClientErrorReport,
  listAuditLogs,
  listReminderExecutionLogs,
  logAudit,
  logRequestError,
} from "./observability";
import {
  createInviteCodes,
  deleteInviteCode,
  deleteInviteCodesFromInput,
  listInviteCodes,
  matchAdminInvitePath,
} from "./invites";
import {
  createNotificationChannel,
  deleteNotificationChannel,
  listNotificationChannels,
  matchNotificationChannelPath,
  updateNotificationChannel,
} from "./notificationChannels";
import {
  getUserTaskUsage,
  insertTask,
  insertTaskForUser,
  listAdminTasks,
  listUserTasks,
  matchTaskStatusAction,
  matchTaskUpdatePath,
  matchUserTaskStatusAction,
  matchUserTaskUpdatePath,
  serializeTask,
  setTaskStatus,
  softDeleteTask,
  updateTaskFromAdminInput,
} from "./tasks";
import {
  banUser,
  deleteUserAndOwnedData,
  listAdminUsers,
  matchAdminUserAction,
  matchAdminUserPath,
  serializeUser,
  unbanUser,
  updateAdminUser,
} from "./users";
import { getAppSettings, getPublicSettings, toPublicSettings, updateAppSettingsFromInput } from "./settings";
import {
  authorizeAdminRequest,
  getAuthenticatedActor,
  handleAdminLogin,
  handleLinuxDoCallback,
  handleLinuxDoComplete,
  handleLinuxDoStart,
  handleUserLogin,
  handleUserRegister,
} from "./auth";
import type { AuthenticatedActor, Env, InboundEmailMessage, ReminderDeliveryMessage } from "./types";

export { extractRunId, formatInTimezone, getFirstMeaningfulLine } from "./shared";
export {
  buildReminderDeliveryKey,
  calculateNextDueAt,
  calculateNextNagAt,
  hasReachedNagLimitAfterDelivery,
  isReminderDeliveryMessage,
  markDeadLetteredDeliveryMessages,
  pingHeartbeat,
} from "./delivery";
export { buildTaskFromAdminInput, buildTaskUpdateFromAdminInput } from "./taskInput";

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      processDueReminders(env)
        .then((summary) => pingHeartbeat(env, summary))
        .catch((error) => {
          console.warn(
            JSON.stringify({
              event: "scheduled_reminder_error",
              error: errorMessageForLog(error),
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
            error: errorMessageForLog(error),
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
            hasFrom: Boolean(message.from),
            hasTo: Boolean(message.to),
            error: errorMessageForLog(error),
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
        await logRequestError(env, request, null, error);
        return jsonError(error);
      }
    }

    if (url.pathname === "/auth/user-login" && request.method === "POST") {
      try {
        return await handleUserLogin(request, env);
      } catch (error) {
        await logRequestError(env, request, null, error);
        return jsonError(error);
      }
    }

    if (url.pathname === "/auth/register" && request.method === "POST") {
      try {
        return await handleUserRegister(request, env);
      } catch (error) {
        await logRequestError(env, request, null, error);
        return jsonError(error);
      }
    }

    if (url.pathname === "/auth/linuxdo/start" && request.method === "GET") {
      try {
        return await handleLinuxDoStart(request, env);
      } catch (error) {
        await logRequestError(env, request, null, error);
        return jsonError(error);
      }
    }

    if (url.pathname === "/auth/linuxdo/callback" && request.method === "GET") {
      try {
        return await handleLinuxDoCallback(request, env);
      } catch (error) {
        await logRequestError(env, request, null, error);
        return jsonError(error);
      }
    }

    if (url.pathname === "/auth/linuxdo/complete" && request.method === "POST") {
      try {
        return await handleLinuxDoComplete(request, env);
      } catch (error) {
        await logRequestError(env, request, null, error);
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

    if (url.pathname === "/client-error" && request.method === "POST") {
      return handleClientErrorReport(request, env, getAuthenticatedActor);
    }

    if (url.pathname === "/notification-channels" && request.method === "GET") {
      const actor = await getAuthenticatedActor(request, env);
      if (!actor) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      return Response.json({ ok: true, channels: await listNotificationChannels(env, false) });
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

        if (url.pathname === "/admin/notification-channels" && request.method === "GET") {
          return Response.json({ ok: true, channels: await listNotificationChannels(env, true) });
        }

        if (url.pathname === "/admin/notification-channels" && request.method === "POST") {
          const channel = await createNotificationChannel(env, await readJsonBody(request));
          await logAudit(env, actor, "notification_channel_create", "notification_channel", channel.id, {
            name: channel.name, type: channel.type,
          });
          return Response.json({ ok: true, channel }, { status: 201 });
        }

        const notificationChannelId = matchNotificationChannelPath(url.pathname);
        if (notificationChannelId && request.method === "PATCH") {
          const channel = await updateNotificationChannel(env, notificationChannelId, await readJsonBody(request));
          await logAudit(env, actor, "notification_channel_update", "notification_channel", channel.id, {
            name: channel.name, type: channel.type, enabled: channel.enabled,
          });
          return Response.json({ ok: true, channel });
        }

        if (notificationChannelId && request.method === "DELETE") {
          await deleteNotificationChannel(env, notificationChannelId);
          await logAudit(env, actor, "notification_channel_delete", "notification_channel", notificationChannelId);
          return Response.json({ ok: true });
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

        if (url.pathname === "/admin/audit-logs" && request.method === "GET") {
          const page = await listAuditLogs(env, url, "admin", undefined);
          return Response.json({ ok: true, auditLogs: page.items, page });
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
        await logRequestError(env, request, actor, error);
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
        await logRequestError(env, request, actor, error);
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
        "GET /admin/audit-logs?action=all&page=1&pageSize=20",
        "POST /admin/process-due",
      ],
    },
    userApi: {
      auth: "cookie session from /auth/register or /auth/user-login",
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
        "POST /client-error",
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
