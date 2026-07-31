import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface DiagnosticLogFields {
  [key: string]: unknown;
}

export interface DiagnosticLogOptions {
  /**
   * Explicit log path. `false` disables logging; when omitted,
   * BINDTTY_DIAGNOSTIC_LOG_FILE is used.
   */
  path?: string | false;
  /** Correlates records written by different layers in one process. */
  runId?: string;
  /** Batches synchronous filesystem writes without delaying process exit. */
  flushIntervalMs?: number;
}

export interface DiagnosticLogger {
  readonly enabled: boolean;
  log(event: string, fields?: DiagnosticLogFields): void;
  error(event: string, error: unknown, fields?: DiagnosticLogFields): void;
  flush(): void;
  dispose(): void;
}

let nextSequence = 1;
const processStartedAt = process.hrtime.bigint();

/**
 * Creates an opt-in JSONL diagnostic writer. Records are buffered briefly so
 * resize/render bursts do not perform one filesystem write per event.
 */
export function createDiagnosticLogger(
  component: string,
  options: DiagnosticLogOptions = {}
): DiagnosticLogger {
  const configuredPath = options.path === undefined
    ? process.env.BINDTTY_DIAGNOSTIC_LOG_FILE
    : options.path;
  const path = typeof configuredPath === "string" && configuredPath !== ""
    ? resolve(configuredPath)
    : null;
  const runId =
    options.runId ??
    process.env.BINDTTY_DIAGNOSTIC_RUN_ID ??
    `pid-${process.pid}`;
  const flushIntervalMs = Math.max(0, options.flushIntervalMs ?? 25);
  let queue: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let directoryReady = false;
  let disposed = false;
  let failed = false;

  function flush(): void {
    if (!path || failed || queue.length === 0) {
      return;
    }
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    const pending = queue.join("");
    queue = [];
    try {
      if (!directoryReady) {
        mkdirSync(dirname(path), { recursive: true });
        directoryReady = true;
      }
      appendFileSync(path, pending, "utf8");
    } catch {
      // Diagnostics must never take down or corrupt the terminal application.
      failed = true;
      queue = [];
    }
  }

  function scheduleFlush(): void {
    if (timer !== undefined || flushIntervalMs === 0) {
      if (flushIntervalMs === 0) {
        flush();
      }
      return;
    }
    timer = setTimeout(flush, flushIntervalMs);
    timer.unref?.();
  }

  function log(event: string, fields: DiagnosticLogFields = {}): void {
    if (!path || disposed || failed) {
      return;
    }
    const elapsedNs = process.hrtime.bigint() - processStartedAt;
    const record = {
      time: new Date().toISOString(),
      elapsedMs: Number(elapsedNs / 1_000_000n),
      sequence: nextSequence++,
      pid: process.pid,
      runId,
      component,
      event,
      ...fields
    };
    try {
      queue.push(`${JSON.stringify(record)}\n`);
      scheduleFlush();
    } catch {
      // Ignore non-serializable diagnostic fields.
    }
  }

  function onProcessExit(): void {
    flush();
  }

  if (path) {
    process.on("exit", onProcessExit);
  }

  return {
    enabled: path !== null,
    log,
    error(event, error, fields = {}) {
      log(event, {
        ...fields,
        error: serializeError(error)
      });
    },
    flush,
    dispose() {
      if (disposed) {
        return;
      }
      flush();
      disposed = true;
      process.off("exit", onProcessExit);
    }
  };
}

export function serializeError(error: unknown): DiagnosticLogFields {
  if (error instanceof AggregateError) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      errors: error.errors.map(serializeError)
    };
  }
  if (error instanceof Error) {
    const systemError = error as NodeJS.ErrnoException;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(systemError.code === undefined ? {} : { code: systemError.code }),
      ...(systemError.syscall === undefined
        ? {}
        : { syscall: systemError.syscall })
    };
  }
  return {
    name: "NonError",
    message: String(error)
  };
}
