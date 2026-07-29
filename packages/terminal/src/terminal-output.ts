import { ANSI } from "./ansi.js";
import type { Dispose, TerminalStdout } from "./types.js";

export interface TerminalOutput {
  writeRaw(chunk: string): boolean;
  present(frame: string): boolean;
  onDrain(listener: () => void): Dispose;
  start(): void;
  stop(): void;
  dispose(): void;
}

export interface TerminalOutputOptions {
  stdout: TerminalStdout;
  synchronizedOutput: boolean;
}

export function createTerminalOutput(
  options: TerminalOutputOptions
): TerminalOutput {
  const listeners = new Set<() => void>();
  let started = false;
  let disposed = false;
  let drainAttached = false;

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

    start(): void {
      if (disposed) {
        return;
      }
      started = true;
      attachDrain();
    },

    stop(): void {
      started = false;
      detachDrain();
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      output.stop();
      listeners.clear();
      disposed = true;
    }
  };

  return output;
}
