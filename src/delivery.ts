import {
  DELIVERY_CLAIM_STALE_SECONDS,
  DELIVERY_ENQUEUE_LIMIT,
  DELIVERY_QUEUED_STALE_SECONDS,
  DELIVERY_QUEUE_BATCH_SIZE,
  DELIVERY_RECOVERY_LIMIT,
  DELIVERY_RETRY_BASE_SECONDS,
  DELIVERY_RETRY_MAX_SECONDS,
  DELIVERY_RETRYING_STALE_SECONDS,
  DUE_SCAN_LIMIT,
  LOG_RETENTION_DAYS,
  NAG_SCAN_LIMIT,
  SCHEDULER_MAX_LOOPS,
} from "./constants";
import { sendReminderNotification } from "./notificationDelivery";
import { errorMessageForLog, logAudit, sanitizeLogText } from "./observability";
import { makeId } from "./shared";
import { calculateNextDueAt, calculateNextNagAt } from "./taskSchedule";
import { parseTaskNotificationChannelIds } from "./tasks";
import type {
  EmailDeliveryJob,
  Env,
  ProcessingSummary,
  ReminderDeliveryMessage,
  ReminderDeliveryType,
  Task,
  TaskRunRow,
} from "./types";

export { buildTaskFromAdminInput, buildTaskUpdateFromAdminInput } from "./taskInput";
export { calculateNextDueAt, calculateNextNagAt } from "./taskSchedule";
export { handleInboundReply } from "./emailDelivery";

export async function processDueReminders(env: Env): Promise<ProcessingSummary> {
  const now = new Date();
  const nowIso = now.toISOString();

  const createdRunResult = await runSchedulerLoop(() => createRunsForDueTasks(env, now, nowIso), DUE_SCAN_LIMIT);
  const nagReminderResult = await runSchedulerLoop(() => createJobsForDueNagReminders(env, nowIso), NAG_SCAN_LIMIT);
  const recoveredDeliveries = await recoverStaleDeliveryJobs(env, now);
  const queuedDeliveries = await enqueuePendingDeliveryJobs(env, nowIso);
  const cleanupDeletedRows = await cleanupExpiredOperationalRows(env, now);
  const backlog = createdRunResult.backlog || nagReminderResult.backlog;

  if (backlog) {
    console.warn(
      JSON.stringify({
        event: "scheduler_backlog",
        createdRuns: createdRunResult.total,
        nagReminders: nagReminderResult.total,
        maxLoops: SCHEDULER_MAX_LOOPS,
      })
    );
  }

  return {
    createdRuns: createdRunResult.total,
    nagReminders: nagReminderResult.total,
    recoveredDeliveries,
    queuedDeliveries,
    cleanupDeletedRows,
    backlog,
  };
}

async function runSchedulerLoop(
  processBatch: () => Promise<number>,
  batchSize: number
): Promise<{ total: number; backlog: boolean }> {
  let total = 0;
  let lastBatchCount = 0;

  for (let i = 0; i < SCHEDULER_MAX_LOOPS; i += 1) {
    const count = await processBatch();
    total += count;
    lastBatchCount = count;
    if (count < batchSize) {
      break;
    }
  }

  return { total, backlog: lastBatchCount >= batchSize };
}

async function cleanupExpiredOperationalRows(env: Env, now: Date): Promise<number> {
  const cutoffIso = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(`DELETE FROM send_logs WHERE created_at_utc < ?`).bind(cutoffIso),
    env.DB.prepare(`DELETE FROM audit_logs WHERE created_at_utc < ?`).bind(cutoffIso),
    env.DB.prepare(
      `DELETE FROM email_delivery_jobs
       WHERE updated_at_utc < ?
         AND status IN ('sent', 'failed', 'dead_lettered', 'skipped')`
    ).bind(cutoffIso),
    env.DB.prepare(
      `DELETE FROM notification_delivery_cycles WHERE completed_at_utc < ?`
    ).bind(cutoffIso),
    env.DB.prepare(
      `DELETE FROM reminder_runs
       WHERE updated_at_utc < ?
         AND status IN ('completed', 'cancelled')`
    ).bind(cutoffIso),
    env.DB.prepare(
      `DELETE FROM reminder_runs
       WHERE updated_at_utc < ?
         AND status = 'open'
         AND NOT EXISTS (
           SELECT 1
           FROM tasks
           WHERE tasks.current_run_id = reminder_runs.id
         )`
    ).bind(cutoffIso),
  ]);

  return results.reduce((total, result) => total + Number(result.meta.changes ?? 0), 0);
}

