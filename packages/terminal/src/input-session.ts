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
  traceRawInput,
  traceTerminalEnvironment
} from "./input-trace.js";
import { createInputParserSession } from "./input-parser-session.js";
import type { ResolvedTerminalProfile } from "./terminal-profile.js";
import {
  createTerminalResponseRouter,
  type TerminalResponse,
  type TerminalResponseRouter
} from "./terminal-response-router.js";
import type {
  CreateNodeTerminalOptions,
  Dispose,
  KeyboardCapabilitiesListener,
  KeyboardProtocolOption,
  StdinInputKind,
  TerminalKeyEvent,
  TerminalKeyListener
} from "./types.js";

export interface InputSessionClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface InputSession {
  readonly keyboardCapabilities: KeyboardCapabilities;
  start(): void;
  stop(): void;
  dispose(): void;
  onKey(listener: TerminalKeyListener): Dispose;
  onKeyboardCapabilitiesChange(
    listener: KeyboardCapabilitiesListener
  ): Dispose;
}

export interface InputSessionOptions {
  terminalOptions: CreateNodeTerminalOptions;
  profile: ResolvedTerminalProfile;
  writeRaw(chunk: string): boolean | void;
  onExitRequest(): void;
  responseRouter?: TerminalResponseRouter;
}

