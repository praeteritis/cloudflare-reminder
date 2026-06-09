import { AdminInputError, makePagedResult, readOptionalPositiveInteger, readOptionalString, readPagination, requireRecord } from "./shared";
import type { AppSettings, AuthenticatedActor, Env } from "./types";

export function matchAdminInvitePath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/invites\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function listInviteCodes(env: Env, url: URL) {
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

export async function createInviteCodes(env: Env, actor: AuthenticatedActor, input: unknown) {
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

export async function deleteInviteCode(env: Env, code: string): Promise<void> {
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

export async function deleteInviteCodesFromInput(env: Env, input: unknown) {
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

export async function assertInviteCodeAvailable(env: Env, settings: AppSettings, code: string | null): Promise<void> {
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

export async function consumeInviteCode(env: Env, settings: AppSettings, code: string | null, userId: string): Promise<void> {
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

function assertRegistrationAllowed(settings: AppSettings, inviteCode: string | null): void {
  if (!settings.allowRegistration) {
    throw new AdminInputError("当前暂未开放注册", 403);
  }

  if (settings.requireInvite && !inviteCode) {
    throw new AdminInputError("邀请码必填", 403);
  }
}

function makeInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
}