export async function pingHeartbeat(env: Pick<Env, "HEARTBEAT_URL">, summary: ProcessingSummary): Promise<void> {
  if (!env.HEARTBEAT_URL) {
    return;
  }

  try {
    const url = new URL(env.HEARTBEAT_URL);
    url.searchParams.set("createdRuns", String(summary.createdRuns));
    url.searchParams.set("nagReminders", String(summary.nagReminders));
    url.searchParams.set("recoveredDeliveries", String(summary.recoveredDeliveries));
    url.searchParams.set("queuedDeliveries", String(summary.queuedDeliveries));
    url.searchParams.set("cleanupDeletedRows", String(summary.cleanupDeletedRows));
    url.searchParams.set("backlog", summary.backlog ? "1" : "0");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "personal-mail-reminder/heartbeat",
      },
    });

    if (!response.ok) {
      console.warn(
        JSON.stringify({
          event: "heartbeat_failed",
          status: response.status,
        })
      );
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "heartbeat_error",
        error: errorMessageForLog(error),
      })
    );
  }
}

async function createRunsForDueTasks(env: Env, now: Date, nowIso: string): Promise<number> {
  const { results: tasks = [] } = await env.DB.prepare(
    `SELECT *
     FROM tasks
     WHERE status = 'active'
       AND deleted_at_utc IS NULL
       AND next_due_at_utc <= ?
       AND (current_run_id IS NULL OR current_run_id = '')
     ORDER BY next_due_at_utc ASC
     LIMIT ?`
  )
    .bind(nowIso, DUE_SCAN_LIMIT)
    .all<Task>();

  let createdCount = 0;

  for (const task of tasks) {
    const runId = makeId("run");
    const channelIds = parseTaskNotificationChannelIds(task.notification_channel_ids);
    const [acquireResult, insertRunResult] = await env.DB.batch([
      env.DB.prepare(
        `UPDATE tasks
         SET current_run_id = ?, updated_at_utc = ?
         WHERE id = ?
           AND status = 'active'
           AND deleted_at_utc IS NULL
           AND next_due_at_utc <= ?
           AND (current_run_id IS NULL OR current_run_id = '')`
      ).bind(runId, nowIso, task.id, nowIso),
      env.DB.prepare(
        `INSERT INTO reminder_runs (
           id,
           task_id,
           due_at_utc,
           status,
           sent_count,
           next_nag_at_utc,
           created_at_utc,
           updated_at_utc
         )
         SELECT ?, id, next_due_at_utc, 'open', 0, NULL, ?, ?
         FROM tasks
         WHERE id = ?
           AND current_run_id = ?
           AND status = 'active'
           AND deleted_at_utc IS NULL
           AND next_due_at_utc <= ?`
      ).bind(runId, nowIso, nowIso, task.id, runId, nowIso),
      ...channelIds.map((channelId) => createEmailDeliveryJobStatement(env, {
        deliveryKey: buildReminderDeliveryKey(runId, "reminder", task.next_due_at_utc, channelId),
        runId,
        taskId: task.id,
        type: "reminder",
        scheduledForUtc: task.next_due_at_utc,
        channelId,
        nowIso,
      })),
    ]);

    if (acquireResult.meta.changes === 0 || insertRunResult.meta.changes === 0) {
      await env.DB.prepare(
        `UPDATE tasks
         SET current_run_id = NULL, updated_at_utc = ?
         WHERE id = ? AND current_run_id = ?`
      )
        .bind(nowIso, task.id, runId)
        .run();
      continue;
    }

    createdCount += 1;
  }

  return createdCount;
}

