import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  InputTraceListener,
  InputTraceOption,
  InputTraceRecord,
  StdinInputKind,
  TerminalKeyEvent
} from "./types.js";

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
  const paste = redactInput || event.name === "paste";
  const record: InputTraceRecord = {
    time: new Date().toISOString(),
    adapter,
    ...(paste ? { redacted: "paste" as const } : {}),
    event: {
      ...(paste ? {} : { input: event.input }),
      inputLength: event.input.length,
      kind: event.kind,
      protocol: event.protocol,
      name: event.name,
      ctrl: event.ctrl,
      meta: event.meta,
      shift: event.shift,
      sequence: paste ? "[redacted-paste]" : event.sequence
    }
  };
  listener?.(record);
}

function resolveEnvironmentTracePath(): string | null {
  if (process.env.BINDTTY_INPUT_TRACE !== "1") {
    return null;
  }

  return process.env.BINDTTY_INPUT_TRACE_FILE
    ?? join(tmpdir(), `bindtty-input-${process.pid}.jsonl`);
}
