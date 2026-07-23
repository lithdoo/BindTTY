import type { Readable } from "node:stream";

import { createInputParser, toSemanticInputEvent } from "@bindtty/input";

import type { Dispose, TerminalKeyEvent } from "../types.js";
import type { StdinInputAdapter } from "../types.js";
import type { InputTraceOption } from "../types.js";
import {
  createInputTraceListener,
  traceInputEvent,
  traceRawInput
} from "../input-trace.js";

export class RawStdinInput implements StdinInputAdapter {
  readonly kind = "raw" as const;
  private readonly trace;

  constructor(trace?: InputTraceOption) {
    this.trace = createInputTraceListener(trace);
  }

  prepare(_stdin: Readable): void {}

  attach(
    stdin: Readable,
    onKey: (event: TerminalKeyEvent) => void
  ): Dispose {
    const parser = createInputParser();
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

      for (const event of parser.parse(chunk)) {
        const semantic = toSemanticInputEvent(event);
        const terminalEvent: TerminalKeyEvent = {
          ...event,
          kind: semantic.kind,
          protocol: semantic.protocol
        };
        traceInputEvent(this.trace, this.kind, terminalEvent, redactTraceChunk);
        onKey(terminalEvent);
      }
    };

    stdin.on("data", handler);
    return () => {
      stdin.off("data", handler);
      parser.reset();
      pasteTraceOpen = false;
      traceSuffix = "";
    };
  }
}
