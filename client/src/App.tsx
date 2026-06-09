import { Activity, Bell, ClipboardList, LogOut, Megaphone, Settings, UserCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { GitHubLogo } from "./components/common";
import { GITHUB_REPOSITORY_URL } from "./constants";
import { api } from "./lib/api";
import { installClientErrorReporting } from "./lib/clientErrors";
import { AnnouncementPage } from "./pages/AnnouncementPage";
import { LoginPage } from "./pages/LoginPage";
import { LogsPage } from "./pages/LogsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TasksPage } from "./pages/TasksPage";
import { UsersPage } from "./pages/UsersPage";
import type { SessionPayload } from "./types";

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

function AuthedApp({ session, onSessionChange }: { session: SessionPayload; onSessionChange: () => Promise<void> }) {
  const navigate = useNavigate();
  const [announcementOpen, setAnnouncementOpen] = useState(Boolean(session.settings.announcementText));

  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    await onSessionChange();
    void navigate("/", { replace: true });
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
          <button className="quiet icon-text" type="button" onClick={() => { void logout(); }}>
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
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal">
            <div className="panel-head">
              <h2>公告</h2>
              <button className="quiet" type="button" onClick={() => setAnnouncementOpen(false)}>
                关闭
              </button>
            </div>
            <div className="modal-body">{session.settings.announcementText}</div>
          </section>
        </div>
      )}
    </div>
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
