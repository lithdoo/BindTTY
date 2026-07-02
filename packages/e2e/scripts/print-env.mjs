#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";

function detectHostKind() {
  if (process.platform === "win32") {
    return "windows";
  }

  if (process.platform === "linux" && fs.existsSync("/proc/version")) {
    const version = fs.readFileSync("/proc/version", "utf8").toLowerCase();

    if (version.includes("microsoft") || version.includes("wsl")) {
      return "wsl";
    }

    return "linux";
  }

  if (process.platform === "darwin") {
    return "macos";
  }

  return "unknown";
}

let nodePty = false;

try {
  await import("node-pty");
  nodePty = true;
} catch {
  nodePty = false;
}

const hostKind = detectHostKind();

console.log("BindTTY real-terminal E2E environment");
console.log(`host=${hostKind}`);
console.log(`platform=${process.platform}`);
console.log(`arch=${process.arch}`);
console.log(`node=${process.version}`);
console.log(`cwd=${process.cwd()}`);
console.log(`stdinTTY=${Boolean(process.stdin.isTTY)}`);
console.log(`stdoutTTY=${Boolean(process.stdout.isTTY)}`);
console.log(`ci=${Boolean(process.env.CI || process.env.GITHUB_ACTIONS)}`);
console.log(`nodePty=${nodePty}`);

if (hostKind === "windows") {
  console.log("runner=windows-native");
  console.log("note=Use npm run test:e2e:real:wsl to execute inside WSL");
} else if (hostKind === "wsl") {
  console.log("runner=wsl");
} else {
  console.log(`runner=${hostKind}`);
}

if (process.env.WSL_DISTRO_NAME) {
  console.log(`wslDistro=${process.env.WSL_DISTRO_NAME}`);
}
