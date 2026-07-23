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
  const title = task.title;
  const content = `${task.body}\n\n任务编号：${runId}${type === "nag" ? "\n这是一次追提醒。" : ""}`;
  const result = await deliverNotificationChannel(channel, title, content);
  const { success, provider, providerMessageId, errorMessage } = result;

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
  return result;
}

export async function sendNotificationChannelTest(channel: NotificationChannel): Promise<EmailSendResult> {
  const sentAt = new Date().toISOString();
  return deliverNotificationChannel(
    channel,
    "Cloudflare Reminder 测试通知",
    `如果你收到这条消息，说明“${channel.name}”渠道配置正确。\n\n发送时间：${sentAt}`
  );
}

async function deliverNotificationChannel(
  channel: NotificationChannel,
  title: string,
  content: string
): Promise<EmailSendResult> {
  const provider = channel.type;
  let providerMessageId: string | null = null;
  try {
    const request = await buildChannelRequest(provider, parseConfig(channel.config_json), title, content);
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(15_000),
    });
    const responseText = await readLimitedText(response, MAX_PROVIDER_RESPONSE_BYTES, "Notification provider response is too large");
    if (!response.ok) throw new Error(`${provider} rejected request with status ${response.status}`);
    const payload = safeJsonParse(responseText) as Record<string, unknown> | null;
    validateProviderResponse(provider, payload);
    providerMessageId = String(payload?.id ?? payload?.message_id ?? payload?.request_id ?? "") || null;
    return { success: true, provider, providerMessageId, errorMessage: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, provider, providerMessageId, errorMessage };
  }
}

export async function buildChannelRequest(
  type: string,
  config: Record<string, string>,
  title: string,
  content: string
): Promise<{ url: string; method: string; headers: Record<string, string>; body?: string }> {
  const json = (url: string, body: unknown, headers: Record<string, string> = {}) => ({
    url, method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  switch (type) {
    case "bark": {
      const base = config.deviceKey
        ? `${(config.serverUrl || "https://api.day.app").replace(/\/$/, "")}/${config.deviceKey}`
        : config.endpoint;
      const url = new URL(`${base.replace(/\/$/, "")}/${encodeURIComponent(title)}/${encodeURIComponent(content)}`);
      for (const [key, value] of Object.entries({
        sound: config.sound, group: config.group || "Mailbell", icon: config.iconUrl,
        level: config.level, url: config.openUrl,
      })) if (value) url.searchParams.set(key, value);
      return { url: url.toString(), method: "GET", headers: {} };
    }
    case "gotify": {
      const url = new URL((config.serverUrl || config.endpoint).replace(/\/$/, "") + "/message");
      url.searchParams.set("token", config.token);
      return json(url.toString(), { title, message: content, priority: Number(config.priority || 0) });
    }
    case "pushdeer": {
      const endpoint = config.endpoint
        || (config.serverUrl ? `${config.serverUrl.replace(/\/$/, "")}/message/push` : "https://api2.pushdeer.com/message/push");
      return json(endpoint, { pushkey: config.pushKey, text: title, desp: content, type: "markdown" });
    }
    case "pushplus":
      return json("https://www.pushplus.plus/send", { token: config.token, title, content, topic: config.topic || undefined });
    case "telegram":
      return json(`${(config.apiHost || "https://api.telegram.org").replace(/\/$/, "")}/bot${config.botToken}/sendMessage`, {
        chat_id: config.chatId, text: `${title}\n\n${content}`, disable_web_page_preview: true,
      });
    case "dingtalk": {
      const accessToken = config.accessToken || readQueryParam(config.webhookUrl, "access_token");
      const url = new URL("https://oapi.dingtalk.com/robot/send");
      url.searchParams.set("access_token", accessToken);
      if (config.secret) {
        const timestamp = Date.now().toString();
        url.searchParams.set("timestamp", timestamp);
        url.searchParams.set("sign", await makeDingTalkSignature(timestamp, config.secret));
      }
      return json(url.toString(), { msgtype: "text", text: { content: `${title}\n\n${content}` } });
    }
    case "wecom": {
      const key = config.key || readQueryParam(config.webhookUrl, "key");
      const origin = (config.origin || "https://qyapi.weixin.qq.com").replace(/\/$/, "");
      return json(`${origin}/cgi-bin/webhook/send?key=${encodeURIComponent(key)}`, { msgtype: "text", text: { content: `${title}\n\n${content}` } });
    }
    case "feishu": {
      const key = config.key || config.webhookUrl?.split("/").filter(Boolean).at(-1) || "";
      return json(`https://open.feishu.cn/open-apis/bot/v2/hook/${encodeURIComponent(key)}`, { msg_type: "text", content: { text: `${title}\n\n${content}` } });
    }
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

export function validateProviderResponse(type: string, payload: Record<string, unknown> | null): void {
  if (type === "webhook") return;
  if (!payload) throw new Error(`${type}: provider returned an invalid response`);
  const ok = type === "bark" ? Number(payload.code) === 200
    : type === "gotify" ? Boolean(payload.id)
    : type === "pushdeer" ? hasPushDeerResult(payload)
    : type === "pushplus" ? Number(payload.code) === 200
    : type === "telegram" ? payload.ok === true
    : type === "dingtalk" || type === "wecom" ? Number(payload.errcode) === 0
    : type === "feishu" ? Number(payload.StatusCode ?? payload.code) === 0
    : true;
  if (!ok) {
    const message = String(payload.message ?? payload.msg ?? payload.errmsg ?? payload.error ?? "provider returned an error");
    throw new Error(`${type}: ${sanitizeLogText(message, 200)}`);
  }
}

function hasPushDeerResult(payload: Record<string, unknown>): boolean {
  const content = payload.content as { result?: unknown[] | string } | undefined;
  return Boolean(content?.result && content.result.length > 0);
}

function readQueryParam(value: string | undefined, name: string): string {
  if (!value) return "";
  try { return new URL(value).searchParams.get(name) || ""; } catch { return ""; }
}

async function makeDingTalkSignature(timestamp: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}\n${secret}`)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
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
