import {
  DEFAULT_MAX_NAG_COUNT,
  DEFAULT_NAG_INTERVAL_MINUTES,
  DEFAULT_TIMEZONE,
  TASK_BODY_MAX_CHARS,
  TASK_MAX_INTERVAL_MINUTES,
  TASK_MAX_NAG_COUNT,
  TASK_TIMEZONE_MAX_CHARS,
  TASK_TITLE_MAX_CHARS,
} from "./constants";
import {
  AdminInputError,
  addMinutes,
  assertMaxCharacters,
  assertMaxInteger,
  hasExplicitTimezone,
  isValidEmail,
  isValidTaskId,
  makeId,
  readOptionalNonNegativeInteger,
  readOptionalPositiveInteger,
  readOptionalRecord,
  readOptionalString,
  readRequiredString,
  requireRecord,
} from "./shared";
import type { RecurrenceAnchor, RecurrenceType, Task, TaskUpdateInput } from "./types";

export function buildTaskFromAdminInput(
  input: unknown,
  options: { timezone?: string; now?: Date; id?: string } = {}
): Task {
  const record = requireRecord(input, "Request body");
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const timezone = readOptionalString(record, ["timezone"]) ?? options.timezone ?? DEFAULT_TIMEZONE;
  const recipientEmail = readRequiredString(record, ["recipientEmail", "recipient_email"], "recipientEmail");
  const title = readRequiredString(record, ["title"], "title");
  const body = readOptionalString(record, ["body"]) ?? title;
  const nagIntervalMinutes =
    readOptionalPositiveInteger(
      record,
      ["nagIntervalMinutes", "nag_interval_minutes", "nagMinutes", "nag"],
      "nagIntervalMinutes"
    ) ?? DEFAULT_NAG_INTERVAL_MINUTES;
  const maxNagCount =
    readOptionalNonNegativeInteger(
      record,
      ["maxNagCount", "max_nag_count", "nagMaxCount", "nag_max_count"],
      "maxNagCount"
    ) ?? DEFAULT_MAX_NAG_COUNT;
  const recurrence = readOptionalRecord(record, ["recurrence"]);
  const recurrenceType = resolveRecurrenceType(record, recurrence);
  const recurrenceAnchor = resolveRecurrenceAnchor(record, recurrence);
  const recurrenceIntervalMinutes = resolveRecurrenceIntervalMinutes(record, recurrence, recurrenceType);
  const dueAt = resolveAdminDueAt(record, timezone, now);
  const recurrenceEndAt = resolveRecurrenceEndAt(record, recurrence, timezone, recurrenceType);
  const id = options.id ?? readOptionalString(record, ["id"]) ?? makeId("task");

  if (!isValidTaskId(id)) {
    throw new AdminInputError("id must contain only letters, numbers, underscores, and hyphens");
  }

  if (!isValidEmail(recipientEmail)) {
    throw new AdminInputError("recipientEmail must be a valid email address");
  }
  assertMaxCharacters(title, TASK_TITLE_MAX_CHARS, "title");
  assertMaxCharacters(body, TASK_BODY_MAX_CHARS, "body");
  assertMaxCharacters(timezone, TASK_TIMEZONE_MAX_CHARS, "timezone");
  assertMaxInteger(nagIntervalMinutes, TASK_MAX_INTERVAL_MINUTES, "nagIntervalMinutes");
  assertMaxInteger(maxNagCount, TASK_MAX_NAG_COUNT, "maxNagCount");
  if (recurrenceIntervalMinutes !== null) {
    assertMaxInteger(recurrenceIntervalMinutes, TASK_MAX_INTERVAL_MINUTES, "recurrence.intervalMinutes");
  }
  if (recurrenceEndAt && recurrenceEndAt <= dueAt) {
    throw new AdminInputError("recurrenceEndAt must be after the first reminder time");
  }

  return {
    id,
    user_id: null,
    recipient_email: recipientEmail,
    title,
    body,
    status: "active",
    timezone,
    first_due_at_utc: dueAt.toISOString(),
    next_due_at_utc: dueAt.toISOString(),
    recurrence_type: recurrenceType,
    recurrence_interval_minutes: recurrenceIntervalMinutes,
    recurrence_anchor: recurrenceAnchor,
    recurrence_end_at_utc: recurrenceEndAt?.toISOString() ?? null,
    nag_interval_minutes: nagIntervalMinutes,
    max_nag_count: maxNagCount,
    current_run_id: null,
    created_at_utc: nowIso,
    updated_at_utc: nowIso,
    deleted_at_utc: null,
  };
}

export function buildTaskUpdateFromAdminInput(
  input: unknown,
  options: { timezone?: string; now?: Date } = {}
): TaskUpdateInput {
  const parsed = buildTaskFromAdminInput(input, {
    timezone: options.timezone,
    now: options.now,
    id: "task_update",
  });

  return {
    recipient_email: parsed.recipient_email,
    title: parsed.title,
    body: parsed.body,
    timezone: parsed.timezone,
    first_due_at_utc: parsed.first_due_at_utc,
    next_due_at_utc: parsed.next_due_at_utc,
    recurrence_type: parsed.recurrence_type,
    recurrence_interval_minutes: parsed.recurrence_interval_minutes,
    recurrence_anchor: parsed.recurrence_anchor,
    recurrence_end_at_utc: parsed.recurrence_end_at_utc,
    nag_interval_minutes: parsed.nag_interval_minutes,
    max_nag_count: parsed.max_nag_count,
    updated_at_utc: parsed.updated_at_utc,
  };
}

