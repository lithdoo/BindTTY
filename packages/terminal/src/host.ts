import { ANSI } from "./ansi.js";
import { normalizeKeypressEvent } from "./input.js";
import type {
  CreateNodeTerminalOptions,
  Dispose,
  KeypressListener,
  ResizeListener,
  TerminalHost,
  TerminalKeyListener,
  TerminalViewport
} from "./types.js";

const defaultViewport: TerminalViewport = {
  width: 80,
  height: 24
};

export function createNodeTerminal(
  options: CreateNodeTerminalOptions
): TerminalHost {
  let started = false;
  let disposed = false;
  const resizeListeners = new Set<ResizeListener>();
  const keyListeners = new Set<TerminalKeyListener>();

  function handleResize(): void {
    for (const listener of [...resizeListeners]) {
      listener();
    }
  }

  const handleKeypress: KeypressListener = (input, key) => {
    const event = normalizeKeypressEvent(input, key);

    if (event.ctrl && event.name === "c" && options.exitOnCtrlC !== false) {
      terminal.dispose();
      return;
    }

    for (const listener of [...keyListeners]) {
      listener(event);
    }
  };

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

      if (options.rawMode === true && options.stdin?.setRawMode) {
        options.stdin.setRawMode(true);
        options.stdin.resume?.();
      }

      options.stdout.on?.("resize", handleResize);
      options.stdin?.on?.("keypress", handleKeypress);
    },

    stop(): void {
      if (!started) {
        return;
      }

      options.stdout.off?.("resize", handleResize);
      options.stdin?.off?.("keypress", handleKeypress);

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
