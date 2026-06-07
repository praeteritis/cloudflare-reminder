#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const wranglerToml = readFileSync(join(root, "wrangler.toml"), "utf8");
const checks = [];

addCheck("wrangler.toml exists", true);
addCheck("D1 database_id is configured", /database_id\s*=\s*"[0-9a-f-]{36}"/i.test(wranglerToml));
addCheck("FROM_EMAIL is not example.com", !/FROM_EMAIL\s*=.*example\.com/.test(wranglerToml));
addCheck("REPLY_EMAIL is not example.com", !/REPLY_EMAIL\s*=.*example\.com/.test(wranglerToml));

const whoami = run("npx", ["wrangler", "whoami"]);
addCheck("Wrangler is authenticated", whoami.ok);

const secrets = readSecrets();
addCheck("ADMIN_TOKEN secret is set", secrets.includes("ADMIN_TOKEN"));
addCheck("RESEND_API_KEY secret is set", secrets.includes("RESEND_API_KEY"));

const tables = run("npx", [
  "wrangler",
  "d1",
  "execute",
  "personal-reminder",
  "--remote",
  "--command",
  "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
]);
addCheck("Remote D1 has tasks table", tables.stdout.includes('"tasks"'));
addCheck("Remote D1 has reminder_runs table", tables.stdout.includes('"reminder_runs"'));
addCheck("Remote D1 has send_logs table", tables.stdout.includes('"send_logs"'));

const deployments = run("npx", ["wrangler", "deployments", "list", "--name", "personal-mail-reminder"]);
addCheck("Worker has deployment records", deployments.ok && deployments.stdout.includes("Created:"));

printChecks();

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  console.error(`\nNot ready yet: ${failed.length} check(s) failed.`);
  process.exit(1);
}

console.log("\nReady for live reminder testing.");

function readSecrets() {
  const result = run("npx", ["wrangler", "secret", "list"]);
  if (!result.ok) {
    return [];
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return parsed.map((secret) => secret.name);
  } catch {
    return [];
  }
}

function addCheck(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}

function printChecks() {
  for (const check of checks) {
    console.log(`${check.ok ? "[ok]" : "[missing]"} ${check.name}`);
  }
}

function run(command, args) {
  try {
    const stdout = execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    return { ok: true, stdout };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.toString() || "",
      stderr: error.stderr?.toString() || "",
    };
  }
}
