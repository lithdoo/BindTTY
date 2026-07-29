import type { Readable } from "node:stream";

import {
  keyboardCapabilitiesForProtocol,
  type InputProtocol,
  type KeyboardCapabilities
} from "@bindtty/input";
import { ANSI } from "./ansi.js";
import {
  createInputTraceListener,
  traceBackendSelection,
  traceInputEvent,
  traceKeyboardCapabilities,
  traceTerminalEnvironment
} from "./input-trace.js";
import { discoverNativeWin32InputProvider } from "./native-win32-provider.js";
import { createTerminalOutput } from "./terminal-output.js";
import { resolveTerminalProfile } from "./terminal-profile.js";
import { createResizeCoordinator } from "./resize-coordinator.js";
import type {
  CreateNodeTerminalOptions,
  Dispose,
  TerminalHost,
  TerminalKeyEvent,
  TerminalKeyListener,
  KeyboardCapabilitiesListener,
  KeyboardProtocolOption,
  StdinInputKind,
  TerminalViewport
} from "./types.js";

const defaultKeyboardProbeTimeoutMs = 100;
const kittyKeyboardResponse = /^\x1b\[\?(\d+)u$/;
const kittyKeyboardLikeResponse = /^\x1b\[\?[^]*u$/;
const primaryDeviceAttributesResponse = /^\x1b\[\??[\d;]*c$/;

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
  const keyListeners = new Set<TerminalKeyListener>();
  const keyboardCapabilitiesListeners = new Set<KeyboardCapabilitiesListener>();
  const profile = resolveTerminalProfile(options);
  const platform = profile.adapter;
  const inputTrace = createInputTraceListener(options.inputTrace);
  let detachStdin: Dispose = () => {};
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
      writeRaw(ANSI.enableKittyKeyboard);
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
      writeRaw(
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
      writeRaw(ANSI.enableKittyKeyboard);
      keyboardProtocolEnabled = "kitty";
      setKeyboardCapabilities("kitty");
      return;
    }

    if (requested === "modify-other-keys") {
      writeRaw(ANSI.enableModifyOtherKeys);
      keyboardProtocolEnabled = "modify-other-keys";
      setKeyboardCapabilities("modify-other-keys");
      return;
    }

    if (requested === "legacy") {
      setKeyboardCapabilities(fallbackProtocol);
      return;
    }

    if (options.enhancedKeyboard === true) {
      writeRaw(ANSI.enableKittyKeyboard);
      writeRaw(ANSI.enableModifyOtherKeys);
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
      writeRaw(ANSI.disableKittyKeyboard);
    } else if (keyboardProtocolEnabled === "modify-other-keys") {
      writeRaw(ANSI.disableModifyOtherKeys);
    } else if (keyboardProtocolEnabled === "legacy-dual") {
      writeRaw(ANSI.disableModifyOtherKeys);
      writeRaw(ANSI.disableKittyKeyboard);
    }

    keyboardProtocolEnabled = null;
    setKeyboardCapabilities(fallbackProtocol);
  }

  function writeRaw(chunk: string): boolean {
    return output.writeRaw(chunk);
  }

  function writeFrame(chunk: string): boolean {
    return output.present(chunk);
  }

  const terminal: TerminalHost = {
    get viewport(): TerminalViewport {
      return resize.viewport;
    },

    get keyboardCapabilities(): KeyboardCapabilities {
      return keyboardCapabilities;
    },

    start(): void {
      if (started || disposed) {
        return;
      }

      started = true;
      traceTerminalEnvironment(inputTrace, options, platform);

      if (options.useAltScreen === true) {
        writeRaw(ANSI.enterAltScreen);
      }

      if (
        requestedKeyboardProtocol(options) !== "auto" &&
        !(platform.name === "win32" && options.win32InputProvider)
      ) {
        startKeyboardProtocol();
      }

      if (options.hideCursor === true) {
        writeRaw(ANSI.hideCursor);
      }

      if (options.stdin) {
        const stdin = options.stdin as Readable;
        const stdinInput = platform.createStdinInput({
          ...options,
          inputTrace: inputTrace ?? false
        });
        const selectedBackend = profile.inputBackend;
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

      output.start();
      resize.start();
    },

    stop(): void {
      if (!started) {
        return;
      }

      resize.stop();
      output.stop();
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
        writeRaw(ANSI.showCursor);
      }

      if (options.useAltScreen === true) {
        writeRaw(ANSI.exitAltScreen);
      }

      started = false;
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      terminal.stop();
      resize.dispose();
      output.dispose();
      keyListeners.clear();
      keyboardCapabilitiesListeners.clear();
      disposed = true;
    },

    write: writeFrame,
    writeRaw,
    present: writeFrame,

    onResize(listener): Dispose {
      return resize.onResize(listener);
    },

    onDrain(listener: () => void): Dispose {
      if (disposed) {
        return () => {};
      }

      return output.onDrain(listener);
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
