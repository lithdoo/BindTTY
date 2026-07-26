import { spawnSync } from "node:child_process";

if (process.platform === "win32") {
  const bundledNodeGyp = process.env.npm_config_node_gyp;
  const command = bundledNodeGyp ? process.execPath : "node-gyp.cmd";
  const args = bundledNodeGyp
    ? [bundledNodeGyp, "rebuild"]
    : ["rebuild"];
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}
