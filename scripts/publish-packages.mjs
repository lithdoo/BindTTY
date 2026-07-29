#!/usr/bin/env node
/**
 * Validate and publish BindTTY packages in dependency order.
 *
 * Dry-run while developing:
 *   node scripts/publish-packages.mjs --dry-run --allow-dirty
 *
 * Publish a prerelease from a clean worktree:
 *   node scripts/publish-packages.mjs
 *
 * Moving latest always requires both flags:
 *   node scripts/publish-packages.mjs --tag=latest --confirm-latest
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const allowDirty = args.has("--allow-dirty");
const skipValidation = args.has("--skip-validation");
const confirmLatest = args.has("--confirm-latest");
const tagArg = [...args].find((arg) => arg.startsWith("--tag="));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

/** Topological publish order (dependencies first). */
const packageDirectories = [
  "packages/signal",
  "packages/text",
  "packages/vnode",
  "packages/jsx-runtime",
  "packages/runtime",
  "packages/layout",
  "packages/renderer-terminal",
  "packages/input",
  "packages/win32-input",
  "packages/terminal",
  "packages/interaction",
  "packages/widgets",
  "packages/bindtty"
];

function run(command, commandArgs, cwd = root, capture = false) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? "pipe" : "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return capture ? result.stdout.trim() : "";
}

function inferTag(version) {
  const prerelease = version.split("-")[1]?.split(".")[0];
  if (prerelease === "alpha" || prerelease === "beta" || prerelease === "rc") {
    return prerelease;
  }
  return "latest";
}

const packages = packageDirectories.map((directory) => ({
  directory,
  manifest: JSON.parse(
    readFileSync(path.join(root, directory, "package.json"), "utf8")
  )
}));
const versions = new Set(packages.map(({ manifest }) => manifest.version));
if (versions.size !== 1) {
  console.error("All public BindTTY packages must use the same version:");
  for (const { directory, manifest } of packages) {
    console.error(`- ${manifest.name}@${manifest.version} (${directory})`);
  }
  process.exit(1);
}

const [version] = versions;
const inferredTag = inferTag(version);
const tag = tagArg ? tagArg.slice("--tag=".length) : inferredTag;
if (!/^(alpha|beta|rc|latest)$/.test(tag)) {
  console.error(`Unsupported dist-tag "${tag}". Expected alpha, beta, rc, or latest.`);
  process.exit(1);
}
if (tag === "latest" && !confirmLatest) {
  console.error('Publishing with tag "latest" requires --confirm-latest.');
  process.exit(1);
}
if (inferredTag !== "latest" && tag !== inferredTag) {
  console.error(
    `Version ${version} requires dist-tag "${inferredTag}", received "${tag}".`
  );
  process.exit(1);
}
if (allowDirty && !dryRun) {
  console.error("--allow-dirty is only permitted with --dry-run.");
  process.exit(1);
}

if (!allowDirty) {
  const status = run("git", ["status", "--porcelain"], root, true);
  if (status !== "") {
    console.error("Release requires a clean git worktree.");
    console.error(status);
    process.exit(1);
  }
}

const internalNames = new Set(packages.map(({ manifest }) => manifest.name));
const dependencyFields = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies"
];
const mismatches = [];
for (const { directory, manifest } of packages) {
  for (const field of dependencyFields) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (internalNames.has(name) && range !== version) {
        mismatches.push(`${directory}: ${field}.${name}=${range}, expected ${version}`);
      }
    }
  }
}
if (mismatches.length > 0) {
  console.error("Internal dependency versions are inconsistent:");
  for (const mismatch of mismatches) console.error(`- ${mismatch}`);
  process.exit(1);
}

console.log([
  dryRun ? "Release dry-run" : "Publishing",
  `${packages.length} public packages`,
  `version=${version}`,
  `tag=${tag}`,
  `validation=${skipValidation ? "skipped" : "enabled"}`
].join(" | "));

if (!skipValidation) {
  run(npmCommand, ["run", "check:dependencies"]);
  run(npmCommand, ["run", "build"]);
  run(npmCommand, ["run", "test:unit:run"]);
  run(npmCommand, ["run", "test:integration:run"]);
  run(npmCommand, ["run", "test:e2e:mock:run"]);
  run(npmCommand, ["run", "test:e2e:pty:run"]);
  run(npmCommand, ["run", "smoke:consumer"]);
}

for (const { directory, manifest } of packages) {
  const cwd = path.join(root, directory);
  console.log(`\n>>> ${manifest.name}@${manifest.version} (${directory})`);
  if (dryRun) {
    run(npmCommand, ["pack", "--dry-run"], cwd);
  } else {
    const publishArgs = ["publish", "--tag", tag];
    if (manifest.name.startsWith("@")) publishArgs.push("--access", "public");
    run(npmCommand, publishArgs, cwd);
  }
}

console.log(dryRun ? "\nRelease dry-run complete." : "\nPublish complete.");
