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
  type TerminalHost,
  type TerminalKeyEvent,
  type TerminalResizeEvent
} from "@bindtty/terminal";
import type { MountedElementNode, ViewTemplate } from "@bindtty/vnode";
import {
  createFrameCoordinator,
  type FrameIntent,
  type FrameIntentKind
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
  let keyUnsubscribe: Dispose | null = null;

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

  function consumeRuntimeRecord(record: RuntimeFlushRecord | null): void {
    if (!record || record.dirtyNodes.length === 0) {
      return;
    }
    coordinator.request({ kind: record.highestDirty });
  }

  function handleRuntimeRecord(record: RuntimeFlushRecord): void {
    if (!synchronousRuntimeFlush) {
      runAsyncEntry("runtime-flush", () => consumeRuntimeRecord(record));
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
    const viewport = intent.viewport ?? readViewport();
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
    if (intent.kind === "viewport") {
      renderer.reset();
    }
    if (needsLayout) {
      cachedLayout = layoutRoot(runtime.root, {
        viewport,
        engine: options.layoutEngine
      });
      cachedViewport = { ...viewport };
    }

    let patch = renderer.render(cachedLayout, {
      viewport,
      isFocused: (mounted) => interaction.isFocused(mounted)
    });
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

    runtime.clearDirty();
    if (needsLayout) {
      dispatchLayout(cachedLayout);
    }
    return { patch, blocked };
  }

  const coordinator = createFrameCoordinator(renderFrame);

  function requestRender(kind: FrameIntentKind = "paint"): string {
    if (disposed) {
      return "";
    }
    const runtimeKind = flushRuntimeIntent();
    return coordinator.request({
      kind: mergeIntentKind(kind, runtimeKind)
    });
  }

  function requestResize(viewport: AppViewport): string {
    if (disposed) {
      return "";
    }
    flushRuntimeIntent();
    return coordinator.request({ kind: "viewport", viewport });
  }

  function handleResize(event?: TerminalResizeEvent): void {
    const viewport = event?.viewport ?? readViewport();
    runAsyncEntry("resize", () => requestResize(viewport), viewport);
  }

  function runAsyncEntry(
    phase: AppErrorPhase,
    operation: () => unknown,
    viewport = readViewport()
  ): void {
    try {
      operation();
    } catch (error) {
      coordinator.cancelPending();
      const appError: AppError = {
        phase,
        error,
        viewport: { ...viewport }
      };
      try {
        if (options.onError) {
          options.onError(appError);
        } else {
          try {
            app.stop();
          } catch (stopError) {
            console.error("[bindtty] terminal restore failed", stopError);
          }
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
      requestRender("paint");
    }
  }

  function focusElement(target: string | MountedElementNode): InteractionResult {
    if (disposed) {
      return { handled: false, dirtyNodes: [] };
    }
    refreshInteraction();
    const result = interaction.focus(target);
    if (result.handled || result.dirtyNodes.length > 0) {
      requestRender("paint");
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
              runAsyncEntry("drain", () => coordinator.writable());
            }
          });
          rollbacks.push(() => writableUnsubscribe?.());
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
      coordinator.cancelPending();
      const errors: unknown[] = [];
      runCleanups([
        () => keyUnsubscribe?.(),
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
      throwErrors(errors, "App dispose failed");
    }
  };

  function clearSubscriptions(): void {
    flushUnsubscribe = null;
    resizeUnsubscribe = null;
    writableUnsubscribe = null;
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
