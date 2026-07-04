#!/usr/bin/env node
/**
 * Publish BindTTY packages to npm in dependency order.
 *
 * Usage:
 *   node scripts/publish-packages.mjs              # publish with tag "alpha"
 *   node scripts/publish-packages.mjs --dry-run    # npm pack --dry-run only
 *   node scripts/publish-packages.mjs --tag=beta   # publish with tag "beta"
 *
 * Prerequisites:
 *   - npm login
 *   - @bindtty scope access configured (npm org or user scope)
 *   - all packages built (script runs `npm run build` first)
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const tagArg = process.argv.find((arg) => arg.startsWith("--tag="));
const tag = tagArg ? tagArg.slice("--tag=".length) : "alpha";

/** Topological publish order (dependencies first). */
const packages = [
  { dir: "packages/signal", scoped: true },
  { dir: "packages/text", scoped: true },
  { dir: "packages/vnode", scoped: true },
  { dir: "packages/jsx-runtime", scoped: true },
  { dir: "packages/runtime", scoped: true },
  { dir: "packages/layout", scoped: true },
  { dir: "packages/renderer-terminal", scoped: true },
  { dir: "packages/terminal", scoped: true },
  { dir: "packages/interaction", scoped: true },
  { dir: "packages/widgets", scoped: true },
  { dir: "packages/bindtty", scoped: false }
];

console.log(
  dryRun
    ? `Dry-run pack for ${packages.length} packages…`
    : `Publishing ${packages.length} packages with tag "${tag}"…`
);

execSync("npm run build", { cwd: root, stdio: "inherit" });

for (const { dir, scoped } of packages) {
  const cwd = path.join(root, dir);
  const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));

  console.log(`\n>>> ${pkg.name} (${dir})`);

  if (dryRun) {
    execSync("npm pack --dry-run", { cwd, stdio: "inherit" });
    continue;
  }

  const access = scoped ? " --access public" : "";
  execSync(`npm publish${access} --tag ${tag}`, { cwd, stdio: "inherit" });
}

console.log(dryRun ? "\nDry run complete." : "\nPublish complete.");
