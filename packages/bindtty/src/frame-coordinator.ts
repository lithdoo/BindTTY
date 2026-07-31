export type FrameIntentKind = "paint" | "layout" | "structure" | "viewport";
export type FrameCoordinatorState =
  | "idle"
  | "scheduled"
  | "rendering"
  | "blocked"
  | "disposed";

export interface FrameViewport {
  width: number;
  height: number;
}

export interface FrameIntent {
  kind: FrameIntentKind;
  viewport?: FrameViewport;
  revision?: number;
  reasons?: readonly FrameReason[];
}

export type FrameReason =
  | "manual"
  | "input"
  | "runtime"
  | "viewport"
  | "output-recovery"
  | "drain";

export interface FrameResult {
  patch: string;
  blocked: boolean;
}

export interface FrameCoordinator {
  readonly state: FrameCoordinatorState;
  readonly revision: number;
  request(intent: FrameIntent, paced?: boolean): string;
  writable(): string;
  cancelPending(): void;
  dispose(): void;
}

export interface FrameClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface FrameCoordinatorOptions {
  frameIntervalMs?: number;
  maxSynchronousPasses?: number;
  clock?: FrameClock;
  onError?(error: unknown): void;
}

const intentRank: Record<FrameIntentKind, number> = {
  paint: 1,
  layout: 2,
  structure: 3,
  viewport: 4
};

export function createFrameCoordinator(
  render: (intent: FrameIntent) => FrameResult,
  options: FrameCoordinatorOptions = {}
): FrameCoordinator {
  const clock = options.clock ?? defaultFrameClock;
  const frameIntervalMs = normalizeDuration(options.frameIntervalMs);
  const maxSynchronousPasses = normalizePasses(
    options.maxSynchronousPasses
  );
  let state: FrameCoordinatorState = "idle";
  let pendingKind: FrameIntentKind | null = null;
  let pendingViewport: FrameViewport | undefined;
  let pendingRevision = 0;
  let pendingReasons = new Set<FrameReason>();
  let pendingPaced = true;
  let revision = 0;
  let lastPacedFrameAt: number | null = null;
  let frameTimer: unknown;

  function merge(
    intent: FrameIntent,
    paced: boolean,
    advanceRevision = true
  ): void {
    if (!pendingKind || intentRank[intent.kind] > intentRank[pendingKind]) {
      pendingKind = intent.kind;
    }
    if (intent.viewport) {
      pendingViewport = { ...intent.viewport };
      pendingKind = "viewport";
    }
    revision = Math.max(
      advanceRevision ? revision + 1 : revision,
      intent.revision ?? 0
    );
    pendingRevision = Math.max(pendingRevision, revision);
    for (const reason of intent.reasons ?? []) {
      pendingReasons.add(reason);
    }
    if (!paced) {
      pendingPaced = false;
    }
  }

  function clearFrameTimer(): void {
    if (frameTimer === undefined) {
      return;
    }
    clock.clearTimeout(frameTimer);
    frameTimer = undefined;
  }

  function schedule(delayMs: number): void {
    if (frameTimer !== undefined || state === "disposed") {
      return;
    }
    state = "scheduled";
    frameTimer = clock.setTimeout(() => {
      frameTimer = undefined;
      if (state === "scheduled") {
        state = "idle";
      }
      try {
        flush();
      } catch (error) {
        if (options.onError) {
          options.onError(error);
        } else {
          throw error;
        }
      }
    }, delayMs);
  }

  function remainingFrameDelay(): number {
    if (
      frameIntervalMs === 0 ||
      lastPacedFrameAt === null ||
      !pendingPaced
    ) {
      return 0;
    }
    return Math.max(0, lastPacedFrameAt + frameIntervalMs - clock.now());
  }

  function flushOrSchedule(): string {
    const delay = remainingFrameDelay();
    if (delay > 0) {
      schedule(delay);
      return "";
    }
    return flush();
  }

  function flush(): string {
    if (state !== "idle") {
      return "";
    }

    state = "rendering";
    clearFrameTimer();
    let lastPatch = "";
    let passes = 0;
    try {
      while (pendingKind) {
        passes += 1;
        const intent: FrameIntent = {
          kind: pendingKind,
          ...(pendingViewport ? { viewport: pendingViewport } : {}),
          revision: pendingRevision,
          reasons: [...pendingReasons]
        };
        const paced = pendingPaced;
        pendingKind = null;
        pendingViewport = undefined;
        pendingRevision = 0;
        pendingReasons = new Set();
        pendingPaced = true;

        try {
          const result = render(intent);
          lastPatch = result.patch;
          if (paced) {
            lastPacedFrameAt = clock.now();
          }
          if (result.blocked) {
            state = "blocked";
            return lastPatch;
          }
        } catch (error) {
          merge(intent, paced, false);
          state = "idle";
          throw error;
        }
        if (pendingKind && remainingFrameDelay() > 0) {
          state = "idle";
          schedule(remainingFrameDelay());
          return lastPatch;
        }
        if (pendingKind && passes >= maxSynchronousPasses) {
          state = "idle";
          schedule(frameIntervalMs);
          return lastPatch;
        }
      }
      state = "idle";
      return lastPatch;
    } finally {
      if (state === "rendering") {
        state = "idle";
      }
    }
  }

  return {
    get state() {
      return state;
    },
    get revision() {
      return revision;
    },
    request(intent, paced = false) {
      if (state === "disposed") {
        return "";
      }
      merge(intent, paced);
      if (state === "rendering" || state === "blocked") {
        return "";
      }
      if (state === "scheduled" && !pendingPaced) {
        clearFrameTimer();
        state = "idle";
      } else if (state === "scheduled") {
        return "";
      }
      return flushOrSchedule();
    },
    writable() {
      if (state !== "blocked") {
        return "";
      }
      state = "idle";
      pendingReasons.add("drain");
      pendingPaced = false;
      return flush();
    },
    cancelPending() {
      clearFrameTimer();
      pendingKind = null;
      pendingViewport = undefined;
      pendingRevision = 0;
      pendingReasons.clear();
      pendingPaced = true;
      if (state === "blocked") {
        state = "idle";
      } else if (state === "scheduled") {
        state = "idle";
      }
    },
    dispose() {
      clearFrameTimer();
      pendingKind = null;
      pendingViewport = undefined;
      pendingRevision = 0;
      pendingReasons.clear();
      state = "disposed";
    }
  };
}

const defaultFrameClock: FrameClock = {
  now() {
    return Date.now();
  },
  setTimeout(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    handle.unref?.();
    return handle;
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
};

function normalizeDuration(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function normalizePasses(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 2;
  }
  return Math.max(1, Math.floor(value));
}
