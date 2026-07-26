import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CreateNodeTerminalOptions,
  InputTraceListener,
  InputTraceOption,
  InputTraceRecord,
  PlatformTerminalAdapter,
  StdinInputKind,
  TerminalKeyEvent,
  Win32KeyRecord
} from "./types.js";
import type { KeyboardCapabilities } from "@bindtty/input";

export function createInputTraceListener(
  option: InputTraceOption | undefined
): InputTraceListener | null {
  if (option === false) {
    return null;
  }

  if (typeof option === "function") {
    return option;
  }

  const path = typeof option === "string"
    ? option
    : resolveEnvironmentTracePath();
  if (!path) {
    return null;
  }

  return (record) => {
    try {
      appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
    } catch {
      // Diagnostics must never take down the terminal application.
    }
  };
}

export function traceRawInput(
  listener: InputTraceListener | null,
  adapter: StdinInputKind,
  chunk: Buffer | string,
  redactPaste = false
): void {
  const bytes = Buffer.isBuffer(chunk)
    ? chunk
    : Buffer.from(chunk, "utf8");
  listener?.({
    time: new Date().toISOString(),
    recordType: "raw",
    adapter,
    rawLength: bytes.length,
    ...(redactPaste
      ? { redacted: "paste" as const }
      : { rawHex: bytes.toString("hex") })
  });
}

export function traceInputEvent(
  listener: InputTraceListener | null,
  adapter: StdinInputKind,
  event: TerminalKeyEvent,
  redactInput = false
): void {
  const paste = redactInput || event.kind === "paste";
  const text = event.kind === "text" || event.kind === "paste"
    ? event.text
    : undefined;
  const record: InputTraceRecord = {
    time: new Date().toISOString(),
    recordType: "event",
    adapter,
    ...(paste ? { redacted: "paste" as const } : {}),
    event: {
      kind: event.kind,
      protocol: event.protocol,
      ...(event.kind === "key"
        ? {
            key: event.key,
            modifiers: event.modifiers,
            repeat: event.repeat
          }
        : {}),
      ...(text === undefined
        ? {}
        : {
            ...(paste ? {} : { text }),
            textLength: text.length
          }),
      ...(event.kind === "unknown"
        ? {
            raw: event.raw,
            rawLength: event.raw.length,
            reason: event.reason
          }
        : {}),
      sequence: paste ? "[redacted-paste]" : event.sequence
    }
  };
  listener?.(record);
}

export function traceTerminalEnvironment(
  listener: InputTraceListener | null,
  options: CreateNodeTerminalOptions,
  _platform: PlatformTerminalAdapter
): void {
  const terminalProgram = readSafeEnvironmentValue("TERM_PROGRAM");
  const term = readSafeEnvironmentValue("TERM");
  const captureShell = readSafeEnvironmentValue("BINDTTY_CAPTURE_SHELL");
  const captureShellVersion = readSafeEnvironmentValue(
    "BINDTTY_CAPTURE_SHELL_VERSION"
  );
  const captureHost = readSafeEnvironmentValue("BINDTTY_CAPTURE_HOST");

  listener?.({
    time: new Date().toISOString(),
    recordType: "environment",
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      stdinIsTTY: options.stdin?.isTTY === true,
      stdoutIsTTY: options.stdout.isTTY === true,
      rawModeRequested: options.rawMode === true,
      inputBackendRequested: options.inputBackend ?? "auto",
      keyboardProtocolRequested:
        options.keyboardProtocol ??
        (options.enhancedKeyboard === true ? "default" : "auto"),
      ...(terminalProgram === undefined ? {} : { terminalProgram }),
      ...(term === undefined ? {} : { term }),
      windowsTerminal: process.env.WT_SESSION !== undefined,
      conEmu: process.env.ConEmuANSI !== undefined,
      ansicon: process.env.ANSICON !== undefined,
      ci: Boolean(process.env.CI || process.env.GITHUB_ACTIONS),
      ...(captureShell === undefined ? {} : { captureShell }),
      ...(captureShellVersion === undefined
        ? {}
        : { captureShellVersion }),
      ...(captureHost === undefined ? {} : { captureHost })
    }
  });
}

export function traceBackendSelection(
  listener: InputTraceListener | null,
  platform: PlatformTerminalAdapter,
  adapter: StdinInputKind,
  reason: string
): void {
  listener?.({
    time: new Date().toISOString(),
    recordType: "backend",
    adapter,
    backend: {
      platformAdapter: platform.name,
      stdinAdapter: adapter,
      reason
    }
  });
}

export function traceKeyboardCapabilities(
  listener: InputTraceListener | null,
  adapter: StdinInputKind | null,
  capabilities: KeyboardCapabilities
): void {
  listener?.({
    time: new Date().toISOString(),
    recordType: "capabilities",
    ...(adapter === null ? {} : { adapter }),
    capabilities
  });
}

export function traceWin32KeyRecord(
  listener: InputTraceListener | null,
  record: Win32KeyRecord
): void {
  listener?.({
    time: new Date().toISOString(),
    recordType: "win32-record",
    adapter: "win32",
    win32Record: {
      keyDown: record.keyDown,
      virtualKeyCode: record.virtualKeyCode,
      scanCode: record.scanCode,
      unicodeCodeUnits: Array.from(record.unicode, (character) =>
        character.charCodeAt(0)
      ),
      controlKeyState: record.controlKeyState,
      repeatCount: record.repeatCount
    }
  });
}

function resolveEnvironmentTracePath(): string | null {
  if (process.env.BINDTTY_INPUT_TRACE !== "1") {
    return null;
  }

  return process.env.BINDTTY_INPUT_TRACE_FILE
    ?? join(tmpdir(), `bindtty-input-${process.pid}.jsonl`);
}

function readSafeEnvironmentValue(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return undefined;
  }

  return value.slice(0, 128);
}
