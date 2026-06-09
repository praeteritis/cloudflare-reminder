import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { NoticeBox } from "../components/common";
import type { AppSettings, Notice } from "../types";

export function LoginPage({ settings, onSignedIn }: { settings: AppSettings; onSignedIn: () => Promise<void> }) {
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
    void navigate("/tasks", { replace: true });
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
    <form className="auth-form" onSubmit={(event) => { void submit(event); }}>
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
    <form className="auth-form" onSubmit={(event) => { void submit(event); }}>
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
    <form className="auth-form" onSubmit={(event) => { void submit(event); }}>
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
