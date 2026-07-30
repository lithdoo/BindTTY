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
  let settleCandidate:
    | { viewport: TerminalViewport; source: TerminalResizeEvent["source"] }
    | undefined;
  let published = readViewport(options);

  function publish(
    viewport: TerminalViewport,
    source: TerminalResizeEvent["source"],
    force = false
  ): void {
    if (!force && equalViewport(published, viewport)) {
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

  function scheduleSettle(frameDelay: number): void {
    clearSettle();
    settleTimer = clock.setTimeout(() => {
      settleTimer = undefined;
      clearFrame();
      const settled = settleCandidate;
      settleCandidate = undefined;
      pending = undefined;
      if (settled) {
        // Hosts such as VS Code/ConPTY can reflow after the last size event was
        // painted. Force one same-size viewport frame after the burst becomes
        // stable so the app can clear and rebuild the final screen.
        publish(settled.viewport, settled.source, true);
      }
    }, options.settleDelayMs > 0 ? options.settleDelayMs : frameDelay);
  }

  function sample(source: TerminalResizeEvent["source"]): void {
    const viewport = readViewport(options, published);
    if (equalViewport(published, viewport)) {
      if (pending) {
        pending = undefined;
        clearFrame();
        settleCandidate = { viewport: { ...viewport }, source };
        scheduleSettle(options.settleDelayMs);
      }
      return;
    }
    if (pending && equalViewport(pending.viewport, viewport)) {
      pending.source = source;
      settleCandidate = { viewport: { ...viewport }, source };
      const elapsed =
        lastPublishedAt === undefined
          ? Number.POSITIVE_INFINITY
          : clock.now() - lastPublishedAt;
      scheduleSettle(Math.max(0, options.minFrameIntervalMs - elapsed));
      return;
    }
    const elapsed =
      lastPublishedAt === undefined
        ? Number.POSITIVE_INFINITY
        : clock.now() - lastPublishedAt;
    if (options.minFrameIntervalMs === 0 || elapsed >= options.minFrameIntervalMs) {
      pending = undefined;
      clearFrame();
      publish(viewport, source);
      settleCandidate = { viewport: { ...viewport }, source };
      scheduleSettle(options.settleDelayMs);
      return;
    }
    pending = { viewport, source };
    settleCandidate = { viewport: { ...viewport }, source };
    const frameDelay = Math.max(0, options.minFrameIntervalMs - elapsed);
    if (frameTimer === undefined) {
      frameTimer = clock.setTimeout(() => {
        frameTimer = undefined;
        publishPending();
      }, frameDelay);
    }
    scheduleSettle(frameDelay);
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
        ((typeof options.stdout.columns === "number" &&
          typeof options.stdout.rows === "number") ||
          typeof options.stdout.getWindowSize === "function")
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
      settleCandidate = undefined;
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

function readWindowSize(stdout: TerminalStdout): [number, number] | undefined {
  if (typeof stdout.getWindowSize !== "function") {
    return undefined;
  }
  try {
    const size = stdout.getWindowSize();
    if (Array.isArray(size) && size.length >= 2) {
      return [size[0], size[1]];
    }
  } catch {
    // Fall through to cached columns/rows and configured fallbacks.
  }
  return undefined;
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
