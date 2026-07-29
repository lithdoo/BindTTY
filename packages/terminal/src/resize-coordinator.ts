import type {
  Dispose,
  ResizeListener,
  TerminalResizeEvent,
  TerminalStdout,
  TerminalViewport
} from "./types.js";

export interface ResizeClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface ResizeCoordinatorOptions {
  stdout: TerminalStdout;
  fallbackViewport?: TerminalViewport;
  pollIntervalMs: number;
  minFrameIntervalMs: number;
  settleDelayMs: number;
  clock?: ResizeClock;
}

export interface ResizeCoordinator {
  readonly viewport: TerminalViewport;
  start(): void;
  stop(): void;
  dispose(): void;
  onResize(listener: ResizeListener): Dispose;
}

const defaultViewport: TerminalViewport = { width: 80, height: 24 };
const systemClock: ResizeClock = {
  now: Date.now,
  setTimeout(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    handle.unref?.();
    return handle;
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
  setInterval(callback, intervalMs) {
    const handle = setInterval(callback, intervalMs);
    handle.unref?.();
    return handle;
  },
  clearInterval(handle) {
    clearInterval(handle as ReturnType<typeof setInterval>);
  }
};

export function createResizeCoordinator(
  options: ResizeCoordinatorOptions
): ResizeCoordinator {
  const clock = options.clock ?? systemClock;
  const listeners = new Set<ResizeListener>();
  let started = false;
  let disposed = false;
  let pollTimer: unknown;
  let frameTimer: unknown;
  let settleTimer: unknown;
  let lastPublishedAt: number | undefined;
  let pending:
    | { viewport: TerminalViewport; source: TerminalResizeEvent["source"] }
    | undefined;
  let published = readViewport(options);

  function publish(
    viewport: TerminalViewport,
    source: TerminalResizeEvent["source"]
  ): void {
    if (equalViewport(published, viewport)) {
      return;
    }
    const previousViewport = published;
    published = viewport;
    lastPublishedAt = clock.now();
    const event: TerminalResizeEvent = {
      viewport: { ...viewport },
      previousViewport: { ...previousViewport },
      source
    };
    for (const listener of [...listeners]) {
      listener(event);
    }
  }

  function clearFrame(): void {
    if (frameTimer !== undefined) {
      clock.clearTimeout(frameTimer);
      frameTimer = undefined;
    }
  }

  function clearSettle(): void {
    if (settleTimer !== undefined) {
      clock.clearTimeout(settleTimer);
      settleTimer = undefined;
    }
  }

  function publishPending(): void {
    const next = pending;
    pending = undefined;
    if (next) {
      publish(next.viewport, next.source);
    }
  }

  function sample(source: TerminalResizeEvent["source"]): void {
    const viewport = readViewport(options, published);
    if (equalViewport(published, viewport)) {
      pending = undefined;
      clearFrame();
      clearSettle();
      return;
    }
    if (pending && equalViewport(pending.viewport, viewport)) {
      pending.source = source;
      return;
    }
    const elapsed =
      lastPublishedAt === undefined
        ? Number.POSITIVE_INFINITY
        : clock.now() - lastPublishedAt;
    if (options.minFrameIntervalMs === 0 || elapsed >= options.minFrameIntervalMs) {
      pending = undefined;
      clearFrame();
      clearSettle();
      publish(viewport, source);
      return;
    }
    pending = { viewport, source };
    const frameDelay = Math.max(0, options.minFrameIntervalMs - elapsed);
    if (frameTimer === undefined) {
      frameTimer = clock.setTimeout(() => {
        frameTimer = undefined;
        publishPending();
      }, frameDelay);
    }
    clearSettle();
    settleTimer = clock.setTimeout(() => {
      settleTimer = undefined;
      clearFrame();
      publishPending();
    }, options.settleDelayMs > 0 ? options.settleDelayMs : frameDelay);
  }

  const handleResize = (): void => sample("event");
  const coordinator: ResizeCoordinator = {
    get viewport() {
      return started ? { ...published } : readViewport(options, published);
    },
    start(): void {
      if (started || disposed) {
        return;
      }
      published = readViewport(options, published);
      started = true;
      options.stdout.on?.("resize", handleResize);
      if (
        options.pollIntervalMs > 0 &&
        options.stdout.isTTY === true &&
        typeof options.stdout.columns === "number" &&
        typeof options.stdout.rows === "number"
      ) {
        pollTimer = clock.setInterval(
          () => sample("poll"),
          options.pollIntervalMs
        );
      }
    },
    stop(): void {
      if (!started) {
        return;
      }
      if (pollTimer !== undefined) {
        clock.clearInterval(pollTimer);
        pollTimer = undefined;
      }
      clearFrame();
      clearSettle();
      pending = undefined;
      lastPublishedAt = undefined;
      options.stdout.off?.("resize", handleResize);
      started = false;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      coordinator.stop();
      listeners.clear();
      disposed = true;
    },
    onResize(listener): Dispose {
      if (disposed) {
        return () => {};
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  return coordinator;
}

function readViewport(
  options: ResizeCoordinatorOptions,
  runtimeFallback?: TerminalViewport
): TerminalViewport {
  return {
    width: readDimension(
      options.stdout.columns,
      runtimeFallback?.width,
      options.fallbackViewport?.width,
      defaultViewport.width
    ),
    height: readDimension(
      options.stdout.rows,
      runtimeFallback?.height,
      options.fallbackViewport?.height,
      defaultViewport.height
    )
  };
}

function readDimension(...values: Array<number | undefined>): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.max(1, Math.floor(value));
    }
  }
  return 1;
}

function equalViewport(
  left: TerminalViewport,
  right: TerminalViewport
): boolean {
  return left.width === right.width && left.height === right.height;
}
