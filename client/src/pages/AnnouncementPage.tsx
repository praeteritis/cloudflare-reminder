import { Save } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { NoticeBox } from "../components/common";
import { api, errorMessage } from "../lib/api";
import type { AppSettings, Notice } from "../types";

export function AnnouncementPage({ onSettingsChange }: { onSettingsChange: () => Promise<void> }) {
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
      <form className="form-grid" onSubmit={(event) => { void save(event); }}>
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
