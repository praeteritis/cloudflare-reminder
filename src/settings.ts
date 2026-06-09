import { readOptionalBoolean, readOptionalStringAllowEmpty, requireRecord } from "./shared";
import type { AppSettings, Env } from "./types";

export async function getAppSettings(env: Env): Promise<AppSettings> {
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

export async function getPublicSettings(env: Env) {
  return toPublicSettings(await getAppSettings(env));
}

export function toPublicSettings(settings: AppSettings) {
  return {
    allowRegistration: settings.allowRegistration,
    requireInvite: settings.requireInvite,
    announcementText: settings.announcementText,
  };
}

export async function updateAppSettingsFromInput(env: Env, input: unknown): Promise<AppSettings> {
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
