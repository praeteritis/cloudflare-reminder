export type RecurrenceType = "none" | "interval";
export type RecurrenceAnchor = "scheduled_time" | "completion_time";
export type TaskStatus = "active" | "done" | "paused" | "cancelled";
export type TaskType = "scheduled" | "confirmation";
export type UserStatus = "active" | "banned";
export type NotificationChannelType =
  | "bark"
  | "gotify"
  | "pushdeer"
  | "pushplus"
  | "telegram"
  | "dingtalk"
  | "wecom"
  | "feishu"
  | "webhook";

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  REMINDER_QUEUE?: Queue<ReminderDeliveryMessage>;
  RESEND_API_KEY: string;
  TIMEZONE: string;
  FROM_EMAIL: string;
  REPLY_EMAIL: string;
  ADMIN_TOKEN?: string;
  EMAIL_DELIVERY?: "resend" | "log";
  HEARTBEAT_URL?: string;
  LINUXDO_CLIENT_ID?: string;
  LINUXDO_CLIENT_SECRET?: string;
}

export interface Task {
  id: string;
  user_id: string | null;
  recipient_email: string;
  title: string;
  body: string;
  status: TaskStatus;
  task_type?: TaskType;
  timezone: string;
  first_due_at_utc: string;
  next_due_at_utc: string;
  recurrence_type: RecurrenceType;
  recurrence_interval_minutes: number | null;
  recurrence_anchor: RecurrenceAnchor;
  recurrence_end_at_utc: string | null;
  nag_interval_minutes: number;
  max_nag_count: number;
  current_run_id: string | null;
  created_at_utc: string;
  updated_at_utc: string;
  deleted_at_utc: string | null;
  notification_channel_ids?: string;
}

export interface ReminderRun {
  id: string;
  task_id: string;
  due_at_utc: string;
  status: "open" | "completed" | "cancelled";
  sent_count: number;
  last_sent_at_utc: string | null;
  next_nag_at_utc: string | null;
  completed_at_utc: string | null;
  completed_by: string | null;
  completion_email_sent_at_utc: string | null;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface TaskRunRow extends Task {
  run_id: string;
  run_due_at_utc: string;
  run_sent_count: number;
  run_next_nag_at_utc: string | null;
}

export interface AdminTaskRow extends Task {
  user_email: string | null;
  run_status: ReminderRun["status"] | null;
  run_sent_count: number | null;
  run_next_nag_at_utc: string | null;
  run_completed_at_utc: string | null;
}

export interface TaskUpdateInput {
  recipient_email: string;
  title: string;
  body: string;
  timezone: string;
  first_due_at_utc: string;
  next_due_at_utc: string;
  recurrence_type: RecurrenceType;
  recurrence_interval_minutes: number | null;
  recurrence_anchor: RecurrenceAnchor;
  recurrence_end_at_utc: string | null;
  nag_interval_minutes: number;
  max_nag_count: number;
  task_type: TaskType;
  updated_at_utc: string;
  notification_channel_ids: string[];
}

export interface InboundEmailMessage {
  raw: ReadableStream;
  from?: string;
  to?: string;
  headers?: Headers;
}

export interface ProcessingSummary {
  createdRuns: number;
  nagReminders: number;
  recoveredDeliveries: number;
  queuedDeliveries: number;
  cleanupDeletedRows: number;
  backlog: boolean;
}

export type ReminderDeliveryType = "reminder" | "nag";

export interface ReminderDeliveryMessage {
  version: 1;
  deliveryKey: string;
  runId: string;
  taskId: string;
  type: ReminderDeliveryType;
  scheduledForUtc: string;
  enqueuedAtUtc: string;
  channelId?: string;
}

export interface EmailDeliveryJob {
  delivery_key: string;
  run_id: string;
  task_id: string;
  type: ReminderDeliveryType;
  scheduled_for_utc: string;
  status: "pending" | "queued" | "sending" | "retrying" | "sent" | "failed" | "dead_lettered" | "skipped";
  attempt_count: number;
  provider: string | null;
  provider_message_id: string | null;
  last_error_message: string | null;
  queued_at_utc: string | null;
  last_attempted_at_utc: string | null;
  sent_at_utc: string | null;
  created_at_utc: string;
  updated_at_utc: string;
  channel_id?: string;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: NotificationChannelType;
  config_json: string;
  enabled: number;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface EmailSendResult {
  success: boolean;
  provider: string;
  providerMessageId: string | null;
  errorMessage: string | null;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  status: UserStatus;
  linuxdo_id: string | null;
  linuxdo_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  last_login_at_utc: string | null;
  banned_at_utc: string | null;
  banned_reason: string | null;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface AuthenticatedActor {
  type: "admin" | "user" | "system";
  userId?: string;
  email?: string;
}

export interface AppSettings {
  allowRegistration: boolean;
  requireInvite: boolean;
  announcementText: string;
}

export interface TaskUsage {
  used: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  offset: number;
}

export interface LinuxDoUser {
  id?: number | string;
  username?: string;
  name?: string;
  email?: string;
  avatar_template?: string;
  avatar_url?: string;
}
