import {
  Activity,
  AlertCircle,
  Bell,
  Check,
  Copy,
  ClipboardList,
  Download,
  LogOut,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  UserCog,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

type TaskStatus = "active" | "done" | "paused" | "cancelled";
type NoticeType = "ok" | "error";
type DueMode = "relative" | "absolute";

interface AppSettings {
  allowRegistration?: boolean;
  requireInvite?: boolean;
  announcementText?: string;
}

interface SessionPayload {
  ok: boolean;
  authenticated: boolean;
  isAdmin: boolean;
  userEmail: string | null;
  settings: AppSettings;
}

interface PagePayload {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

interface Task {
  id: string;
  recipientEmail: string;
  title: string;
  body: string;
  status: TaskStatus;
  nextDueAtUtc: string;
  recurrenceType: "none" | "interval";
  recurrenceIntervalMinutes: number | null;
  recurrenceAnchor: "scheduled_time" | "completion_time";
  recurrenceEndAtUtc: string | null;
  nagIntervalMinutes: number;
  maxNagCount: number;
  userEmail?: string | null;
  currentRun?: {
    status?: string;
    sentCount?: number;
  } | null;
}

interface TaskUsage {
  used: number;
  limit: number;
}

interface UserRow {
  id: string;
  email: string;
  status: string;
  linuxdoUsername?: string | null;
  taskCount?: number;
  taskLimit?: number;
  lastLoginAtUtc?: string | null;
}

interface InviteRow {
  code: string;
  usedAtUtc?: string | null;
  usedByEmail?: string | null;
  expiresAtUtc?: string | null;
  createdAtUtc?: string | null;
  expired?: boolean;
}

interface LogRow {
  id?: number;
  createdAtUtc: string;
  type?: "reminder" | "nag" | "completion";
  status?: "success" | "failed";
  success?: boolean;
  taskTitle?: string | null;
  taskId?: string | null;
  ownerEmail?: string | null;
  recipientEmail?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  dueAtUtc?: string | null;
  runStatus?: string | null;
}

interface Notice {
  type: NoticeType;
  message: string;
}

const PAGE_SIZE = 20;
const TASK_TITLE_MAX_CHARS = 20;
const TASK_BODY_MAX_CHARS = 200;
const TASK_MAX_INTERVAL_MINUTES = 366 * 24 * 60;
const TASK_DEFAULT_MAX_NAG_COUNT = 3;
const TASK_MAX_NAG_COUNT = 10;
const GITHUB_REPOSITORY_URL = "https://github.com/maya1900/cloudflare-reminder";
const MAX_CLIENT_ERROR_REPORTS = 8;
const reportedClientErrors = new Set<string>();
let clientErrorReportCount = 0;

export function App() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => installClientErrorReporting(), []);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api<SessionPayload>("/auth/session");
      setSession(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession().catch(() => setLoading(false));
  }, [refreshSession]);

  if (loading) {
    return <div className="boot">加载中</div>;
  }

  if (!session?.authenticated) {
    return <LoginPage settings={session?.settings || {}} onSignedIn={refreshSession} />;
  }

  return <AuthedApp session={session} onSessionChange={refreshSession} />;
}

function LoginPage({ settings, onSignedIn }: { settings: AppSettings; onSignedIn: () => Promise<void> }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const pendingLinuxdoToken = params.get("linuxdoPending") || "";
  const linuxdoError = params.get("linuxdoError") || "";
  const initialMode = pendingLinuxdoToken ? "linuxdo" : "user-login";
  const [mode, setMode] = useState(initialMode);
  const [notice, setNotice] = useState<Notice | null>(
    pendingLinuxdoToken
      ? { type: "ok", message: "Linux.do 授权成功，请填写邀请码完成注册。" }
      : linuxdoError
        ? { type: "error", message: linuxdoError }
        : null
  );

  async function finishLogin() {
    await onSignedIn();
    navigate("/tasks", { replace: true });
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-head">
          <div className="mark">M</div>
          <div>
            <h1>邮件铃</h1>
            <div className="sub">Mailbell</div>
          </div>
        </div>

        {mode !== "linuxdo" && (
          <div className="tabs" aria-label="登录方式">
            <button className="tab" type="button" aria-pressed={mode === "user-login"} onClick={() => setMode("user-login")}>
              用户登录
            </button>
            <button className="tab" type="button" aria-pressed={mode === "register"} onClick={() => setMode("register")}>
              注册
            </button>
            <button className="tab" type="button" aria-pressed={mode === "admin"} onClick={() => setMode("admin")}>
              管理员
            </button>
          </div>
        )}

        {notice && <NoticeBox notice={notice} onDismiss={() => setNotice(null)} />}

        {mode === "user-login" && (
          <PasswordAuthForm
            kind="login"
            path="/auth/user-login"
            submitLabel="登录"
            onDone={finishLogin}
            onNotice={setNotice}
          />
        )}
        {mode === "register" && (
          <PasswordAuthForm
            kind="register"
            path="/auth/register"
            submitLabel={settings.allowRegistration === false ? "注册暂未开放" : "注册并进入"}
            disabled={settings.allowRegistration === false}
            requireInvite={settings.requireInvite === true}
            onDone={finishLogin}
            onNotice={setNotice}
          />
        )}
        {mode === "linuxdo" && (
          <LinuxdoCompleteForm pendingToken={pendingLinuxdoToken} onDone={finishLogin} onNotice={setNotice} />
        )}
        {mode === "admin" && (
          <AdminLoginForm onDone={finishLogin} onNotice={setNotice} />
        )}
      </section>
    </main>
  );
}

