import { Check, Pause, Play, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Empty, NoticeBox } from "../components/common";
import { TASK_BODY_MAX_CHARS, TASK_DEFAULT_MAX_NAG_COUNT, TASK_MAX_INTERVAL_MINUTES, TASK_MAX_NAG_COUNT, TASK_TITLE_MAX_CHARS } from "../constants";
import { api, errorMessage } from "../lib/api";
import { countCharacters, durationAmount, durationToMinutes, formatDuration, formatTime, maxDurationAmount, parseDateTimeInGmt8, statusLabel, toDateTimeLocalValue } from "../lib/format";
import type { DueMode, Notice, NotificationChannel, SessionPayload, Task, TaskUsage } from "../types";

export function TasksPage({ session }: { session: SessionPayload }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskUsage, setTaskUsage] = useState<TaskUsage | null>(null);
  const [status, setStatus] = useState("all");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Task | null>(null);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const basePath = session.isAdmin ? "/admin/tasks" : "/user/tasks";

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api<{ tasks: Task[]; taskUsage?: TaskUsage }>(`${basePath}?status=${encodeURIComponent(status)}&limit=50`);
      setTasks(payload.tasks || []);
      setTaskUsage(payload.taskUsage || null);
      const usageEl = document.getElementById("task-usage-inline");
      if (usageEl && payload.taskUsage) {
        usageEl.textContent = `${payload.taskUsage.used} tasks`;
      }
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [basePath, status]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    api<{ channels: NotificationChannel[] }>("/notification-channels")
      .then((payload) => setChannels(payload.channels || []))
      .catch((error) => setNotice({ type: "error", message: errorMessage(error) }));
  }, []);

  async function processDue() {
    try {
      const summary = await api<{ createdRuns: number; nagReminders: number }>("/admin/process-due", { method: "POST" });
      setNotice({ type: "ok", message: `已检查：新建 ${summary.createdRuns}，追提醒 ${summary.nagReminders}` });
      await loadTasks();
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    }
  }

  async function runTaskAction(task: Task, action: "pause" | "resume" | "cancel" | "delete") {
    if (action === "delete" && !window.confirm("确认删除这个任务？")) {
      return;
    }
    try {
      const path = action === "delete" ? `${basePath}/${encodeURIComponent(task.id)}` : `${basePath}/${encodeURIComponent(task.id)}/${action}`;
      await api(path, { method: action === "delete" ? "DELETE" : "POST" });
      setNotice({ type: "ok", message: "任务已更新" });
      await loadTasks();
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    }
  }

  return (
    <section className="tasks-layout">
      <TaskEditor
        basePath={basePath}
        editing={editing}
        channels={channels}
        onDone={(message) => {
          setEditing(null);
          setNotice({ type: "ok", message });
          return loadTasks();
        }}
        onCancel={() => setEditing(null)}
        onError={(message) => setNotice({ type: "error", message })}
      />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>任务</h2>
            <p>{session.isAdmin ? "管理员任务列表" : taskUsage ? `${taskUsage.used} tasks` : "我的提醒任务"}</p>
          </div>
          <div className="head-actions">
            {session.isAdmin && (
              <button className="quiet icon-text" type="button" onClick={() => { void processDue(); }}>
                <Check size={16} />
                检查
              </button>
            )}
            <button className="quiet icon-text" type="button" onClick={() => { void loadTasks(); }}>
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </div>
        {notice && <NoticeBox notice={notice} onDismiss={() => setNotice(null)} />}
        <div className="filters">
          {["all", "active", "paused", "done", "cancelled"].map((item) => (
            <button key={item} className="filter" type="button" aria-pressed={status === item} onClick={() => setStatus(item)}>
              {statusLabel(item)}
            </button>
          ))}
        </div>
        {loading ? (
          <Empty text="加载中" />
        ) : tasks.length ? (
          <div className="task-list">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} channels={channels} isAdmin={session.isAdmin} onEdit={setEditing} onAction={runTaskAction} />
            ))}
          </div>
        ) : (
          <Empty text="暂无任务" />
        )}
      </section>
    </section>
  );
}

