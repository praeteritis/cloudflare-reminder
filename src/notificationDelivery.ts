import { MAX_PROVIDER_RESPONSE_BYTES } from "./constants";
import { sendReminderEmail } from "./emailDelivery";
import { findNotificationChannel } from "./notificationChannels";
import { logAudit, sanitizeLogText } from "./observability";
import { readLimitedText, safeJsonParse } from "./shared";
import type { EmailSendResult, Env, NotificationChannel, ReminderDeliveryType, Task } from "./types";

export async function sendReminderNotification(
  env: Env,
  task: Task,
  runId: string,
  type: ReminderDeliveryType,
  idempotencyKey: string,
  channelId: string
): Promise<EmailSendResult> {
  if (channelId === "email") return sendReminderEmail(env, task, runId, type, idempotencyKey);
  const channel = await findNotificationChannel(env, channelId);
  if (!channel || !channel.enabled) {
    await logAudit(env, { type: "system", email: "system" }, "notification_channel_skipped", "task", task.id, {
      runId, type, channelId, reason: "channel is disabled or deleted",
    });
    return { success: true, provider: "skipped", providerMessageId: null, errorMessage: null };
  }
  return sendCustomNotification(env, task, runId, type, idempotencyKey, channel);
}

async function sendCustomNotification(
  env: Env,
  task: Task,
  runId: string,
  type: ReminderDeliveryType,
  deliveryKey: string,
  channel: NotificationChannel
): Promise<EmailSendResult> {
  const provider = channel.type;
  const config = parseConfig(channel.config_json);
  const title = task.title;
  const content = `${task.body}\n\n任务编号：${runId}${type === "nag" ? "\n这是一次追提醒。" : ""}`;
  let success = false;
  let errorMessage: string | null = null;
  let providerMessageId: string | null = null;
  try {
    const request = buildChannelRequest(provider, config, title, content);
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(15_000),
    });
    const responseText = await readLimitedText(response, MAX_PROVIDER_RESPONSE_BYTES, "Notification provider response is too large");
    if (!response.ok) throw new Error(`${provider} rejected request with status ${response.status}`);
    const payload = safeJsonParse(responseText) as Record<string, unknown> | null;
    providerMessageId = String(payload?.id ?? payload?.message_id ?? payload?.request_id ?? "") || null;
    success = true;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO send_logs (
       run_id, task_id, type, recipient_email, subject, provider, provider_message_id,
       success, error_message, delivery_key, created_at_utc
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(runId, task.id, type, channel.name, title, provider, providerMessageId, success ? 1 : 0, errorMessage, deliveryKey, now).run();
  await logAudit(env, { type: "system", email: "system" }, success ? "notification_send_success" : "notification_send_failed", "task", task.id, {
    runId, type, channelId: channel.id, channelType: channel.type,
    error: errorMessage ? sanitizeLogText(errorMessage, 240) : null,
  });
  return { success, provider, providerMessageId, errorMessage };
}

function buildChannelRequest(
  type: string,
  config: Record<string, string>,
  title: string,
  content: string
): { url: string; method: string; headers: Record<string, string>; body?: string } {
  const json = (url: string, body: unknown, headers: Record<string, string> = {}) => ({
    url, method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  switch (type) {
    case "bark":
      return json(config.endpoint, { title, body: content, group: "Mailbell" });
    case "gotify": {
      const url = new URL(config.endpoint.replace(/\/$/, "") + "/message");
      url.searchParams.set("token", config.token);
      return json(url.toString(), { title, message: content, priority: 5 });
    }
    case "pushdeer":
      return json(`${(config.serverUrl || "https://api2.pushdeer.com").replace(/\/$/, "")}/message/push`, { pushkey: config.pushKey, text: title, desp: content, type: "text" });
    case "pushplus":
      return json("https://www.pushplus.plus/send", { token: config.token, title, content, topic: config.topic || undefined });
    case "telegram":
      return json(`https://api.telegram.org/bot${config.botToken}/sendMessage`, { chat_id: config.chatId, text: `${title}\n\n${content}` });
    case "dingtalk":
      return json(config.webhookUrl, { msgtype: "text", text: { content: `${title}\n\n${content}` } });
    case "wecom":
      return json(config.webhookUrl, { msgtype: "text", text: { content: `${title}\n\n${content}` } });
    case "feishu":
      return json(config.webhookUrl, { msg_type: "text", content: { text: `${title}\n\n${content}` } });
    case "webhook": {
      const method = (config.method || "POST").toUpperCase();
      const replace = (value: string) => value.replaceAll("$title", title).replaceAll("$content", content);
      const url = config.url.replaceAll("$title", encodeURIComponent(title)).replaceAll("$content", encodeURIComponent(content));
      const headers = config.headers ? parseHeaders(config.headers) : {};
      if (method === "GET") return { url, method, headers };
      const body = config.bodyTemplate ? replace(config.bodyTemplate) : JSON.stringify({ title, content });
      return { url, method, headers: { "Content-Type": config.contentType || "application/json", ...headers }, body };
    }
    default:
      throw new Error(`Unsupported notification channel: ${type}`);
  }
}

function parseConfig(value: string): Record<string, string> {
  try { return JSON.parse(value) as Record<string, string>; } catch { throw new Error("Notification channel configuration is invalid"); }
}

function parseHeaders(value: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index > 0) headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return headers;
}