async function createJobsForDueNagReminders(env: Env, nowIso: string): Promise<number> {
  const { results: rows = [] } = await env.DB.prepare(
    `SELECT
       tasks.*,
       reminder_runs.id AS run_id,
       reminder_runs.due_at_utc AS run_due_at_utc,
       reminder_runs.sent_count AS run_sent_count,
       reminder_runs.next_nag_at_utc AS run_next_nag_at_utc
     FROM reminder_runs
     JOIN tasks ON tasks.id = reminder_runs.task_id
     WHERE reminder_runs.status = 'open'
       AND tasks.status = 'active'
       AND tasks.deleted_at_utc IS NULL
       AND tasks.current_run_id = reminder_runs.id
       AND reminder_runs.next_nag_at_utc <= ?
     ORDER BY reminder_runs.next_nag_at_utc ASC
     LIMIT ?`
  )
    .bind(nowIso, NAG_SCAN_LIMIT)
    .all<TaskRunRow>();

  let createdCount = 0;

  for (const row of rows) {
    const scheduledForUtc = row.run_next_nag_at_utc ?? nowIso;
    const channelIds = parseTaskNotificationChannelIds(row.notification_channel_ids);
    const results = await env.DB.batch([
      ...channelIds.map((channelId) => createEmailDeliveryJobStatement(env, {
        deliveryKey: buildReminderDeliveryKey(row.run_id, "nag", scheduledForUtc, channelId),
        runId: row.run_id,
        taskId: row.id,
        type: "nag",
        scheduledForUtc,
        channelId,
        nowIso,
      })),
      env.DB.prepare(
      `UPDATE reminder_runs
       SET next_nag_at_utc = NULL,
           updated_at_utc = ?
      WHERE id = ?
         AND status = 'open'
         AND next_nag_at_utc = ?`
      ).bind(nowIso, row.run_id, scheduledForUtc),
    ]);

    if (results.at(-1)?.meta.changes) createdCount += 1;
  }

  return createdCount;
}

async function updateRunAfterReminderDelivery(
  env: Env,
  task: TaskRunRow,
  runId: string,
  type: ReminderDeliveryType,
  sentAt: Date
): Promise<void> {
  const sentAtIso = sentAt.toISOString();

  if ((task.task_type ?? "confirmation") === "scheduled") {
    await closeRunAfterScheduledDelivery(env, task, runId, sentAt);
    return;
  }

  if (hasReachedNagLimitAfterDelivery(task)) {
    await closeRunAfterMaxNagCount(env, task, runId, sentAt);
    return;
  }

  const nextNagAt = calculateNextNagAt(task, sentAt, true).toISOString();

  await env.DB.prepare(
    `UPDATE reminder_runs
     SET sent_count = sent_count + 1,
         last_sent_at_utc = ?,
         next_nag_at_utc = ?,
         updated_at_utc = ?
     WHERE id = ? AND status = 'open'`
  )
    .bind(sentAtIso, nextNagAt, sentAtIso, runId)
    .run();

  void type;
}

async function closeRunAfterScheduledDelivery(env: Env, task: TaskRunRow, runId: string, completedAt: Date): Promise<void> {
  const completedAtIso = completedAt.toISOString();
  const nextDueAt = calculateNextDueAt(task, completedAt);
  const result = await env.DB.prepare(
    `UPDATE reminder_runs
     SET sent_count = sent_count + 1,
         last_sent_at_utc = ?,
         status = 'completed',
         next_nag_at_utc = NULL,
         completed_at_utc = ?,
         completed_by = 'system:delivered',
         updated_at_utc = ?
     WHERE id = ? AND status = 'open'`
  ).bind(completedAtIso, completedAtIso, completedAtIso, runId).run();
  if (result.meta.changes === 0) return;

  if (nextDueAt) {
    await env.DB.prepare(
      `UPDATE tasks
       SET current_run_id = NULL,
           next_due_at_utc = ?,
           status = 'active',
           updated_at_utc = ?
       WHERE id = ? AND current_run_id = ?`
    ).bind(nextDueAt.toISOString(), completedAtIso, task.id, runId).run();
  } else {
    await env.DB.prepare(
      `UPDATE tasks
       SET current_run_id = NULL,
           status = 'done',
           updated_at_utc = ?
       WHERE id = ? AND current_run_id = ?`
    ).bind(completedAtIso, task.id, runId).run();
  }

  await logAudit(env, { type: "system", email: "system" }, "scheduled_notification_delivered", "task", task.id, {
    runId,
    nextDueAtUtc: nextDueAt?.toISOString() ?? null,
  });
}

