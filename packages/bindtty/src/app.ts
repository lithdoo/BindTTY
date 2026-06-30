import { layoutRoot } from "@bindtty/layout";
import { createTerminalRenderer } from "@bindtty/renderer-terminal";
import { createRuntimeRoot } from "@bindtty/runtime";
import type { Dispose } from "@bindtty/runtime";
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

export interface CreateAppOptions {
  stdout: AppStdout;
  stdin?: AppStdin;
  fallbackViewport?: AppViewport;
  autoStart?: boolean;
}

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
  const runtime = createRuntimeRoot(view);
  const renderer = createTerminalRenderer();
  let started = false;
  let disposed = false;
  let flushUnsubscribe: Dispose | null = null;

  function handleResize(): void {
    app.resize();
  }

  function readViewport(): AppViewport {
    return {
      width: options.stdout.columns ?? options.fallbackViewport?.width ?? 80,
      height: options.stdout.rows ?? options.fallbackViewport?.height ?? 24
    };
  }

  function render(): string {
    if (disposed) {
      return "";
    }

    const viewport = readViewport();
    const layoutTree = layoutRoot(runtime.root, { viewport });
    const patch = renderer.render(layoutTree, { viewport });

    if (patch !== "") {
      options.stdout.write(patch);
    }

    runtime.clearDirty();
    return patch;
  }

  const app: BindTTYApp = {
    start(): void {
      if (started || disposed) {
        return;
      }

      started = true;
      flushUnsubscribe = runtime.onFlush(() => {
        render();
      });
      options.stdout.on?.("resize", handleResize);
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
      options.stdout.off?.("resize", handleResize);
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      app.stop();
      disposed = true;
      runtime.dispose();
      renderer.reset();
    }
  };

  if (options.autoStart === true) {
    app.start();
  }

  return app;
}
