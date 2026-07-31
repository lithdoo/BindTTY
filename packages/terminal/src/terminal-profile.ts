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
export const DEFAULT_WIN32_RESIZE_MIN_FRAME_INTERVAL_MS = 80;
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
    | "classic-windows-console"
    | "generic";
  readonly input: {
    readonly tty: boolean;
    readonly rawModeAvailable: boolean;
  };
  readonly output: {
    readonly tty: boolean;
    readonly synchronizedOutput: boolean;
    readonly absoluteCursorAddressing: boolean;
  };
  readonly resize: {
    readonly pollIntervalMs: number;
    readonly minFrameIntervalMs: number;
    readonly settleDelayMs: number;
    readonly queryXtermViewport: boolean;
  };
}

export function resolveTerminalProfile(
  options: CreateNodeTerminalOptions,
  environmentOverrides: Partial<TerminalInputEnvironment> = {}
): ResolvedTerminalProfile {
  const adapter = resolvePlatformAdapter(options);
  const platform =
    environmentOverrides.platform ??
    (adapter.name === "win32" ? "win32" : process.platform);
  const inputEnvironment = detectTerminalInputEnvironment(options, {
    platform,
    ...environmentOverrides
  });
  const win32Policy = platform === "win32";

  const host = resolveHost(inputEnvironment);
  return {
    platform,
    adapter,
    inputEnvironment,
    inputBackend: selectInputBackend(options, inputEnvironment),
    host,
    input: {
      tty: inputEnvironment.stdinIsTTY,
      rawModeAvailable: inputEnvironment.canSetRawMode
    },
    output: {
      tty: inputEnvironment.stdoutIsTTY,
      synchronizedOutput:
        options.synchronizedOutput ??
        (inputEnvironment.stdoutIsTTY &&
          host !== "classic-windows-console" &&
          (win32Policy ||
            host === "windows-terminal" ||
            host === "vscode")),
      absoluteCursorAddressing: host !== "classic-windows-console"
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
      ),
      queryXtermViewport:
        options.viewportQuery === "xterm" ||
        (options.viewportQuery !== "none" &&
          host === "vscode" &&
          options.stdout === process.stdout &&
          options.stdin === process.stdin)
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
  if (
    environment.platform === "win32" &&
    environment.isProcessStdout === true
  ) {
    return "classic-windows-console";
  }
  return "generic";
}
