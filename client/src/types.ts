export type TaskStatus = "active" | "done" | "paused" | "cancelled";
export type NoticeType = "ok" | "error";
export type DueMode = "relative" | "absolute";
export type TaskType = "scheduled" | "confirmation";

export interface AppSettings {
  allowRegistration?: boolean;
  requireInvite?: boolean;
  announcementText?: string;
}

export interface SessionPayload {
  ok: boolean;
  authenticated: boolean;
  isAdmin: boolean;
  userEmail: string | null;
  settings: AppSettings;
}

export interface PagePayload {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface Task {
  id: string;
  recipientEmail: string;
  title: string;
  body: string;
  status: TaskStatus;
  taskType: TaskType;
  nextDueAtUtc: string;
  recurrenceType: "none" | "interval";
  recurrenceIntervalMinutes: number | null;
  recurrenceAnchor: "scheduled_time" | "completion_time";
  recurrenceEndAtUtc: string | null;
  nagIntervalMinutes: number;
  maxNagCount: number;
  notificationChannelIds: string[];
  userEmail?: string | null;
  currentRun?: {
    status?: string;
    sentCount?: number;
  } | null;
}

export type NotificationChannelType = "email" | "bark" | "gotify" | "pushdeer" | "pushplus" | "telegram" | "dingtalk" | "wecom" | "feishu" | "webhook";

export interface NotificationChannel {
  id: string;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  builtIn: boolean;
  config?: Record<string, string>;
  createdAtUtc?: string;
  updatedAtUtc?: string;
}

export interface TaskUsage {
  used: number;
}

export interface UserRow {
  id: string;
  email: string;
  status: string;
  linuxdoUsername?: string | null;
  taskCount?: number;
  lastLoginAtUtc?: string | null;
}

export interface InviteRow {
  code: string;
  usedAtUtc?: string | null;
  usedByEmail?: string | null;
  expiresAtUtc?: string | null;
  createdAtUtc?: string | null;
  expired?: boolean;
}

export interface LogRow {
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

export interface Notice {
  type: NoticeType;
  message: string;
}
