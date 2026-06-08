#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    const rendered = [command, ...commandArgs].join(" ");
    if (options.capture && result.stderr) {
      process.stderr.write(result.stderr);
    }
    throw new Error(`Command failed: ${rendered}`);
  }

  return options.capture ? result.stdout.trim() : "";
}

function output(command, commandArgs) {
  return run(command, commandArgs, { capture: true });
}

function hasFlag(name) {
  return args.has(name);
}

function valueFlag(prefix, fallback) {
  const found = [...args].find((arg) => arg.startsWith(`${prefix}=`));
  return found ? found.slice(prefix.length + 1) : fallback;
}

if (hasFlag("--help")) {
  console.log(`Usage: npm run release:push -- [options]

Options:
  --remote=<name>          Git remote to push to. Default: origin
  --branch=<name>          Branch to push. Default: current branch
  --deploy-script=<name>   npm script to run after push. Default: deploy
  --no-deploy              Skip deployment after push
`);
  process.exit(0);
}

const remote = valueFlag("--remote", "origin");
const currentBranch = output("git", ["branch", "--show-current"]);
const branch = valueFlag("--branch", currentBranch);
const deployScript = valueFlag("--deploy-script", "deploy");

if (!branch) {
  throw new Error("Cannot release from a detached HEAD. Check out a branch first.");
}

const porcelain = output("git", ["status", "--porcelain"]);
if (porcelain) {
  throw new Error("Working tree is not clean. Commit or stash changes before release:push.");
}

console.log(`Releasing ${branch} to ${remote} with a patch version bump...`);

run("npm", ["version", "patch", "--no-git-tag-version"]);

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const version = packageJson.version;

run("git", ["add", "package.json", "package-lock.json"]);
run("git", ["commit", "-m", `chore: bump version to v${version}`]);

run("git", ["push", remote, branch], {
  env: {
    MAILBELL_RELEASE_PUSH: "1",
  },
});

if (!hasFlag("--no-deploy")) {
  console.log(`Push succeeded. Deploying with npm run ${deployScript}...`);
  run("npm", ["run", deployScript]);
}

console.log(`Released v${version}.`);
