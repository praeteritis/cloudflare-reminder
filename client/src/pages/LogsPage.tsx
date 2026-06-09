import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Empty, NoticeBox, Pager } from "../components/common";
import { PAGE_SIZE } from "../constants";
import { api, errorMessage } from "../lib/api";
import { executionTypeLabel, formatExecutionDetails, formatTime } from "../lib/format";
import type { LogRow, Notice, PagePayload } from "../types";

export function LogsPage({ isAdmin }: { isAdmin: boolean }) {
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
    void loadLogs();
  }, [loadLogs]);

  return (
    <section className="panel full">
      <div className="panel-head">
        <div>
          <h2>日志</h2>
          <p>最近 30 天的提醒发送执行情况</p>
        </div>
        <button className="quiet icon-text" type="button" onClick={() => { void loadLogs(); }}>
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
