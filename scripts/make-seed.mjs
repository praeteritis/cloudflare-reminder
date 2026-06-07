#!/usr/bin/env node

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  printHelp();
  process.exit(0);
}

const recipient = required(args.email, "--email");
const id = args.id || `test-${Date.now()}`;
const title = args.title || "测试提醒";
const body = args.body || "这是一条 Cloudflare 测试提醒。";
const timezone = args.timezone || "Asia/Shanghai";
const nagMinutes = numberArg(args.nag, 5, "--nag");
const repeatMinutes = optionalNumberArg(args["repeat-minutes"], "--repeat-minutes");
const recurrenceType = repeatMinutes ? "interval" : "none";
const recurrenceAnchor = args.anchor || "scheduled_time";
const dueAt = resolveDueAt(args);
const createdAt = new Date();

if (!["scheduled_time", "completion_time"].includes(recurrenceAnchor)) {
  fail("--anchor must be scheduled_time or completion_time");
}

if (timezone !== "Asia/Shanghai" && args.due && !hasExplicitTimezone(args.due)) {
  fail('--due without an explicit timezone currently assumes "Asia/Shanghai"');
}

const sql = `INSERT INTO tasks (
  id,
  recipient_email,
  title,
  body,
  status,
  timezone,
  first_due_at_utc,
  next_due_at_utc,
  recurrence_type,
  recurrence_interval_minutes,
  recurrence_anchor,
  nag_interval_minutes,
  current_run_id,
  created_at_utc,
  updated_at_utc
) VALUES (
  ${sqlString(id)},
  ${sqlString(recipient)},
  ${sqlString(title)},
  ${sqlString(body)},
  'active',
  ${sqlString(timezone)},
  ${sqlString(dueAt.toISOString())},
  ${sqlString(dueAt.toISOString())},
  ${sqlString(recurrenceType)},
  ${repeatMinutes ? String(repeatMinutes) : "NULL"},
  ${sqlString(recurrenceAnchor)},
  ${String(nagMinutes)},
  NULL,
  ${sqlString(createdAt.toISOString())},
  ${sqlString(createdAt.toISOString())}
);`;

console.log(sql);

function parseArgs(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      fail(`Unexpected argument: ${item}`);
    }

    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }

  return parsed;
}

function resolveDueAt(parsed) {
  if (parsed["minutes-from-now"] && parsed.due) {
    fail("Use only one of --minutes-from-now or --due");
  }

  if (parsed["minutes-from-now"]) {
    return new Date(Date.now() + numberArg(parsed["minutes-from-now"], 0, "--minutes-from-now") * 60 * 1000);
  }

  if (parsed.due) {
    return parseDue(parsed.due);
  }

  return new Date(Date.now() + 2 * 60 * 1000);
}

function parseDue(value) {
  const normalized = value.trim();
  const isoLike = normalized.replace(" ", "T");
  const withTimezone = hasExplicitTimezone(isoLike) ? isoLike : `${isoLike}:00+08:00`;
  const date = new Date(withTimezone);

  if (Number.isNaN(date.getTime())) {
    fail(`Could not parse --due value: ${value}`);
  }

  return date;
}

function hasExplicitTimezone(value) {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function required(value, name) {
  if (!value || value === true) {
    fail(`${name} is required`);
  }

  return value;
}

function numberArg(value, fallback, name) {
  if (value === undefined || value === true) {
    return fallback;
  }

  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    fail(`${name} must be a positive integer`);
  }

  return number;
}

function optionalNumberArg(value, name) {
  if (value === undefined || value === false) {
    return null;
  }

  return numberArg(value, 0, name);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function printHelp() {
  console.log(`Usage:
  npm run seed:make -- --email you@example.com
  npm run seed:make -- --email you@example.com --minutes-from-now 2 --nag 5
  npm run seed:make -- --email you@example.com --due "2026-06-07 20:00"
  npm run seed:make -- --email you@example.com --repeat-minutes 1440 --title "每日测试提醒"

Options:
  --email                 Recipient email. Required.
  --id                    Task id. Defaults to test-<timestamp>.
  --title                 Task title. Defaults to 测试提醒.
  --body                  Task body. Defaults to a Cloudflare test reminder.
  --minutes-from-now      Due time relative to now. Defaults to 2.
  --due                   Due time. "YYYY-MM-DD HH:mm" is interpreted as Asia/Shanghai.
  --timezone              Stored task timezone. Defaults to Asia/Shanghai.
  --nag                   Nag interval in minutes. Defaults to 5.
  --repeat-minutes        Repeat interval in minutes. Omit for one-time task.
  --anchor                scheduled_time or completion_time. Defaults to scheduled_time.
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
