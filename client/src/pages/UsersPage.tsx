import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Empty, NoticeBox, Pager } from "../components/common";
import { PAGE_SIZE } from "../constants";
import { api, errorMessage } from "../lib/api";
import { formatTime } from "../lib/format";
import type { Notice, PagePayload, UserRow } from "../types";

export function UsersPage() {
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
    void loadUsers();
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
        <button className="quiet icon-text" type="button" onClick={() => { void loadUsers(); }}>
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
                    {Number(user.taskCount || 0)}
                  </td>
                  <td>{formatTime(user.lastLoginAtUtc)}</td>
                  <td>
                    <div className="actions">
                      <button className="quiet" type="button" onClick={() => { void action(user, "edit"); }}>
                        编辑
                      </button>
                      {user.status === "banned" ? (
                        <button className="primary" type="button" onClick={() => { void action(user, "unban"); }}>
                          解封
                        </button>
                      ) : (
                        <button className="danger" type="button" onClick={() => { void action(user, "ban"); }}>
                          封禁
                        </button>
                      )}
                      <button className="danger" type="button" onClick={() => { void action(user, "delete"); }}>
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
