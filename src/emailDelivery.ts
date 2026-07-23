import PostalMime from "postal-mime";
import { DEFAULT_TIMEZONE, MAX_PROVIDER_RESPONSE_BYTES } from "./constants";
import { logAudit, sanitizeLogText } from "./observability";
import {
  extractRunId,
  formatInTimezone,
  getFirstMeaningfulLine,
  makeId,
  readLimitedText,
  safeJsonParse,
  sameEmailAddress,
} from "./shared";
import { calculateNextDueAt } from "./taskSchedule";
import { parseTaskNotificationChannelIds } from "./tasks";
import type {
  AuthenticatedActor,
  EmailSendResult,
  Env,
  InboundEmailMessage,
  ReminderDeliveryType,
  Task,
  TaskRunRow,
} from "./types";

export async function sendReminderEmail(
  env: Env,
  task: Task,
  runId: string,
  type: ReminderDeliveryType,
  idempotencyKey: string
): Promise<EmailSendResult> {
  const { subject, text } = buildReminderEmailContent(task, runId, new Date());

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

export function buildReminderEmailContent(task: Pick<Task, "title" | "body" | "task_type">, runId: string, sentAt = new Date()): {
  subject: string;
  text: string;
} {
  const sentAtLine = `发送时间：${formatInTimezone(sentAt, DEFAULT_TIMEZONE)} GMT+08:00`;
  if ((task.task_type ?? "confirmation") === "scheduled") {
    return { subject: task.title, text: `${task.body}\n\n${sentAtLine}` };
  }
  return {
    subject: `[R:${runId}] ${task.title}`,
    text: `${task.body}

---
完成后，请直接回复本邮件。
回复第一行只写：
1

${sentAtLine}`,
  };
}

export async function handleInboundReply(message: InboundEmailMessage, env: Env): Promise<void> {
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
        fromMatchesExpected: false,
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

  if (!parseTaskNotificationChannelIds(row.notification_channel_ids).includes("email")) {
    return;
  }
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
  const timezone = DEFAULT_TIMEZONE;
  const subject = `[已完成] ${task.title}`;
  const nextReminderLine = nextDueAt
    ? `下次提醒时间：${formatInTimezone(nextDueAt, timezone)} GMT+08:00`
    : "这是一次性任务，后续不会继续提醒。";
  const text = `本次提醒任务已完成。

任务：${task.title}
完成时间：${formatInTimezone(completedAt, timezone)} GMT+08:00
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
            error: sanitizeLogText(responsePayload?.message ?? responsePayload?.name ?? responseText.slice(0, 200), 240),
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
