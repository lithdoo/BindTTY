export type FrameIntentKind = "paint" | "layout" | "structure" | "viewport";
export type FrameCoordinatorState =
  | "idle"
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
}

export interface FrameResult {
  patch: string;
  blocked: boolean;
}

export interface FrameCoordinator {
  readonly state: FrameCoordinatorState;
  request(intent: FrameIntent): string;
  writable(): string;
  cancelPending(): void;
  dispose(): void;
}

const intentRank: Record<FrameIntentKind, number> = {
  paint: 1,
  layout: 2,
  structure: 3,
  viewport: 4
};

export function createFrameCoordinator(
  render: (intent: FrameIntent) => FrameResult
): FrameCoordinator {
  let state: FrameCoordinatorState = "idle";
  let pendingKind: FrameIntentKind | null = null;
  let pendingViewport: FrameViewport | undefined;

  function merge(intent: FrameIntent): void {
    if (!pendingKind || intentRank[intent.kind] > intentRank[pendingKind]) {
      pendingKind = intent.kind;
    }
    if (intent.viewport) {
      pendingViewport = { ...intent.viewport };
      pendingKind = "viewport";
    }
  }

  function flush(): string {
    if (state !== "idle") {
      return "";
    }

    state = "rendering";
    let lastPatch = "";
    try {
      while (pendingKind) {
        const intent: FrameIntent = {
          kind: pendingKind,
          ...(pendingViewport ? { viewport: pendingViewport } : {})
        };
        pendingKind = null;
        pendingViewport = undefined;

        try {
          const result = render(intent);
          lastPatch = result.patch;
          if (result.blocked) {
            state = "blocked";
            return lastPatch;
          }
        } catch (error) {
          merge(intent);
          state = "idle";
          throw error;
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
    request(intent) {
      if (state === "disposed") {
        return "";
      }
      merge(intent);
      return flush();
    },
    writable() {
      if (state !== "blocked") {
        return "";
      }
      state = "idle";
      return flush();
    },
    cancelPending() {
      pendingKind = null;
      pendingViewport = undefined;
      if (state === "blocked") {
        state = "idle";
      }
    },
    dispose() {
      pendingKind = null;
      pendingViewport = undefined;
      state = "disposed";
    }
  };
}
