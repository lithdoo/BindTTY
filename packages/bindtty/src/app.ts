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
  RuntimeLifecycleErrorHandler,
  RuntimeRoot
} from "@bindtty/runtime";
import type {
  TerminalHost,
  TerminalKeyEvent,
  TerminalResizeEvent
} from "@bindtty/terminal";
import type { MountedElementNode, ViewTemplate } from "@bindtty/vnode";

export interface AppStdout {
  columns?: number;
  rows?: number;
  write(chunk: string): unknown;
  on?(event: "resize", listener: () => void): unknown;
  off?(event: "resize", listener: () => void): unknown;
}

export interface AppStdin {}

export interface AppViewport {
  width: number;
  height: number;
}

export interface CreateAppBaseOptions {
  autoStart?: boolean;
  onLifecycleError?: RuntimeLifecycleErrorHandler;
  layoutEngine?: LayoutEngine;
}

export interface CreateAppStdoutOptions {
  stdout: AppStdout;
  stdin?: AppStdin;
  fallbackViewport?: AppViewport;
  autoStart?: CreateAppBaseOptions["autoStart"];
  onLifecycleError?: CreateAppBaseOptions["onLifecycleError"];
  layoutEngine?: CreateAppBaseOptions["layoutEngine"];
  terminal?: never;
}

export interface CreateAppTerminalOptions {
  terminal: TerminalHost;
  autoStart?: CreateAppBaseOptions["autoStart"];
  onLifecycleError?: CreateAppBaseOptions["onLifecycleError"];
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
  let runtime: RuntimeRoot;
  let started = false;
  let disposed = false;
  let flushUnsubscribe: Dispose | null = null;
  let terminalResizeUnsubscribe: Dispose | null = null;
  let terminalDrainUnsubscribe: Dispose | null = null;
  let terminalKeyUnsubscribe: Dispose | null = null;
  let renderTransactionActive = false;
  let renderRequested = false;
  let pendingResizeViewport: AppViewport | null = null;
  let outputBlocked = false;

  function handleResize(event?: TerminalResizeEvent): void {
    requestResize(event?.viewport ?? readViewport());
  }

  function refreshInteraction(): void {
    interaction.refresh(runtime.root);
  }

  function handleKey(event: TerminalKeyEvent): void {
    const result = interaction.handleKey(event);

    if (result.handled || result.dirtyNodes.length > 0) {
      requestRender();
    }
  }

  function focusElement(target: string | MountedElementNode): InteractionResult {
    if (disposed) {
      return { handled: false, dirtyNodes: [] };
    }

    refreshInteraction();
    const result = interaction.focus(target);
    if (result.handled || result.dirtyNodes.length > 0) {
      requestRender();
    }
    return result;
  }

  function readViewport(): AppViewport {
    if (terminal) {
      return terminal.viewport;
    }

    if ("stdout" in options) {
      return {
        width: options.stdout.columns ?? options.fallbackViewport?.width ?? 80,
        height: options.stdout.rows ?? options.fallbackViewport?.height ?? 24
      };
    }

    return { width: 80, height: 24 };
  }

  function writePatch(patch: string): boolean {
    if (terminal) {
      const accepted = terminal.write(patch);
      return accepted !== false || terminal.onDrain === undefined;
    }

    if ("stdout" in options) {
      options.stdout.write(patch);
    }

    return true;
  }

  function handleTerminalDrain(): void {
    if (disposed || !started || !outputBlocked) {
      return;
    }

    outputBlocked = false;
    flushRenderTransaction();
  }

  function renderFrame(viewport: AppViewport): string {
    if (disposed) {
      return "";
    }

    refreshInteraction();
    const layoutTree = layoutRoot(runtime.root, {
      viewport,
      engine: options.layoutEngine
    });
    const patch = renderer.render(layoutTree, {
      viewport,
      isFocused: (mounted) => interaction.isFocused(mounted)
    });

    if (patch !== "") {
      outputBlocked = !writePatch(patch);
    }

    runtime.clearDirty();
    dispatchLayout(layoutTree);
    return patch;
  }

  function requestRender(): string {
    if (disposed) {
      return "";
    }

    renderRequested = true;
    return flushRenderTransaction();
  }

  function requestResize(viewport: AppViewport): string {
    if (disposed) {
      return "";
    }

    pendingResizeViewport = { ...viewport };
    return flushRenderTransaction();
  }

  function flushRenderTransaction(): string {
    if (renderTransactionActive || outputBlocked || disposed) {
      return "";
    }

    renderTransactionActive = true;
    let lastPatch = "";

    try {
      while (renderRequested || pendingResizeViewport !== null) {
        const resizeViewport = pendingResizeViewport;
        pendingResizeViewport = null;
        renderRequested = false;

        if (resizeViewport !== null) {
          runtime.flushNow();

          if (pendingResizeViewport !== null) {
            continue;
          }

          // The resize frame includes any dirty runtime state consumed above.
          renderRequested = false;
          renderer.reset();
        }

        lastPatch = renderFrame(resizeViewport ?? readViewport());
      }
    } finally {
      renderTransactionActive = false;
    }

    return lastPatch;
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

      started = true;
      terminal?.start();
      flushUnsubscribe = runtime.onFlush(() => {
        requestRender();
      });
      if (terminal) {
        terminalResizeUnsubscribe = terminal.onResize(handleResize);
        terminalDrainUnsubscribe = terminal.onDrain?.(handleTerminalDrain) ?? null;
        terminalKeyUnsubscribe = terminal.onKey(handleKey);
      } else if ("stdout" in options) {
        options.stdout.on?.("resize", handleResize);
      }
      requestRender();
    },

    render: requestRender,

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
      flushUnsubscribe?.();
      flushUnsubscribe = null;
      terminalResizeUnsubscribe?.();
      terminalResizeUnsubscribe = null;
      terminalDrainUnsubscribe?.();
      terminalDrainUnsubscribe = null;
      terminalKeyUnsubscribe?.();
      terminalKeyUnsubscribe = null;
      outputBlocked = false;
      if (terminal) {
        terminal.stop();
      } else if ("stdout" in options) {
        options.stdout.off?.("resize", handleResize);
      }
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      app.stop();
      disposed = true;
      runtime.dispose();
      interaction.dispose();
      renderer.reset();
      renderRequested = false;
      pendingResizeViewport = null;
      outputBlocked = false;
      terminal?.dispose();
    }
  };

  if (options.autoStart === true) {
    app.start();
  }

  return app;
}
