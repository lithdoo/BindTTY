import { createInteractionController } from "@bindtty/interaction";
import { layoutRoot } from "@bindtty/layout";
import type { LayoutEngine, LayoutNode } from "@bindtty/layout";
import { createTerminalRenderer } from "@bindtty/renderer-terminal";
import { createRuntimeRoot, notifyElementLayout } from "@bindtty/runtime";
import type { Dispose, RuntimeLifecycleErrorHandler } from "@bindtty/runtime";
import type { TerminalHost, TerminalKeyEvent } from "@bindtty/terminal";
import type { ViewTemplate } from "@bindtty/vnode";

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
  stop(): void;
  dispose(): void;
}

export function createApp(
  view: ViewTemplate,
  options: CreateAppOptions
): BindTTYApp {
  const runtime = createRuntimeRoot(view, {
    onLifecycleError: options.onLifecycleError
  });
  const renderer = createTerminalRenderer();
  const interaction = createInteractionController();
  const terminal = options.terminal;
  let started = false;
  let disposed = false;
  let flushUnsubscribe: Dispose | null = null;
  let terminalResizeUnsubscribe: Dispose | null = null;
  let terminalKeyUnsubscribe: Dispose | null = null;

  function handleResize(): void {
    app.resize();
  }

  function refreshInteraction(): void {
    interaction.refresh(runtime.root);
  }

  function handleKey(event: TerminalKeyEvent): void {
    const result = interaction.handleKey(event);

    if (result.handled || result.dirtyNodes.length > 0) {
      render();
    }
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

  function writePatch(patch: string): void {
    if (terminal) {
      terminal.write(patch);
      return;
    }

    if ("stdout" in options) {
      options.stdout.write(patch);
    }
  }

  function render(): string {
    if (disposed) {
      return "";
    }

    const viewport = readViewport();
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
      writePatch(patch);
    }

    runtime.clearDirty();
    dispatchLayout(layoutTree);
    return patch;
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

  const app: BindTTYApp = {
    start(): void {
      if (started || disposed) {
        return;
      }

      started = true;
      terminal?.start();
      flushUnsubscribe = runtime.onFlush(() => {
        render();
      });
      if (terminal) {
        terminalResizeUnsubscribe = terminal.onResize(handleResize);
        terminalKeyUnsubscribe = terminal.onKey(handleKey);
      } else if ("stdout" in options) {
        options.stdout.on?.("resize", handleResize);
      }
      render();
    },

    render,

    resize(): string {
      if (disposed) {
        return "";
      }

      renderer.reset();
      return render();
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
      terminalKeyUnsubscribe?.();
      terminalKeyUnsubscribe = null;
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
      terminal?.dispose();
    }
  };

  if (options.autoStart === true) {
    app.start();
  }

  return app;
}
