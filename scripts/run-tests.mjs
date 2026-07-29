import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function testFiles(directory, suffix = ".test.js") {
  const absolute = path.join(root, directory);
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

const groups = {
  unit: [
    ...testFiles("packages/signal/test"),
    ...testFiles("packages/text/test/dist"),
    ...testFiles("packages/vnode/test"),
    ...testFiles("packages/input/test/dist"),
    ...testFiles("packages/interaction/test/dist"),
    ...testFiles("packages/jsx-runtime/test/dist"),
    ...testFiles("packages/layout/test/dist"),
    ...testFiles("packages/renderer-terminal/test/dist"),
    ...testFiles("packages/runtime/test/dist"),
    ...testFiles("packages/terminal/test/dist"),
    ...testFiles("packages/widgets/test/dist"),
    ...testFiles("packages/win32-input/test", ".test.mjs")
  ],
  integration: testFiles("packages/bindtty/test/dist"),
  "e2e:mock": [
    ...testFiles("packages/e2e/scripts", ".test.mjs"),
    ...testFiles("packages/e2e/dist/mock/test")
  ],
  "e2e:pty": testFiles("packages/e2e/dist/real/test")
};

const group = process.argv[2];
const files = groups[group];
if (!files) {
  console.error(`Unknown test group: ${group ?? "(missing)"}`);
  console.error(`Expected one of: ${Object.keys(groups).join(", ")}`);
  process.exit(1);
}

const args = ["--test"];
if (group === "e2e:pty") {
  args.push("--test-concurrency=1", "--test-force-exit");
}
args.push(...files);

console.log(`[test:${group}] ${files.length} test files`);
const result = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: "inherit"
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