export function hasReachedNagLimitAfterDelivery(task: Pick<TaskRunRow, "run_sent_count" | "max_nag_count">): boolean {
  return Number(task.run_sent_count || 0) + 1 >= 1 + Number(task.max_nag_count || 0);
}

async function closeRunAfterMaxNagCount(env: Env, task: TaskRunRow, runId: string, completedAt: Date): Promise<void> {
  const completedAtIso = completedAt.toISOString();
  const nextDueAt = calculateNextDueAt(task, completedAt);
  const completedBy = "system:max_nag_count";
  const result = await env.DB.prepare(
    `UPDATE reminder_runs
     SET sent_count = sent_count + 1,
         last_sent_at_utc = ?,
         status = 'completed',
         next_nag_at_utc = NULL,
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
    .bind(completedAtIso, completedAtIso, completedBy, completedAtIso, runId)
    .run();

  if (result.meta.changes === 0) {
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
      .bind(nextDueAt.toISOString(), completedAtIso, task.id, runId)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE tasks
       SET current_run_id = NULL,
           status = 'done',
           updated_at_utc = ?
       WHERE id = ? AND current_run_id = ?`
    )
      .bind(completedAtIso, task.id, runId)
      .run();
  }

  await logAudit(env, { type: "system", email: "system" }, "reminder_run_max_nag_reached", "task", task.id, {
    runId,
    sentCount: Number(task.run_sent_count || 0) + 1,
    maxNagCount: task.max_nag_count,
    nextDueAtUtc: nextDueAt?.toISOString() ?? null,
  });
}

export function buildReminderDeliveryKey(runId: string, type: ReminderDeliveryType, scheduledForUtc: string, channelId = "email"): string {
  const base = `${runId}:${type}:${scheduledForUtc}`;
  return channelId === "email" ? base : `${base}:${channelId}`;
}

