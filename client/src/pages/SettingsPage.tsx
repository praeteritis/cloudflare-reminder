import { Copy, Download, Plus, Save, Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Empty, NoticeBox, Pager } from "../components/common";
import { NotificationChannelsPanel } from "../components/NotificationChannelsPanel";
import { PAGE_SIZE } from "../constants";
import { api, errorMessage } from "../lib/api";
import { copyText, downloadText } from "../lib/files";
import { formatTime, inviteExpirationFromDays } from "../lib/format";
import type { AppSettings, InviteRow, Notice, PagePayload } from "../types";

export function SettingsPage({ onSettingsChange }: { onSettingsChange: () => Promise<void> }) {
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
      <NotificationChannelsPanel />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>设置</h2>
            <p>注册开关和邀请码要求</p>
          </div>
        </div>
        {notice && <NoticeBox notice={notice} onDismiss={() => setNotice(null)} />}
        <form className="form-grid" onSubmit={(event) => { void saveSettings(event); }}>
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
          <button className="danger icon-text" type="button" onClick={() => { void deleteInvites(selected); }}>
            <Trash2 size={16} />
            删除选中
          </button>
        </div>
        {inviteModalOpen && (
          <Modal title="生成邀请码" className="invite-modal" onClose={() => setInviteModalOpen(false)}>
            <form className="invite-form" onSubmit={(event) => { void createInvites(event); }}>
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
                    <button className="quiet icon-text" type="button" onClick={() => { void copyGeneratedInvites(); }}>
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
                            onClick={() => { void copyInviteCode(invite.code); }}
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
