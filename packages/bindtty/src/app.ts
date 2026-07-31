import {
  createInteractionController,
  type InteractionResult
} from "@bindtty/interaction";
import { layoutRoot } from "@bindtty/layout";
import type { LayoutEngine, LayoutNode } from "@bindtty/layout";
import { createTerminalRenderer } from "@bindtty/renderer-terminal";
import { createRuntimeRoot, notifyElementLayout } from "@bindtty/runtime";
import type {
  Dispose,
  RuntimeFlushRecord,
  RuntimeLifecycleErrorHandler,
  RuntimeRoot
} from "@bindtty/runtime";
import {
  ANSI,
  createDiagnosticLogger,
  type TerminalHost,
  type TerminalKeyEvent,
  type TerminalResizeEvent
} from "@bindtty/terminal";
import type { MountedElementNode, ViewTemplate } from "@bindtty/vnode";
import {
  createFrameCoordinator,
  type FrameClock,
  type FrameCoordinatorState,
  type FrameIntent,
  type FrameIntentKind,
  type FrameReason
} from "./frame-coordinator.js";
import {
  createStdoutFrameSink,
  createTerminalFrameSink,
  type FrameSink
} from "./frame-sink.js";

export interface AppStdout {
  columns?: number;
  rows?: number;
  write(chunk: string): unknown;
  on?(event: "resize" | "drain", listener: () => void): unknown;
  off?(event: "resize" | "drain", listener: () => void): unknown;
}

export interface AppStdin {}

export interface AppViewport {
  width: number;
  height: number;
}

export type AppErrorPhase = "resize" | "runtime-flush" | "drain";

export interface AppError {
  phase: AppErrorPhase;
  error: unknown;
  viewport: AppViewport;
  intent: FrameIntent;
  revision: number;
  schedulerState: FrameCoordinatorState;
  recoverable: boolean;
}

export type AppErrorHandler = (error: AppError) => void;

export interface CreateAppBaseOptions {
  autoStart?: boolean;
  onLifecycleError?: RuntimeLifecycleErrorHandler;
  onError?: AppErrorHandler;
  clearOnResize?: boolean;
  /**
   * Runs immediately before the initial or resized viewport is laid out.
   * Applications can update viewport-derived state here without registering
   * a second, order-dependent terminal resize listener.
   */
  onViewportChange?(viewport: AppViewport): void;
  layoutEngine?: LayoutEngine;
  /**
   * Minimum interval between asynchronous runtime/viewport frames. The first
   * update in a burst is immediate and the latest trailing update is retained.
   * Defaults to 16ms for TerminalHost mode and 0 for plain stdout mode.
   */
  frameIntervalMs?: number;
  /**
   * Maximum number of reentrant frame passes completed synchronously before
   * remaining work is deferred. Defaults to 2.
   */
  maxStabilizationPasses?: number;
  /** Injectable frame clock for deterministic scheduling tests. */
  frameClock?: FrameClock;
}

export interface CreateAppStdoutOptions {
  stdout: AppStdout;
  stdin?: AppStdin;
  fallbackViewport?: AppViewport;
  autoStart?: CreateAppBaseOptions["autoStart"];
  onLifecycleError?: CreateAppBaseOptions["onLifecycleError"];
  onError?: CreateAppBaseOptions["onError"];
  clearOnResize?: CreateAppBaseOptions["clearOnResize"];
  onViewportChange?: CreateAppBaseOptions["onViewportChange"];
  layoutEngine?: CreateAppBaseOptions["layoutEngine"];
  frameIntervalMs?: CreateAppBaseOptions["frameIntervalMs"];
  maxStabilizationPasses?: CreateAppBaseOptions["maxStabilizationPasses"];
  frameClock?: CreateAppBaseOptions["frameClock"];
  terminal?: never;
}

