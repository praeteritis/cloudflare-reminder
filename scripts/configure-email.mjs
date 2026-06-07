#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  printHelp();
  process.exit(0);
}

const root = process.cwd();
const localVarsPath = join(root, ".dev.vars");
const localVars = existsSync(localVarsPath) ? readFileSync(localVarsPath, "utf8") : "";
const replyEmail = resolveReplyEmail(args);
const fromName = args["from-name"] || "个人提醒助手";
const fromEmail = args.from || `${fromName} <${replyEmail}>`;

validateEmail(replyEmail, "reply email");
validateFromEmail(fromEmail);

const nextLocalVars = upsertDotEnvValues(localVars, {
  FROM_EMAIL: fromEmail,
  REPLY_EMAIL: replyEmail,
});

if (args["dry-run"]) {
  console.log("Dry run. .dev.vars would be updated with:");
  console.log(`FROM_EMAIL=${formatDotEnvValue(fromEmail)}`);
  console.log(`REPLY_EMAIL=${formatDotEnvValue(replyEmail)}`);
} else {
  writeFileSync(localVarsPath, nextLocalVars);
  console.log("Updated local .dev.vars email settings:");
  console.log(`FROM_EMAIL=${formatDotEnvValue(fromEmail)}`);
  console.log(`REPLY_EMAIL=${formatDotEnvValue(replyEmail)}`);
}

console.log("\nFor production, set FROM_EMAIL and REPLY_EMAIL as Worker variables in the Cloudflare dashboard.");

function resolveReplyEmail(parsed) {
  if (parsed.reply && parsed.domain) {
    fail("Use only one of --reply or --domain");
  }

  if (parsed.reply) {
    return String(parsed.reply);
  }

  if (parsed.domain) {
    const domain = String(parsed.domain).replace(/^@/, "");
    return `reminder@${domain}`;
  }

  fail("Either --reply or --domain is required");
}

function validateEmail(email, label) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fail(`Invalid ${label}: ${email}`);
  }

  if (email.endsWith("@example.com")) {
    fail(`${label} must not use example.com`);
  }
}

function validateFromEmail(value) {
  const match = value.match(/<([^<>]+)>$/);
  const email = match ? match[1] : value;
  validateEmail(email, "from email");
}

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

function upsertDotEnvValues(text, updates) {
  const keys = new Set(Object.keys(updates));
  const seen = new Set();
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const output = [];

  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match && keys.has(match[1])) {
      const key = match[1];
      seen.add(key);
      output.push(`${key}=${formatDotEnvValue(updates[key])}`);
    } else if (line.length > 0) {
      output.push(line);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      output.push(`${key}=${formatDotEnvValue(value)}`);
    }
  }

  return `${output.join("\n")}\n`;
}

function formatDotEnvValue(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@+-]+$/.test(text)) {
    return text;
  }

  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`;
}

function printHelp() {
  console.log(`Usage:
  npm run config:email -- --domain your-domain.com
  npm run config:email -- --reply reminder@your-domain.com
  npm run config:email -- --reply reminder@your-domain.com --from-name "个人提醒助手"
  npm run config:email -- --reply reminder@your-domain.com --from "个人提醒助手 <reminder@your-domain.com>"

Options:
  --domain       Domain used to build reminder@<domain>.
  --reply        Reply-to email address.
  --from-name    Display name for FROM_EMAIL. Defaults to 个人提醒助手.
  --from         Full FROM_EMAIL value. Overrides --from-name.
  --dry-run      Print the change without writing .dev.vars.

This updates local .dev.vars only. For production, set FROM_EMAIL and
REPLY_EMAIL as Worker variables in the Cloudflare dashboard.
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
