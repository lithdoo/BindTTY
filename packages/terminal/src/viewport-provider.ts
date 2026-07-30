import type { XtermViewportQuery } from "./xterm-viewport-query.js";
import type {
  Dispose,
  TerminalResizeEvent,
  TerminalStdout,
  TerminalViewport
} from "./types.js";

export interface ViewportProvider {
  readonly viewport: TerminalViewport;
  readonly pollable: boolean;
  start(): void;
  stop(): void;
  dispose(): void;
  onChange(
    listener: (source: TerminalResizeEvent["source"]) => void
  ): Dispose;
}

export interface CompositeViewportProviderOptions {
  stdout: TerminalStdout;
  fallbackViewport?: TerminalViewport;
  query?: XtermViewportQuery;
}

const defaultViewport: TerminalViewport = { width: 80, height: 24 };

/**
 * Combines Node's TTY dimensions with an optional terminal query. Once a query
 * has produced a valid viewport it is authoritative; stdout remains the
 * fallback before that first response and the activity source for host events.
 */
export function createCompositeViewportProvider(
  options: CompositeViewportProviderOptions
): ViewportProvider {
  const listeners =
    new Set<(source: TerminalResizeEvent["source"]) => void>();
  let started = false;
  let disposed = false;
  let stopQueryListener: Dispose = () => {};
  let nodeViewport = readStdoutViewport(options);

  function emit(source: TerminalResizeEvent["source"]): void {
    for (const listener of [...listeners]) {
      listener(source);
    }
  }

  const handleStdoutResize = (): void => emit("event");
  const provider: ViewportProvider = {
    get viewport() {
      nodeViewport = readStdoutViewport(options, nodeViewport);
      return options.query?.viewport ?? { ...nodeViewport };
    },
    get pollable() {
      return (
        options.stdout.isTTY === true &&
        ((typeof options.stdout.columns === "number" &&
          typeof options.stdout.rows === "number") ||
          typeof options.stdout.getWindowSize === "function" ||
          options.query !== undefined)
      );
    },
    start(): void {
      if (started || disposed) {
        return;
      }
      started = true;
      options.stdout.on?.("resize", handleStdoutResize);
      if (options.query) {
        stopQueryListener = options.query.onViewport(() => emit("query"));
        options.query.start();
      }
    },
    stop(): void {
      if (!started) {
        return;
      }
      options.query?.stop();
      stopQueryListener();
      stopQueryListener = () => {};
      options.stdout.off?.("resize", handleStdoutResize);
      started = false;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      provider.stop();
      options.query?.dispose();
      listeners.clear();
      disposed = true;
    },
    onChange(listener): Dispose {
      if (disposed) {
        return () => {};
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  return provider;
}

function readStdoutViewport(
  options: CompositeViewportProviderOptions,
  runtimeFallback?: TerminalViewport
): TerminalViewport {
  const windowSize = readWindowSize(options.stdout);
  return {
    width: readDimension(
      windowSize?.[0],
      options.stdout.columns,
      runtimeFallback?.width,
      options.fallbackViewport?.width,
      defaultViewport.width
    ),
    height: readDimension(
      windowSize?.[1],
      options.stdout.rows,
      runtimeFallback?.height,
      options.fallbackViewport?.height,
      defaultViewport.height
    )
  };
}

function readWindowSize(
  stdout: TerminalStdout
): [number, number] | undefined {
  if (typeof stdout.getWindowSize !== "function") {
    return undefined;
  }
  try {
    const size = stdout.getWindowSize();
    return Array.isArray(size) && size.length >= 2
      ? [size[0], size[1]]
      : undefined;
  } catch {
    return undefined;
  }
}

function readDimension(...values: Array<number | undefined>): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.max(1, Math.floor(value));
    }
  }
  return 1;
}