function resolveAdminDueAt(record: Record<string, unknown>, timezone: string, now: Date): Date {
  const minutesFromNow = readOptionalPositiveInteger(
    record,
    ["minutesFromNow", "minutes_from_now"],
    "minutesFromNow"
  );
  const dueAtValue = readOptionalString(record, ["dueAt", "due_at", "dueAtUtc", "due_at_utc"]);

  if (minutesFromNow && dueAtValue) {
    throw new AdminInputError("Use only one of dueAt or minutesFromNow");
  }

  if (minutesFromNow) {
    return addMinutes(now, minutesFromNow);
  }

  if (!dueAtValue) {
    throw new AdminInputError("dueAt or minutesFromNow is required");
  }

  return parseAdminDueAt(dueAtValue, timezone);
}

function parseAdminDueAt(value: string, timezone: string): Date {
  const normalized = value.trim().replace(" ", "T");
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
    ? `${normalized}:00`
    : normalized;
  const withTimezone = hasExplicitTimezone(withSeconds)
    ? withSeconds
    : appendDefaultTimezoneOffset(withSeconds, timezone);
  const date = new Date(withTimezone);

  if (Number.isNaN(date.getTime())) {
    throw new AdminInputError("dueAt must be a valid date");
  }

  return date;
}

function appendDefaultTimezoneOffset(value: string, timezone: string): string {
  if (timezone !== DEFAULT_TIMEZONE) {
    throw new AdminInputError(
      `dueAt without an explicit timezone currently requires "${DEFAULT_TIMEZONE}"; include an explicit offset such as 2026-06-07T20:00:00+08:00`
    );
  }

  return `${value}+08:00`;
}

function resolveRecurrenceType(
  record: Record<string, unknown>,
  recurrence: Record<string, unknown> | null
): RecurrenceType {
  const type =
    readOptionalString(recurrence, ["type"]) ??
    readOptionalString(record, ["recurrenceType", "recurrence_type"]);
  const interval =
    readOptionalPositiveInteger(
      recurrence ?? {},
      ["intervalMinutes", "interval_minutes", "repeatMinutes", "repeat_minutes"],
      "recurrence.intervalMinutes"
    ) ??
    readOptionalPositiveInteger(
      record,
      ["recurrenceIntervalMinutes", "recurrence_interval_minutes", "repeatMinutes", "repeat_minutes"],
      "recurrenceIntervalMinutes"
    );

  if (!type && interval) {
    return "interval";
  }

  if (!type) {
    return "none";
  }

  if (type !== "none" && type !== "interval") {
    throw new AdminInputError("recurrence type must be none or interval");
  }

  return type;
}

function resolveRecurrenceAnchor(
  record: Record<string, unknown>,
  recurrence: Record<string, unknown> | null
): RecurrenceAnchor {
  const anchor =
    readOptionalString(recurrence, ["anchor"]) ??
    readOptionalString(record, ["recurrenceAnchor", "recurrence_anchor"]) ??
    "scheduled_time";

  if (anchor !== "scheduled_time" && anchor !== "completion_time") {
    throw new AdminInputError("recurrence anchor must be scheduled_time or completion_time");
  }

  return anchor;
}

function resolveRecurrenceIntervalMinutes(
  record: Record<string, unknown>,
  recurrence: Record<string, unknown> | null,
  recurrenceType: RecurrenceType
): number | null {
  const interval =
    readOptionalPositiveInteger(
      recurrence ?? {},
      ["intervalMinutes", "interval_minutes", "repeatMinutes", "repeat_minutes"],
      "recurrence.intervalMinutes"
    ) ??
    readOptionalPositiveInteger(
      record,
      ["recurrenceIntervalMinutes", "recurrence_interval_minutes", "repeatMinutes", "repeat_minutes"],
      "recurrenceIntervalMinutes"
    );

  if (recurrenceType === "none") {
    return null;
  }

  if (!interval) {
    throw new AdminInputError("recurrence.intervalMinutes is required for interval tasks");
  }

  return interval;
}

function resolveRecurrenceEndAt(
  record: Record<string, unknown>,
  recurrence: Record<string, unknown> | null,
  timezone: string,
  recurrenceType: RecurrenceType
): Date | null {
  if (recurrenceType === "none") {
    return null;
  }

  const value =
    readOptionalString(recurrence, ["endAt", "end_at", "endAtUtc", "end_at_utc"]) ??
    readOptionalString(record, ["recurrenceEndAt", "recurrence_end_at", "recurrenceEndAtUtc", "recurrence_end_at_utc"]);

  return value ? parseAdminDueAt(value, timezone) : null;
}