function createEmailDeliveryJobStatement(env: Env, input: {
  deliveryKey: string;
  runId: string;
  taskId: string;
  type: ReminderDeliveryType;
  scheduledForUtc: string;
  channelId: string;
  nowIso: string;
}): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO email_delivery_jobs (
       delivery_key,
       run_id,
       task_id,
       type,
       scheduled_for_utc,
       channel_id,
       status,
       attempt_count,
       created_at_utc,
       updated_at_utc
     )
     SELECT ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?
     FROM reminder_runs
     WHERE id = ?`
  )
    .bind(
      input.deliveryKey,
      input.runId,
      input.taskId,
      input.type,
      input.scheduledForUtc,
      input.channelId,
      input.nowIso,
      input.nowIso,
      input.runId
    );
}

async function recoverStaleDeliveryJobs(env: Env, now: Date): Promise<number> {
  const nowIso = now.toISOString();
  const queuedStaleBeforeIso = new Date(now.getTime() - DELIVERY_QUEUED_STALE_SECONDS * 1000).toISOString();
  const sendingStaleBeforeIso = new Date(now.getTime() - DELIVERY_CLAIM_STALE_SECONDS * 1000).toISOString();
  const retryingStaleBeforeIso = new Date(now.getTime() - DELIVERY_RETRYING_STALE_SECONDS * 1000).toISOString();

  const { results: jobs = [] } = await env.DB.prepare(
    `SELECT delivery_key, status
     FROM email_delivery_jobs
     WHERE (
         status = 'queued' AND updated_at_utc <= ?
       ) OR (
         status = 'sending' AND updated_at_utc <= ?
       ) OR (
         status = 'retrying' AND updated_at_utc <= ?
       )
     ORDER BY updated_at_utc ASC
     LIMIT ?`
  )
    .bind(queuedStaleBeforeIso, sendingStaleBeforeIso, retryingStaleBeforeIso, DELIVERY_RECOVERY_LIMIT)
    .all<Pick<EmailDeliveryJob, "delivery_key" | "status">>();

  if (!jobs.length) {
    return 0;
  }

  await env.DB.batch(
    jobs.map((job) =>
      env.DB.prepare(
        `UPDATE email_delivery_jobs
         SET status = 'pending',
             last_error_message = ?,
             updated_at_utc = ?
         WHERE delivery_key = ?
           AND status = ?`
      ).bind(`recovered stale ${job.status} delivery`, nowIso, job.delivery_key, job.status)
    )
  );

  console.warn(
    JSON.stringify({
      event: "recovered_stale_delivery_jobs",
      count: jobs.length,
    })
  );

  return jobs.length;
}

async function enqueuePendingDeliveryJobs(env: Env, nowIso: string): Promise<number> {
  const { results: jobs = [] } = await env.DB.prepare(
    `SELECT *
     FROM email_delivery_jobs
     WHERE status = 'pending'
     ORDER BY scheduled_for_utc ASC, created_at_utc ASC
     LIMIT ?`
  )
    .bind(DELIVERY_ENQUEUE_LIMIT)
    .all<EmailDeliveryJob>();

  let queuedCount = 0;

  if (!env.REMINDER_QUEUE) {
    for (const job of jobs) {
      const result = await processReminderDeliveryMessage(env, toReminderDeliveryMessage(job, nowIso), 1);
      if (result !== "retry") {
        queuedCount += 1;
      }
    }
    return queuedCount;
  }

  for (const chunk of chunkArray(jobs, DELIVERY_QUEUE_BATCH_SIZE)) {
    try {
      await env.REMINDER_QUEUE.sendBatch(
        chunk.map((job) => ({
          body: toReminderDeliveryMessage(job, nowIso),
          contentType: "json" as const,
        }))
      );

      await env.DB.batch(
        chunk.map((job) =>
          env.DB.prepare(
            `UPDATE email_delivery_jobs
             SET status = 'queued',
                 queued_at_utc = ?,
                 last_error_message = NULL,
                 updated_at_utc = ?
             WHERE delivery_key = ?
               AND status = 'pending'`
          ).bind(nowIso, nowIso, job.delivery_key)
        )
      );
      queuedCount += chunk.length;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await env.DB.batch(
        chunk.map((job) =>
          env.DB.prepare(
            `UPDATE email_delivery_jobs
             SET last_error_message = ?,
                 updated_at_utc = ?
             WHERE delivery_key = ?
               AND status = 'pending'`
          ).bind(errorMessage, nowIso, job.delivery_key)
        )
      );
    }
  }

  return queuedCount;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function toReminderDeliveryMessage(job: EmailDeliveryJob, enqueuedAtUtc: string): ReminderDeliveryMessage {
  return {
    version: 1,
    deliveryKey: job.delivery_key,
    runId: job.run_id,
    taskId: job.task_id,
    type: job.type,
    scheduledForUtc: job.scheduled_for_utc,
    enqueuedAtUtc,
    channelId: job.channel_id || "email",
  };
}

export async function processReminderDeliveryMessage(
  env: Env,
  body: unknown,
  queueAttempts: number
): Promise<"sent" | "already_done" | "retry"> {
  if (!isReminderDeliveryMessage(body)) {
    return "already_done";
  }

  await ensureEmailDeliveryJobFromMessage(env, body);

  const claim = await claimEmailDeliveryJob(env, body.deliveryKey);
  if (claim === "sent" || claim === "skipped" || claim === "dead_lettered") {
    return "already_done";
  }
  if (claim === "busy") {
    return "retry";
  }

  const row = await findOpenRunForDelivery(env, body.runId, body.taskId);
  if (!row) {
    await markEmailDeliveryJobSkipped(env, body.deliveryKey, "run is no longer open");
    return "already_done";
  }

  const channelId = body.channelId || "email";
  const result = await sendReminderNotification(env, row, body.runId, body.type, body.deliveryKey, channelId);
  const now = new Date();
  const nowIso = now.toISOString();

  if (!result.success) {
    await env.DB.prepare(
      `UPDATE email_delivery_jobs
       SET status = 'retrying',
           provider = ?,
           provider_message_id = ?,
           last_error_message = ?,
           updated_at_utc = ?
       WHERE delivery_key = ?
         AND status = 'sending'`
    )
      .bind(result.provider, result.providerMessageId, result.errorMessage, nowIso, body.deliveryKey)
      .run();
    console.warn(
      JSON.stringify({
        event: "reminder_delivery_failed",
        deliveryKey: body.deliveryKey,
        runId: body.runId,
        taskId: body.taskId,
        type: body.type,
        attemptCount: queueAttempts,
        error: sanitizeLogText(result.errorMessage || "", 300),
      })
    );
    return "retry";
  }

  await env.DB.prepare(
    `UPDATE email_delivery_jobs
     SET status = 'sent',
         provider = ?,
         provider_message_id = ?,
         last_error_message = NULL,
         sent_at_utc = ?,
         updated_at_utc = ?
     WHERE delivery_key = ?`
  )
    .bind(result.provider, result.providerMessageId, nowIso, nowIso, body.deliveryKey)
    .run();
  await completeDeliveryCycleIfReady(env, row, body.runId, body.type, body.scheduledForUtc, now);

  void queueAttempts;
  return "sent";
}

export function isReminderDeliveryMessage(value: unknown): value is ReminderDeliveryMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.deliveryKey === "string" &&
    typeof record.runId === "string" &&
    typeof record.taskId === "string" &&
    (record.type === "reminder" || record.type === "nag") &&
    typeof record.scheduledForUtc === "string" &&
    typeof record.enqueuedAtUtc === "string" &&
    (record.channelId === undefined || typeof record.channelId === "string")
  );
}

async function ensureEmailDeliveryJobFromMessage(env: Env, message: ReminderDeliveryMessage): Promise<void> {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO email_delivery_jobs (
       delivery_key,
       run_id,
       task_id,
       type,
       scheduled_for_utc,
       channel_id,
       status,
       attempt_count,
       queued_at_utc,
       created_at_utc,
       updated_at_utc
     ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)`
  )
    .bind(
      message.deliveryKey,
      message.runId,
      message.taskId,
      message.type,
      message.scheduledForUtc,
      message.channelId || "email",
      message.enqueuedAtUtc,
      message.enqueuedAtUtc,
      nowIso
    )
    .run();
}

