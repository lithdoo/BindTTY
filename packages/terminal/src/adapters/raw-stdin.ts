import type { Readable } from "node:stream";

import type { Dispose, TerminalKeyEvent } from "../types.js";
import type { StdinInputAdapter } from "../types.js";
import type { InputTraceOption } from "../types.js";
import {
  createInputTraceListener,
  traceRawInput
} from "../input-trace.js";
import { createInputParserSession } from "../input-parser-session.js";
import type { InputParserSessionClock } from "../input-parser-session.js";

export const DEFAULT_ESCAPE_AMBIGUITY_TIMEOUT_MS = 30;

export interface RawStdinInputOptions {
  escapeAmbiguityTimeoutMs?: number;
  maxPasteCodeUnits?: number;
  clock?: InputParserSessionClock;
}

export class RawStdinInput implements StdinInputAdapter {
  readonly kind = "raw" as const;
  private readonly trace;

  private readonly options: RawStdinInputOptions;

  constructor(trace?: InputTraceOption, options: RawStdinInputOptions = {}) {
    this.trace = createInputTraceListener(trace);
    const timeoutMs =
      options.escapeAmbiguityTimeoutMs ?? DEFAULT_ESCAPE_AMBIGUITY_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
      throw new RangeError("escapeAmbiguityTimeoutMs must be a finite non-negative number");
    }
    this.options = { ...options, escapeAmbiguityTimeoutMs: timeoutMs };
  }

  prepare(_stdin: Readable): void {}

  attach(
    stdin: Readable,
    onKey: (event: TerminalKeyEvent) => void
  ): Dispose {
    const session = createInputParserSession(onKey, {
      escapeFlushMode: "escape",
      pasteMode: "event",
      maxPasteCodeUnits: this.options.maxPasteCodeUnits,
      pendingTimeoutMs: this.options.escapeAmbiguityTimeoutMs,
      clock: this.options.clock
    });
    let pasteTraceOpen = false;
    let traceSuffix = "";
    const handler = (chunk: Buffer | string): void => {
      const traceText = Buffer.isBuffer(chunk)
        ? chunk.toString("utf8")
        : chunk;
      const combinedTraceText = traceSuffix + traceText;
      const openIndex = combinedTraceText.lastIndexOf("\x1b[200~");
      const closeIndex = combinedTraceText.lastIndexOf("\x1b[201~");
      const containsPasteBoundary = openIndex >= 0 || closeIndex >= 0;
      const redactPaste = pasteTraceOpen || openIndex > closeIndex;
      const redactTraceChunk = redactPaste || containsPasteBoundary;
      traceRawInput(this.trace, this.kind, chunk, redactTraceChunk);
      if (openIndex >= 0 || closeIndex >= 0) {
        pasteTraceOpen = openIndex > closeIndex;
      }
      traceSuffix = combinedTraceText.slice(-5);

      session.push(chunk);
    };

    stdin.on("data", handler);
    return () => {
      stdin.off("data", handler);
      session.reset();
      pasteTraceOpen = false;
      traceSuffix = "";
    };
  }
}
