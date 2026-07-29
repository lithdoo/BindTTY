import { ANSI } from "./ansi.js";
import { createInputSession } from "./input-session.js";
import { discoverNativeWin32InputProvider } from "./native-win32-provider.js";
import { createResizeCoordinator } from "./resize-coordinator.js";
import { createTerminalOutput } from "./terminal-output.js";
import { resolveTerminalProfile } from "./terminal-profile.js";
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
  const profile = resolveTerminalProfile(options);
  const output = createTerminalOutput({
    stdout: options.stdout,
    synchronizedOutput: profile.output.synchronizedOutput
  });
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
    onExitRequest: () => terminal.dispose()
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
        if (options.hideCursor === true) {
          writeRaw(ANSI.hideCursor);
        }
        output.start();
        resize.start();
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
      restoreStartedComponents();
      started = false;
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      terminal.stop();
      resize.dispose();
      input.dispose();
      output.dispose();
      disposed = true;
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
