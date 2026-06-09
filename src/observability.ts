import { LOG_RETENTION_DAYS } from "./constants";
import { AdminInputError, makePagedResult, readJsonBody, readOptionalString, readPagination, requireRecord, safeJsonParse } from "./shared";
import type { AuthenticatedActor, Env } from "./types";

export async function logAudit(
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
        error: errorMessageForLog(error),
      })
    );
  }
}

export async function handleClientErrorReport(
  request: Request,
  env: Env,
  getActor: (request: Request, env: Env) => Promise<AuthenticatedActor | null>
): Promise<Response> {
  try {
    const actor = await getActor(request, env).catch(() => null);
    const input = requireRecord(await readJsonBody(request), "Request body");
    const path = sanitizeLogPath(readOptionalString(input, ["path", "pathname"]) || "/");
    const source = sanitizeLogText(readOptionalString(input, ["source"]) || "client", 80);
    const name = sanitizeLogText(readOptionalString(input, ["name"]) || "Error", 80);
    const message = sanitizeLogText(readOptionalString(input, ["message"]) || "Client error", 240);
    const line = readOptionalFiniteNumber(input, "line");
    const column = readOptionalFiniteNumber(input, "column");
    const details: Record<string, unknown> = {
      requestId: readRequestId(request),
      path,
      source,
      name,
      message,
      userAgent: summarizeUserAgent(request.headers.get("User-Agent") || ""),
    };

    if (line !== null) {
      details.line = line;
    }
    if (column !== null) {
      details.column = column;
    }

    logStructuredWarning("client_error", {
      requestId: details.requestId,
      path,
      source,
      actorType: actor?.type ?? "anonymous",
    });
    await logAudit(env, makeAuditActorForError(actor), "client_error", "client", path, details);
  } catch (error) {
    await logRequestError(env, request, null, error);
  }

  return Response.json({ ok: true });
}

export async function logRequestError(
  env: Env,
  request: Request,
  actor: AuthenticatedActor | null,
  error: unknown
): Promise<void> {
  const status = errorStatus(error);
  const action = status >= 500 ? "api_error" : "api_rejected";
  const publicError = status >= 500 ? "Internal server error" : errorMessageForLog(error);
  const details = makeRequestLogDetails(request, status, errorMessageForLog(error));

  logStructuredWarning(action, {
    requestId: details.requestId,
    method: details.method,
    path: details.path,
    status,
    actorType: actor?.type ?? "anonymous",
    error: publicError,
  });

  await logAudit(
    env,
    makeAuditActorForError(actor),
    action,
    "request",
    `${details.method} ${details.path}`,
    details
  );
}

export async function logSecurityEvent(
  env: Env,
  request: Request,
  action: string,
  status: number,
  reason: string,
  actor: AuthenticatedActor | null
): Promise<void> {
  const details = makeRequestLogDetails(request, status, reason);

  logStructuredWarning(action, {
    requestId: details.requestId,
    method: details.method,
    path: details.path,
    status,
    actorType: actor?.type ?? "anonymous",
    reason,
  });

  await logAudit(
    env,
    makeAuditActorForError(actor),
    action,
    "auth",
    `${details.method} ${details.path}`,
    { ...details, reason: sanitizeLogText(reason, 120) }
  );
}

function makeRequestLogDetails(request: Request, status: number, error: string): Record<string, unknown> {
  const url = new URL(request.url);
  return {
    requestId: readRequestId(request),
    method: sanitizeLogText(request.method, 12),
    path: sanitizeLogPath(url.pathname),
    status,
    error: sanitizeLogText(error, 300),
    userAgent: summarizeUserAgent(request.headers.get("User-Agent") || ""),
  };
}

function makeAuditActorForError(actor: AuthenticatedActor | null): AuthenticatedActor {
  if (!actor) {
    return { type: "system" };
  }

  return {
    type: actor.type,
    userId: actor.userId,
  };
}

function logStructuredWarning(event: string, details: Record<string, unknown>): void {
  console.warn(
    JSON.stringify({
      event,
      ...details,
    })
  );
}

function errorStatus(error: unknown): number {
  return error instanceof AdminInputError ? error.status : 500;
}

export function errorMessageForLog(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeLogText(error.message, 300);
  }

  return sanitizeLogText(String(error), 300);
}

function readRequestId(request: Request): string {
  return sanitizeLogText(
    request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID(),
    80
  );
}

function readOptionalFiniteNumber(record: Record<string, unknown>, name: string): number | null {
  const value = record[name];
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function sanitizeLogPath(value: string): string {
  const withoutQuery = value.split("?")[0]?.split("#")[0] || "/";
  const path = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return sanitizeLogText(path, 140);
}

export function sanitizeLogText(value: string, maxLength: number): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/([?&](?:token|password|inviteCode|code|state|linuxdoPending|linuxdoError)=)[^&#\s]+/gi, "$1[redacted]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function summarizeUserAgent(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("firefox/")
      ? "Firefox"
      : ua.includes("chrome/") || ua.includes("crios/")
        ? "Chrome"
        : ua.includes("safari/")
          ? "Safari"
          : "Other";
  const platform = ua.includes("iphone") || ua.includes("ipad")
    ? "iOS"
    : ua.includes("android")
      ? "Android"
      : ua.includes("mac os")
        ? "macOS"
        : ua.includes("windows")
          ? "Windows"
          : ua.includes("linux")
            ? "Linux"
            : "Unknown";

  return `${browser}/${platform}`;
}

export async function listAuditLogs(
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

export async function listReminderExecutionLogs(
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