const defaultProbeTimeoutMs = 100;
const systemClock: InputSessionClock = {
  setTimeout(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    handle.unref?.();
    return handle;
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
};

export function createInputSession(
  config: InputSessionOptions
): InputSession {
  const options = config.terminalOptions;
  const { profile } = config;
  const responseRouter =
    config.responseRouter ?? createTerminalResponseRouter();
  const ownsResponseRouter = config.responseRouter === undefined;
  const clock = options.inputClock ?? systemClock;
  const trace = createInputTraceListener(options.inputTrace);
  const keyListeners = new Set<TerminalKeyListener>();
  const capabilityListeners = new Set<KeyboardCapabilitiesListener>();
  let started = false;
  let disposed = false;
  let detachBackend: Dispose = () => {};
  let rawModeEnabled = false;
  let activeKind: StdinInputKind | null = null;
  let fallbackProtocol = fallbackInputProtocol(profile.platform);
  let capabilities = keyboardCapabilitiesForProtocol(fallbackProtocol);
  let probeTimer: unknown;
  let daTimer: unknown;
  let stopExpectingKitty: Dispose | undefined;
  let stopExpectingPrimaryDa: Dispose | undefined;
  let probeState: "idle" | "kitty-query" = "idle";
  let awaitingPrimaryDa = false;
  let enabledProtocol:
    | "kitty"
    | "modify-other-keys"
    | "legacy-dual"
    | null = null;

  function setCapabilities(protocol: InputProtocol): void {
    const next = keyboardCapabilitiesForProtocol(protocol);
    if (next.protocol === capabilities.protocol) {
      return;
    }
    capabilities = next;
    traceKeyboardCapabilities(trace, activeKind, next);
    for (const listener of [...capabilityListeners]) {
      listener(next);
    }
  }

  function clearProbeTimer(): void {
    if (probeTimer !== undefined) {
      clock.clearTimeout(probeTimer);
      probeTimer = undefined;
    }
  }

  function stopProbe(): void {
    clearProbeTimer();
    if (daTimer !== undefined) {
      clock.clearTimeout(daTimer);
      daTimer = undefined;
    }
    probeState = "idle";
    awaitingPrimaryDa = false;
    stopExpectingKitty?.();
    stopExpectingKitty = undefined;
    stopExpectingPrimaryDa?.();
    stopExpectingPrimaryDa = undefined;
  }

  function fallbackProbe(): void {
    stopProbe();
    setCapabilities(fallbackProtocol);
  }

  function handleTerminalResponse(response: TerminalResponse): void {
    if (
      response.kind === "kitty-keyboard" &&
      probeState === "kitty-query"
    ) {
      if (!/^\d+$/.test(response.parameters)) {
        fallbackProbe();
        return;
      }
      clearProbeTimer();
      probeState = "idle";
      stopExpectingKitty?.();
      stopExpectingKitty = undefined;
      config.writeRaw(ANSI.enableKittyKeyboard);
      enabledProtocol = "kitty";
      setCapabilities("kitty");
      return;
    }
    if (
      response.kind === "primary-device-attributes" &&
      awaitingPrimaryDa
    ) {
      awaitingPrimaryDa = false;
      stopExpectingPrimaryDa?.();
      stopExpectingPrimaryDa = undefined;
      if (probeState === "kitty-query") {
        daTimer = clock.setTimeout(() => {
          daTimer = undefined;
          if (probeState === "kitty-query") {
            fallbackProbe();
          }
        }, 0);
      }
    }
  }

  const stopResponseListener = responseRouter.onResponse(
    handleTerminalResponse
  );

  function dispatch(event: TerminalKeyEvent): void {
    event.protocol = capabilities.protocol;
    traceInputEvent(
      trace,
      activeKind ?? fallbackStdinKind(profile.platform),
      event
    );
    if (
      event.kind === "key" &&
      event.modifiers.ctrl &&
      event.key === "c" &&
      options.exitOnCtrlC !== false
    ) {
      config.onExitRequest();
      return;
    }
    for (const listener of [...keyListeners]) {
      listener(event);
    }
  }

  function startProtocol(): void {
    if (activeKind === "win32") {
      setCapabilities("win32");
      return;
    }
    const requested = requestedProtocol(options);
    if (requested === "auto") {
      if (activeKind !== "raw") {
        setCapabilities(fallbackProtocol);
        return;
      }
      probeState = "kitty-query";
      awaitingPrimaryDa = true;
      stopExpectingKitty = responseRouter.expect("kitty-keyboard");
      stopExpectingPrimaryDa =
        responseRouter.expect("primary-device-attributes");
      config.writeRaw(ANSI.queryKittyKeyboard + ANSI.queryPrimaryDeviceAttributes);
      const timeout = Math.max(
        0,
        options.keyboardProbeTimeoutMs ?? defaultProbeTimeoutMs
      );
      probeTimer = clock.setTimeout(() => {
        probeTimer = undefined;
        fallbackProbe();
      }, timeout);
      return;
    }
    if (requested === "kitty") {
      config.writeRaw(ANSI.enableKittyKeyboard);
      enabledProtocol = "kitty";
      setCapabilities("kitty");
    } else if (requested === "modify-other-keys") {
      config.writeRaw(ANSI.enableModifyOtherKeys);
      enabledProtocol = "modify-other-keys";
      setCapabilities("modify-other-keys");
    } else if (requested === "legacy") {
      setCapabilities(fallbackProtocol);
    } else if (options.enhancedKeyboard === true) {
      config.writeRaw(ANSI.enableKittyKeyboard);
      config.writeRaw(ANSI.enableModifyOtherKeys);
      enabledProtocol = "legacy-dual";
      setCapabilities("modify-other-keys");
    }
  }

  function stopProtocol(): void {
    stopProbe();
    if (enabledProtocol === "kitty") {
      config.writeRaw(ANSI.disableKittyKeyboard);
    } else if (enabledProtocol === "modify-other-keys") {
      config.writeRaw(ANSI.disableModifyOtherKeys);
    } else if (enabledProtocol === "legacy-dual") {
      config.writeRaw(ANSI.disableModifyOtherKeys);
      config.writeRaw(ANSI.disableKittyKeyboard);
    }
    enabledProtocol = null;
    setCapabilities(fallbackProtocol);
  }

  const session: InputSession = {
    get keyboardCapabilities() {
      return capabilities;
    },
    start(): void {
      if (started || disposed) {
        return;
      }
      started = true;
      traceTerminalEnvironment(trace, options, profile.adapter);
      if (
        requestedProtocol(options) !== "auto" &&
        !(profile.platform === "win32" && options.win32InputProvider)
      ) {
        startProtocol();
      }
      if (options.stdin) {
        const stdin = options.stdin as Readable;
        const backend = profile.adapter.createStdinInput({
          ...options,
          inputTrace: trace ?? false
        });
        activeKind = backend.kind;
        traceBackendSelection(
          trace,
          profile.adapter,
          backend.kind,
          profile.inputBackend.stdinAdapter === backend.kind
            ? profile.inputBackend.reason
            : `platform-adapter-selected-${backend.kind}`
        );
        const previousProtocol = capabilities.protocol;
        if (backend.kind === "win32") {
          fallbackProtocol = "win32";
          setCapabilities("win32");
        } else if (backend.kind === "readline") {
          fallbackProtocol = "readline";
          setCapabilities("readline");
        }
        if (capabilities.protocol === previousProtocol) {
          traceKeyboardCapabilities(trace, backend.kind, capabilities);
        }
        const enableRaw =
          backend.kind === "raw" && profile.inputBackend.enableRawMode;
        if (enableRaw && options.stdin.setRawMode) {
          if (options.stdin.isTTY) {
            backend.prepare(stdin);
          }
          options.stdin.setRawMode(true);
          rawModeEnabled = true;
          options.stdin.resume?.();
        } else if (options.stdin.isTTY) {
          backend.prepare(stdin);
        }
        if (backend.kind === "raw" && backend.attachRaw) {
          const parser = createInputParserSession(dispatch, {
            escapeFlushMode: "escape",
            pasteMode: "event",
            maxPasteCodeUnits: options.maxPasteCodeUnits,
            pendingTimeoutMs: options.escapeAmbiguityTimeoutMs ?? 30,
            clock
          });
          const stopRoutedInput = responseRouter.onInput((input) => {
            parser.push(input);
            parser.flush();
          });
          let pasteTraceOpen = false;
          let traceSuffix = "";
          detachBackend = backend.attachRaw(stdin, (chunk) => {
            const filteredChunk =
              responseRouter.route(chunk).input;
            if (filteredChunk.length === 0) {
              return;
            }
            const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
            const combined = traceSuffix + text;
            const openIndex = combined.lastIndexOf("\x1b[200~");
            const closeIndex = combined.lastIndexOf("\x1b[201~");
            const containsBoundary = openIndex >= 0 || closeIndex >= 0;
            traceRawInput(
              trace,
              "raw",
              chunk,
              pasteTraceOpen || openIndex > closeIndex || containsBoundary
            );
            if (containsBoundary) {
              pasteTraceOpen = openIndex > closeIndex;
            }
            traceSuffix = combined.slice(-5);
            parser.push(filteredChunk);
          });
          const detachRaw = detachBackend;
          detachBackend = () => {
            detachRaw();
            stopRoutedInput();
            parser.reset();
            pasteTraceOpen = false;
            traceSuffix = "";
          };
        } else {
          detachBackend = backend.attach(stdin, dispatch);
        }
      }
      if (requestedProtocol(options) === "auto") {
        startProtocol();
      }
    },
    stop(): void {
      if (!started) {
        return;
      }
      detachBackend();
      detachBackend = () => {};
      if (rawModeEnabled && options.stdin?.setRawMode) {
        options.stdin.setRawMode(false);
      }
      rawModeEnabled = false;
      activeKind = null;
      stopProtocol();
      responseRouter.reset();
      started = false;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      session.stop();
      stopResponseListener?.();
      if (ownsResponseRouter) {
        responseRouter.dispose();
      }
      keyListeners.clear();
      capabilityListeners.clear();
      disposed = true;
    },
    onKey(listener): Dispose {
      if (disposed) {
        return () => {};
      }
      keyListeners.add(listener);
      return () => keyListeners.delete(listener);
    },
    onKeyboardCapabilitiesChange(listener): Dispose {
      if (disposed) {
        return () => {};
      }
      capabilityListeners.add(listener);
      return () => capabilityListeners.delete(listener);
    }
  };
  return session;
}

function fallbackInputProtocol(platform: NodeJS.Platform): InputProtocol {
  return platform === "win32" ? "windows-vt" : "legacy-vt";
}

function fallbackStdinKind(platform: NodeJS.Platform): StdinInputKind {
  return platform === "win32" ? "raw" : "readline";
}

function requestedProtocol(
  options: CreateNodeTerminalOptions
): KeyboardProtocolOption | "legacy-dual" {
  return options.keyboardProtocol ??
    (options.enhancedKeyboard === true ? "legacy-dual" : "auto");
}
