import type {
  Dispose,
  ResizeListener,
  TerminalResizeEvent,
  TerminalStdout,
  TerminalViewport
} from "./types.js";
import {
  createCompositeViewportProvider,
  type ViewportProvider
} from "./viewport-provider.js";

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
  viewportProvider?: ViewportProvider;
}

export interface ResizeCoordinator {
  readonly viewport: TerminalViewport;
  start(): void;
  stop(): void;
  dispose(): void;
  onResize(listener: ResizeListener): Dispose;
}

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
  const viewportProvider =
    options.viewportProvider ??
    createCompositeViewportProvider({
      stdout: options.stdout,
      fallbackViewport: options.fallbackViewport
    });
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
  let published = viewportProvider.viewport;

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
    const viewport = viewportProvider.viewport;
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

  let stopViewportListener: Dispose = () => {};
  const coordinator: ResizeCoordinator = {
    get viewport() {
      return started ? { ...published } : viewportProvider.viewport;
    },
    start(): void {
      if (started || disposed) {
        return;
      }
      published = viewportProvider.viewport;
      started = true;
      stopViewportListener = viewportProvider.onChange(sample);
      viewportProvider.start();
      if (
        options.pollIntervalMs > 0 &&
        viewportProvider.pollable
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
      viewportProvider.stop();
      stopViewportListener();
      stopViewportListener = () => {};
      started = false;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      coordinator.stop();
      viewportProvider.dispose();
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

function equalViewport(
  left: TerminalViewport,
  right: TerminalViewport
): boolean {
  return left.width === right.width && left.height === right.height;
}