function PasswordAuthForm({
  kind,
  path,
  submitLabel,
  disabled,
  requireInvite,
  onDone,
  onNotice,
}: {
  kind: "login" | "register";
  path: string;
  submitLabel: string;
  disabled?: boolean;
  requireInvite?: boolean;
  onDone: () => Promise<void>;
  onNotice: (notice: Notice | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onNotice(null);
    const data = new FormData(event.currentTarget);
    try {
      await api(path, {
        method: "POST",
        body: {
          email: String(data.get("email") || "").trim(),
          password: String(data.get("password") || ""),
          inviteCode: String(data.get("inviteCode") || "").trim(),
          remember: data.get("remember") === "on",
        },
      });
      await onDone();
    } catch (error) {
      onNotice({ type: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        邮箱
        <input name="email" type="email" autoComplete="email" autoFocus required />
      </label>
      <label>
        密码
        <input
          name="password"
          type="password"
          autoComplete={kind === "register" ? "new-password" : "current-password"}
          minLength={kind === "register" ? 8 : undefined}
          required
        />
      </label>
      {kind === "register" && requireInvite && (
        <label>
          邀请码
          <input name="inviteCode" type="text" autoComplete="off" required />
        </label>
      )}
      <label className="remember">
        <input name="remember" type="checkbox" defaultChecked={kind === "register"} />
        记住登录
      </label>
      <button type="submit" disabled={disabled || busy}>
        {busy ? "处理中..." : submitLabel}
      </button>
      <button type="button" className="secondary-action" onClick={() => (window.location.href = "/auth/linuxdo/start")}>
        使用 Linux.do 登录
      </button>
    </form>
  );
}

function AdminLoginForm({ onDone, onNotice }: { onDone: () => Promise<void>; onNotice: (notice: Notice | null) => void }) {
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onNotice(null);
    const data = new FormData(event.currentTarget);
    try {
      await api("/auth/login", {
        method: "POST",
        body: {
          token: String(data.get("token") || "").trim(),
          remember: data.get("remember") === "on",
        },
      });
      await onDone();
    } catch (error) {
      onNotice({ type: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        Admin Token
        <input name="token" type="password" autoComplete="current-password" required />
      </label>
      <label className="remember">
        <input name="remember" type="checkbox" />
        记住登录
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "处理中..." : "进入管理台"}
      </button>
    </form>
  );
}

function LinuxdoCompleteForm({
  pendingToken,
  onDone,
  onNotice,
}: {
  pendingToken: string;
  onDone: () => Promise<void>;
  onNotice: (notice: Notice | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onNotice(null);
    const data = new FormData(event.currentTarget);
    try {
      await api("/auth/linuxdo/complete", {
        method: "POST",
        body: {
          pendingToken,
          inviteCode: String(data.get("inviteCode") || "").trim(),
        },
      });
      await onDone();
    } catch (error) {
      onNotice({ type: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        邀请码
        <input name="inviteCode" type="text" autoComplete="off" autoFocus required />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "处理中..." : "完成 Linux.do 注册"}
      </button>
    </form>
  );
}

function AuthedApp({ session, onSessionChange }: { session: SessionPayload; onSessionChange: () => Promise<void> }) {
  const navigate = useNavigate();
  const [announcementOpen, setAnnouncementOpen] = useState(Boolean(session.settings.announcementText));

  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    await onSessionChange();
    navigate("/", { replace: true });
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" to="/tasks">
          <span className="mark">M</span>
          <span>
            <strong>邮件铃</strong>
            <span>Mailbell</span>
          </span>
        </Link>
        <div className="account-tools">
          <AccountStatus session={session} />
          {session.settings.announcementText && (
            <button className="icon-button" type="button" title="查看公告" aria-label="查看公告" onClick={() => setAnnouncementOpen(true)}>
              <Bell size={18} />
            </button>
          )}
          <a className="github-link" href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer" aria-label="打开 GitHub 仓库" title="GitHub 仓库">
            <GitHubLogo />
          </a>
          <button className="quiet icon-text" type="button" onClick={logout}>
            <LogOut size={16} />
            退出
          </button>
        </div>
      </header>

      <main className="shell">
        <NavTabs isAdmin={session.isAdmin} />
        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/tasks" element={<TasksPage session={session} />} />
          <Route path="/logs" element={<LogsPage isAdmin={session.isAdmin} />} />
          <Route path="/users" element={session.isAdmin ? <UsersPage /> : <Navigate to="/tasks" replace />} />
          <Route path="/settings" element={session.isAdmin ? <SettingsPage onSettingsChange={onSessionChange} /> : <Navigate to="/tasks" replace />} />
          <Route
            path="/announcement"
            element={session.isAdmin ? <AnnouncementPage onSettingsChange={onSessionChange} /> : <Navigate to="/tasks" replace />}
          />
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Routes>
      </main>

      {announcementOpen && session.settings.announcementText && (
        <Modal title="公告" onClose={() => setAnnouncementOpen(false)}>
          <div className="modal-body">{session.settings.announcementText}</div>
        </Modal>
      )}
    </div>
  );
}

function GitHubLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.54 2.86 8.39 6.84 9.75.5.09.68-.22.68-.49 0-.24-.01-1.05-.01-1.9-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.51-1.11-1.51-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.35 9.35 0 0 1 12 6.98c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.11 10.11 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function NavTabs({ isAdmin }: { isAdmin: boolean }) {
  const location = useLocation();
  const items = [
    { to: "/tasks", label: "任务", icon: ClipboardList, show: true },
    { to: "/users", label: "用户", icon: UserCog, show: isAdmin },
    { to: "/settings", label: "设置", icon: Settings, show: isAdmin },
    { to: "/announcement", label: "公告", icon: Megaphone, show: isAdmin },
    { to: "/logs", label: "执行日志", icon: Activity, show: true },
  ];

  return (
    <nav className="view-tabs" aria-label="后台视图">
      {items
        .filter((item) => item.show)
        .map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.to} className="view-tab" aria-current={location.pathname === item.to ? "page" : undefined} to={item.to}>
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}

function AccountStatus({ session }: { session: SessionPayload }) {
  if (session.isAdmin) {
    return <div className="account-status">admin session</div>;
  }

  return (
    <div className="account-status" title={session.userEmail || "user"}>
      <span className="account-email">{session.userEmail || "user"}</span>
      <span id="task-usage-inline" className="account-usage">
        tasks
      </span>
    </div>
  );
}

function TasksPage({ session }: { session: SessionPayload }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskUsage, setTaskUsage] = useState<TaskUsage | null>(null);
  const [status, setStatus] = useState("all");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Task | null>(null);
  const basePath = session.isAdmin ? "/admin/tasks" : "/user/tasks";

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api<{ tasks: Task[]; taskUsage?: TaskUsage }>(`${basePath}?status=${encodeURIComponent(status)}&limit=50`);
      setTasks(payload.tasks || []);
      setTaskUsage(payload.taskUsage || null);
      const usageEl = document.getElementById("task-usage-inline");
      if (usageEl && payload.taskUsage) {
        usageEl.textContent = `${payload.taskUsage.used}/${payload.taskUsage.limit} tasks`;
      }
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [basePath, status]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

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
        onDone={async (message) => {
          setEditing(null);
          setNotice({ type: "ok", message });
          await loadTasks();
        }}
        onCancel={() => setEditing(null)}
        onError={(message) => setNotice({ type: "error", message })}
      />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>任务</h2>
            <p>{session.isAdmin ? "管理员任务列表" : taskUsage ? `${taskUsage.used}/${taskUsage.limit} tasks` : "我的提醒任务"}</p>
          </div>
          <div className="head-actions">
            {session.isAdmin && (
              <button className="quiet icon-text" type="button" onClick={processDue}>
                <Check size={16} />
                检查
              </button>
            )}
            <button className="quiet icon-text" type="button" onClick={loadTasks}>
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
              <TaskCard key={task.id} task={task} isAdmin={session.isAdmin} onEdit={setEditing} onAction={runTaskAction} />
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
  onDone,
  onCancel,
  onError,
}: {
  basePath: string;
  editing: Task | null;
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
    const recurrenceEndAt = String(data.get("recurrenceEndAt") || "");
    const maxNagCount = Number(data.get("maxNagCount") || TASK_DEFAULT_MAX_NAG_COUNT);
    if (nagIntervalMinutes > TASK_MAX_INTERVAL_MINUTES || (recurrenceIntervalMinutes ?? 0) > TASK_MAX_INTERVAL_MINUTES) {
      onError("提醒间隔最多 366 天");
      return;
    }
    if (!Number.isInteger(maxNagCount) || maxNagCount < 0 || maxNagCount > TASK_MAX_NAG_COUNT) {
      onError(`追提醒次数必须在 0-${TASK_MAX_NAG_COUNT} 之间`);
      return;
    }
    if (dueMode === "relative") {
      const firstDueAt = new Date(Date.now() + Number(recurrenceIntervalMinutes || 0) * 60 * 1000);
      const endAt = new Date(recurrenceEndAt);
      if (!recurrenceEndAt || Number.isNaN(endAt.getTime()) || endAt <= firstDueAt) {
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
    };
    if (dueMode === "relative") {
      payload.minutesFromNow = recurrenceIntervalMinutes;
      payload.recurrence = {
        type: "interval",
        intervalMinutes: recurrenceIntervalMinutes,
        anchor: "scheduled_time",
        endAt: recurrenceEndAt,
      };
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
      <form className="form-grid" key={editing?.id || "new"} onSubmit={submit}>
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
            <label>
              每
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
              停止时间
              <input name="recurrenceEndAt" type="datetime-local" defaultValue={toDateTimeLocalValue(editing?.recurrenceEndAtUtc)} required />
            </label>
          </div>
        ) : (
          <div className="inline-fields">
            <label>
              到期时间
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
  isAdmin,
  onEdit,
  onAction,
}: {
  task: Task;
  isAdmin: boolean;
  onEdit: (task: Task) => void;
  onAction: (task: Task, action: "pause" | "resume" | "cancel" | "delete") => void;
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
          <button className="quiet icon-text" type="button" onClick={() => onAction(task, "pause")}>
            <Pause size={15} />
            暂停
          </button>
        ) : (
          <button className="primary icon-text" type="button" onClick={() => onAction(task, "resume")}>
            <Play size={15} />
            恢复
          </button>
        )}
        {task.status !== "cancelled" && (
          <button className="danger" type="button" onClick={() => onAction(task, "cancel")}>
            取消
          </button>
        )}
        <button className="danger icon-text" type="button" onClick={() => onAction(task, "delete")}>
          <Trash2 size={15} />
          删除
        </button>
      </div>
    </article>
  );
}

function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState<PagePayload | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api<{ users: UserRow[]; page: PagePayload }>(`/admin/users?page=${currentPage}&pageSize=${PAGE_SIZE}`);
      setUsers(payload.users || []);
      setPage(payload.page);
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function action(user: UserRow, actionName: "edit" | "ban" | "unban" | "delete") {
    try {
      if (actionName === "edit") {
        const email = window.prompt("新的邮箱", user.email);
        if (!email) return;
        await api(`/admin/users/${encodeURIComponent(user.id)}`, { method: "PATCH", body: { email: email.trim() } });
      }
      if (actionName === "ban") {
        const reason = window.prompt("封禁原因", "");
        await api(`/admin/users/${encodeURIComponent(user.id)}/ban`, { method: "POST", body: { reason: reason || "" } });
      }
      if (actionName === "unban") {
        await api(`/admin/users/${encodeURIComponent(user.id)}/unban`, { method: "POST" });
      }
      if (actionName === "delete") {
        if (!window.confirm("确认删除该用户及其所有数据？")) return;
        await api(`/admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
      }
      setNotice({ type: "ok", message: "用户已更新" });
      await loadUsers();
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    }
  }

  return (
    <section className="panel full">
      <div className="panel-head">
        <div>
          <h2>用户管理</h2>
          <p>编辑、封禁、解封和删除用户</p>
        </div>
        <button className="quiet icon-text" type="button" onClick={loadUsers}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
      {notice && <NoticeBox notice={notice} onDismiss={() => setNotice(null)} />}
      {loading ? (
        <Empty text="加载中" />
      ) : users.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>用户</th>
                <th>状态</th>
                <th>任务</th>
                <th>登录</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.email}</strong>
                    <br />
                    <span className="guide-text">{user.linuxdoUsername ? `Linux.do @${user.linuxdoUsername}` : "邮箱"}</span>
                  </td>
                  <td>{user.status}</td>
                  <td>
                    {Number(user.taskCount || 0)}/{Number(user.taskLimit || 5)}
                  </td>
                  <td>{formatTime(user.lastLoginAtUtc)}</td>
                  <td>
                    <div className="actions">
                      <button className="quiet" type="button" onClick={() => action(user, "edit")}>
                        编辑
                      </button>
                      {user.status === "banned" ? (
                        <button className="primary" type="button" onClick={() => action(user, "unban")}>
                          解封
                        </button>
                      ) : (
                        <button className="danger" type="button" onClick={() => action(user, "ban")}>
                          封禁
                        </button>
                      )}
                      <button className="danger" type="button" onClick={() => action(user, "delete")}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty text="暂无用户" />
      )}
      <Pager page={page} onChange={setCurrentPage} />
    </section>
  );
}

function SettingsPage({ onSettingsChange }: { onSettingsChange: () => Promise<void> }) {
  const [settings, setSettings] = useState<AppSettings>({});
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [page, setPage] = useState<PagePayload | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteExpireOption, setInviteExpireOption] = useState("30");
  const [generatedInvites, setGeneratedInvites] = useState<InviteRow[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadSettings = useCallback(async () => {
    const payload = await api<{ settings: AppSettings }>("/admin/settings");
    setSettings(payload.settings || {});
  }, []);

  const loadInvites = useCallback(async () => {
    const payload = await api<{ invites: InviteRow[]; page: PagePayload }>(`/admin/invites?page=${currentPage}&pageSize=${PAGE_SIZE}`);
    setInvites(payload.invites || []);
    setPage(payload.page);
    setSelected([]);
  }, [currentPage]);

  useEffect(() => {
    loadSettings().catch((error) => setNotice({ type: "error", message: errorMessage(error) }));
  }, [loadSettings]);

  useEffect(() => {
    loadInvites().catch((error) => setNotice({ type: "error", message: errorMessage(error) }));
  }, [loadInvites]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const payload = await api<{ settings: AppSettings }>("/admin/settings", {
        method: "PATCH",
        body: {
          allowRegistration: data.get("allowRegistration") === "on",
          requireInvite: data.get("requireInvite") === "on",
        },
      });
      setSettings(payload.settings || {});
      setNotice({ type: "ok", message: "设置已保存" });
      await onSettingsChange();
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    }
  }

  async function createInvites(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const expiresAt = inviteExpirationFromDays(data);
      const payload = await api<{ invites: InviteRow[] }>("/admin/invites", {
        method: "POST",
        body: {
          count: Number(data.get("count") || 1),
          expiresAt,
        },
      });
      const nextInvites = payload.invites || [];
      setGeneratedInvites(nextInvites);
      setNotice({ type: "ok", message: `已生成 ${nextInvites.length || 1} 个邀请码` });
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        await loadInvites();
      }
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    }
  }

  async function copyInviteCode(code: string) {
    try {
      await copyText(code);
      setNotice({ type: "ok", message: "邀请码已复制" });
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    }
  }

  async function copyGeneratedInvites() {
    const text = generatedInvites.map((invite) => invite.code).join("\n");
    if (!text) return;
    try {
      await copyText(text);
      setNotice({ type: "ok", message: "已复制本次生成的邀请码" });
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    }
  }

  function downloadGeneratedInvites() {
    const text = generatedInvites.map((invite) => invite.code).join("\n");
    if (!text) return;
    downloadText(`invite-codes-${new Date().toISOString().slice(0, 10)}.txt`, text);
    setNotice({ type: "ok", message: "邀请码文件已下载" });
  }

  async function deleteInvites(codes: string[]) {
    if (!codes.length) {
      setNotice({ type: "error", message: "请选择要删除的邀请码" });
      return;
    }
    if (!window.confirm(`确认删除选中的 ${codes.length} 个未使用邀请码？`)) {
      return;
    }
    try {
      const result = await api<{ deleted: number; skipped: number }>("/admin/invites/batch-delete", {
        method: "POST",
        body: { codes },
      });
      setNotice({ type: "ok", message: `已删除 ${result.deleted || 0} 个，跳过 ${result.skipped || 0} 个` });
      await loadInvites();
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    }
  }

  const selectableCodes = useMemo(() => invites.filter((invite) => !invite.usedAtUtc).map((invite) => invite.code), [invites]);

  return (
    <section className="settings-grid-page">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>设置</h2>
            <p>注册开关和邀请码要求</p>
          </div>
        </div>
        {notice && <NoticeBox notice={notice} onDismiss={() => setNotice(null)} />}
        <form className="form-grid" onSubmit={saveSettings}>
          <label className="remember">
            <input name="allowRegistration" type="checkbox" defaultChecked={settings.allowRegistration !== false} key={`allow-${settings.allowRegistration}`} />
            允许用户注册
          </label>
          <label className="remember">
            <input name="requireInvite" type="checkbox" defaultChecked={settings.requireInvite === true} key={`invite-${settings.requireInvite}`} />
            注册需要邀请码
          </label>
          <button className="primary icon-text" type="submit">
            <Save size={16} />
            保存设置
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>邀请码</h2>
            <p>批量生成、分页查看和批量删除</p>
          </div>
          <button
            className="primary icon-text"
            type="button"
            onClick={() => {
              setGeneratedInvites([]);
              setInviteExpireOption("30");
              setInviteModalOpen(true);
            }}
          >
            <Plus size={16} />
            生成
          </button>
        </div>
        <div className="invite-toolbar">
          <button className="danger icon-text" type="button" onClick={() => deleteInvites(selected)}>
            <Trash2 size={16} />
            删除选中
          </button>
        </div>
        {inviteModalOpen && (
          <Modal title="生成邀请码" className="invite-modal" onClose={() => setInviteModalOpen(false)}>
            <form className="invite-form" onSubmit={createInvites}>
              <label>
                数量
                <input name="count" type="number" min="1" max="100" defaultValue="1" />
              </label>
              <label>
                过期天数
                <select name="expiresInDays" value={inviteExpireOption} onChange={(event) => setInviteExpireOption(event.target.value)}>
                  <option value="">不过期</option>
                  <option value="1">1 天</option>
                  <option value="7">7 天</option>
                  <option value="14">14 天</option>
                  <option value="30">30 天</option>
                  <option value="90">90 天</option>
                  <option value="custom">自定义</option>
                </select>
              </label>
              {inviteExpireOption === "custom" && (
                <label>
                  自定义天数
                  <input name="customExpiresInDays" type="number" min="1" max="3650" autoFocus required />
                </label>
              )}
              <button className="primary icon-text invite-submit" type="submit">
                <Plus size={16} />
                生成邀请码
              </button>
            </form>
            {generatedInvites.length > 0 && (
              <div className="generated-invites">
                <div className="generated-head">
                  <strong>本次生成</strong>
                  <div className="actions">
                    <button className="quiet icon-text" type="button" onClick={copyGeneratedInvites}>
                      <Copy size={15} />
                      复制
                    </button>
                    <button className="quiet icon-text" type="button" onClick={downloadGeneratedInvites}>
                      <Download size={15} />
                      下载
                    </button>
                  </div>
                </div>
                <pre>{generatedInvites.map((invite) => invite.code).join("\n")}</pre>
              </div>
            )}
          </Modal>
        )}
        {invites.length ? (
          <div className="table-wrap">
            <table className="table invite-table">
              <colgroup>
                <col className="invite-select-col" />
                <col className="invite-code-col" />
                <col className="invite-status-col" />
                <col className="invite-user-col" />
                <col className="invite-time-col" />
                <col className="invite-time-col" />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="选择本页全部邀请码"
                      checked={selectableCodes.length > 0 && selected.length === selectableCodes.length}
                      onChange={(event) => setSelected(event.target.checked ? selectableCodes : [])}
                    />
                  </th>
                  <th>邀请码</th>
                  <th>状态</th>
                  <th>使用者</th>
                  <th>过期时间</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => {
                  const used = Boolean(invite.usedAtUtc);
                  const expired = Boolean(invite.expired);
                  return (
                    <tr key={invite.code}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={used}
                          checked={selected.includes(invite.code)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked ? [...current, invite.code] : current.filter((code) => code !== invite.code)
                            )
                          }
                        />
                      </td>
                      <td>
                        <div className="invite-code-cell">
                          <strong>{invite.code}</strong>
                          <button
                            className="quiet mini-copy"
                            type="button"
                            aria-label={`复制邀请码 ${invite.code}`}
                            title="复制邀请码"
                            onClick={() => copyInviteCode(invite.code)}
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </td>
                      <td>{used ? "已使用" : expired ? "已过期" : "未使用"}</td>
                      <td>
                        <span className="table-truncate" title={invite.usedByEmail || undefined}>
                          {invite.usedByEmail || "-"}
                        </span>
                      </td>
                      <td>{formatTime(invite.expiresAtUtc)}</td>
                      <td>{formatTime(invite.createdAtUtc)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="暂无邀请码" />
        )}
        <Pager page={page} onChange={setCurrentPage} />
      </section>
    </section>
  );
}

function AnnouncementPage({ onSettingsChange }: { onSettingsChange: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    api<{ settings: AppSettings }>("/admin/settings")
      .then((payload) => setText(payload.settings.announcementText || ""))
      .catch((error) => setNotice({ type: "error", message: errorMessage(error) }));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const payload = await api<{ settings: AppSettings }>("/admin/settings", {
        method: "PATCH",
        body: { announcementText: text.trim() },
      });
      setText(payload.settings.announcementText || "");
      setNotice({ type: "ok", message: "公告已保存" });
      await onSettingsChange();
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    }
  }

  return (
    <section className="panel full">
      <div className="panel-head">
        <div>
          <h2>公告</h2>
          <p>维护一条所有登录用户可见的公告</p>
        </div>
      </div>
      {notice && <NoticeBox notice={notice} onDismiss={() => setNotice(null)} />}
      <form className="form-grid" onSubmit={save}>
        <label>
          公告内容
          <textarea rows={8} value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <button className="primary icon-text" type="submit">
          <Save size={16} />
          保存公告
        </button>
      </form>
    </section>
  );
}

function LogsPage({ isAdmin }: { isAdmin: boolean }) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [page, setPage] = useState<PagePayload | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [result, setResult] = useState("all");
  const [type, setType] = useState("delivery");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const base = isAdmin ? "/admin/logs" : "/user/logs";
      const payload = await api<{ logs: LogRow[]; page: PagePayload }>(
        `${base}?result=${encodeURIComponent(result)}&type=${encodeURIComponent(type)}&page=${currentPage}&pageSize=${PAGE_SIZE}`
      );
      setLogs(payload.logs || []);
      setPage(payload.page);
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [currentPage, isAdmin, result, type]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <section className="panel full">
      <div className="panel-head">
        <div>
          <h2>日志</h2>
          <p>最近 30 天的提醒发送执行情况</p>
        </div>
        <button className="quiet icon-text" type="button" onClick={loadLogs}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
      {notice && <NoticeBox notice={notice} onDismiss={() => setNotice(null)} />}
      <div className="filters log-filters">
        <select
          value={result}
          onChange={(event) => {
            setResult(event.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="all">全部结果</option>
          <option value="success">正常</option>
          <option value="failed">报错</option>
        </select>
        <select
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="delivery">提醒/追提醒</option>
          <option value="all">全部发送</option>
          <option value="reminder">首次提醒</option>
          <option value="nag">追提醒</option>
          <option value="completion">完成确认</option>
        </select>
      </div>
      {loading ? (
        <Empty text="加载中" />
      ) : logs.length ? (
        <div className="table-wrap">
          <table className="table logs-table">
            <colgroup>
              <col className="log-result-col" />
              <col className="log-task-col" />
              <col className="log-type-col" />
              <col className="log-time-col" />
              <col className="log-time-col" />
              {isAdmin && <col className="log-user-col" />}
              <col className="log-recipient-col" />
              <col className="log-detail-col" />
            </colgroup>
            <thead>
              <tr>
                <th>结果</th>
                <th>任务</th>
                <th>类型</th>
                <th>应提醒</th>
                <th>发送时间</th>
                {isAdmin && <th>用户</th>}
                <th>收件人</th>
                <th>异常/通道</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, index) => (
                <tr key={log.id || `${log.createdAtUtc}-${index}`}>
                  <td>
                    <span className={`pill ${log.success ? "status-done" : "status-cancelled"}`}>
                      {log.success ? "正常" : "报错"}
                    </span>
                  </td>
                  <td>{log.taskTitle || log.taskId || "-"}</td>
                  <td>{executionTypeLabel(log.type)}</td>
                  <td>{formatTime(log.dueAtUtc)}</td>
                  <td>{formatTime(log.createdAtUtc)}</td>
                  {isAdmin && (
                    <td>
                      <span className="table-truncate" title={log.ownerEmail || undefined}>
                        {log.ownerEmail || "管理员任务"}
                      </span>
                    </td>
                  )}
                  <td>{log.recipientEmail || "-"}</td>
                  <td>{formatExecutionDetails(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty text="最近 30 天暂无提醒执行日志" />
      )}
      <Pager page={page} onChange={setCurrentPage} />
    </section>
  );
}

function Pager({ page, onChange }: { page: PagePayload | null; onChange: (page: number) => void }) {
  if (!page) return null;
  return (
    <div className="pager">
      <button className="quiet" type="button" disabled={!page.hasPrev} onClick={() => onChange(page.page - 1)}>
        上一页
      </button>
      <span>
        第 {page.page} / {page.totalPages} 页，共 {page.total} 条
      </span>
      <button className="quiet" type="button" disabled={!page.hasNext} onClick={() => onChange(page.page + 1)}>
        下一页
      </button>
    </div>
  );
}

function Modal({
  title,
  className = "",
  onClose,
  children,
}: {
  title: string;
  className?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className={["modal", className].filter(Boolean).join(" ")}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="quiet icon-text" type="button" onClick={onClose}>
            <X size={16} />
            关闭
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function NoticeBox({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 3000);
    return () => window.clearTimeout(timer);
  }, [notice.message, notice.type, onDismiss]);

  return (
    <div className={`notice show ${notice.type}`} role="status">
      {notice.type === "error" ? <AlertCircle size={16} /> : <Check size={16} />}
      {notice.message}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function installClientErrorReporting(): () => void {
  const onError = (event: ErrorEvent) => {
    reportClientError({
      source: "window.error",
      name: event.error instanceof Error ? event.error.name : "Error",
      message: event.message || (event.error instanceof Error ? event.error.message : "Script error"),
      line: event.lineno,
      column: event.colno,
    });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    reportClientError({
      source: "unhandledrejection",
      name: reason instanceof Error ? reason.name : "UnhandledRejection",
      message: reason instanceof Error ? reason.message : "Unhandled promise rejection",
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

function reportClientError(input: { source: string; name: string; message: string; line?: number; column?: number }): void {
  if (clientErrorReportCount >= MAX_CLIENT_ERROR_REPORTS) {
    return;
  }

  const payload = {
    source: redactClientText(input.source, 80),
    name: redactClientText(input.name, 80),
    message: redactClientText(input.message, 240),
    path: window.location.pathname,
    line: Number.isFinite(input.line) ? input.line : undefined,
    column: Number.isFinite(input.column) ? input.column : undefined,
  };
  const fingerprint = `${payload.source}:${payload.name}:${payload.message}:${payload.path}`;
  if (reportedClientErrors.has(fingerprint)) {
    return;
  }

  reportedClientErrors.add(fingerprint);
  clientErrorReportCount += 1;

  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon("/client-error", new Blob([body], { type: "application/json" }));
    if (sent) {
      return;
    }
  }

  void fetch("/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

async function api<T = Record<string, unknown>>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (response.status === 401) {
    window.location.href = "/";
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function inviteExpirationFromDays(data: FormData): string {
  const selectedDays = String(data.get("expiresInDays") || "");
  if (!selectedDays) return "";
  const daysValue = selectedDays === "custom" ? data.get("customExpiresInDays") : selectedDays;
  const days = Number(daysValue || 0);
  if (!Number.isFinite(days) || days < 1) {
    throw new Error("请填写有效的过期天数");
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("复制失败，请手动复制");
  }
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text, "\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function durationToMinutes(amount: FormDataEntryValue | null, unitValue: FormDataEntryValue | null): number {
  const value = Number(amount || 1);
  const unit = String(unitValue || "minute");
  const multiplier = unit === "day" ? 1440 : unit === "hour" ? 60 : 1;
  return value * multiplier;
}

function durationAmount(minutes: number): { amount: number; unit: string } {
  const value = Number(minutes || 1);
  if (value > 0 && value % 1440 === 0) return { amount: value / 1440, unit: "day" };
  if (value > 0 && value % 60 === 0) return { amount: value / 60, unit: "hour" };
  return { amount: value, unit: "minute" };
}

function maxDurationAmount(unit: string): number {
  if (unit === "day") return Math.floor(TASK_MAX_INTERVAL_MINUTES / 1440);
  if (unit === "hour") return Math.floor(TASK_MAX_INTERVAL_MINUTES / 60);
  return TASK_MAX_INTERVAL_MINUTES;
}

function countCharacters(value: string): number {
  return Array.from(value).length;
}

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function statusLabel(status: string): string {
  if (status === "all") return "全部";
  if (status === "active") return "进行中";
  if (status === "paused") return "已暂停";
  if (status === "done") return "已完成";
  if (status === "cancelled") return "已取消";
  return status;
}

function formatTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDuration(minutes?: number | null): string {
  const value = Number(minutes || 0);
  if (value > 0 && value % 1440 === 0) return `${value / 1440} 天`;
  if (value > 0 && value % 60 === 0) return `${value / 60} 小时`;
  return `${value} 分钟`;
}

function executionTypeLabel(type?: string): string {
  if (type === "reminder") return "首次提醒";
  if (type === "nag") return "追提醒";
  if (type === "completion") return "完成确认";
  return type || "-";
}

function formatExecutionDetails(log: LogRow): string {
  if (log.errorMessage) return `失败原因：${log.errorMessage}`;
  const provider = log.provider || "-";
  const messageId = log.providerMessageId ? ` / ${log.providerMessageId}` : "";
  return `通道：${provider}${messageId}`;
}

function redactClientText(value: string, maxLength: number): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/([?&](?:token|password|inviteCode|code|state|linuxdoPending|linuxdoError)=)[^&#\s]+/gi, "$1[redacted]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .trim()
    .slice(0, maxLength);
}
