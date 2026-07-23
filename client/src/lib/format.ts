import { DISPLAY_TIME_ZONE, DISPLAY_TIME_ZONE_LABEL, TASK_MAX_INTERVAL_MINUTES } from "../constants";
import type { LogRow } from "../types";

export function inviteExpirationFromDays(data: FormData): string {
  const selectedDays = String(data.get("expiresInDays") || "");
  if (!selectedDays) return "";
  const daysValue = selectedDays === "custom" ? data.get("customExpiresInDays") : selectedDays;
  const days = Number(daysValue || 0);
  if (!Number.isFinite(days) || days < 1) {
    throw new Error("请填写有效的过期天数");
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function durationToMinutes(amount: FormDataEntryValue | null, unitValue: FormDataEntryValue | null): number {
  const value = Number(amount || 1);
  const unit = String(unitValue || "minute");
  const multiplier = unit === "day" ? 1440 : unit === "hour" ? 60 : 1;
  return value * multiplier;
}

export function durationAmount(minutes: number): { amount: number; unit: string } {
  const value = Number(minutes || 1);
  if (value > 0 && value % 1440 === 0) return { amount: value / 1440, unit: "day" };
  if (value > 0 && value % 60 === 0) return { amount: value / 60, unit: "hour" };
  return { amount: value, unit: "minute" };
}

export function maxDurationAmount(unit: string): number {
  if (unit === "day") return Math.floor(TASK_MAX_INTERVAL_MINUTES / 1440);
  if (unit === "hour") return Math.floor(TASK_MAX_INTERVAL_MINUTES / 60);
  return TASK_MAX_INTERVAL_MINUTES;
}

export function countCharacters(value: string): number {
  return Array.from(value).length;
}

export function toDateTimeLocalValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date).replace(" ", "T");
}

export function parseDateTimeInGmt8(value: string): Date {
  const normalized = value.trim().replace(" ", "T");
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized) ? `${normalized}:00` : normalized;
  return new Date(`${withSeconds}+08:00`);
}

export function statusLabel(status: string): string {
  if (status === "all") return "全部";
  if (status === "active") return "进行中";
  if (status === "paused") return "已暂停";
  if (status === "done") return "已完成";
  if (status === "cancelled") return "已取消";
  return status;
}

export function formatTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }) + ` ${DISPLAY_TIME_ZONE_LABEL}`;
}

export function formatDuration(minutes?: number | null): string {
  const value = Number(minutes || 0);
  if (value > 0 && value % 1440 === 0) return `${value / 1440} 天`;
  if (value > 0 && value % 60 === 0) return `${value / 60} 小时`;
  return `${value} 分钟`;
}

export function executionTypeLabel(type?: string): string {
  if (type === "reminder") return "首次提醒";
  if (type === "nag") return "追提醒";
  if (type === "completion") return "完成确认";
  return type || "-";
}

export function formatExecutionDetails(log: LogRow): string {
  if (log.errorMessage) return `失败原因：${log.errorMessage}`;
  const provider = log.provider || "-";
  const messageId = log.providerMessageId ? ` / ${log.providerMessageId}` : "";
  return `通道：${provider}${messageId}`;
}
