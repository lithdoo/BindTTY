import { ANSI } from "./ansi.js";
import { createDiagnosticLogger } from "./diagnostic-log.js";
import { createInputSession } from "./input-session.js";
import { createLifecycleGuard } from "./lifecycle-guard.js";
import { discoverNativeWin32InputProvider } from "./native-win32-provider.js";
import { createResizeCoordinator } from "./resize-coordinator.js";
import { createTerminalOutput } from "./terminal-output.js";
import { createTerminalResponseRouter } from "./terminal-response-router.js";
import { resolveTerminalProfile } from "./terminal-profile.js";
import { createCompositeViewportProvider } from "./viewport-provider.js";
import { acquireWindowsStdioResizeGuard } from "./windows-stdio-resize-guard.js";
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
  const detectedPlatform =
    options.terminalEnvironment?.platform ?? process.platform;
  if (detectedPlatform === "win32" && !options.win32InputProvider) {
    const nativeProvider = discoverNativeWin32InputProvider();
    if (nativeProvider) {
      options = { ...options, win32InputProvider: nativeProvider };
    }
  }

  let started = false;
  let disposed = false;
  let releaseStdioResizeGuard: Dispose | undefined;
  const profile = resolveTerminalProfile(
    options,
    options.terminalEnvironment
  );
  const useAltScreen =
    options.useAltScreen === true && profile.host !== "classic-windows-console";
  const frameStrategy = profile.output.absoluteCursorAddressing
    ? "diff" as const
    : "sequential" as const;
  const diagnostic = createDiagnosticLogger("bindtty-terminal");
  const output = createTerminalOutput({
    stdout: options.stdout,
    synchronizedOutput: profile.output.synchronizedOutput,
    recoverWindowsWriteEpipe:
      profile.platform === "win32" && options.stdout.isTTY === true
  });
  const responseRouter = createTerminalResponseRouter({
    pendingTimeoutMs: options.escapeAmbiguityTimeoutMs,
    clock: options.inputClock
  });
  const viewportQuery = profile.resize.queryXtermViewport
    ? createXtermViewportQuery({
        writeRaw: (chunk) => output.writeRaw(chunk),
        responseRouter,
        clock: options.resizeClock
      })
    : undefined;
  const viewportProvider = createCompositeViewportProvider({
    stdout: options.stdout,
    fallbackViewport: options.fallbackViewport,
    query: viewportQuery
  });
  const resize = createResizeCoordinator({
    stdout: options.stdout,
    fallbackViewport: options.fallbackViewport,
    ...profile.resize,
    clock: options.resizeClock,
    viewportProvider
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
  const stopDiagnosticResize = diagnostic.enabled
    ? resize.onResize((event) => {
        diagnostic.log("resize-published", {
          source: event.source,
          width: event.viewport.width,
          height: event.viewport.height,
          previousWidth: event.previousViewport.width,
          previousHeight: event.previousViewport.height
        });
      })
    : () => {};
  const stopDiagnosticOutputError = diagnostic.enabled
    ? output.onOutputError((error) => {
        diagnostic.error("output-recoverable-error", error, {
          width: resize.viewport.width,
          height: resize.viewport.height
        });
      })
    : () => {};
  const stopDiagnosticInput = diagnostic.enabled
    ? input.onKey((event) => {
        diagnostic.log("input-event", summarizeKeyEvent(event));
      })
    : () => {};
  const stopDiagnosticQuery = diagnostic.enabled
    ? viewportQuery?.onViewport((viewport) => {
        diagnostic.log("viewport-query-response", {
          width: viewport.width,
          height: viewport.height
        });
      })
    : undefined;

  diagnostic.log("created", {
    platform: profile.platform,
    terminalProgram: process.env.TERM_PROGRAM,
    windowsTerminal: process.env.WT_SESSION !== undefined,
    stdinIsTTY: options.stdin?.isTTY === true,
    stdoutIsTTY: options.stdout.isTTY === true,
    inputBackend: profile.inputBackend.stdinAdapter,
    inputBackendReason: profile.inputBackend.reason,
    terminalHost: profile.host,
    requestedAltScreen: options.useAltScreen === true,
    effectiveAltScreen: useAltScreen,
    frameStrategy,
    synchronizedOutput: profile.output.synchronizedOutput,
    queryXtermViewport: profile.resize.queryXtermViewport,
    pollIntervalMs: profile.resize.pollIntervalMs,
    settleDelayMs: profile.resize.settleDelayMs,
    initialWidth: resize.viewport.width,
    initialHeight: resize.viewport.height
  });

  function writeRaw(chunk: string): boolean {
    return output.writeRaw(chunk);
  }

  function present(frame: string): boolean {
    return output.present(frame);
  }

  terminal = {
    outputCapabilities: {
      absoluteCursorAddressing: profile.output.absoluteCursorAddressing
    },
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
      diagnostic.log("start", {
        width: resize.viewport.width,
        height: resize.viewport.height
      });
      try {
        if (options.stdout === process.stdout) {
          releaseStdioResizeGuard = acquireWindowsStdioResizeGuard();
        }
        output.start();
        if (useAltScreen) {
          writeRaw(ANSI.enterAltScreen);
        }
        input.start();
        if (options.hideCursor === true) {
          writeRaw(ANSI.hideCursor);
        }
        resize.start();
        lifecycle.start();
      } catch (error) {
        diagnostic.error("start-error", error);
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
        diagnostic.log("stop", {
          width: resize.viewport.width,
          height: resize.viewport.height
        });
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
      diagnostic.log("dispose", {
        width: resize.viewport.width,
        height: resize.viewport.height
      });
      for (const cleanup of [
        () => terminal.stop(),
        () => lifecycle.dispose(),
        () => stopDiagnosticQuery?.(),
        () => stopDiagnosticInput(),
        () => stopDiagnosticOutputError(),
        () => stopDiagnosticResize(),
        () => resize.dispose(),
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
        diagnostic.error(
          "dispose-error",
          new AggregateError(errors, "failed to dispose terminal")
        );
        diagnostic.dispose();
        throw new AggregateError(errors, "failed to dispose terminal");
      }
      diagnostic.dispose();
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

    onOutputError(listener): Dispose {
      return disposed ? () => {} : output.onOutputError(listener);
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
      () => input.stop(),
      () => {
        if (options.hideCursor === true) {
          writeRaw(ANSI.showCursor);
        }
      },
      () => {
        if (useAltScreen) {
          writeRaw(ANSI.exitAltScreen);
        }
      },
      () => output.stop(),
      () => {
        releaseStdioResizeGuard?.();
        releaseStdioResizeGuard = undefined;
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

function summarizeKeyEvent(
  event: import("./types.js").TerminalKeyEvent
): Record<string, unknown> {
  if (event.kind === "key") {
    return {
      kind: event.kind,
      protocol: event.protocol,
      key: event.key,
      modifiers: event.modifiers,
      repeat: event.repeat
    };
  }
  if (event.kind === "text" || event.kind === "paste") {
    return {
      kind: event.kind,
      protocol: event.protocol,
      textLength: event.text.length
    };
  }
  return {
    kind: event.kind,
    protocol: event.protocol,
    rawLength: event.raw.length,
    reason: event.reason
  };
}
