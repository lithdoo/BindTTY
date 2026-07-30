import { ANSI } from "./ansi.js";
import type { ResizeClock } from "./resize-coordinator.js";
import type { TerminalStdout } from "./types.js";

export interface XtermViewportQuery {
  readonly stdout: TerminalStdout;
  start(): void;
  stop(): void;
  dispose(): void;
  filterRawInput(chunk: Buffer | string): string;
}

export interface XtermViewportQueryOptions {
  stdout: TerminalStdout;
  writeRaw(chunk: string): boolean | void;
  clock?: Pick<ResizeClock, "setInterval" | "clearInterval">;
  intervalMs?: number;
}

const reportPrefix = "\x1b[8;";
const completeReport = /^\x1b\[8;(\d+);(\d+)t/;
const partialReport = /^\x1b(?:\[8(?:;\d*(?:;\d*)?)?)?$/;
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
  let pending = "";
  let timer: unknown;
  let started = false;
  let disposed = false;
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
      pending = "";
      started = false;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      controller.stop();
      disposed = true;
    },
    filterRawInput(chunk): string {
      const text = pending +
        (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
      pending = "";
      let output = "";
      let offset = 0;

      while (offset < text.length) {
        const escape = text.indexOf("\x1b", offset);
        if (escape < 0) {
          output += text.slice(offset);
          break;
        }
        output += text.slice(offset, escape);
        const candidate = text.slice(escape);
        const report = completeReport.exec(candidate);
        if (report) {
          const rows = Number(report[1]);
          const columns = Number(report[2]);
          if (columns > 0 && rows > 0) {
            viewport = [columns, rows];
          }
          offset = escape + report[0].length;
          continue;
        }
        if (
          reportPrefix.startsWith(candidate) ||
          partialReport.test(candidate)
        ) {
          pending = candidate;
          break;
        }
        output += "\x1b";
        offset = escape + 1;
      }
      return output;
    }
  };

  return controller;
}
