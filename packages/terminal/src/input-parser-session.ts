import {
  createInputParser,
  toSemanticInputEvent,
  type InputParser,
  type ParseInputChunkOptions
} from "@bindtty/input";

import type { TerminalKeyEvent } from "./types.js";

export interface InputParserSession {
  push(chunk: Buffer | string): void;
  flush(): void;
  hasPending(): boolean;
  reset(): void;
}

export function createInputParserSession(
  publish: (event: TerminalKeyEvent) => void,
  options: ParseInputChunkOptions = {}
): InputParserSession {
  const parser: InputParser = createInputParser(options);

  function publishParsed(events: ReturnType<InputParser["parse"]>): void {
    for (const event of events) {
      publish(toSemanticInputEvent(event));
    }
  }

  return {
    push(chunk) {
      publishParsed(parser.parse(chunk));
    },
    flush() {
      publishParsed(parser.flush());
    },
    hasPending() {
      return parser.hasPending();
    },
    reset() {
      parser.reset();
    }
  };
}
