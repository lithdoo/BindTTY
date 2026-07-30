import { ANSI } from "./ansi.js";
import type { ResizeClock } from "./resize-coordinator.js";
import type {
  TerminalResponseRouter
} from "./terminal-response-router.js";
import type {
  Dispose,
  TerminalViewport
} from "./types.js";

export interface XtermViewportQuery {
  readonly viewport: TerminalViewport | undefined;
  start(): void;
  stop(): void;
  dispose(): void;
  onViewport(listener: (viewport: TerminalViewport) => void): Dispose;
}

export interface XtermViewportQueryOptions {
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
  const listeners = new Set<(viewport: TerminalViewport) => void>();
  const stopListening = options.responseRouter.onResponse((response) => {
    if (
      response.kind === "viewport" &&
      response.columns > 0 &&
      response.rows > 0
    ) {
      viewport = [response.columns, response.rows];
      const next = {
        width: response.columns,
        height: response.rows
      };
      for (const listener of [...listeners]) {
        listener(next);
      }
    }
  });
  const clock = options.clock ?? systemClock;

  function query(): void {
    options.writeRaw(ANSI.queryTextAreaSize);
  }

  const controller: XtermViewportQuery = {
    get viewport() {
      return viewport
        ? { width: viewport[0], height: viewport[1] }
        : undefined;
    },
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
      listeners.clear();
      disposed = true;
    },
    onViewport(listener): Dispose {
      if (disposed) {
        return () => {};
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };

  return controller;
}
