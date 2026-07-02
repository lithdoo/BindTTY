import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

export type HostKind = "windows" | "wsl" | "linux" | "macos" | "unknown";

export interface RuntimeEnv {
  hostKind: HostKind;
  platform: NodeJS.Platform;
  arch: string;
  nodeVersion: string;
  cwd: string;
  isTTY: {
    stdin: boolean;
    stdout: boolean;
    stderr: boolean;
  };
  ci: boolean;
  wslDistro: string | null;
}

export function detectHostKind(): HostKind {
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

export function readWslDistro(): string | null {
  if (detectHostKind() !== "wsl") {
    return null;
  }

  return process.env.WSL_DISTRO_NAME ?? null;
}

export function readRuntimeEnv(): RuntimeEnv {
  return {
    hostKind: detectHostKind(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cwd: process.cwd(),
    isTTY: {
      stdin: Boolean(process.stdin.isTTY),
      stdout: Boolean(process.stdout.isTTY),
      stderr: Boolean(process.stderr.isTTY)
    },
    ci: Boolean(process.env.CI || process.env.GITHUB_ACTIONS),
    wslDistro: readWslDistro()
  };
}

export function formatRuntimeEnv(env: RuntimeEnv): string {
  const lines = [
    `host=${env.hostKind}`,
    `platform=${env.platform}`,
    `arch=${env.arch}`,
    `node=${env.nodeVersion}`,
    `cwd=${env.cwd}`,
    `stdinTTY=${env.isTTY.stdin}`,
    `stdoutTTY=${env.isTTY.stdout}`,
    `ci=${env.ci}`
  ];

  if (env.wslDistro) {
    lines.push(`wslDistro=${env.wslDistro}`);
  }

  return lines.join("\n");
}

export function canLoadNodePty(): boolean {
  try {
    require.resolve("node-pty");
    return true;
  } catch {
    return false;
  }
}

export function createMarkerFile(prefix = "bindtty-e2e"): string {
  return path.join(
    os.tmpdir(),
    `${prefix}-${process.pid}-${Date.now()}.log`
  );
}
