import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform === "win32") {
  const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const prebuild = path.join(
    packageRoot,
    "prebuilds",
    `win32-${process.arch}`,
    "node.napi.node"
  );
  if (existsSync(prebuild)) {
    console.log(`Using BindTTY Win32 input prebuild for ${process.arch}.`);
    process.exit(0);
  }
  const bundledNodeGyp = process.env.npm_config_node_gyp;
  const command = bundledNodeGyp ? process.execPath : "node-gyp.cmd";
  const args = bundledNodeGyp
    ? [bundledNodeGyp, "rebuild"]
    : ["rebuild"];
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}
