import { ANSI } from "./ansi.js";
import type { ResizeClock } from "./resize-coordinator.js";
import type {
  TerminalResponseRouter
} from "./terminal-response-router.js";
import type { TerminalStdout } from "./types.js";

export interface XtermViewportQuery {
  readonly stdout: TerminalStdout;
  start(): void;
  stop(): void;
  dispose(): void;
}

export interface XtermViewportQueryOptions {
  stdout: TerminalStdout;
  writeRaw(chunk: string): boolean | void;
  responseRouter: TerminalResponseRouter;
  clock?: Pick<ResizeClock, "setInterval" | "clearInterval">;
  intervalMs?: number;
}

const systemClock: Pick<ResizeClock, "setInterval" | "clearInterval"> = {
  setInterval(callback, intervalMs) {
    const handle = setInterval(callback, intervalMs);
    handle.unref?.();
    return handle;
  },
  clearInterval(handle) {
    clearInterval(handle as ReturnType<typeof setInterval>);
  }
};

/**
 * Owns the xterm window-size request/response exchange. Responses are removed
 * before semantic keyboard parsing, while all unrelated bytes pass through.
 */
export function createXtermViewportQuery(
  options: XtermViewportQueryOptions
): XtermViewportQuery {
  let viewport: [number, number] | undefined;
  let timer: unknown;
  let started = false;
  let disposed = false;
  let stopExpecting: (() => void) | undefined;
  const stopListening = options.responseRouter.onResponse((response) => {
    if (
      response.kind === "viewport" &&
      response.columns > 0 &&
      response.rows > 0
    ) {
      viewport = [response.columns, response.rows];
    }
  });
  const clock = options.clock ?? systemClock;

  const stdout = Object.create(options.stdout) as TerminalStdout;
  Object.defineProperties(stdout, {
    columns: {
      configurable: true,
      get: () => viewport?.[0] ?? options.stdout.columns
    },
    rows: {
      configurable: true,
      get: () => viewport?.[1] ?? options.stdout.rows
    },
    getWindowSize: {
      configurable: true,
      value: () => viewport
        ? [...viewport] as [number, number]
        : options.stdout.getWindowSize?.()
    }
  });

  function query(): void {
    options.writeRaw(ANSI.queryTextAreaSize);
  }

  const controller: XtermViewportQuery = {
    stdout,
    start(): void {
      if (started || disposed) {
        return;
      }
      started = true;
      stopExpecting = options.responseRouter.expect("viewport");
      query();
      timer = clock.setInterval(
        query,
        Math.max(25, options.intervalMs ?? 100)
      );
    },
    stop(): void {
      if (!started) {
        return;
      }
      if (timer !== undefined) {
        clock.clearInterval(timer);
        timer = undefined;
      }
      stopExpecting?.();
      stopExpecting = undefined;
      started = false;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      controller.stop();
      stopListening();
      disposed = true;
    }
  };

  return controller;
}
