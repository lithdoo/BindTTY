import { ANSI } from "./ansi.js";
import { createInputSession } from "./input-session.js";
import { createLifecycleGuard } from "./lifecycle-guard.js";
import { discoverNativeWin32InputProvider } from "./native-win32-provider.js";
import { createResizeCoordinator } from "./resize-coordinator.js";
import { createTerminalOutput } from "./terminal-output.js";
import { createTerminalResponseRouter } from "./terminal-response-router.js";
import { resolveTerminalProfile } from "./terminal-profile.js";
import { createXtermViewportQuery } from "./xterm-viewport-query.js";
import type {
  CreateNodeTerminalOptions,
  Dispose,
  TerminalHost,
  TerminalViewport
} from "./types.js";

export function createNodeTerminal(
  initialOptions: CreateNodeTerminalOptions
): TerminalHost {
  let options = initialOptions;
  if (!options.win32InputProvider) {
    const nativeProvider = discoverNativeWin32InputProvider();
    if (nativeProvider) {
      options = { ...options, win32InputProvider: nativeProvider };
    }
  }

  let started = false;
  let disposed = false;
  let profile = resolveTerminalProfile(options);
  if (
    profile.resize.queryXtermViewport &&
    options.inputBackend === undefined
  ) {
    options = { ...options, inputBackend: "raw" };
    profile = resolveTerminalProfile(options);
  }
  const output = createTerminalOutput({
    stdout: options.stdout,
    synchronizedOutput: profile.output.synchronizedOutput
  });
  const responseRouter = createTerminalResponseRouter({
    pendingTimeoutMs: options.escapeAmbiguityTimeoutMs,
    clock: options.inputClock
  });
  const viewportQuery = profile.resize.queryXtermViewport
    ? createXtermViewportQuery({
        stdout: options.stdout,
        writeRaw: (chunk) => output.writeRaw(chunk),
        responseRouter,
        clock: options.resizeClock
      })
    : undefined;
  if (viewportQuery) {
    options = { ...options, stdout: viewportQuery.stdout };
  }
  const resize = createResizeCoordinator({
    stdout: options.stdout,
    fallbackViewport: options.fallbackViewport,
    ...profile.resize,
    clock: options.resizeClock
  });
  let terminal!: TerminalHost;
  const input = createInputSession({
    terminalOptions: options,
    profile,
    writeRaw: (chunk) => output.writeRaw(chunk),
    onExitRequest: () => terminal.dispose(),
    responseRouter
  });
  const lifecycle = createLifecycleGuard({
    restore: restoreStartedComponents
  });

  function writeRaw(chunk: string): boolean {
    return output.writeRaw(chunk);
  }

  function present(frame: string): boolean {
    return output.present(frame);
  }

  terminal = {
    get viewport(): TerminalViewport {
      return resize.viewport;
    },

    get keyboardCapabilities() {
      return input.keyboardCapabilities;
    },

    start(): void {
      if (started || disposed) {
        return;
      }
      started = true;
      try {
        if (options.useAltScreen === true) {
          writeRaw(ANSI.enterAltScreen);
        }
        input.start();
        viewportQuery?.start();
        if (options.hideCursor === true) {
          writeRaw(ANSI.hideCursor);
        }
        output.start();
        resize.start();
        lifecycle.start();
      } catch (error) {
        restoreStartedComponents();
        started = false;
        throw error;
      }
    },

    stop(): void {
      if (!started) {
        return;
      }
      try {
        lifecycle.stop();
      } finally {
        started = false;
      }
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      const errors: unknown[] = [];
      for (const cleanup of [
        () => terminal.stop(),
        () => lifecycle.dispose(),
        () => resize.dispose(),
        () => viewportQuery?.dispose(),
        () => input.dispose(),
        () => responseRouter.dispose(),
        () => output.dispose()
      ]) {
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      disposed = true;
      if (errors.length > 0) {
        throw new AggregateError(errors, "failed to dispose terminal");
      }
    },

    write: present,
    writeRaw,
    present,

    onResize(listener): Dispose {
      return resize.onResize(listener);
    },

    onDrain(listener): Dispose {
      return disposed ? () => {} : output.onDrain(listener);
    },

    onKey(listener): Dispose {
      return disposed ? () => {} : input.onKey(listener);
    },

    onKeyboardCapabilitiesChange(listener): Dispose {
      return disposed
        ? () => {}
        : input.onKeyboardCapabilitiesChange(listener);
    }
  };

  function restoreStartedComponents(): void {
    const errors: unknown[] = [];
    for (const cleanup of [
      () => resize.stop(),
      () => viewportQuery?.stop(),
      () => output.stop(),
      () => input.stop(),
      () => {
        if (options.hideCursor === true) {
          writeRaw(ANSI.showCursor);
        }
      },
      () => {
        if (options.useAltScreen === true) {
          writeRaw(ANSI.exitAltScreen);
        }
      }
    ]) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "failed to restore terminal state");
    }
  }

  return terminal;
}
