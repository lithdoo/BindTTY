import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");

if (!existsSync(tsc)) {
  console.error("TypeScript is not installed. Run npm install before building.");
  process.exit(1);
}

const packageProjects = [
  "packages/signal/tsconfig.json",
  "packages/text/tsconfig.json",
  "packages/vnode/tsconfig.json",
  "packages/jsx-runtime/tsconfig.json",
  "packages/runtime/tsconfig.json",
  "packages/layout/tsconfig.json",
  "packages/renderer-terminal/tsconfig.json",
  "packages/input/tsconfig.json",
  "packages/terminal/tsconfig.json",
  "packages/interaction/tsconfig.json",
  "packages/widgets/tsconfig.json",
  "packages/bindtty/tsconfig.json"
];

const testProjects = [
  "packages/input/test/tsconfig.json",
  "packages/interaction/test/tsconfig.json",
  "packages/jsx-runtime/test/tsconfig.json",
  "packages/jsx-runtime/test/tsconfig.runtime.json",
  "packages/layout/test/tsconfig.json",
  "packages/renderer-terminal/test/tsconfig.json",
  "packages/runtime/test/tsconfig.json",
  "packages/terminal/test/tsconfig.json",
  "packages/text/test/tsconfig.json",
  "packages/widgets/test/tsconfig.json",
  "packages/bindtty/test/tsconfig.json"
];

const e2eProjects = [
  "packages/e2e/mock/tsconfig.json",
  "packages/e2e/real/harness/tsconfig.json",
  "packages/e2e/real/tsconfig.json"
];

const modes = new Set(process.argv.slice(2));
if (modes.size === 0 || modes.has("all")) {
  modes.add("packages");
  modes.add("tests");
  modes.add("e2e");
}

const projects = [];
if (modes.has("packages")) projects.push(...packageProjects);
if (modes.has("tests")) projects.push(...testProjects);
if (modes.has("e2e")) projects.push(...e2eProjects);

if (projects.length === 0) {
  console.error("Usage: node scripts/build-graph.mjs [all|packages|tests|e2e]");
  process.exit(1);
}

for (const project of projects) {
  console.log(`\n[build] ${project}`);
  const result = spawnSync(process.execPath, [tsc, "-p", project], {
    cwd: root,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
