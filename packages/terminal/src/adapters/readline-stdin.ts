import readline from "node:readline";
import type { Readable } from "node:stream";

import { normalizeKeypressEvent } from "../input.js";
import type { Dispose, KeypressListener, TerminalKeyEvent } from "../types.js";
import type { StdinInputAdapter } from "../types.js";

export class ReadlineStdinInput implements StdinInputAdapter {
  readonly kind = "readline" as const;

  prepare(stdin: Readable): void {
    readline.emitKeypressEvents(stdin);
  }

  attach(
    stdin: Readable,
    onKey: (event: TerminalKeyEvent) => void
  ): Dispose {
    const handler: KeypressListener = (input, key) => {
      onKey(normalizeKeypressEvent(input, key));
    };

    stdin.on("keypress", handler);
    return () => {
      stdin.off("keypress", handler);
    };
  }
}
