import { AdminInputError, isValidEmail, makePagedResult, readOptionalString, readPagination, requireRecord } from "./shared";
import { countUserLimitedTasks } from "./tasks";
import type { Env, User } from "./types";

export function matchAdminUserPath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/users\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function matchAdminUserAction(pathname: string): { id: string; action: "ban" | "unban" } | null {
  const match = pathname.match(/^\/admin\/users\/([^/]+)\/(ban|unban)$/);
  if (!match) {
    return null;
  }

  return {
    id: decodeURIComponent(match[1]),
    action: match[2] as "ban" | "unban",
  };
}

export async function listAdminUsers(env: Env, url: URL) {
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
    })),
    pagination,
    Number(totalRow?.count ?? 0)
  );
}

export function serializeUser(user: User) {
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

export async function updateAdminUser(env: Env, id: string, input: unknown): Promise<User> {
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

export async function banUser(env: Env, id: string, input: unknown): Promise<User> {
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

export async function unbanUser(env: Env, id: string): Promise<User> {
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

export async function deleteUserAndOwnedData(env: Env, userId: string) {
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

export async function findUserById(env: Env, id: string): Promise<User | null> {
  return env.DB.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).bind(id).first<User>();
}
