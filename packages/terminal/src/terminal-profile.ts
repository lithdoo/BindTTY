import {
  detectTerminalInputEnvironment,
  selectInputBackend
} from "./backend-selection.js";
import { resolvePlatformAdapter } from "./adapters/resolve.js";
import type {
  CreateNodeTerminalOptions,
  InputBackendSelection,
  PlatformTerminalAdapter,
  TerminalInputEnvironment
} from "./types.js";

export const DEFAULT_WIN32_RESIZE_POLL_INTERVAL_MS = 50;
export const DEFAULT_WIN32_RESIZE_MIN_FRAME_INTERVAL_MS = 32;
export const DEFAULT_WIN32_RESIZE_SETTLE_DELAY_MS = 100;

export interface ResolvedTerminalProfile {
  readonly platform: NodeJS.Platform;
  readonly adapter: PlatformTerminalAdapter;
  readonly inputEnvironment: TerminalInputEnvironment;
  readonly inputBackend: InputBackendSelection;
  readonly host:
    | "windows-terminal"
    | "vscode"
    | "conemu"
    | "ansicon"
    | "generic";
  readonly input: {
    readonly tty: boolean;
    readonly rawModeAvailable: boolean;
  };
  readonly output: {
    readonly tty: boolean;
    readonly synchronizedOutput: boolean;
  };
  readonly resize: {
    readonly pollIntervalMs: number;
    readonly minFrameIntervalMs: number;
    readonly settleDelayMs: number;
  };
}

export function resolveTerminalProfile(
  options: CreateNodeTerminalOptions
): ResolvedTerminalProfile {
  const adapter = resolvePlatformAdapter(options);
  const platform = adapter.name === "win32" ? "win32" : process.platform;
  const inputEnvironment = detectTerminalInputEnvironment(options, { platform });
  const win32Policy = platform === "win32";

  return {
    platform,
    adapter,
    inputEnvironment,
    inputBackend: selectInputBackend(options, inputEnvironment),
    host: resolveHost(inputEnvironment),
    input: {
      tty: inputEnvironment.stdinIsTTY,
      rawModeAvailable: inputEnvironment.canSetRawMode
    },
    output: {
      tty: inputEnvironment.stdoutIsTTY,
      synchronizedOutput:
        options.synchronizedOutput ??
        (win32Policy && inputEnvironment.stdoutIsTTY)
    },
    resize: {
      pollIntervalMs: normalizeDurationMs(
        options.resizePollIntervalMs,
        win32Policy ? DEFAULT_WIN32_RESIZE_POLL_INTERVAL_MS : 0
      ),
      minFrameIntervalMs: normalizeDurationMs(
        options.resizeMinFrameIntervalMs,
        win32Policy ? DEFAULT_WIN32_RESIZE_MIN_FRAME_INTERVAL_MS : 0
      ),
      settleDelayMs: normalizeDurationMs(
        options.resizeSettleDelayMs,
        win32Policy ? DEFAULT_WIN32_RESIZE_SETTLE_DELAY_MS : 0
      )
    }
  };
}

function normalizeDurationMs(
  value: number | undefined,
  fallback: number
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function resolveHost(
  environment: TerminalInputEnvironment
): ResolvedTerminalProfile["host"] {
  if (environment.windowsTerminal) {
    return "windows-terminal";
  }
  if (environment.terminalProgram === "vscode") {
    return "vscode";
  }
  if (environment.conEmu) {
    return "conemu";
  }
  if (environment.ansicon) {
    return "ansicon";
  }
  return "generic";
}
