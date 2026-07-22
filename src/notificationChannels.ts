import { AdminInputError, makeId, readOptionalBoolean, readOptionalString, readRequiredString, requireRecord } from "./shared";
import type { Env, NotificationChannel, NotificationChannelType } from "./types";

const CHANNEL_TYPES = new Set<NotificationChannelType>([
  "bark", "gotify", "pushdeer", "pushplus", "telegram", "dingtalk", "wecom", "feishu", "webhook",
]);

export const BUILTIN_EMAIL_CHANNEL = {
  id: "email",
  name: "邮件",
  type: "email" as const,
  enabled: true,
  builtIn: true,
  config: {},
};

export async function listNotificationChannels(env: Env, includeConfig = false) {
  const { results = [] } = await env.DB.prepare(
    `SELECT * FROM notification_channels ORDER BY enabled DESC, name ASC`
  ).all<NotificationChannel>();
  const visible = includeConfig ? results : results.filter((row) => Boolean(row.enabled));
  return [BUILTIN_EMAIL_CHANNEL, ...visible.map((row) => serializeChannel(row, includeConfig))];
}

export async function validateNotificationChannelIds(env: Env, ids: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(ids));
  const customIds = uniqueIds.filter((id) => id !== "email");
  if (!uniqueIds.length) {
    throw new AdminInputError("Select at least one notification channel");
  }
  if (!customIds.length) return;
  const placeholders = customIds.map(() => "?").join(",");
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM notification_channels WHERE enabled = 1 AND id IN (${placeholders})`
  ).bind(...customIds).first<{ count: number }>();
  if (Number(row?.count || 0) !== customIds.length) {
    throw new AdminInputError("One or more notification channels are unavailable");
  }
}

export async function createNotificationChannel(env: Env, input: unknown) {
  const parsed = parseChannelInput(input);
  const now = new Date().toISOString();
  const row: NotificationChannel = {
    id: makeId("channel"),
    name: parsed.name,
    type: parsed.type,
    config_json: JSON.stringify(parsed.config),
    enabled: parsed.enabled ? 1 : 0,
    created_at_utc: now,
    updated_at_utc: now,
  };
  await env.DB.prepare(
    `INSERT INTO notification_channels (id, name, type, config_json, enabled, created_at_utc, updated_at_utc)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(row.id, row.name, row.type, row.config_json, row.enabled, now, now).run();
  return serializeChannel(row, true);
}

export async function updateNotificationChannel(env: Env, id: string, input: unknown) {
  const existing = await findNotificationChannel(env, id);
  if (!existing) throw new AdminInputError("Notification channel not found", 404);
  const parsed = parseChannelInput(input);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE notification_channels
     SET name = ?, type = ?, config_json = ?, enabled = ?, updated_at_utc = ?
     WHERE id = ?`
  ).bind(parsed.name, parsed.type, JSON.stringify(parsed.config), parsed.enabled ? 1 : 0, now, id).run();
  if (!parsed.enabled) await removeChannelFromTasks(env, id, now);
  return serializeChannel({ ...existing, ...parsed, config_json: JSON.stringify(parsed.config), enabled: parsed.enabled ? 1 : 0, updated_at_utc: now }, true);
}

export async function deleteNotificationChannel(env: Env, id: string): Promise<void> {
  if (id === "email") throw new AdminInputError("The built-in email channel cannot be deleted");
  const now = new Date().toISOString();
  await removeChannelFromTasks(env, id, now);
  const result = await env.DB.prepare(`DELETE FROM notification_channels WHERE id = ?`).bind(id).run();
  if (result.meta.changes === 0) throw new AdminInputError("Notification channel not found", 404);
}

export async function findNotificationChannel(env: Env, id: string): Promise<NotificationChannel | null> {
  if (id === "email") return null;
  return env.DB.prepare(`SELECT * FROM notification_channels WHERE id = ? LIMIT 1`)
    .bind(id).first<NotificationChannel>();
}

export function matchNotificationChannelPath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/notification-channels\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseChannelInput(input: unknown): { name: string; type: NotificationChannelType; config: Record<string, string>; enabled: boolean } {
  const record = requireRecord(input, "Request body");
  const name = readRequiredString(record, ["name"], "name");
  const type = readRequiredString(record, ["type"], "type") as NotificationChannelType;
  if (!CHANNEL_TYPES.has(type)) throw new AdminInputError("Unsupported notification channel type");
  const rawConfig = requireRecord(record.config, "config");
  const config: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawConfig)) {
    if (typeof value !== "string") throw new AdminInputError(`config.${key} must be a string`);
    if (value.trim()) config[key] = value.trim();
  }
  validateChannelConfig(type, config);
  if (name.length > 40) throw new AdminInputError("name must be 40 characters or fewer");
  return { name, type, config, enabled: readOptionalBoolean(record, ["enabled"]) ?? true };
}

function validateChannelConfig(type: NotificationChannelType, config: Record<string, string>): void {
  const required: Partial<Record<NotificationChannelType, string[]>> = {
    bark: ["endpoint"], gotify: ["endpoint", "token"], pushdeer: ["pushKey"], pushplus: ["token"],
    telegram: ["botToken", "chatId"], dingtalk: ["webhookUrl"], wecom: ["webhookUrl"],
    feishu: ["webhookUrl"], webhook: ["url"],
  };
  for (const key of required[type] || []) {
    if (!config[key]) throw new AdminInputError(`config.${key} is required for ${type}`);
  }
  for (const key of ["endpoint", "webhookUrl", "url", "serverUrl"]) {
    if (config[key]) assertHttpUrl(config[key], `config.${key}`);
  }
  if (config.method && !["GET", "POST", "PUT", "PATCH"].includes(config.method.toUpperCase())) {
    throw new AdminInputError("config.method must be GET, POST, PUT, or PATCH");
  }
}

function assertHttpUrl(value: string, name: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    throw new AdminInputError(`${name} must be a valid HTTP URL`);
  }
}

function serializeChannel(row: NotificationChannel, includeConfig: boolean) {
  let config: Record<string, string> = {};
  try { config = JSON.parse(row.config_json) as Record<string, string>; } catch { /* return empty config */ }
  return {
    id: row.id, name: row.name, type: row.type, enabled: Boolean(row.enabled), builtIn: false,
    ...(includeConfig ? { config } : {}), createdAtUtc: row.created_at_utc, updatedAtUtc: row.updated_at_utc,
  };
}

async function removeChannelFromTasks(env: Env, id: string, now: string): Promise<void> {
  const { results = [] } = await env.DB.prepare(
    `SELECT id, notification_channel_ids FROM tasks WHERE deleted_at_utc IS NULL AND notification_channel_ids LIKE ?`
  ).bind(`%${id}%`).all<{ id: string; notification_channel_ids: string }>();
  const statements = results.flatMap((task) => {
    let ids: string[] = [];
    try { ids = JSON.parse(task.notification_channel_ids) as string[]; } catch { ids = ["email"]; }
    const next = ids.filter((channelId) => channelId !== id);
    return next.length === ids.length ? [] : [env.DB.prepare(
      `UPDATE tasks SET notification_channel_ids = ?, updated_at_utc = ? WHERE id = ?`
    ).bind(JSON.stringify(next.length ? next : ["email"]), now, task.id)];
  });
  for (let index = 0; index < statements.length; index += 100) {
    await env.DB.batch(statements.slice(index, index + 100));
  }
}
