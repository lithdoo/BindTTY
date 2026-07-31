import { stdin as processStdin } from "node:process";

import type {
  CreateNodeTerminalOptions,
  InputBackendSelection,
  TerminalInputEnvironment
} from "./types.js";

export function detectTerminalInputEnvironment(
  options: CreateNodeTerminalOptions,
  overrides: Partial<TerminalInputEnvironment> = {}
): TerminalInputEnvironment {
  return {
    platform: overrides.platform ?? process.platform,
    stdinIsTTY: overrides.stdinIsTTY ?? options.stdin?.isTTY === true,
    stdoutIsTTY: overrides.stdoutIsTTY ?? options.stdout.isTTY === true,
    canSetRawMode:
      overrides.canSetRawMode ??
      typeof options.stdin?.setRawMode === "function",
    isProcessStdin:
      overrides.isProcessStdin ??
      options.stdin === processStdin,
    windowsTerminal:
      overrides.windowsTerminal ??
      process.env.WT_SESSION !== undefined,
    conEmu:
      overrides.conEmu ??
      process.env.ConEmuANSI !== undefined,
    ansicon:
      overrides.ansicon ??
      process.env.ANSICON !== undefined,
    terminalProgram:
      overrides.terminalProgram ??
      readEnvironmentValue("TERM_PROGRAM"),
    term: overrides.term ?? readEnvironmentValue("TERM")
  };
}

export function selectInputBackend(
  options: CreateNodeTerminalOptions,
  environment = detectTerminalInputEnvironment(options)
): InputBackendSelection {
  if (options.stdinInputAdapter) {
    return {
      stdinAdapter: options.stdinInputAdapter.kind,
      reason: "explicit-stdin-input-adapter",
      enableRawMode:
        options.stdinInputAdapter.kind === "raw" &&
        environment.stdinIsTTY &&
        environment.canSetRawMode
    };
  }

  const requested = options.inputBackend ?? "auto";
  if (requested === "readline") {
    return {
      stdinAdapter: "readline",
      reason: "explicit-readline-backend",
      enableRawMode: false
    };
  }

  if (requested === "raw") {
    return {
      stdinAdapter: "raw",
      reason: "explicit-raw-backend",
      enableRawMode: environment.stdinIsTTY && environment.canSetRawMode
    };
  }

  if (requested === "win32") {
    if (
      environment.platform === "win32" &&
      win32ProviderAvailable(options)
    ) {
      return {
        stdinAdapter: "win32",
        reason: "explicit-win32-backend",
        enableRawMode: false
      };
    }

    return rawInputAvailable(options, environment)
      ? {
          stdinAdapter: "raw",
          reason: "explicit-win32-backend-unavailable; using-raw-stdin",
          enableRawMode: environment.stdinIsTTY && environment.canSetRawMode
        }
      : {
          stdinAdapter: "readline",
          reason: "explicit-win32-backend-unavailable; using-readline",
          enableRawMode: false
        };
  }

  if (
    environment.platform === "win32" &&
    environment.terminalProgram === "vscode" &&
    options.rawMode !== false &&
    rawInputAvailable(options, environment)
  ) {
    return {
      stdinAdapter: "raw",
      reason: "vscode-terminal-control-responses; using-raw-stdin",
      enableRawMode: environment.stdinIsTTY && environment.canSetRawMode
    };
  }

  if (environment.platform === "win32" && win32ProviderAvailable(options)) {
    return {
      stdinAdapter: "win32",
      reason: "win32-input-provider-available",
      enableRawMode: false
    };
  }

  if (options.rawMode === false) {
    return {
      stdinAdapter: "readline",
      reason: "raw-mode-disabled",
      enableRawMode: false
    };
  }

  if (rawInputAvailable(options, environment)) {
    return {
      stdinAdapter: "raw",
      reason:
        options.rawMode === true
          ? "raw-mode-requested"
          : environment.platform === "win32"
            ? "win32-input-provider-unavailable; using-raw-stdin"
            : "tty-raw-input-available",
      enableRawMode: environment.stdinIsTTY && environment.canSetRawMode
    };
  }

  return {
    stdinAdapter: "readline",
    reason:
      environment.platform === "win32"
        ? "win32-input-provider-unavailable; using-readline"
        : "non-tty-readline-fallback",
    enableRawMode: false
  };
}

function win32ProviderAvailable(options: CreateNodeTerminalOptions): boolean {
  const provider = options.win32InputProvider;
  if (!provider) {
    return false;
  }

  try {
    return provider.isAvailable?.() !== false;
  } catch {
    return false;
  }
}

function rawInputAvailable(
  options: CreateNodeTerminalOptions,
  environment: TerminalInputEnvironment
): boolean {
  return (
    options.rawMode === true ||
    (
      environment.platform === "win32" &&
      (
        environment.isProcessStdin ||
        (environment.stdinIsTTY && environment.canSetRawMode)
      )
    )
  );
}

function readEnvironmentValue(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === ""
    ? undefined
    : value.slice(0, 128);
}
