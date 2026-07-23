import type { Readable } from "node:stream";

import {
  keyboardCapabilitiesForProtocol,
  type InputProtocol,
  type KeyboardCapabilities
} from "@bindtty/input";
import { resolvePlatformAdapter } from "./adapters/resolve.js";
import { ANSI } from "./ansi.js";
import type {
  CreateNodeTerminalOptions,
  Dispose,
  ResizeListener,
  TerminalHost,
  TerminalKeyEvent,
  TerminalKeyListener,
  KeyboardCapabilitiesListener,
  StdinInputKind,
  TerminalViewport
} from "./types.js";

const defaultViewport: TerminalViewport = {
  width: 80,
  height: 24
};

const win32ResizePollIntervalMs = 50;
const defaultKeyboardProbeTimeoutMs = 100;
const kittyKeyboardResponse = /^\x1b\[\?(\d+)u$/;

function readResizePollIntervalMs(
  options: CreateNodeTerminalOptions
): number {
  if (options.resizePollIntervalMs !== undefined) {
    return options.resizePollIntervalMs;
  }

  return process.platform === "win32" ? win32ResizePollIntervalMs : 0;
}

function shouldPollStdoutResize(
  stdout: CreateNodeTerminalOptions["stdout"],
  intervalMs: number
): boolean {
  return (
    intervalMs > 0 &&
    stdout.isTTY === true &&
    typeof stdout.columns === "number" &&
    typeof stdout.rows === "number"
  );
}

function viewportsEqual(
  left: TerminalViewport,
  right: TerminalViewport
): boolean {
  return left.width === right.width && left.height === right.height;
}

export function createNodeTerminal(
  options: CreateNodeTerminalOptions
): TerminalHost {
  let started = false;
  let disposed = false;
  const resizeListeners = new Set<ResizeListener>();
  const keyListeners = new Set<TerminalKeyListener>();
  const keyboardCapabilitiesListeners = new Set<KeyboardCapabilitiesListener>();
  const platform = resolvePlatformAdapter(options);
  let detachStdin: Dispose = () => {};
  let resizePollTimer: ReturnType<typeof setInterval> | undefined;
  let lastPolledViewport: TerminalViewport | null = null;
  let keyboardProbeTimer: ReturnType<typeof setTimeout> | undefined;
  let keyboardProtocolEnabled: "kitty" | "modify-other-keys" | "legacy-dual" | null = null;
  let activeStdinKind: StdinInputKind | null = null;
  let fallbackProtocol = fallbackInputProtocol(platform.name);
  let keyboardCapabilities = keyboardCapabilitiesForProtocol(
    fallbackProtocol
  );

  function readViewport(): TerminalViewport {
    return {
      width:
        options.stdout.columns ??
        options.fallbackViewport?.width ??
        defaultViewport.width,
      height:
        options.stdout.rows ??
        options.fallbackViewport?.height ??
        defaultViewport.height
    };
  }

  function handleResize(): void {
    lastPolledViewport = readViewport();

    for (const listener of [...resizeListeners]) {
      listener();
    }
  }

  function pollViewportIfChanged(): void {
    const nextViewport = readViewport();

    if (
      lastPolledViewport !== null &&
      viewportsEqual(lastPolledViewport, nextViewport)
    ) {
      return;
    }

    handleResize();
  }

  function startWin32ResizePolling(): void {
    const intervalMs = readResizePollIntervalMs(options);

    if (!shouldPollStdoutResize(options.stdout, intervalMs)) {
      return;
    }

    lastPolledViewport = readViewport();
    resizePollTimer = setInterval(pollViewportIfChanged, intervalMs);
    resizePollTimer.unref?.();
  }

  function stopWin32ResizePolling(): void {
    if (resizePollTimer) {
      clearInterval(resizePollTimer);
      resizePollTimer = undefined;
    }

    lastPolledViewport = null;
  }

  function dispatchKey(event: TerminalKeyEvent): void {
    if (consumeKittyProbeResponse(event)) {
      return;
    }

    if (event.ctrl && event.name === "c" && options.exitOnCtrlC !== false) {
      terminal.dispose();
      return;
    }

    event.protocol = keyboardCapabilities.protocol;

    for (const listener of [...keyListeners]) {
      listener(event);
    }
  }

  function setKeyboardCapabilities(protocol: InputProtocol): void {
    const next = keyboardCapabilitiesForProtocol(protocol);
    if (next.protocol === keyboardCapabilities.protocol) {
      return;
    }

    keyboardCapabilities = next;
    for (const listener of [...keyboardCapabilitiesListeners]) {
      listener(next);
    }
  }

  function consumeKittyProbeResponse(event: TerminalKeyEvent): boolean {
    if (options.keyboardProtocol !== "auto" || event.name !== "unknown") {
      return false;
    }

    const match = event.sequence?.match(kittyKeyboardResponse);
    if (!match) {
      return false;
    }

    stopKeyboardProbe();
    write(ANSI.enableKittyKeyboard);
    keyboardProtocolEnabled = "kitty";
    setKeyboardCapabilities("kitty");
    return true;
  }

  function startKeyboardProtocol(): void {
    if (activeStdinKind === "win32") {
      setKeyboardCapabilities("win32");
      return;
    }

    if (options.keyboardProtocol === "auto") {
      write(ANSI.queryKittyKeyboard);
      const timeout = Math.max(
        0,
        options.keyboardProbeTimeoutMs ?? defaultKeyboardProbeTimeoutMs
      );
      keyboardProbeTimer = setTimeout(() => {
        keyboardProbeTimer = undefined;
        setKeyboardCapabilities(fallbackProtocol);
      }, timeout);
      keyboardProbeTimer.unref?.();
      return;
    }

    if (options.keyboardProtocol === "kitty") {
      write(ANSI.enableKittyKeyboard);
      keyboardProtocolEnabled = "kitty";
      setKeyboardCapabilities("kitty");
      return;
    }

    if (options.keyboardProtocol === "modify-other-keys") {
      write(ANSI.enableModifyOtherKeys);
      keyboardProtocolEnabled = "modify-other-keys";
      setKeyboardCapabilities("modify-other-keys");
      return;
    }

    if (options.keyboardProtocol === "legacy") {
      setKeyboardCapabilities(fallbackProtocol);
      return;
    }

    if (options.enhancedKeyboard === true) {
      write(ANSI.enableKittyKeyboard);
      write(ANSI.enableModifyOtherKeys);
      keyboardProtocolEnabled = "legacy-dual";
      setKeyboardCapabilities("modify-other-keys");
    }
  }

  function stopKeyboardProbe(): void {
    if (keyboardProbeTimer) {
      clearTimeout(keyboardProbeTimer);
      keyboardProbeTimer = undefined;
    }
  }

  function stopKeyboardProtocol(): void {
    stopKeyboardProbe();

    if (keyboardProtocolEnabled === "kitty") {
      write(ANSI.disableKittyKeyboard);
    } else if (keyboardProtocolEnabled === "modify-other-keys") {
      write(ANSI.disableModifyOtherKeys);
    } else if (keyboardProtocolEnabled === "legacy-dual") {
      write(ANSI.disableModifyOtherKeys);
      write(ANSI.disableKittyKeyboard);
    }

    keyboardProtocolEnabled = null;
    setKeyboardCapabilities(fallbackProtocol);
  }

  function write(chunk: string): void {
    if (disposed || chunk === "") {
      return;
    }

    options.stdout.write(chunk);
  }

  const terminal: TerminalHost = {
    get viewport(): TerminalViewport {
      return readViewport();
    },

    get keyboardCapabilities(): KeyboardCapabilities {
      return keyboardCapabilities;
    },

    start(): void {
      if (started || disposed) {
        return;
      }

      started = true;

      if (options.useAltScreen === true) {
        write(ANSI.enterAltScreen);
      }

      if (options.keyboardProtocol !== "auto") {
        startKeyboardProtocol();
      }

      if (options.hideCursor === true) {
        write(ANSI.hideCursor);
      }

      if (options.stdin) {
        const stdin = options.stdin as Readable;
        const stdinInput = platform.createStdinInput(options);
        activeStdinKind = stdinInput.kind;
        if (stdinInput.kind === "win32") {
          fallbackProtocol = "win32";
          if (
            options.keyboardProtocol === "auto" ||
            (options.keyboardProtocol === undefined && options.enhancedKeyboard !== true)
          ) {
            setKeyboardCapabilities("win32");
          }
        }

        if (options.rawMode === true && options.stdin.setRawMode) {
          if (options.stdin.isTTY) {
            stdinInput.prepare(stdin);
          }

          options.stdin.setRawMode(true);
          options.stdin.resume?.();
        } else if (options.stdin.isTTY) {
          stdinInput.prepare(stdin);
        }

        detachStdin = stdinInput.attach(stdin, dispatchKey);
      }

      if (options.keyboardProtocol === "auto") {
        startKeyboardProtocol();
      }

      options.stdout.on?.("resize", handleResize);
      startWin32ResizePolling();
    },

    stop(): void {
      if (!started) {
        return;
      }

      stopWin32ResizePolling();
      options.stdout.off?.("resize", handleResize);
      detachStdin();
      detachStdin = () => {};
      activeStdinKind = null;

      if (options.rawMode === true && options.stdin?.setRawMode) {
        options.stdin.setRawMode(false);
      }

      stopKeyboardProtocol();

      if (options.hideCursor === true) {
        write(ANSI.showCursor);
      }

      if (options.useAltScreen === true) {
        write(ANSI.exitAltScreen);
      }

      started = false;
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      terminal.stop();
      resizeListeners.clear();
      keyListeners.clear();
      keyboardCapabilitiesListeners.clear();
      disposed = true;
    },

    write,

    onResize(listener: ResizeListener): Dispose {
      if (disposed) {
        return () => {};
      }

      resizeListeners.add(listener);
      return () => {
        resizeListeners.delete(listener);
      };
    },

    onKey(listener: TerminalKeyListener): Dispose {
      if (disposed) {
        return () => {};
      }

      keyListeners.add(listener);
      return () => {
        keyListeners.delete(listener);
      };
    },

    onKeyboardCapabilitiesChange(listener: KeyboardCapabilitiesListener): Dispose {
      if (disposed) {
        return () => {};
      }

      keyboardCapabilitiesListeners.add(listener);
      return () => {
        keyboardCapabilitiesListeners.delete(listener);
      };
    }
  };

  return terminal;
}

function fallbackInputProtocol(platformName: string): InputProtocol {
  return platformName === "win32" ? "windows-vt" : "legacy-vt";
}
