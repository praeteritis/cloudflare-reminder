import { BellRing, Pencil, Plus, Save, Send, Trash2 } from "lucide-react";
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

type ChannelField = { key: string; label: string; placeholder?: string; multiline?: boolean; required?: boolean; secret?: boolean; help?: string };

const FIELDS: Record<string, ChannelField[]> = {
  bark: [
    { key: "deviceKey", label: "设备 Key", required: true, secret: true, help: "Bark 推送地址最后一段，例如 https://api.day.app/abc 中的 abc。" },
    { key: "serverUrl", label: "服务器地址（可选）", placeholder: "https://api.day.app" },
    { key: "sound", label: "提示音（可选）" }, { key: "group", label: "分组（可选）", placeholder: "Mailbell" },
  ],
  gotify: [
    { key: "serverUrl", label: "Gotify 服务地址", placeholder: "https://gotify.example.com", required: true },
    { key: "token", label: "应用 Token", required: true, secret: true },
    { key: "priority", label: "优先级（可选）", placeholder: "0" },
  ],
  pushdeer: [
    { key: "pushKey", label: "Push Key", required: true, secret: true },
    { key: "endpoint", label: "API 地址（可选）", placeholder: "https://api2.pushdeer.com/message/push", help: "仅自建 PushDeer 服务时填写完整推送接口地址。" },
  ],
  pushplus: [{ key: "token", label: "Token", required: true, secret: true }, { key: "topic", label: "群组编码（可选）" }],
  telegram: [
    { key: "botToken", label: "Bot Token", required: true, secret: true }, { key: "chatId", label: "用户或群组 ID", required: true },
    { key: "apiHost", label: "API Host（可选）", placeholder: "https://api.telegram.org", help: "使用 Telegram API 反向代理时填写。" },
  ],
  dingtalk: [
    { key: "accessToken", label: "Access Token", required: true, secret: true, help: "钉钉机器人 Webhook 中 access_token= 后面的值。" },
    { key: "secret", label: "加签 Secret（可选）", secret: true, help: "机器人安全设置启用“加签”时填写 SEC 开头的密钥。" },
  ],
  wecom: [
    { key: "key", label: "机器人 Key", required: true, secret: true, help: "企业微信 Webhook 中 key= 后面的值。" },
    { key: "origin", label: "API 地址（可选）", placeholder: "https://qyapi.weixin.qq.com" },
  ],
  feishu: [{ key: "key", label: "机器人 Key", required: true, secret: true, help: "飞书 Webhook 地址最后一段的标识。" }],
  webhook: [
    { key: "url", label: "请求 URL", placeholder: "可使用 $title 和 $content", required: true },
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
  const [testingId, setTestingId] = useState<string | null>(null);
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

  async function testChannel(channel: NotificationChannel) {
    setTestingId(channel.id);
    setNotice(null);
    try {
      await api(`/admin/notification-channels/${encodeURIComponent(channel.id)}/test`, { method: "POST" });
      setNotice({ type: "ok", message: `测试通知已通过“${channel.name}”发送` });
    } catch (error) {
      setNotice({ type: "error", message: `“${channel.name}”测试失败：${errorMessage(error)}` });
    } finally {
      setTestingId(null);
    }
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
                <button className="quiet icon-text" type="button" disabled={testingId !== null} onClick={() => { void testChannel(channel); }}>
                  <Send size={15} />{testingId === channel.id ? "发送中..." : "测试"}
                </button>
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
          {(FIELDS[type] || []).map((field) => <label key={`${type}-${field.key}`}>
            <span>{field.label}{field.required ? " *" : ""}</span>
            {field.multiline
              ? <textarea name={field.key} rows={4} required={field.required} placeholder={field.placeholder} defaultValue={editing?.type === type ? editing.config?.[field.key] || "" : ""} />
              : <input name={field.key} type={field.secret ? "password" : "text"} autoComplete="off" required={field.required} placeholder={field.placeholder} defaultValue={editing?.type === type ? editing.config?.[field.key] || "" : ""} />}
            {field.help && <small className="config-field-help">{field.help}</small>}
          </label>)}
          <label className="remember"><input name="enabled" type="checkbox" defaultChecked={editing?.enabled ?? true} />启用该渠道</label>
          <p className="field-help">渠道凭据保存在 D1，仅管理员接口可读取。自定义 Webhook 支持 $title、$content 占位符。</p>
          <div className="form-actions"><button className="primary icon-text" type="submit" disabled={busy}><Save size={16} />{busy ? "保存中..." : "保存渠道"}</button><button className="quiet" type="button" onClick={() => setOpen(false)}>取消</button></div>
        </form>
      </Modal>}
    </section>
  );
}