function TaskEditor({
  basePath,
  editing,
  channels,
  onDone,
  onCancel,
  onError,
}: {
  basePath: string;
  editing: Task | null;
  channels: NotificationChannel[];
  onDone: (message: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [dueMode, setDueMode] = useState<DueMode>("relative");
  const [busy, setBusy] = useState(false);
  const [titleValue, setTitleValue] = useState(editing?.title || "");
  const [bodyValue, setBodyValue] = useState(editing?.body || "");
  const [nagUnit, setNagUnit] = useState("hour");
  const editingNagDuration = durationAmount(editing?.nagIntervalMinutes || 60);
  const editingRelativeDuration = durationAmount(editing?.recurrenceIntervalMinutes || 60);
  const editingRelativeStartAt = editing?.recurrenceType === "interval" && editing.recurrenceIntervalMinutes
    ? new Date(new Date(editing.nextDueAtUtc).getTime() - editing.recurrenceIntervalMinutes * 60 * 1000).toISOString()
    : null;
  const [nagAbsoluteUnit, setNagAbsoluteUnit] = useState(editingNagDuration.unit);
  const [relativeUnit, setRelativeUnit] = useState(editingRelativeDuration.unit);

  useEffect(() => {
    setDueMode(editing?.recurrenceType === "interval" || !editing ? "relative" : "absolute");
    setTitleValue(editing?.title || "");
    setBodyValue(editing?.body || "");
    const nextNagDuration = durationAmount(editing?.nagIntervalMinutes || 60);
    const nextRelativeDuration = durationAmount(editing?.recurrenceIntervalMinutes || 60);
    setNagUnit(nextNagDuration.unit);
    setNagAbsoluteUnit(nextNagDuration.unit);
    setRelativeUnit(nextRelativeDuration.unit);
  }, [editing]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    const body = String(data.get("body") || "").trim() || title;
    if (countCharacters(title) > TASK_TITLE_MAX_CHARS) {
      onError(`标题最多 ${TASK_TITLE_MAX_CHARS} 个字符`);
      return;
    }
    if (countCharacters(body) > TASK_BODY_MAX_CHARS) {
      onError(`内容最多 ${TASK_BODY_MAX_CHARS} 个字符`);
      return;
    }

    const nagIntervalMinutes =
      dueMode === "relative"
        ? durationToMinutes(data.get("nagAmount"), data.get("nagUnit"))
        : durationToMinutes(data.get("nagAbsoluteAmount"), data.get("nagAbsoluteUnit"));
    const recurrenceIntervalMinutes =
      dueMode === "relative" ? durationToMinutes(data.get("relativeAmount"), data.get("relativeUnit")) : null;
    const relativeStartAt = String(data.get("relativeStartAt") || "").trim();
    const recurrenceEndAt = String(data.get("recurrenceEndAt") || "");
    const maxNagCount = Number(data.get("maxNagCount") || TASK_DEFAULT_MAX_NAG_COUNT);
    const notificationChannelIds = data.getAll("notificationChannelIds").map(String);
    if (!notificationChannelIds.length) {
      onError("请至少选择一个通知渠道");
      return;
    }
    if (nagIntervalMinutes > TASK_MAX_INTERVAL_MINUTES || (recurrenceIntervalMinutes ?? 0) > TASK_MAX_INTERVAL_MINUTES) {
      onError("提醒间隔最多 366 天");
      return;
    }
    if (!Number.isInteger(maxNagCount) || maxNagCount < 0 || maxNagCount > TASK_MAX_NAG_COUNT) {
      onError(`追提醒次数必须在 0-${TASK_MAX_NAG_COUNT} 之间`);
      return;
    }
    if (dueMode === "relative") {
      const startAt = relativeStartAt ? parseDateTimeInGmt8(relativeStartAt) : new Date();
      const intervalMs = Number(recurrenceIntervalMinutes || 0) * 60 * 1000;
      const elapsedMs = Date.now() - startAt.getTime();
      const intervals = Math.max(1, Math.ceil(elapsedMs / intervalMs));
      const firstDueAt = new Date(startAt.getTime() + intervals * intervalMs);
      const endAt = recurrenceEndAt ? parseDateTimeInGmt8(recurrenceEndAt) : null;
      if (Number.isNaN(startAt.getTime())) {
        onError("请输入有效的开始时间");
        return;
      }
      if (endAt && (Number.isNaN(endAt.getTime()) || endAt <= firstDueAt)) {
        onError("结束时间必须晚于第一次提醒时间");
        return;
      }
    }

    setBusy(true);
    const payload: Record<string, unknown> = {
      recipientEmail: String(data.get("recipientEmail") || "").trim(),
      title,
      body,
      nagIntervalMinutes,
      maxNagCount,
      notificationChannelIds,
    };
    if (dueMode === "relative") {
      payload.minutesFromNow = recurrenceIntervalMinutes;
      if (relativeStartAt) payload.startAt = relativeStartAt;
      const recurrencePayload: {
        type: "interval";
        intervalMinutes: number | null;
        anchor: "scheduled_time";
        endAt?: string;
      } = {
        type: "interval",
        intervalMinutes: recurrenceIntervalMinutes,
        anchor: "scheduled_time",
      };
      if (recurrenceEndAt) {
        recurrencePayload.endAt = recurrenceEndAt;
      }
      payload.recurrence = recurrencePayload;
    } else {
      payload.dueAt = String(data.get("dueAt") || "");
    }

    try {
      await api(editing ? `${basePath}/${encodeURIComponent(editing.id)}` : basePath, {
        method: editing ? "PATCH" : "POST",
        body: payload,
      });
      form.reset();
      await onDone(editing ? "提醒已保存" : "提醒已创建");
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel editor">
      <div className="panel-head">
        <div>
          <h2>{editing ? "编辑提醒" : "新建提醒"}</h2>
          <p>{editing ? editing.title : "安排邮件提醒"}</p>
        </div>
      </div>
      <form className="form-grid" key={editing?.id || "new"} onSubmit={(event) => { void submit(event); }}>
        <label>
          收件邮箱
          <input name="recipientEmail" type="email" defaultValue={editing?.recipientEmail || ""} required />
        </label>
        <label>
          标题
          <input
            name="title"
            type="text"
            value={titleValue}
            maxLength={TASK_TITLE_MAX_CHARS}
            onChange={(event) => setTitleValue(event.target.value)}
            required
          />
          <span className="field-hint">{countCharacters(titleValue)}/{TASK_TITLE_MAX_CHARS}</span>
        </label>
        <label>
          内容
          <textarea
            name="body"
            rows={4}
            value={bodyValue}
            maxLength={TASK_BODY_MAX_CHARS}
            onChange={(event) => setBodyValue(event.target.value)}
          />
          <span className="field-hint">{countCharacters(bodyValue)}/{TASK_BODY_MAX_CHARS}</span>
        </label>
        <fieldset className="channel-picker">
          <legend>通知渠道 *</legend>
          <p className="field-help">请至少选择一个渠道。每个渠道独立投递；某个渠道失败不会重复发送其他已成功渠道。</p>
          <div className="channel-options">
            {channels.map((channel) => (
              <label className="channel-option" key={channel.id}>
                <input
                  name="notificationChannelIds"
                  type="checkbox"
                  value={channel.id}
                  defaultChecked={Boolean(editing?.notificationChannelIds.includes(channel.id))}
                />
                <span>
                  <strong>{channel.name}</strong>
                  <small>{channel.type === "email" ? "发送到任务收件邮箱" : channel.type}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="segmented">
          <button type="button" aria-pressed={dueMode === "relative"} onClick={() => setDueMode("relative")}>
            相对时间
          </button>
          <button type="button" aria-pressed={dueMode === "absolute"} onClick={() => setDueMode("absolute")}>
            指定时间
          </button>
        </div>
        {dueMode === "relative" ? (
          <div className="inline-fields">
            <label className="full-field">
              开始时间（GMT+8，可选）
              <input name="relativeStartAt" type="datetime-local" defaultValue={toDateTimeLocalValue(editingRelativeStartAt)} />
              <span className="field-help">为空时默认当前时间；首次通知时间为开始时间加一个通知间隔。</span>
            </label>
            <label>
              通知间隔
              <input
                name="relativeAmount"
                type="number"
                min="1"
                max={maxDurationAmount(relativeUnit)}
                defaultValue={editingRelativeDuration.amount}
                required
              />
            </label>
            <label>
              单位
              <select name="relativeUnit" value={relativeUnit} onChange={(event) => setRelativeUnit(event.target.value)}>
                <option value="minute">分钟</option>
                <option value="hour">小时</option>
                <option value="day">天</option>
              </select>
            </label>
            <label>
              追提醒
              <input name="nagAmount" type="number" min="1" max={maxDurationAmount(nagUnit)} defaultValue={editingNagDuration.amount} required />
            </label>
            <label>
              单位
              <select name="nagUnit" value={nagUnit} onChange={(event) => setNagUnit(event.target.value)}>
                <option value="minute">分钟</option>
                <option value="hour">小时</option>
                <option value="day">天</option>
              </select>
            </label>
            <label>
              最多追
              <input
                name="maxNagCount"
                type="number"
                min="0"
                max={TASK_MAX_NAG_COUNT}
                defaultValue={editing?.maxNagCount ?? TASK_DEFAULT_MAX_NAG_COUNT}
                required
              />
              <span className="field-hint">0-{TASK_MAX_NAG_COUNT}</span>
            </label>
            <label>
              停止时间（GMT+8）
              <input name="recurrenceEndAt" type="datetime-local" defaultValue={toDateTimeLocalValue(editing?.recurrenceEndAtUtc)} />
            </label>
          </div>
        ) : (
          <div className="inline-fields">
            <label>
              到期时间（GMT+8）
              <input name="dueAt" type="datetime-local" defaultValue={toDateTimeLocalValue(editing?.nextDueAtUtc)} required />
            </label>
            <label>
              追提醒
              <input
                name="nagAbsoluteAmount"
                type="number"
                min="1"
                max={maxDurationAmount(nagAbsoluteUnit)}
                defaultValue={editingNagDuration.amount}
                required
              />
            </label>
            <label>
              单位
              <select name="nagAbsoluteUnit" value={nagAbsoluteUnit} onChange={(event) => setNagAbsoluteUnit(event.target.value)}>
                <option value="minute">分钟</option>
                <option value="hour">小时</option>
                <option value="day">天</option>
              </select>
            </label>
            <label>
              最多追
              <input
                name="maxNagCount"
                type="number"
                min="0"
                max={TASK_MAX_NAG_COUNT}
                defaultValue={editing?.maxNagCount ?? TASK_DEFAULT_MAX_NAG_COUNT}
                required
              />
              <span className="field-hint">0-{TASK_MAX_NAG_COUNT}</span>
            </label>
          </div>
        )}
        <div className="form-actions">
          <button className="primary icon-text" type="submit" disabled={busy}>
            {editing ? <Save size={16} /> : <Plus size={16} />}
            {busy ? "保存中..." : editing ? "保存修改" : "创建提醒"}
          </button>
          <button className="quiet" type="button" onClick={onCancel}>
            {editing ? "取消编辑" : "清空"}
          </button>
        </div>
      </form>
    </section>
  );
}

function TaskCard({
  task,
  channels,
  isAdmin,
  onEdit,
  onAction,
}: {
  task: Task;
  channels: NotificationChannel[];
  isAdmin: boolean;
  onEdit: (task: Task) => void;
  onAction: (task: Task, action: "pause" | "resume" | "cancel" | "delete") => Promise<void>;
}) {
  const recurrence = task.recurrenceType === "interval" ? `每 ${formatDuration(task.recurrenceIntervalMinutes)}` : "一次性";
  const recurrenceEnd = task.recurrenceType === "interval" && task.recurrenceEndAtUtc ? `结束 ${formatTime(task.recurrenceEndAtUtc)}` : null;
  return (
    <article className={`task ${task.status}`}>
      <div>
        <h3>{task.title}</h3>
        <p className="task-body">{task.body}</p>
        <div className="meta">
          <span className={`pill status-${task.status}`}>{statusLabel(task.status)}</span>
          {isAdmin && task.userEmail && <span className="pill">{task.userEmail}</span>}
          <span className="pill">{task.recipientEmail}</span>
          <span className="pill">下次 {formatTime(task.nextDueAtUtc)}</span>
          <span className="pill">{recurrence}</span>
          {recurrenceEnd && <span className="pill">{recurrenceEnd}</span>}
          <span className="pill">追 {formatDuration(task.nagIntervalMinutes)}</span>
          <span className="pill">最多追 {task.maxNagCount} 次</span>
          {(task.notificationChannelIds || ["email"]).map((channelId) => (
            <span className="pill channel-pill" key={channelId}>
              {channels.find((channel) => channel.id === channelId)?.name || channelId}
            </span>
          ))}
          {task.currentRun && (
            <span className="pill">
              run {task.currentRun.status || "open"} / {Number(task.currentRun.sentCount || 0)}
            </span>
          )}
        </div>
      </div>
      <div className="task-actions">
        <button className="quiet" type="button" onClick={() => onEdit(task)}>
          编辑
        </button>
        {task.status === "active" ? (
          <button className="quiet icon-text" type="button" onClick={() => { void onAction(task, "pause"); }}>
            <Pause size={15} />
            暂停
          </button>
        ) : (
          <button className="primary icon-text" type="button" onClick={() => { void onAction(task, "resume"); }}>
            <Play size={15} />
            恢复
          </button>
        )}
        {task.status !== "cancelled" && (
          <button className="danger" type="button" onClick={() => { void onAction(task, "cancel"); }}>
            取消
          </button>
        )}
        <button className="danger icon-text" type="button" onClick={() => { void onAction(task, "delete"); }}>
          <Trash2 size={15} />
          删除
        </button>
      </div>
    </article>
  );
}
