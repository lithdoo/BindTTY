import type { Readable } from "node:stream";

import { parseRawChunk } from "../raw-input.js";
import type { Dispose, TerminalKeyEvent } from "../types.js";
import type { StdinInputAdapter } from "../types.js";

export class RawStdinInput implements StdinInputAdapter {
  readonly kind = "raw" as const;

  prepare(_stdin: Readable): void {}

  attach(
    stdin: Readable,
    onKey: (event: TerminalKeyEvent) => void
  ): Dispose {
    const handler = (chunk: Buffer | string): void => {
      for (const event of parseRawChunk(String(chunk))) {
        onKey(event);
      }
    };

    stdin.on("data", handler);
    return () => {
      stdin.off("data", handler);
    };
  }
}
