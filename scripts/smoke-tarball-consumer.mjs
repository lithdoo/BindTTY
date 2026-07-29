import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = mkdtempSync(path.join(tmpdir(), "bindtty-consumer-"));
const tarballRoot = path.join(temporaryRoot, "tarballs");
const consumerRoot = path.join(temporaryRoot, "consumer");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
const packageDirectories = [
  "signal",
  "text",
  "vnode",
  "jsx-runtime",
  "runtime",
  "layout",
  "renderer-terminal",
  "input",
  "win32-input",
  "terminal",
  "interaction",
  "widgets",
  "bindtty"
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  mkdirSync(tarballRoot);
  mkdirSync(consumerRoot);
  run(npmCommand, ["pack", "--silent", "--pack-destination", tarballRoot],
    path.join(root, "packages", packageDirectories[0]));
  for (const directory of packageDirectories.slice(1)) {
    run(npmCommand, ["pack", "--silent", "--pack-destination", tarballRoot],
      path.join(root, "packages", directory));
  }

  writeFileSync(path.join(temporaryRoot, "package.json"), JSON.stringify({
    private: true,
    workspaces: ["consumer"]
  }, null, 2));
  writeFileSync(path.join(consumerRoot, "package.json"), JSON.stringify({
    name: "bindtty-isolated-consumer",
    private: true,
    type: "module"
  }, null, 2));
  writeFileSync(path.join(consumerRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: false
    },
    include: ["consumer.ts"]
  }, null, 2));
  writeFileSync(path.join(consumerRoot, "consumer.ts"), [
    'import { createApp, createSignal } from "bindtty";',
    'import { createTerminalRenderer } from "@bindtty/renderer-terminal";',
    'import { emptyTemplate, type ViewTemplate } from "@bindtty/vnode";',
    'import type { SemanticInputEvent } from "@bindtty/input";',
    "",
    "const view: ViewTemplate = emptyTemplate();",
    "const count = createSignal(0);",
    "const renderer = createTerminalRenderer();",
    "const event: SemanticInputEvent = {",
    '  kind: "text", text: "x", protocol: "legacy-vt"',
    "};",
    "void createApp;",
    "void view;",
    "void count;",
    "void renderer;",
    "void event;",
    ""
  ].join("\n"));

  const tarballs = readdirSync(tarballRoot)
    .filter((entry) => entry.endsWith(".tgz"))
    .map((entry) => path.join(tarballRoot, entry));
  if (tarballs.length !== packageDirectories.length) {
    throw new Error(
      `Expected ${packageDirectories.length} tarballs, found ${tarballs.length}`
    );
  }

  run(npmCommand, [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "@types/node@^22.0.0",
    ...tarballs
  ],
    temporaryRoot);
  run(process.execPath, [tsc, "-p", "tsconfig.json"], consumerRoot);
  run(process.execPath, ["-e", 'import("bindtty").then(m => { if (!m.createApp) process.exit(1); })'],
    consumerRoot);
  console.log(`Isolated consumer smoke passed for ${tarballs.length} tarballs.`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
