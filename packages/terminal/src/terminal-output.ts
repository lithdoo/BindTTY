import { ANSI } from "./ansi.js";
import type {
  Dispose,
  TerminalOutputErrorListener,
  TerminalStdout
} from "./types.js";

export interface TerminalOutput {
  writeRaw(chunk: string): boolean;
  present(frame: string): boolean;
  onDrain(listener: () => void): Dispose;
  onOutputError(listener: TerminalOutputErrorListener): Dispose;
  start(): void;
  stop(): void;
  dispose(): void;
}

export interface TerminalOutputOptions {
  stdout: TerminalStdout;
  synchronizedOutput: boolean;
  recoverWindowsWriteEpipe?: boolean;
}

export function createTerminalOutput(
  options: TerminalOutputOptions
): TerminalOutput {
  const listeners = new Set<() => void>();
  const outputErrorListeners = new Set<TerminalOutputErrorListener>();
  let started = false;
  let disposed = false;
  let drainAttached = false;
  let errorAttached = false;

  function handleDrain(): void {
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function attachDrain(): void {
    if (drainAttached || !started || listeners.size === 0) {
      return;
    }
    const on = options.stdout.on as
      | ((event: "drain", listener: () => void) => unknown)
      | undefined;
    if (!on) {
      return;
    }
    on.call(options.stdout, "drain", handleDrain);
    drainAttached = true;
  }

  function detachDrain(): void {
    if (!drainAttached) {
      return;
    }
    const off = options.stdout.off as
      | ((event: "drain", listener: () => void) => unknown)
      | undefined;
    off?.call(options.stdout, "drain", handleDrain);
    drainAttached = false;
  }

  function handleOutputError(error: unknown): void {
    if (
      !options.recoverWindowsWriteEpipe ||
      !isTransientWindowsWriteEpipe(error)
    ) {
      throw error;
    }
    for (const listener of [...outputErrorListeners]) {
      listener(error);
    }
  }

  function attachError(): void {
    if (
      errorAttached ||
      !started ||
      !options.recoverWindowsWriteEpipe
    ) {
      return;
    }
    const on = options.stdout.on as
      | ((event: "error", listener: (error: unknown) => void) => unknown)
      | undefined;
    if (!on) {
      return;
    }
    on.call(options.stdout, "error", handleOutputError);
    errorAttached = true;
  }

  function detachError(): void {
    if (!errorAttached) {
      return;
    }
    const off = options.stdout.off as
      | ((event: "error", listener: (error: unknown) => void) => unknown)
      | undefined;
    off?.call(options.stdout, "error", handleOutputError);
    errorAttached = false;
  }

  const output: TerminalOutput = {
    writeRaw(chunk): boolean {
      if (disposed || chunk === "") {
        return true;
      }
      return options.stdout.write(chunk) !== false;
    },

    present(frame): boolean {
      if (disposed || frame === "") {
        return true;
      }
      return output.writeRaw(
        options.synchronizedOutput
          ? ANSI.beginSynchronizedOutput +
              frame +
              ANSI.endSynchronizedOutput
          : frame
      );
    },

    onDrain(listener): Dispose {
      if (disposed) {
        return () => {};
      }
      listeners.add(listener);
      attachDrain();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          detachDrain();
        }
      };
    },

    onOutputError(listener): Dispose {
      if (disposed) {
        return () => {};
      }
      outputErrorListeners.add(listener);
      return () => {
        outputErrorListeners.delete(listener);
      };
    },

    start(): void {
      if (disposed) {
        return;
      }
      started = true;
      attachDrain();
      attachError();
    },

    stop(): void {
      started = false;
      detachDrain();
      detachError();
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      output.stop();
      listeners.clear();
      outputErrorListeners.clear();
      disposed = true;
    }
  };

  return output;
}

function isTransientWindowsWriteEpipe(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as NodeJS.ErrnoException;
  return (
    candidate.code === "EPIPE" &&
    (candidate.syscall === "write" ||
      String(candidate.message).includes("write EPIPE"))
  );
}
