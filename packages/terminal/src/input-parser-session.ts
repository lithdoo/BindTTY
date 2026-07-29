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

export interface InputParserSessionClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface InputParserSessionOptions extends ParseInputChunkOptions {
  pendingTimeoutMs?: number;
  clock?: InputParserSessionClock;
}

const systemClock: InputParserSessionClock = {
  setTimeout(callback, delayMs) {
    return setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
};

export function createInputParserSession(
  publish: (event: TerminalKeyEvent) => void,
  options: InputParserSessionOptions = {}
): InputParserSession {
  const parser: InputParser = createInputParser(options);
  const timeoutMs = options.pendingTimeoutMs;
  const clock = options.clock ?? systemClock;
  let pendingTimer: unknown;

  function cancelPendingTimer(): void {
    if (pendingTimer !== undefined) {
      clock.clearTimeout(pendingTimer);
      pendingTimer = undefined;
    }
  }

  function schedulePendingFlush(): void {
    cancelPendingTimer();
    if (!parser.hasPending() || timeoutMs === undefined) {
      return;
    }
    pendingTimer = clock.setTimeout(() => {
      pendingTimer = undefined;
      publishParsed(parser.flush());
    }, timeoutMs);
  }

  function publishParsed(events: ReturnType<InputParser["parse"]>): void {
    for (const event of events) {
      publish(toSemanticInputEvent(event));
    }
  }

  return {
    push(chunk) {
      cancelPendingTimer();
      publishParsed(parser.parse(chunk));
      schedulePendingFlush();
    },
    flush() {
      cancelPendingTimer();
      publishParsed(parser.flush());
    },
    hasPending() {
      return parser.hasPending();
    },
    reset() {
      cancelPendingTimer();
      parser.reset();
    }
  };
}
