import { AlertCircle, Check, X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import type { Notice, PagePayload } from "../types";

export function GitHubLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.54 2.86 8.39 6.84 9.75.5.09.68-.22.68-.49 0-.24-.01-1.05-.01-1.9-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.51-1.11-1.51-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.35 9.35 0 0 1 12 6.98c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.11 10.11 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export function Pager({ page, onChange }: { page: PagePayload | null; onChange: (page: number) => void }) {
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

export function Modal({
  title,
  className = "",
  onClose,
  children,
}: {
  title: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
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

export function NoticeBox({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
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

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