async function completeDeliveryCycleIfReady(
  env: Env,
  task: TaskRunRow,
  runId: string,
  type: ReminderDeliveryType,
  scheduledForUtc: string,
  completedAt: Date
): Promise<void> {
  const pending = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM email_delivery_jobs
     WHERE run_id = ? AND type = ? AND scheduled_for_utc = ?
       AND status NOT IN ('sent', 'skipped')`
  ).bind(runId, type, scheduledForUtc).first<{ count: number }>();
  if (Number(pending?.count || 0) > 0) return;
  const cycleKey = `${runId}:${type}:${scheduledForUtc}`;
  const claimed = await env.DB.prepare(
    `INSERT OR IGNORE INTO notification_delivery_cycles
       (cycle_key, run_id, type, scheduled_for_utc, completed_at_utc)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(cycleKey, runId, type, scheduledForUtc, completedAt.toISOString()).run();
  if (claimed.meta.changes > 0) await updateRunAfterReminderDelivery(env, task, runId, type, completedAt);
}

async function claimEmailDeliveryJob(
  env: Env,
  deliveryKey: string
): Promise<"claimed" | "sent" | "busy" | "skipped" | "dead_lettered"> {
  const job = await env.DB.prepare(`SELECT * FROM email_delivery_jobs WHERE delivery_key = ? LIMIT 1`)
    .bind(deliveryKey)
    .first<EmailDeliveryJob>();

  if (!job) {
    return "busy";
  }
  if (job.status === "sent") {
    return "sent";
  }
  if (job.status === "skipped") {
    return "skipped";
  }
  if (job.status === "dead_lettered") {
    return "dead_lettered";
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const staleBeforeIso = new Date(now.getTime() - DELIVERY_CLAIM_STALE_SECONDS * 1000).toISOString();
  const result = await env.DB.prepare(
    `UPDATE email_delivery_jobs
     SET status = 'sending',
         attempt_count = attempt_count + 1,
         last_attempted_at_utc = ?,
         updated_at_utc = ?
     WHERE delivery_key = ?
       AND status <> 'sent'
       AND status <> 'skipped'
       AND status <> 'dead_lettered'
       AND (status <> 'sending' OR updated_at_utc <= ?)`
  )
    .bind(nowIso, nowIso, deliveryKey, staleBeforeIso)
    .run();

  return result.meta.changes > 0 ? "claimed" : "busy";
}

async function findOpenRunForDelivery(env: Env, runId: string, taskId: string): Promise<TaskRunRow | null> {
  return env.DB.prepare(
    `SELECT
       tasks.*,
       reminder_runs.id AS run_id,
       reminder_runs.due_at_utc AS run_due_at_utc,
       reminder_runs.sent_count AS run_sent_count,
       reminder_runs.next_nag_at_utc AS run_next_nag_at_utc
     FROM reminder_runs
     JOIN tasks ON tasks.id = reminder_runs.task_id
     WHERE reminder_runs.id = ?
       AND tasks.id = ?
       AND reminder_runs.status = 'open'
       AND tasks.status = 'active'
       AND tasks.deleted_at_utc IS NULL
       AND tasks.current_run_id = reminder_runs.id
     LIMIT 1`
  )
    .bind(runId, taskId)
    .first<TaskRunRow>();
}

async function markEmailDeliveryJobSkipped(env: Env, deliveryKey: string, reason: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE email_delivery_jobs
     SET status = 'skipped',
         last_error_message = ?,
         updated_at_utc = ?
     WHERE delivery_key = ?
       AND status <> 'sent'`
  )
    .bind(reason, nowIso, deliveryKey)
    .run();
}

export async function markDeadLetteredDeliveryMessages(
  env: Env,
  messages: readonly Message<ReminderDeliveryMessage>[]
): Promise<void> {
  const nowIso = new Date().toISOString();
  let deadLetteredCount = 0;
  for (const message of messages) {
    if (!isReminderDeliveryMessage(message.body)) {
      continue;
    }

    await env.DB.prepare(
      `UPDATE email_delivery_jobs
       SET status = 'dead_lettered',
           last_error_message = ?,
           updated_at_utc = ?
       WHERE delivery_key = ?
         AND status <> 'sent'`
    )
      .bind(`dead letter queue after ${message.attempts} attempts`, nowIso, message.body.deliveryKey)
      .run();
    deadLetteredCount += 1;

    await closeRunAfterDeadLetteredDelivery(env, message.body, message.attempts, nowIso);
  }

  if (deadLetteredCount > 0) {
    console.warn(
      JSON.stringify({
        event: "delivery_dead_lettered",
        count: deadLetteredCount,
      })
    );
  }
}

async function closeRunAfterDeadLetteredDelivery(
  env: Env,
  body: ReminderDeliveryMessage,
  attempts: number,
  nowIso: string
): Promise<void> {
  const row = await findOpenRunForDelivery(env, body.runId, body.taskId);
  if (!row) {
    return;
  }

  const nextDueAt = calculateNextDueAt(row, new Date(nowIso));
  const cancelResult = await env.DB.prepare(
    `UPDATE reminder_runs
     SET status = 'cancelled',
         next_nag_at_utc = NULL,
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
    .bind(nowIso, body.runId)
    .run();

  if (cancelResult.meta.changes === 0) {
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
      .bind(nextDueAt.toISOString(), nowIso, row.id, body.runId)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE tasks
       SET current_run_id = NULL,
           status = 'paused',
           updated_at_utc = ?
       WHERE id = ? AND current_run_id = ?`
    )
      .bind(nowIso, row.id, body.runId)
      .run();
  }

  await logAudit(env, { type: "system", email: "system" }, "reminder_run_dead_lettered", "task", row.id, {
    runId: body.runId,
    deliveryKey: body.deliveryKey,
    deliveryType: body.type,
    attempts,
    nextDueAtUtc: nextDueAt?.toISOString() ?? null,
  });
}

export function isDeadLetterQueue(queueName: string): boolean {
  return queueName.endsWith("-dlq");
}

export function calculateQueueRetryDelaySeconds(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(DELIVERY_RETRY_BASE_SECONDS * 2 ** exponent, DELIVERY_RETRY_MAX_SECONDS);
}
