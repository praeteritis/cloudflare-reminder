import {
  ADMIN_SESSION_COOKIE,
  LINUXDO_AUTHORIZE_URL,
  LINUXDO_TOKEN_URL,
  LINUXDO_USER_URL,
  REMEMBER_SESSION_MAX_AGE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  USER_SESSION_COOKIE,
} from "./constants";
import { assertInviteCodeAvailable, consumeInviteCode } from "./invites";
import { logAudit, logSecurityEvent } from "./observability";
import { getAppSettings } from "./settings";
import {
  AdminInputError,
  constantTimeEqual,
  createAdminSessionCookie,
  createUserSessionCookie,
  decodeBase64UrlToString,
  encodeBase64UrlString,
  findUserByEmail,
  findUserByLinuxDoId,
  hashPassword,
  isValidEmail,
  makeId,
  markUserLogin,
  normalizeEmail,
  readCookie,
  readJsonBody,
  readOptionalString,
  readRequiredString,
  requireRecord,
  safeJsonParse,
  signSessionPayload,
  validateUserCredentials,
  verifyPassword,
  verifySessionSignature,
} from "./shared";
import { findUserById } from "./users";
import type { AuthenticatedActor, Env, LinuxDoUser, User } from "./types";

export async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    await logSecurityEvent(env, request, "api_error", 500, "admin_token_missing", null);
    return Response.json({ ok: false, error: "ADMIN_TOKEN is not configured" }, { status: 500 });
  }

  const input = requireRecord(await readJsonBody(request), "Request body");
  const token = readRequiredString(input, ["token"], "token");
  const remember = input.remember === true;

  if (!constantTimeEqual(token, env.ADMIN_TOKEN)) {
    await logSecurityEvent(env, request, "auth_admin_login_failed", 401, "invalid_token", null);
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

export async function handleUserRegister(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    await logSecurityEvent(env, request, "api_error", 500, "admin_token_missing", null);
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

export async function handleUserLogin(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    await logSecurityEvent(env, request, "api_error", 500, "admin_token_missing", null);
    return Response.json({ ok: false, error: "ADMIN_TOKEN is not configured" }, { status: 500 });
  }

  const input = requireRecord(await readJsonBody(request), "Request body");
  const email = normalizeEmail(readRequiredString(input, ["email"], "email"));
  const password = readRequiredString(input, ["password"], "password");
  const remember = input.remember === true;
  const user = await findUserByEmail(env, email);

  if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
    await logSecurityEvent(env, request, "auth_user_login_failed", 401, "invalid_credentials", null);
    return Response.json({ ok: false, error: "邮箱或密码不正确" }, { status: 401 });
  }

  if (user.status === "banned") {
    await logSecurityEvent(env, request, "auth_user_login_blocked", 403, "banned", { type: "user", userId: user.id });
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

export async function handleLinuxDoStart(request: Request, env: Env): Promise<Response> {
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

export async function handleLinuxDoCallback(request: Request, env: Env): Promise<Response> {
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

export async function handleLinuxDoComplete(request: Request, env: Env): Promise<Response> {
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

export async function authorizeAdminRequest(request: Request, env: Env): Promise<Response | null> {
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

export async function getAuthenticatedActor(request: Request, env: Env): Promise<AuthenticatedActor | null> {
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
