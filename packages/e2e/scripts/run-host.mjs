#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("BindTTY real-terminal E2E — Windows host runner");
console.log(`platform=${process.platform}`);
console.log(`cwd=${packageRoot}`);

const result = spawnSync("npm", ["test"], {
  cwd: packageRoot,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    BINDTTY_E2E_HOST: "windows"
  }
});

process.exit(result.status ?? 1);
