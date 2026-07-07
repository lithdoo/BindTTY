import { parseInputChunk } from "@bindtty/input";

import type { TerminalKeyEvent } from "./types.js";

export function* parseRawChunk(chunk: string): Generator<TerminalKeyEvent> {
  for (const event of parseInputChunk(chunk)) {
    yield event;
  }
}
