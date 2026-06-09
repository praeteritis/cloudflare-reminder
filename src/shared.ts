import {
  ADMIN_SESSION_COOKIE,
  MAX_JSON_BODY_BYTES,
  MAX_LIST_LIMIT,
  PASSWORD_HASH_ITERATIONS,
  PASSWORD_MIN_LENGTH,
  RUN_ID_PATTERN,
  USER_SESSION_COOKIE,
} from "./constants";
import type { Env, Pagination, TaskStatus, User } from "./types";

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function sameEmailAddress(left: string, right: string): boolean {
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

export function addMinutes(date: Date, minutes: number): Date {
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

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function readLimitedText(source: Request | Response, maxBytes: number, tooLargeMessage: string): Promise<string> {
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

export async function readJsonBody(request: Request): Promise<unknown> {
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

export function readRequiredString(
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

export function countCharacters(value: string): number {
  return Array.from(value).length;
}

export function assertMaxCharacters(value: string, maxCharacters: number, displayName: string): void {
  if (countCharacters(value) > maxCharacters) {
    throw new AdminInputError(`${displayName} must be ${maxCharacters} characters or fewer`);
  }
}

export function assertMaxInteger(value: number, maxValue: number, displayName: string): void {
  if (value > maxValue) {
    throw new AdminInputError(`${displayName} must be ${maxValue} or less`);
  }
}

export function readOptionalString(record: Record<string, unknown> | null, names: string[]): string | null {
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

export function readOptionalStringAllowEmpty(record: Record<string, unknown> | null, names: string[]): string | null {
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

export function readOptionalPositiveInteger(
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

export function readOptionalNonNegativeInteger(
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

export function readOptionalBoolean(record: Record<string, unknown>, names: string[]): boolean | null {
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

export function readOptionalRecord(record: Record<string, unknown>, names: string[]): Record<string, unknown> | null {
  for (const name of names) {
    if (!(name in record)) {
      continue;
    }

    return requireRecord(record[name], name);
  }

  return null;
}

export function requireRecord(value: unknown, displayName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminInputError(`${displayName} must be an object`);
  }

  return value as Record<string, unknown>;
}

export function readListLimit(value: string | null): number {
  if (!value) {
    return 50;
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new AdminInputError("limit must be a positive integer");
  }

  return Math.min(limit, MAX_LIST_LIMIT);
}

export function readPagination(url: URL, defaultPageSize = 20): Pagination {
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

export function makePagedResult<T>(items: T[], pagination: Pagination, total: number) {
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

export function hasExplicitTimezone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

export function isValidEmail(value: string): boolean {
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

export function isValidTaskId(value: string): boolean {
  return /^[A-Za-z0-9_-]{3,80}$/.test(value);
}

export function isTaskStatus(value: string): value is TaskStatus {
  return value === "active" || value === "done" || value === "paused" || value === "cancelled";
}

export async function createAdminSessionCookie(
  request: Request,
  env: Env,
  maxAgeSeconds: number
): Promise<string> {
  const payload = encodeBase64UrlString(JSON.stringify({ exp: Date.now() + maxAgeSeconds * 1000 }));
  const signature = await signSessionPayload(env.ADMIN_TOKEN || "", payload);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return `${ADMIN_SESSION_COOKIE}=${payload}.${signature}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict${secure}`;
}

export async function createUserSessionCookie(
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

export function clearSessionCookie(request: Request, name: string): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}

export function validateUserCredentials(email: string, password: string): void {
  if (!isValidEmail(email)) {
    throw new AdminInputError("email must be a valid email address");
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new AdminInputError(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
}

export async function findUserByEmail(env: Env, email: string): Promise<User | null> {
  return env.DB.prepare(`SELECT * FROM users WHERE email = ? LIMIT 1`).bind(email).first<User>();
}

export async function findUserByLinuxDoId(env: Env, linuxdoId: string): Promise<User | null> {
  return env.DB.prepare(`SELECT * FROM users WHERE linuxdo_id = ? LIMIT 1`).bind(linuxdoId).first<User>();
}

export async function markUserLogin(env: Env, userId: string): Promise<void> {
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

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function hashPassword(password: string, salt = makePasswordSalt()): Promise<{
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

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const { password_hash: actualHash } = await hashPassword(password, salt);
  return constantTimeEqual(actualHash, expectedHash);
}

export function makePasswordSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return encodeBase64UrlBytes(bytes);
}

export async function signSessionPayload(secret: string, payload: string): Promise<string> {
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

export async function verifySessionSignature(
  secret: string,
  payload: string,
  signature: string
): Promise<boolean> {
  const expected = await signSessionPayload(secret, payload);
  return constantTimeEqual(signature, expected);
}

export function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const chunk of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = chunk.trim().split("=");
    if (rawName === name) {
      return rawValue.join("=") || null;
    }
  }

  return null;
}

export function encodeBase64UrlString(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function encodeBase64UrlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeBase64UrlToString(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

  try {
    return atob(padded);
  } catch {
    return "";
  }
}

export function decodeBase64UrlToBytes(value: string): Uint8Array {
  const decoded = decodeBase64UrlToString(value);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
}

export function constantTimeEqual(actual: string, expected: string): boolean {
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

export function jsonError(error: unknown): Response {
  if (error instanceof AdminInputError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, error: message }, { status: 500 });
}

export class AdminInputError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}
