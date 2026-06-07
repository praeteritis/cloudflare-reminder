#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  printHelp();
  process.exit(0);
}

const root = process.cwd();
const configPath = join(root, "wrangler.toml");
const config = readFileSync(configPath, "utf8");
const replyEmail = resolveReplyEmail(args);
const fromName = args["from-name"] || "个人提醒助手";
const fromEmail = args.from || `${fromName} <${replyEmail}>`;

validateEmail(replyEmail, "reply email");
validateFromEmail(fromEmail);

const nextConfig = config
  .replace(/^FROM_EMAIL\s*=\s*".*"$/m, `FROM_EMAIL = "${escapeTomlString(fromEmail)}"`)
  .replace(/^REPLY_EMAIL\s*=\s*".*"$/m, `REPLY_EMAIL = "${escapeTomlString(replyEmail)}"`);

if (nextConfig === config) {
  fail("Could not find FROM_EMAIL and REPLY_EMAIL in wrangler.toml");
}

if (args["dry-run"]) {
  console.log("Dry run. wrangler.toml would be updated with:");
  console.log(`FROM_EMAIL = "${fromEmail}"`);
  console.log(`REPLY_EMAIL = "${replyEmail}"`);
} else {
  writeFileSync(configPath, nextConfig);
  console.log("Updated wrangler.toml email settings:");
  console.log(`FROM_EMAIL = "${fromEmail}"`);
  console.log(`REPLY_EMAIL = "${replyEmail}"`);
}

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

function escapeTomlString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
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
  --dry-run      Print the change without writing wrangler.toml.
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