export interface CreateAppTerminalOptions {
  terminal: TerminalHost;
  autoStart?: CreateAppBaseOptions["autoStart"];
  onLifecycleError?: CreateAppBaseOptions["onLifecycleError"];
  onError?: CreateAppBaseOptions["onError"];
  clearOnResize?: CreateAppBaseOptions["clearOnResize"];
  onViewportChange?: CreateAppBaseOptions["onViewportChange"];
  layoutEngine?: CreateAppBaseOptions["layoutEngine"];
  frameIntervalMs?: CreateAppBaseOptions["frameIntervalMs"];
  maxStabilizationPasses?: CreateAppBaseOptions["maxStabilizationPasses"];
  frameClock?: CreateAppBaseOptions["frameClock"];
  stdout?: never;
  stdin?: never;
  fallbackViewport?: never;
}

export type CreateAppOptions = CreateAppStdoutOptions | CreateAppTerminalOptions;

export interface BindTTYApp {
  start(): void;
  render(): string;
  resize(): string;
  focus(target: string | MountedElementNode): InteractionResult;
  getFocusedId(): string | null;
  stop(): void;
  dispose(): void;
}

export function createApp(
  view: ViewTemplate,
  options: CreateAppOptions
): BindTTYApp {
  const diagnostic = createDiagnosticLogger("bindtty-app");
  const renderer = createTerminalRenderer();
  const interaction = createInteractionController();
  const terminal = options.terminal;
  const sink: FrameSink = terminal
    ? createTerminalFrameSink(terminal)
    : createStdoutFrameSink(options.stdout);
  let runtime: RuntimeRoot;
  let cachedLayout: LayoutNode | null = null;
  let cachedViewport: AppViewport | null = null;
  let synchronousRuntimeFlush = false;
  let started = false;
  let disposed = false;
  let flushUnsubscribe: Dispose | null = null;
  let resizeUnsubscribe: Dispose | null = null;
  let writableUnsubscribe: Dispose | null = null;
  let outputErrorUnsubscribe: Dispose | null = null;
  let keyUnsubscribe: Dispose | null = null;
  let lastFailedIntent: FrameIntent | null = null;

  diagnostic.log("created", {
    terminalMode: terminal !== undefined,
    frameIntervalMs: options.frameIntervalMs ?? (terminal ? 16 : 0),
    maxStabilizationPasses: options.maxStabilizationPasses ?? 2,
    clearOnResize: options.clearOnResize !== false
  });

  function readViewport(): AppViewport {
    if (terminal) {
      return terminal.viewport;
    }
    return {
      width: options.stdout.columns ?? options.fallbackViewport?.width ?? 80,
      height: options.stdout.rows ?? options.fallbackViewport?.height ?? 24
    };
  }

  function refreshInteraction(): void {
    interaction.refresh(runtime.root);
  }

  function handleRuntimeRecord(record: RuntimeFlushRecord): void {
    diagnostic.log("runtime-flush", {
      dirtyNodeCount: record.dirtyNodes.length,
      highestDirty: record.highestDirty,
      synchronous: synchronousRuntimeFlush,
      schedulerState: coordinator.state,
      revision: coordinator.revision
    });
    if (!synchronousRuntimeFlush) {
      runAsyncEntry("runtime-flush", () => {
        if (record.dirtyNodes.length > 0) {
          requestRender(record.highestDirty, true, "runtime");
        }
      });
    }
  }

  function flushRuntimeIntent(): FrameIntentKind | null {
    synchronousRuntimeFlush = true;
    try {
      return runtime.flushNow()?.highestDirty ?? null;
    } finally {
      synchronousRuntimeFlush = false;
    }
  }

  function renderFrame(intent: FrameIntent): {
    patch: string;
    blocked: boolean;
  } {
    const frameStartedAt = diagnostic.enabled
      ? process.hrtime.bigint()
      : undefined;
    const viewport = intent.viewport ?? readViewport();
    if (diagnostic.enabled) {
      diagnostic.log("frame-begin", {
        kind: intent.kind,
        reasons: intent.reasons,
        revision: intent.revision,
        width: viewport.width,
        height: viewport.height,
        schedulerState: coordinator.state,
        cachedLayout: cachedLayout !== null
      });
    }
    const needsInteraction =
      intent.kind === "structure" ||
      intent.kind === "viewport" ||
      cachedLayout === null;
    const needsLayout = intent.kind !== "paint" || cachedLayout === null;

    if (
      options.onViewportChange &&
      (intent.kind === "viewport" || cachedViewport === null)
    ) {
      options.onViewportChange({ ...viewport });
    }
    if (needsInteraction) {
      refreshInteraction();
    }
    let candidateLayout = cachedLayout;
    let candidateViewport = cachedViewport;
    if (needsLayout) {
      candidateLayout = layoutRoot(runtime.root, {
        viewport,
        engine: options.layoutEngine
      });
      candidateViewport = { ...viewport };
      dispatchLayout(candidateLayout);
      const feedbackKind = flushRuntimeIntent();
      if (feedbackKind) {
        coordinator.request(
          {
            ...intent,
            kind: mergeIntentKind(intent.kind, feedbackKind),
            reasons: [...(intent.reasons ?? []), "runtime"]
          },
          false
        );
        diagnostic.log("frame-deferred-runtime-feedback", {
          kind: intent.kind,
          feedbackKind,
          revision: intent.revision,
          width: viewport.width,
          height: viewport.height
        });
        return { patch: "", blocked: false };
      }
    }

    const prepared = renderer.prepare(
      candidateLayout,
      {
        viewport,
        isFocused: (mounted) => interaction.isFocused(mounted)
      },
      intent.kind === "viewport"
    );
    let patch = prepared.patch;
    if (
      intent.kind === "viewport" &&
      patch !== "" &&
      options.clearOnResize !== false
    ) {
      patch = ANSI.eraseDisplay + ANSI.cursorHome + patch;
    }
    let blocked = false;
    if (patch !== "") {
      blocked = sink.write(patch) === "blocked";
    }

    prepared.commit();
    cachedLayout = candidateLayout;
    cachedViewport = candidateViewport;
    runtime.clearDirty();
    if (frameStartedAt !== undefined) {
      const durationNs = process.hrtime.bigint() - frameStartedAt;
      diagnostic.log("frame-commit", {
        kind: intent.kind,
        reasons: intent.reasons,
        revision: intent.revision,
        width: viewport.width,
        height: viewport.height,
        patchLength: patch.length,
        blocked,
        durationMs: Number(durationNs / 1_000_000n)
      });
    }
    return { patch, blocked };
  }

  const coordinator = createFrameCoordinator(
    (intent) => {
      lastFailedIntent = null;
      try {
        return renderFrame(intent);
      } catch (error) {
        lastFailedIntent = intent;
        throw error;
      }
    },
    {
      frameIntervalMs: options.frameIntervalMs ?? (terminal ? 16 : 0),
      maxSynchronousPasses: options.maxStabilizationPasses,
      ...(options.frameClock ? { clock: options.frameClock } : {}),
      onError(error) {
        const failedIntent = lastFailedIntent;
        const reasons = failedIntent?.reasons ?? [];
        const phase: AppErrorPhase = reasons.includes("viewport")
          ? "resize"
          : reasons.includes("drain")
            ? "drain"
            : "runtime-flush";
        runAsyncEntry(
          phase,
          () => {
            throw error;
          },
          failedIntent?.viewport ?? readViewport()
        );
      }
    }
  );

  function requestRender(
    kind: FrameIntentKind = "paint",
    paced = false,
    reason: FrameReason = "manual"
  ): string {
    if (disposed) {
      return "";
    }
    const runtimeKind = flushRuntimeIntent();
    const patch = coordinator.request(
      {
        kind: mergeIntentKind(kind, runtimeKind),
        reasons: [reason]
      },
      paced
    );
    diagnostic.log("render-request", {
      kind,
      reason,
      paced,
      patchLength: patch.length,
      schedulerState: coordinator.state,
      revision: coordinator.revision
    });
    return patch;
  }

  function requestResize(
    viewport: AppViewport,
    paced = false,
    reason: FrameReason = "manual"
  ): string {
    if (disposed) {
      return "";
    }
    flushRuntimeIntent();
    const patch = coordinator.request(
      { kind: "viewport", viewport, reasons: [reason] },
      paced
    );
    diagnostic.log("resize-request", {
      reason,
      paced,
      width: viewport.width,
      height: viewport.height,
      patchLength: patch.length,
      schedulerState: coordinator.state,
      revision: coordinator.revision
    });
    return patch;
  }

  function handleResize(event?: TerminalResizeEvent): void {
    const viewport = event?.viewport ?? readViewport();
    diagnostic.log("resize-received", {
      source: event?.source ?? "stdout",
      width: viewport.width,
      height: viewport.height,
      previousWidth: event?.previousViewport.width,
      previousHeight: event?.previousViewport.height,
      schedulerState: coordinator.state,
      revision: coordinator.revision
    });
    runAsyncEntry(
      "resize",
      () => requestResize(viewport, true, "viewport"),
      viewport
    );
  }

  function runAsyncEntry(
    phase: AppErrorPhase,
    operation: () => unknown,
    viewport = readViewport()
  ): void {
    try {
      operation();
    } catch (error) {
      const schedulerState = coordinator.state;
      const failedIntent = lastFailedIntent ?? {
        kind: phase === "resize" ? "viewport" : "paint",
        viewport: { ...viewport },
        revision: coordinator.revision,
        reasons: [
          phase === "resize"
            ? "viewport"
            : phase === "drain"
              ? "drain"
              : "runtime"
        ]
      };
      lastFailedIntent = null;
      coordinator.cancelPending();
      const appError: AppError = {
        phase,
        error,
        viewport: { ...viewport },
        intent: failedIntent,
        revision: failedIntent.revision ?? coordinator.revision,
        schedulerState,
        recoverable: true
      };
      diagnostic.error("entry-error", error, {
        phase,
        width: viewport.width,
        height: viewport.height,
        intentKind: failedIntent.kind,
        intentReasons: failedIntent.reasons,
        revision: appError.revision,
        schedulerState
      });
      try {
        if (options.onError) {
          options.onError(appError);
        } else {
          console.error(`[bindtty] ${phase} failed`, error);
        }
      } catch (handlerError) {
        console.error("[bindtty] onError failed", handlerError);
      }
    }
  }

  function handleKey(event: TerminalKeyEvent): void {
    const result = interaction.handleKey(event);
    if (result.handled || result.dirtyNodes.length > 0) {
      requestRender("paint", false, "input");
    }
  }

  function focusElement(target: string | MountedElementNode): InteractionResult {
    if (disposed) {
      return { handled: false, dirtyNodes: [] };
    }
    refreshInteraction();
    const result = interaction.focus(target);
    if (result.handled || result.dirtyNodes.length > 0) {
      requestRender("paint", false, "input");
    }
    return result;
  }

  runtime = createRuntimeRoot(view, {
    onLifecycleError: options.onLifecycleError,
    elementActions: {
      focus: focusElement,
      isFocused: (node) => interaction.isFocused(node)
    }
  });

  const app: BindTTYApp = {
    start(): void {
      if (started || disposed) {
        return;
      }

      const rollbacks: Array<() => void> = [];
      try {
        diagnostic.log("start", { ...readViewport() });
        if (terminal) {
          rollbacks.push(() => terminal.stop());
          terminal.start();
        }

        flushUnsubscribe = runtime.onFlush(handleRuntimeRecord);
        rollbacks.push(() => flushUnsubscribe?.());

        if (terminal) {
          resizeUnsubscribe = terminal.onResize(handleResize);
          rollbacks.push(() => resizeUnsubscribe?.());
          keyUnsubscribe = terminal.onKey(handleKey);
          rollbacks.push(() => keyUnsubscribe?.());
        } else {
          options.stdout.on?.("resize", handleResize);
          rollbacks.push(() => options.stdout.off?.("resize", handleResize));
        }

        if (sink.onWritable) {
          writableUnsubscribe = sink.onWritable(() => {
            if (!disposed && started) {
              diagnostic.log("output-writable", {
                schedulerState: coordinator.state,
                revision: coordinator.revision
              });
              runAsyncEntry("drain", () => coordinator.writable());
            }
          });
          rollbacks.push(() => writableUnsubscribe?.());
        }
        if (terminal?.onOutputError) {
          outputErrorUnsubscribe = terminal.onOutputError((error) => {
            if (!disposed && started) {
              diagnostic.error("output-error-repaint", error, {
                ...readViewport(),
                schedulerState: coordinator.state,
                revision: coordinator.revision
              });
              requestResize(readViewport(), true, "output-recovery");
            }
          });
          rollbacks.push(() => outputErrorUnsubscribe?.());
        }

        started = true;
        const viewport = readViewport();
        if (!cachedViewport) {
          requestRender("structure");
        } else if (
          cachedViewport.width === viewport.width &&
          cachedViewport.height === viewport.height
        ) {
          requestRender("paint");
        } else {
          requestResize(viewport);
        }
      } catch (error) {
        diagnostic.error("start-error", error, {
          schedulerState: coordinator.state,
          revision: coordinator.revision
        });
        started = false;
        coordinator.cancelPending();
        const errors: unknown[] = [error];
        runCleanups([...rollbacks].reverse(), errors);
        clearSubscriptions();
        throwErrors(errors, "App start and rollback failed");
      }
    },

    render: () => requestRender("paint"),

    resize(): string {
      return requestResize(readViewport());
    },

    focus(target: string | MountedElementNode): InteractionResult {
      return focusElement(target);
    },

    getFocusedId(): string | null {
      if (disposed) {
        return null;
      }
      refreshInteraction();
      return interaction.getFocusedId();
    },

    stop(): void {
      if (!started) {
        return;
      }

      started = false;
      diagnostic.log("stop", {
        ...readViewport(),
        schedulerState: coordinator.state,
        revision: coordinator.revision
      });
      coordinator.cancelPending();
      const errors: unknown[] = [];
      runCleanups([
        () => keyUnsubscribe?.(),
        () => outputErrorUnsubscribe?.(),
        () => writableUnsubscribe?.(),
        () => resizeUnsubscribe?.(),
        () => flushUnsubscribe?.(),
        () => {
          if (terminal) {
            terminal.stop();
          } else {
            options.stdout.off?.("resize", handleResize);
          }
        }
      ], errors);
      clearSubscriptions();
      throwErrors(errors, "App stop failed");
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      const errors: unknown[] = [];
      diagnostic.log("dispose", {
        ...readViewport(),
        schedulerState: coordinator.state,
        revision: coordinator.revision
      });
      try {
        app.stop();
      } catch (error) {
        collectError(errors, error);
      }
      disposed = true;
      coordinator.dispose();
      runCleanups([
        () => runtime.dispose(),
        () => interaction.dispose(),
        () => renderer.reset(),
        () => terminal?.dispose()
      ], errors);
      cachedLayout = null;
      cachedViewport = null;
      if (errors.length > 0) {
        diagnostic.error(
          "dispose-error",
          new AggregateError(errors, "App dispose failed")
        );
      }
      diagnostic.dispose();
      throwErrors(errors, "App dispose failed");
    }
  };

  function clearSubscriptions(): void {
    flushUnsubscribe = null;
    resizeUnsubscribe = null;
    writableUnsubscribe = null;
    outputErrorUnsubscribe = null;
    keyUnsubscribe = null;
  }

  if (options.autoStart === true) {
    app.start();
  }
  return app;
}

function mergeIntentKind(
  requested: FrameIntentKind,
  runtimeKind: FrameIntentKind | null
): FrameIntentKind {
  if (!runtimeKind) {
    return requested;
  }
  const ranks: Record<FrameIntentKind, number> = {
    paint: 1,
    layout: 2,
    structure: 3,
    viewport: 4
  };
  return ranks[runtimeKind] > ranks[requested] ? runtimeKind : requested;
}

function dispatchLayout(layout: LayoutNode | null): void {
  if (!layout) {
    return;
  }
  if (layout.mounted.kind === "element") {
    notifyElementLayout(layout.mounted, layout);
  }
  for (const child of layout.children) {
    dispatchLayout(child);
  }
}

function runCleanups(cleanups: Array<() => void>, errors: unknown[]): void {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      collectError(errors, error);
    }
  }
}

function collectError(errors: unknown[], error: unknown): void {
  if (error instanceof AggregateError) {
    errors.push(...error.errors);
  } else {
    errors.push(error);
  }
}

function throwErrors(errors: unknown[], message: string): void {
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, message);
  }
}
