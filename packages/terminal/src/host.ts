import type { Readable } from "node:stream";

import {
  keyboardCapabilitiesForProtocol,
  type InputProtocol,
  type KeyboardCapabilities
} from "@bindtty/input";
import { resolvePlatformAdapter } from "./adapters/resolve.js";
import {
  detectTerminalInputEnvironment,
  selectInputBackend
} from "./backend-selection.js";
import { ANSI } from "./ansi.js";
import {
  createInputTraceListener,
  traceBackendSelection,
  traceInputEvent,
  traceKeyboardCapabilities,
  traceTerminalEnvironment
} from "./input-trace.js";
import { discoverNativeWin32InputProvider } from "./native-win32-provider.js";
import type {
  CreateNodeTerminalOptions,
  Dispose,
  ResizeListener,
  TerminalHost,
  TerminalKeyEvent,
  TerminalKeyListener,
  TerminalResizeEvent,
  KeyboardCapabilitiesListener,
  KeyboardProtocolOption,
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
const kittyKeyboardLikeResponse = /^\x1b\[\?[^]*u$/;
const primaryDeviceAttributesResponse = /^\x1b\[\??[\d;]*c$/;

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

function readViewportDimension(
  ...candidates: Array<number | undefined>
): number {
  for (const candidate of candidates) {
    if (
      typeof candidate === "number" &&
      Number.isFinite(candidate) &&
      candidate > 0
    ) {
      return Math.max(1, Math.floor(candidate));
    }
  }

  return 1;
}

export function createNodeTerminal(
  options: CreateNodeTerminalOptions
): TerminalHost {
  if (!options.win32InputProvider) {
    const nativeProvider = discoverNativeWin32InputProvider();
    if (nativeProvider) {
      options = {
        ...options,
        win32InputProvider: nativeProvider
      };
    }
  }

  let started = false;
  let disposed = false;
  const resizeListeners = new Set<ResizeListener>();
  const keyListeners = new Set<TerminalKeyListener>();
  const keyboardCapabilitiesListeners = new Set<KeyboardCapabilitiesListener>();
  const platform = resolvePlatformAdapter(options);
  const inputTrace = createInputTraceListener(options.inputTrace);
  let detachStdin: Dispose = () => {};
  let resizePollTimer: ReturnType<typeof setInterval> | undefined;
  let publishedViewport: TerminalViewport = {
    width: readViewportDimension(
      options.stdout.columns,
      options.fallbackViewport?.width,
      defaultViewport.width
    ),
    height: readViewportDimension(
      options.stdout.rows,
      options.fallbackViewport?.height,
      defaultViewport.height
    )
  };
  let keyboardProbeTimer: ReturnType<typeof setTimeout> | undefined;
  let keyboardProbeDaTimer: ReturnType<typeof setTimeout> | undefined;
  let keyboardProbeState: "idle" | "kitty-query" = "idle";
  let awaitingPrimaryDeviceAttributes = false;
  let keyboardProtocolEnabled: "kitty" | "modify-other-keys" | "legacy-dual" | null = null;
  let activeStdinKind: StdinInputKind | null = null;
  let rawModeEnabled = false;
  let fallbackProtocol = fallbackInputProtocol(platform.name);
  let keyboardCapabilities = keyboardCapabilitiesForProtocol(
    fallbackProtocol
  );

  function readViewport(
    runtimeFallback: TerminalViewport = defaultViewport
  ): TerminalViewport {
    return {
      width: readViewportDimension(
        options.stdout.columns,
        runtimeFallback.width,
        options.fallbackViewport?.width,
        defaultViewport.width
      ),
      height: readViewportDimension(
        options.stdout.rows,
        runtimeFallback.height,
        options.fallbackViewport?.height,
        defaultViewport.height
      )
    };
  }

  function publishViewportIfChanged(
    source: TerminalResizeEvent["source"]
  ): void {
    const nextViewport = readViewport(publishedViewport);
    if (viewportsEqual(publishedViewport, nextViewport)) {
      return;
    }

    const previousViewport = publishedViewport;
    publishedViewport = nextViewport;
    const event: TerminalResizeEvent = {
      viewport: { ...nextViewport },
      previousViewport: { ...previousViewport },
      source
    };
    for (const listener of [...resizeListeners]) {
      listener(event);
    }
  }

  function handleStdoutResize(): void {
    publishViewportIfChanged("event");
  }

  function pollViewportIfChanged(): void {
    publishViewportIfChanged("poll");
  }

  function startWin32ResizePolling(): void {
    const intervalMs = readResizePollIntervalMs(options);

    if (!shouldPollStdoutResize(options.stdout, intervalMs)) {
      return;
    }

    resizePollTimer = setInterval(pollViewportIfChanged, intervalMs);
    resizePollTimer.unref?.();
  }

  function stopWin32ResizePolling(): void {
    if (resizePollTimer) {
      clearInterval(resizePollTimer);
      resizePollTimer = undefined;
    }

  }

  function dispatchKey(event: TerminalKeyEvent): void {
    event.protocol = keyboardCapabilities.protocol;

    if (consumeKittyProbeResponse(event)) {
      return;
    }

    traceInputEvent(
      inputTrace,
      activeStdinKind ?? fallbackStdinKind(platform.name),
      event
    );

    if (
      event.kind === "key" &&
      event.modifiers.ctrl &&
      event.key === "c" &&
      options.exitOnCtrlC !== false
    ) {
      terminal.dispose();
      return;
    }

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
    traceKeyboardCapabilities(inputTrace, activeStdinKind, next);
    for (const listener of [...keyboardCapabilitiesListeners]) {
      listener(next);
    }
  }

  function consumeKittyProbeResponse(event: TerminalKeyEvent): boolean {
    if (event.kind !== "unknown" || !event.sequence) {
      return false;
    }

    const match = event.sequence.match(kittyKeyboardResponse);
    if (keyboardProbeState === "kitty-query" && match) {
      stopKeyboardProbeTimer();
      keyboardProbeState = "idle";
      write(ANSI.enableKittyKeyboard);
      keyboardProtocolEnabled = "kitty";
      setKeyboardCapabilities("kitty");
      return true;
    }

    if (
      keyboardProbeState === "kitty-query" &&
      kittyKeyboardLikeResponse.test(event.sequence)
    ) {
      finishKeyboardProbeFallback();
      return true;
    }

    if (
      awaitingPrimaryDeviceAttributes &&
      primaryDeviceAttributesResponse.test(event.sequence)
    ) {
      awaitingPrimaryDeviceAttributes = false;
      if (keyboardProbeState === "kitty-query") {
        keyboardProbeDaTimer = setTimeout(() => {
          keyboardProbeDaTimer = undefined;
          if (keyboardProbeState === "kitty-query") {
            finishKeyboardProbeFallback();
          }
        }, 0);
        keyboardProbeDaTimer.unref?.();
      }
      return true;
    }

    return false;
  }

  function startKeyboardProtocol(): void {
    if (activeStdinKind === "win32") {
      setKeyboardCapabilities("win32");
      return;
    }

    const requested = requestedKeyboardProtocol(options);

    if (requested === "auto") {
      if (activeStdinKind !== "raw") {
        setKeyboardCapabilities(fallbackProtocol);
        return;
      }

      keyboardProbeState = "kitty-query";
      awaitingPrimaryDeviceAttributes = true;
      write(
        ANSI.queryKittyKeyboard +
        ANSI.queryPrimaryDeviceAttributes
      );
      const timeout = Math.max(
        0,
        options.keyboardProbeTimeoutMs ?? defaultKeyboardProbeTimeoutMs
      );
      keyboardProbeTimer = setTimeout(() => {
        keyboardProbeTimer = undefined;
        finishKeyboardProbeFallback();
      }, timeout);
      keyboardProbeTimer.unref?.();
      return;
    }

    if (requested === "kitty") {
      write(ANSI.enableKittyKeyboard);
      keyboardProtocolEnabled = "kitty";
      setKeyboardCapabilities("kitty");
      return;
    }

    if (requested === "modify-other-keys") {
      write(ANSI.enableModifyOtherKeys);
      keyboardProtocolEnabled = "modify-other-keys";
      setKeyboardCapabilities("modify-other-keys");
      return;
    }

    if (requested === "legacy") {
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
    stopKeyboardProbeTimer();
    if (keyboardProbeDaTimer) {
      clearTimeout(keyboardProbeDaTimer);
      keyboardProbeDaTimer = undefined;
    }
    keyboardProbeState = "idle";
    awaitingPrimaryDeviceAttributes = false;
  }

  function stopKeyboardProbeTimer(): void {
    if (keyboardProbeTimer) {
      clearTimeout(keyboardProbeTimer);
      keyboardProbeTimer = undefined;
    }
  }

  function finishKeyboardProbeFallback(): void {
    stopKeyboardProbe();
    setKeyboardCapabilities(fallbackProtocol);
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
      return started
        ? { ...publishedViewport }
        : readViewport(publishedViewport);
    },

    get keyboardCapabilities(): KeyboardCapabilities {
      return keyboardCapabilities;
    },

    start(): void {
      if (started || disposed) {
        return;
      }

      publishedViewport = readViewport(publishedViewport);
      started = true;
      traceTerminalEnvironment(inputTrace, options, platform);

      if (options.useAltScreen === true) {
        write(ANSI.enterAltScreen);
      }

      if (
        requestedKeyboardProtocol(options) !== "auto" &&
        !(platform.name === "win32" && options.win32InputProvider)
      ) {
        startKeyboardProtocol();
      }

      if (options.hideCursor === true) {
        write(ANSI.hideCursor);
      }

      if (options.stdin) {
        const stdin = options.stdin as Readable;
        const stdinInput = platform.createStdinInput({
          ...options,
          inputTrace: inputTrace ?? false
        });
        const environment = detectTerminalInputEnvironment(
          options,
          platform.name === "win32" ? { platform: "win32" } : {}
        );
        const selectedBackend = selectInputBackend(options, environment);
        activeStdinKind = stdinInput.kind;
        traceBackendSelection(
          inputTrace,
          platform,
          stdinInput.kind,
          selectedBackend.stdinAdapter === stdinInput.kind
            ? selectedBackend.reason
            : `platform-adapter-selected-${stdinInput.kind}`
        );
        const protocolBeforeAdapter = keyboardCapabilities.protocol;
        if (stdinInput.kind === "win32") {
          fallbackProtocol = "win32";
          setKeyboardCapabilities("win32");
        } else if (stdinInput.kind === "readline") {
          fallbackProtocol = "readline";
          setKeyboardCapabilities("readline");
        }
        if (keyboardCapabilities.protocol === protocolBeforeAdapter) {
          traceKeyboardCapabilities(
            inputTrace,
            stdinInput.kind,
            keyboardCapabilities
          );
        }

        const enableRawMode =
          stdinInput.kind === "raw" &&
          selectedBackend.enableRawMode;
        if (enableRawMode && options.stdin.setRawMode) {
          if (options.stdin.isTTY) {
            stdinInput.prepare(stdin);
          }

          options.stdin.setRawMode(true);
          rawModeEnabled = true;
          options.stdin.resume?.();
        } else if (options.stdin.isTTY) {
          stdinInput.prepare(stdin);
        }

        detachStdin = stdinInput.attach(stdin, dispatchKey);
      }

      if (requestedKeyboardProtocol(options) === "auto") {
        startKeyboardProtocol();
      }

      options.stdout.on?.("resize", handleStdoutResize);
      startWin32ResizePolling();
    },

    stop(): void {
      if (!started) {
        return;
      }

      stopWin32ResizePolling();
      options.stdout.off?.("resize", handleStdoutResize);
      detachStdin();
      detachStdin = () => {};

      if (
        rawModeEnabled &&
        options.stdin?.setRawMode
      ) {
        options.stdin.setRawMode(false);
      }
      rawModeEnabled = false;
      activeStdinKind = null;

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

function fallbackStdinKind(platformName: string): StdinInputKind {
  return platformName === "win32" ? "raw" : "readline";
}

function requestedKeyboardProtocol(
  options: CreateNodeTerminalOptions
): KeyboardProtocolOption | "legacy-dual" {
  if (options.keyboardProtocol) {
    return options.keyboardProtocol;
  }
  return options.enhancedKeyboard === true ? "legacy-dual" : "auto";
}
