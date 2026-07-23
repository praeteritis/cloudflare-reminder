import { AdminInputError, isTaskStatus, isValidTaskId, readListLimit } from "./shared";
import { DEFAULT_TIMEZONE } from "./constants";
import { buildTaskUpdateFromAdminInput } from "./taskInput";
import { validateNotificationChannelIds } from "./notificationChannels";
import type { AdminTaskRow, Env, Task, TaskStatus, TaskUsage } from "./types";

export async function insertTask(env: Env, task: Task): Promise<void> {
  await validateNotificationChannelIds(env, parseTaskNotificationChannelIds(task.notification_channel_ids));
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
       deleted_at_utc,
       notification_channel_ids
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      task.deleted_at_utc,
      task.notification_channel_ids
    )
    .run();
}

export async function insertTaskForUser(env: Env, task: Task, userId: string): Promise<void> {
  void userId;
  await insertTask(env, task);
}

export async function getUserTaskUsage(env: Env, userId: string): Promise<TaskUsage> {
  return {
    used: await countUserLimitedTasks(env, userId),
  };
}

export async function countUserLimitedTasks(env: Env, userId: string): Promise<number> {
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

export async function softDeleteTask(env: Env, id: string, userId?: string): Promise<Task> {
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

export async function listAdminTasks(env: Env, url: URL) {
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

export async function listUserTasks(env: Env, url: URL, userId: string) {
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

export async function setTaskStatus(env: Env, id: string, status: TaskStatus, userId?: string): Promise<Task> {
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

export async function updateTaskFromAdminInput(env: Env, id: string, input: unknown, userId?: string): Promise<Task> {
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
  await validateNotificationChannelIds(env, update.notification_channel_ids);
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
           updated_at_utc = ?,
           notification_channel_ids = ?
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
      JSON.stringify(update.notification_channel_ids),
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

export async function findTaskById(env: Env, id: string, userId?: string, includeDeleted = false): Promise<Task | null> {
  const deletedFilter = includeDeleted ? "" : " AND deleted_at_utc IS NULL";
  if (userId) {
    return env.DB.prepare(`SELECT * FROM tasks WHERE id = ? AND user_id = ?${deletedFilter} LIMIT 1`)
      .bind(id, userId)
      .first<Task>();
  }

  return env.DB.prepare(`SELECT * FROM tasks WHERE id = ?${deletedFilter} LIMIT 1`).bind(id).first<Task>();
}

export async function findAdminTaskById(env: Env, id: string, includeDeleted = false): Promise<Task | null> {
  const deletedFilter = includeDeleted ? "" : " AND deleted_at_utc IS NULL";
  return env.DB.prepare(`SELECT * FROM tasks WHERE id = ? AND user_id IS NULL${deletedFilter} LIMIT 1`)
    .bind(id)
    .first<Task>();
}

export function matchTaskUpdatePath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/tasks\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function matchUserTaskUpdatePath(pathname: string): string | null {
  const match = pathname.match(/^\/user\/tasks\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function matchTaskStatusAction(pathname: string): { id: string; status: TaskStatus } | null {
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

export function matchUserTaskStatusAction(pathname: string): { id: string; status: TaskStatus } | null {
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

export function serializeTask(task: Task) {
  return {
    id: task.id,
    userId: task.user_id,
    recipientEmail: task.recipient_email,
    title: task.title,
    body: task.body,
    status: task.status,
    timezone: DEFAULT_TIMEZONE,
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
    notificationChannelIds: parseTaskNotificationChannelIds(task.notification_channel_ids),
  };
}

export function parseTaskNotificationChannelIds(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || "");
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") && parsed.length
      ? Array.from(new Set(parsed))
      : ["email"];
  } catch {
    return ["email"];
  }
}
