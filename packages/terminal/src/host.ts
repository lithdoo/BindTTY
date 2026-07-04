import type { Readable } from "node:stream";

import { resolvePlatformAdapter } from "./adapters/resolve.js";
import { ANSI } from "./ansi.js";
import type {
  CreateNodeTerminalOptions,
  Dispose,
  ResizeListener,
  TerminalHost,
  TerminalKeyEvent,
  TerminalKeyListener,
  TerminalViewport
} from "./types.js";

const defaultViewport: TerminalViewport = {
  width: 80,
  height: 24
};

const win32ResizePollIntervalMs = 50;

function readResizePollIntervalMs(
  options: CreateNodeTerminalOptions
): number {
  if (options.resizePollIntervalMs !== undefined) {
    return options.resizePollIntervalMs;
  }

  return process.platform === "win32" ? win32ResizePollIntervalMs : 0;
}

function shouldPollStdoutResize(
  stdout: CreateNodeTerminalOptions["stdout"],
  intervalMs: number
): boolean {
  return (
    intervalMs > 0 &&
    stdout.isTTY === true &&
    typeof stdout.columns === "number" &&
    typeof stdout.rows === "number"
  );
}

function viewportsEqual(
  left: TerminalViewport,
  right: TerminalViewport
): boolean {
  return left.width === right.width && left.height === right.height;
}

export function createNodeTerminal(
  options: CreateNodeTerminalOptions
): TerminalHost {
  let started = false;
  let disposed = false;
  const resizeListeners = new Set<ResizeListener>();
  const keyListeners = new Set<TerminalKeyListener>();
  const platform = resolvePlatformAdapter(options);
  let detachStdin: Dispose = () => {};
  let resizePollTimer: ReturnType<typeof setInterval> | undefined;
  let lastPolledViewport: TerminalViewport | null = null;

  function readViewport(): TerminalViewport {
    return {
      width:
        options.stdout.columns ??
        options.fallbackViewport?.width ??
        defaultViewport.width,
      height:
        options.stdout.rows ??
        options.fallbackViewport?.height ??
        defaultViewport.height
    };
  }

  function handleResize(): void {
    lastPolledViewport = readViewport();

    for (const listener of [...resizeListeners]) {
      listener();
    }
  }

  function pollViewportIfChanged(): void {
    const nextViewport = readViewport();

    if (
      lastPolledViewport !== null &&
      viewportsEqual(lastPolledViewport, nextViewport)
    ) {
      return;
    }

    handleResize();
  }

  function startWin32ResizePolling(): void {
    const intervalMs = readResizePollIntervalMs(options);

    if (!shouldPollStdoutResize(options.stdout, intervalMs)) {
      return;
    }

    lastPolledViewport = readViewport();
    resizePollTimer = setInterval(pollViewportIfChanged, intervalMs);
    resizePollTimer.unref?.();
  }

  function stopWin32ResizePolling(): void {
    if (resizePollTimer) {
      clearInterval(resizePollTimer);
      resizePollTimer = undefined;
    }

    lastPolledViewport = null;
  }

  function dispatchKey(event: TerminalKeyEvent): void {
    if (event.ctrl && event.name === "c" && options.exitOnCtrlC !== false) {
      terminal.dispose();
      return;
    }

    for (const listener of [...keyListeners]) {
      listener(event);
    }
  }

  function write(chunk: string): void {
    if (disposed || chunk === "") {
      return;
    }

    options.stdout.write(chunk);
  }

  const terminal: TerminalHost = {
    get viewport(): TerminalViewport {
      return readViewport();
    },

    start(): void {
      if (started || disposed) {
        return;
      }

      started = true;

      if (options.useAltScreen === true) {
        write(ANSI.enterAltScreen);
      }

      if (options.hideCursor === true) {
        write(ANSI.hideCursor);
      }

      if (options.stdin) {
        const stdin = options.stdin as Readable;
        const stdinInput = platform.createStdinInput(options);

        if (options.rawMode === true && options.stdin.setRawMode) {
          if (options.stdin.isTTY) {
            stdinInput.prepare(stdin);
          }

          options.stdin.setRawMode(true);
          options.stdin.resume?.();
        } else if (options.stdin.isTTY) {
          stdinInput.prepare(stdin);
        }

        detachStdin = stdinInput.attach(stdin, dispatchKey);
      }

      options.stdout.on?.("resize", handleResize);
      startWin32ResizePolling();
    },

    stop(): void {
      if (!started) {
        return;
      }

      stopWin32ResizePolling();
      options.stdout.off?.("resize", handleResize);
      detachStdin();
      detachStdin = () => {};

      if (options.rawMode === true && options.stdin?.setRawMode) {
        options.stdin.setRawMode(false);
      }

      if (options.hideCursor === true) {
        write(ANSI.showCursor);
      }

      if (options.useAltScreen === true) {
        write(ANSI.exitAltScreen);
      }

      started = false;
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      terminal.stop();
      resizeListeners.clear();
      keyListeners.clear();
      disposed = true;
    },

    write,

    onResize(listener: ResizeListener): Dispose {
      if (disposed) {
        return () => {};
      }

      resizeListeners.add(listener);
      return () => {
        resizeListeners.delete(listener);
      };
    },

    onKey(listener: TerminalKeyListener): Dispose {
      if (disposed) {
        return () => {};
      }

      keyListeners.add(listener);
      return () => {
        keyListeners.delete(listener);
      };
    }
  };

  return terminal;
}
