import { BellRing, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import type { Notice, NotificationChannel, NotificationChannelType } from "../types";
import { Empty, Modal, NoticeBox } from "./common";

const TYPES: Array<{ value: Exclude<NotificationChannelType, "email">; label: string }> = [
  { value: "bark", label: "Bark" }, { value: "gotify", label: "Gotify" },
  { value: "pushdeer", label: "PushDeer" }, { value: "pushplus", label: "PushPlus" },
  { value: "telegram", label: "Telegram" }, { value: "dingtalk", label: "钉钉机器人" },
  { value: "wecom", label: "企业微信机器人" }, { value: "feishu", label: "飞书机器人" },
  { value: "webhook", label: "自定义 Webhook" },
];

const FIELDS: Record<string, Array<{ key: string; label: string; placeholder?: string; multiline?: boolean }>> = {
  bark: [{ key: "endpoint", label: "Bark 完整推送地址", placeholder: "https://api.day.app/设备密钥" }],
  gotify: [{ key: "endpoint", label: "Gotify 服务地址", placeholder: "https://gotify.example.com" }, { key: "token", label: "应用 Token" }],
  pushdeer: [{ key: "pushKey", label: "Push Key" }, { key: "serverUrl", label: "服务地址（可选）", placeholder: "https://api2.pushdeer.com" }],
  pushplus: [{ key: "token", label: "Token" }, { key: "topic", label: "群组编码（可选）" }],
  telegram: [{ key: "botToken", label: "Bot Token" }, { key: "chatId", label: "Chat ID" }],
  dingtalk: [{ key: "webhookUrl", label: "钉钉 Webhook URL" }],
  wecom: [{ key: "webhookUrl", label: "企业微信 Webhook URL" }],
  feishu: [{ key: "webhookUrl", label: "飞书 Webhook URL" }],
  webhook: [
    { key: "url", label: "请求 URL", placeholder: "可使用 $title 和 $content" },
    { key: "method", label: "请求方法", placeholder: "POST" },
    { key: "contentType", label: "Content-Type", placeholder: "application/json" },
    { key: "headers", label: "请求头（每行一个）", multiline: true },
    { key: "bodyTemplate", label: "请求体模板", placeholder: '{"title":"$title","content":"$content"}', multiline: true },
  ],
};

export function NotificationChannelsPanel() {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [editing, setEditing] = useState<NotificationChannel | null>(null);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<Exclude<NotificationChannelType, "email">>("bark");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    const payload = await api<{ channels: NotificationChannel[] }>("/admin/notification-channels");
    setChannels(payload.channels || []);
  }, []);

  useEffect(() => { load().catch((error) => setNotice({ type: "error", message: errorMessage(error) })); }, [load]);

  function showEditor(channel: NotificationChannel | null) {
    setEditing(channel);
    setType(channel && channel.type !== "email" ? channel.type : "bark");
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const config = Object.fromEntries((FIELDS[type] || []).map((field) => [field.key, String(data.get(field.key) || "").trim()]));
    setBusy(true);
    try {
      await api(editing ? `/admin/notification-channels/${encodeURIComponent(editing.id)}` : "/admin/notification-channels", {
        method: editing ? "PATCH" : "POST",
        body: { name: String(data.get("name") || "").trim(), type, enabled: data.get("enabled") === "on", config },
      });
      setOpen(false);
      setNotice({ type: "ok", message: editing ? "通知渠道已更新" : "通知渠道已创建" });
      await load();
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    } finally { setBusy(false); }
  }

  async function remove(channel: NotificationChannel) {
    if (!window.confirm(`确认删除通知渠道“${channel.name}”？使用它的任务会自动回退到邮件渠道。`)) return;
    try {
      await api(`/admin/notification-channels/${encodeURIComponent(channel.id)}`, { method: "DELETE" });
      setNotice({ type: "ok", message: "通知渠道已删除" });
      await load();
    } catch (error) { setNotice({ type: "error", message: errorMessage(error) }); }
  }

  return (
    <section className="panel channel-panel">
      <div className="panel-head">
        <div><h2>通知渠道</h2><p>统一配置推送服务，创建任务时按需多选</p></div>
        <button className="primary icon-text" type="button" onClick={() => showEditor(null)}><Plus size={16} />新增渠道</button>
      </div>
      {notice && <NoticeBox notice={notice} onDismiss={() => setNotice(null)} />}
      {channels.length ? (
        <div className="channel-list">
          {channels.map((channel) => (
            <article className="channel-row" key={channel.id}>
              <div className="channel-icon" aria-hidden="true"><BellRing size={18} /></div>
              <div className="channel-summary">
                <strong>{channel.name}</strong>
                <span>{channel.type}{channel.enabled ? " · 已启用" : " · 已停用"}{channel.builtIn ? " · 内置" : ""}</span>
              </div>
              {!channel.builtIn && <div className="channel-actions">
                <button className="quiet icon-text" type="button" onClick={() => showEditor(channel)}><Pencil size={15} />编辑</button>
                <button className="danger icon-text" type="button" onClick={() => { void remove(channel); }}><Trash2 size={15} />删除</button>
              </div>}
            </article>
          ))}
        </div>
      ) : <Empty text="暂无通知渠道" />}
      {open && <Modal title={editing ? "编辑通知渠道" : "新增通知渠道"} onClose={() => setOpen(false)}>
        <form className="channel-form" onSubmit={(event) => { void submit(event); }}>
          <label>渠道名称<input name="name" required maxLength={40} defaultValue={editing?.name || ""} /></label>
          <label>渠道类型<select value={type} onChange={(event) => setType(event.target.value as Exclude<NotificationChannelType, "email">)}>
            {TYPES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select></label>
          {(FIELDS[type] || []).map((field) => <label key={`${type}-${field.key}`}>{field.label}
            {field.multiline
              ? <textarea name={field.key} rows={4} placeholder={field.placeholder} defaultValue={editing?.type === type ? editing.config?.[field.key] || "" : ""} />
              : <input name={field.key} placeholder={field.placeholder} defaultValue={editing?.type === type ? editing.config?.[field.key] || "" : ""} />}
          </label>)}
          <label className="remember"><input name="enabled" type="checkbox" defaultChecked={editing?.enabled ?? true} />启用该渠道</label>
          <p className="field-help">渠道凭据保存在 D1，仅管理员接口可读取。自定义 Webhook 支持 $title、$content 占位符。</p>
          <div className="form-actions"><button className="primary icon-text" type="submit" disabled={busy}><Save size={16} />{busy ? "保存中..." : "保存渠道"}</button><button className="quiet" type="button" onClick={() => setOpen(false)}>取消</button></div>
        </form>
      </Modal>}
    </section>
  );
}
