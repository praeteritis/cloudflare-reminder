#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const wranglerToml = readFileSync(join(root, "wrangler.toml"), "utf8");
const localConfigPath = join(root, "wrangler.local.toml");
const hasLocalConfig = existsSync(localConfigPath);
const localConfig = hasLocalConfig ? readFileSync(localConfigPath, "utf8") : "";
const configArgs = hasLocalConfig ? ["--config", "wrangler.local.toml"] : [];
const checks = [];

addCheck("wrangler.toml exists", true);
addCheck("wrangler.toml keeps dashboard variables on deploy", /keep_vars\s*=\s*true/.test(wranglerToml));
addCheck("DB binding is configured", /binding\s*=\s*"DB"/.test(wranglerToml));
addCheck("Public routes run through Worker", wranglerToml.includes('"/*"'));
addCheck("Public hashed assets bypass Worker", wranglerToml.includes('"!/assets/*"'));
addCheck("D1 database name is configured", /database_name\s*=\s*"personal-reminder"/.test(wranglerToml));
addCheck("No database_id is committed", !/database_id\s*=\s*"[0-9a-f-]{36}"/i.test(wranglerToml));
addCheck("No FROM_EMAIL is committed", !/FROM_EMAIL\s*=/.test(wranglerToml));
addCheck("No REPLY_EMAIL is committed", !/REPLY_EMAIL\s*=/.test(wranglerToml));
addCheck("wrangler.local.toml exists", hasLocalConfig);
addCheck("Local routes run through Worker", localConfig.includes('"/*"'));
addCheck("Local hashed assets bypass Worker", localConfig.includes('"!/assets/*"'));
addCheck(
  "Local D1 database_id is configured",
  /database_id\s*=\s*"[0-9a-f-]{36}"/i.test(localConfig)
);

const whoami = run("npx", ["wrangler", "whoami", ...configArgs]);
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
  ...configArgs,
]);
addCheck("Remote D1 has tasks table", tables.stdout.includes('"tasks"'));
addCheck("Remote D1 has reminder_runs table", tables.stdout.includes('"reminder_runs"'));
addCheck("Remote D1 has send_logs table", tables.stdout.includes('"send_logs"'));

const deployments = run("npx", [
  "wrangler",
  "deployments",
  "list",
  "--name",
  "personal-mail-reminder",
  "--json",
  ...configArgs,
]);
addCheck("Worker has deployment records", hasDeploymentRecords(deployments));

printChecks();

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  console.error(`\nNot ready yet: ${failed.length} check(s) failed.`);
  process.exit(1);
}

console.log("\nReady for live reminder testing.");
console.log(
  "Reminder: production FROM_EMAIL, REPLY_EMAIL, TIMEZONE, and optional EMAIL_DELIVERY live in the Worker dashboard."
);

function readSecrets() {
  const result = run("npx", ["wrangler", "secret", "list", ...configArgs]);
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

function hasDeploymentRecords(result) {
  if (!result.ok) {
    return false;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
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
