import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { ANSI, createNodeTerminal, DefaultPlatformAdapter, discoverNativeWin32InputProvider, mapWin32KeyRecord, normalizeKeypressEvent, parseRawChunk, RawStdinInput, ReadlineStdinInput, resolveTerminalProfile, selectInputBackend, Win32ConsoleInput, Win32PlatformAdapter } from "@bindtty/terminal";
import type {
  CreateNodeTerminalOptions,
  InputTraceRecord,
  StdinInputAdapter,
  KeypressKey,
  KeypressListener,
  TerminalHost,
  TerminalInputEnvironment,
  TerminalKeyEvent,
  TerminalResizeEvent,
  TerminalStdin,
  TerminalStdout,
  TerminalViewport
} from "@bindtty/terminal";

interface MockStdout extends TerminalStdout {
  writes: string[];
  listenerCount(): number;
  drainListenerCount(): number;
  emitResize(): void;
  emitDrain(): void;
}

interface MockStdin extends TerminalStdin {
  rawModeCalls: boolean[];
  resumeCalls: number;
  listenerCount(): number;
  keypressListenerCount(): number;
  dataListenerCount(): number;
  emitKey(input?: string, key?: KeypressKey): void;
  emitData(chunk: Buffer | string): void;
}

function createMockStdout(): MockStdout {
  const resizeListeners = new Set<() => void>();
  const drainListeners = new Set<() => void>();

  return {
    columns: 10,
    rows: 3,
    writes: [],
    write(chunk: string) {
      this.writes.push(chunk);
    },
    on(event: "resize" | "drain", listener: () => void) {
      if (event === "resize") {
        resizeListeners.add(listener);
      } else {
        drainListeners.add(listener);
      }
    },
    off(event: "resize" | "drain", listener: () => void) {
      if (event === "resize") {
        resizeListeners.delete(listener);
      } else {
        drainListeners.delete(listener);
      }
    },
    listenerCount() {
      return resizeListeners.size;
    },
    drainListenerCount() {
      return drainListeners.size;
    },
    emitResize() {
      for (const listener of [...resizeListeners]) {
        listener();
      }
    },
    emitDrain() {
      for (const listener of [...drainListeners]) {
        listener();
      }
    }
  };
}

function createMockStdin(): MockStdin {
  const keyListeners = new Set<KeypressListener>();
  const dataListeners = new Set<(chunk: Buffer | string) => void>();

  return {
    isTTY: true,
    isRaw: false,
    rawModeCalls: [],
    resumeCalls: 0,
    setRawMode(enabled: boolean) {
      this.isRaw = enabled;
      this.rawModeCalls.push(enabled);
    },
    resume() {
      this.resumeCalls += 1;
    },
    on(event: "keypress" | "data", listener: KeypressListener | ((chunk: Buffer | string) => void)) {
      if (event === "keypress") {
        keyListeners.add(listener as KeypressListener);
      }
      if (event === "data") {
        dataListeners.add(listener as (chunk: Buffer | string) => void);
      }
    },
    off(event: "keypress" | "data", listener: KeypressListener | ((chunk: Buffer | string) => void)) {
      if (event === "keypress") {
        keyListeners.delete(listener as KeypressListener);
      }
      if (event === "data") {
        dataListeners.delete(listener as (chunk: Buffer | string) => void);
      }
    },
    listenerCount() {
      return keyListeners.size + dataListeners.size;
    },
    keypressListenerCount() {
      return keyListeners.size;
    },
    dataListenerCount() {
      return dataListeners.size;
    },
    emitKey(input?: string, key?: KeypressKey) {
      for (const listener of [...keyListeners]) {
        listener(input, key);
      }
    },
    emitData(chunk: Buffer | string) {
      for (const listener of [...dataListeners]) {
        listener(chunk);
      }
    }
  };
}

function semanticText(
  text: string,
  protocol: TerminalKeyEvent["protocol"] = "legacy-vt",
  sequence = text
): TerminalKeyEvent {
  return { kind: "text", protocol, text, sequence };
}

function semanticKey(
  key: string,
  sequence: string | undefined,
  modifiers: Partial<{
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
    shift: boolean;
  }> = {},
  protocol: TerminalKeyEvent["protocol"] = "legacy-vt",
  repeat = 1
): TerminalKeyEvent {
  return {
    kind: "key",
    protocol,
    key,
    modifiers: {
      ctrl: false,
      alt: false,
      meta: false,
      shift: false,
      ...modifiers
    },
    repeat,
    sequence
  };
}

function semanticUnknown(raw: string): TerminalKeyEvent {
  return {
    kind: "unknown",
    protocol: "legacy-vt",
    raw,
    reason: "unrecognized-input-sequence",
    sequence: raw
  };
}

function inputEnvironment(
  overrides: Partial<TerminalInputEnvironment> = {}
): TerminalInputEnvironment {
  return {
    platform: "linux",
    stdinIsTTY: true,
    stdoutIsTTY: true,
    canSetRawMode: true,
    isProcessStdin: false,
    windowsTerminal: false,
    conEmu: false,
    ansicon: false,
    term: "xterm-256color",
    ...overrides
  };
}

test("input backend auto-selection owns Windows fallback policy", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const options = { stdout, stdin };

  assert.deepEqual(
    selectInputBackend(options, inputEnvironment({
      platform: "win32",
      windowsTerminal: true
    })),
    {
      stdinAdapter: "raw",
      reason: "tty-raw-input-available",
      enableRawMode: true
    }
  );
  assert.deepEqual(
    selectInputBackend(options, inputEnvironment({
      platform: "win32",
      stdinIsTTY: false,
      canSetRawMode: false
    })),
    {
      stdinAdapter: "readline",
      reason: "non-tty-readline-fallback",
      enableRawMode: false
    }
  );
});

test("input backend auto-selection prefers native Win32 records", () => {
  const options: CreateNodeTerminalOptions = {
    stdout: createMockStdout(),
    stdin: createMockStdin(),
    win32InputProvider: {
      attach() {
        return () => {};
      }
    }
  };

  assert.deepEqual(
    selectInputBackend(options, inputEnvironment({ platform: "win32" })),
    {
      stdinAdapter: "win32",
      reason: "win32-input-provider-available",
      enableRawMode: false
    }
  );
});

test("native Win32 provider discovery is platform guarded and failure safe", () => {
  let loadCalls = 0;
  const provider = {
    isAvailable() {
      return true;
    },
    attach() {
      return () => {};
    }
  };

  assert.equal(
    discoverNativeWin32InputProvider("linux", () => {
      loadCalls += 1;
      return { createWin32InputProvider: () => provider };
    }),
    undefined
  );
  assert.equal(loadCalls, 0);

  assert.equal(
    discoverNativeWin32InputProvider("win32", () => ({
      createWin32InputProvider: () => provider
    })),
    provider
  );
  assert.equal(
    discoverNativeWin32InputProvider("win32", () => {
      throw new Error("optional module unavailable");
    }),
    undefined
  );
  assert.equal(
    discoverNativeWin32InputProvider("win32", () => ({
      createWin32InputProvider: () => ({
        ...provider,
        isAvailable() {
          return false;
        }
      })
    })),
    undefined
  );
});

test("input backend explicit choices override environment with safe fallback", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();

  assert.equal(
    selectInputBackend(
      { stdout, stdin, inputBackend: "readline" },
      inputEnvironment({ platform: "win32" })
    ).stdinAdapter,
    "readline"
  );
  assert.deepEqual(
    selectInputBackend(
      { stdout, stdin, inputBackend: "raw", rawMode: false },
      inputEnvironment({ platform: "win32" })
    ),
    {
      stdinAdapter: "raw",
      reason: "explicit-raw-backend",
      enableRawMode: true
    }
  );
  assert.deepEqual(
    selectInputBackend(
      { stdout, stdin, inputBackend: "win32" },
      inputEnvironment({
        platform: "win32",
        stdinIsTTY: false,
        canSetRawMode: false
      })
    ),
    {
      stdinAdapter: "readline",
      reason: "explicit-win32-backend-unavailable; using-readline",
      enableRawMode: false
    }
  );
  assert.equal(
    selectInputBackend(
      { stdout, stdin, rawMode: false },
      inputEnvironment({ platform: "win32" })
    ).reason,
    "raw-mode-disabled"
  );

  assert.equal(
    selectInputBackend(
      {
        stdout,
        stdin,
        win32InputProvider: {
          isAvailable() {
            throw new Error("console handle unavailable");
          },
          attach() {
            return () => {};
          }
        }
      },
      inputEnvironment({ platform: "win32" })
    ).stdinAdapter,
    "raw"
  );
});

test("non-Windows auto-selection preserves readline unless raw mode is requested", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const environment = inputEnvironment({ platform: "linux" });

  assert.equal(
    selectInputBackend({ stdout, stdin }, environment).stdinAdapter,
    "readline"
  );
  assert.deepEqual(
    selectInputBackend({ stdout, stdin, rawMode: true }, environment),
    {
      stdinAdapter: "raw",
      reason: "raw-mode-requested",
      enableRawMode: true
    }
  );
});

test("exports terminal ANSI lifecycle constants", () => {
  assert.deepEqual(ANSI, {
    enterAltScreen: "\x1b[?1049h",
    exitAltScreen: "\x1b[?1049l",
    hideCursor: "\x1b[?25l",
    showCursor: "\x1b[?25h",
    beginSynchronizedOutput: "\x1b[?2026h",
    endSynchronizedOutput: "\x1b[?2026l",
    queryKittyKeyboard: "\x1b[?u",
    queryPrimaryDeviceAttributes: "\x1b[c",
    enableKittyKeyboard: "\x1b[>1u",
    disableKittyKeyboard: "\x1b[<u",
    enableModifyOtherKeys: "\x1b[>4;2m",
    disableModifyOtherKeys: "\x1b[>4;0m",
    reset: "\x1b[0m"
  });
});

test("exports terminal host contract types", () => {
  const stdout: TerminalStdout = {
    columns: 80,
    rows: 24,
    write() {}
  };
  const stdin: TerminalStdin = {
    isTTY: true,
    setRawMode() {}
  };
  const viewport: TerminalViewport = {
    width: 80,
    height: 24
  };
  const key: TerminalKeyEvent = {
    kind: "text",
    protocol: "legacy-vt",
    text: "a",
    sequence: "a"
  };
  const options: CreateNodeTerminalOptions = {
    stdout,
    stdin,
    fallbackViewport: viewport,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true,
    exitOnCtrlC: true,
    enhancedKeyboard: true
  };
  const host: TerminalHost = {
    viewport,
    start() {},
    stop() {},
    dispose() {},
    write() {},
    onResize() {
      return () => {};
    },
    onKey(listener) {
      listener(key);
      return () => {};
    }
  };

  assert.equal(options.stdout, stdout);
  assert.equal(host.viewport, viewport);
});

test("resolved terminal profile applies platform defaults once and preserves overrides", () => {
  const stdout = createMockStdout();
  stdout.isTTY = true;
  const profile = resolveTerminalProfile({
    stdout,
    platformAdapter: new Win32PlatformAdapter(),
    synchronizedOutput: false,
    resizePollIntervalMs: 7,
    resizeMinFrameIntervalMs: 11,
    resizeSettleDelayMs: 13
  });

  assert.equal(profile.platform, "win32");
  assert.equal(profile.output.tty, true);
  assert.equal(profile.output.synchronizedOutput, false);
  assert.deepEqual(profile.resize, {
    pollIntervalMs: 7,
    minFrameIntervalMs: 11,
    settleDelayMs: 13
  });
});

test("createNodeTerminal does not touch streams before start", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();

  createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true
  });

  assert.deepEqual(stdout.writes, []);
  assert.deepEqual(stdin.rawModeCalls, []);
  assert.equal(stdin.resumeCalls, 0);
});

test("write sends chunks to stdout and ignores empty chunks", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({ stdout });

  terminal.write("");
  terminal.write("hello");

  assert.deepEqual(stdout.writes, ["hello"]);
});

test(
  "write propagates stdout backpressure to the terminal host",
  () => {
    const stdout = createMockStdout();
    stdout.write = function writeBlocked(chunk: string): boolean {
      this.writes.push(chunk);
      return false;
    };
    const terminal = createNodeTerminal({ stdout });

    const accepted = terminal.write("frame");

    assert.equal(accepted, false);
    assert.deepEqual(stdout.writes, ["frame"]);
  }
);

test("write frames output atomically when synchronized output is enabled", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({
    stdout,
    synchronizedOutput: true
  });

  terminal.write("frame");

  assert.deepEqual(stdout.writes, [
    ANSI.beginSynchronizedOutput + "frame" + ANSI.endSynchronizedOutput
  ]);
});

test("writeRaw never adds synchronized frame boundaries", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({
    stdout,
    synchronizedOutput: true
  });

  terminal.writeRaw?.("\x1b[?25l");
  terminal.present?.("frame");

  assert.deepEqual(stdout.writes, [
    "\x1b[?25l",
    ANSI.beginSynchronizedOutput + "frame" + ANSI.endSynchronizedOutput
  ]);
});

test("synchronized output preserves stdout backpressure", () => {
  const stdout = createMockStdout();
  stdout.write = function writeBlocked(chunk: string): boolean {
    this.writes.push(chunk);
    return false;
  };
  const terminal = createNodeTerminal({
    stdout,
    synchronizedOutput: true
  });

  const accepted = terminal.write("frame");

  assert.equal(accepted, false);
  assert.deepEqual(stdout.writes, [
    ANSI.beginSynchronizedOutput + "frame" + ANSI.endSynchronizedOutput
  ]);
});

test("win32 TTY enables synchronized output without application wiring", () => {
  const stdout = createMockStdout();
  stdout.isTTY = true;
  const terminal = createNodeTerminal({
    stdout,
    platformAdapter: new Win32PlatformAdapter()
  });

  terminal.write("frame");

  assert.deepEqual(stdout.writes, [
    ANSI.beginSynchronizedOutput + "frame" + ANSI.endSynchronizedOutput
  ]);
});

test("redirected win32 output does not enable synchronized output", () => {
  const stdout = createMockStdout();
  stdout.isTTY = false;
  const terminal = createNodeTerminal({
    stdout,
    platformAdapter: new Win32PlatformAdapter()
  });

  terminal.write("frame");

  assert.deepEqual(stdout.writes, ["frame"]);
});

test("synchronized output can be disabled explicitly on win32 TTY", () => {
  const stdout = createMockStdout();
  stdout.isTTY = true;
  const terminal = createNodeTerminal({
    stdout,
    platformAdapter: new Win32PlatformAdapter(),
    synchronizedOutput: false
  });

  terminal.write("frame");

  assert.deepEqual(stdout.writes, ["frame"]);
});

test("terminal lifecycle writes stay outside synchronized frame boundaries", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({
    stdout,
    useAltScreen: true,
    hideCursor: true,
    keyboardProtocol: "legacy",
    synchronizedOutput: true
  });

  terminal.start();
  terminal.write("frame");
  terminal.stop();

  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.hideCursor,
    ANSI.beginSynchronizedOutput + "frame" + ANSI.endSynchronizedOutput,
    ANSI.showCursor,
    ANSI.exitAltScreen
  ]);
});

test("onDrain follows stdout drain subscription lifecycle", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({ stdout });
  let drains = 0;
  const unsubscribe = terminal.onDrain?.(() => {
    drains += 1;
  });

  assert.equal(stdout.drainListenerCount(), 0);
  terminal.start();
  assert.equal(stdout.drainListenerCount(), 1);
  stdout.emitDrain();
  assert.equal(drains, 1);

  terminal.stop();
  assert.equal(stdout.drainListenerCount(), 0);
  stdout.emitDrain();
  assert.equal(drains, 1);

  terminal.start();
  assert.equal(stdout.drainListenerCount(), 1);
  unsubscribe?.();
  stdout.emitDrain();
  assert.equal(drains, 1);
  assert.equal(stdout.drainListenerCount(), 0);
  terminal.dispose();
});

test("start applies alternate screen cursor and raw mode lifecycle", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true,
    keyboardProtocol: "legacy"
  });

  terminal.start();

  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.hideCursor
  ]);
  assert.deepEqual(stdin.rawModeCalls, [true]);
  assert.equal(stdin.resumeCalls, 1);
});

test("start and stop apply enhanced keyboard protocol when requested", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true,
    enhancedKeyboard: true
  });

  terminal.start();
  terminal.stop();

  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.enableKittyKeyboard,
    ANSI.enableModifyOtherKeys,
    ANSI.hideCursor,
    ANSI.disableModifyOtherKeys,
    ANSI.disableKittyKeyboard,
    ANSI.showCursor,
    ANSI.exitAltScreen
  ]);
});

test("auto keyboard protocol consumes Kitty probe response and updates capabilities", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const trace: InputTraceRecord[] = [];
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    keyboardProtocol: "auto",
    keyboardProbeTimeoutMs: 1000,
    inputTrace(record) {
      trace.push(record);
    }
  });
  const protocols: string[] = [];
  const keys: TerminalKeyEvent[] = [];
  terminal.onKeyboardCapabilitiesChange?.((capabilities) => {
    protocols.push(capabilities.protocol);
  });
  terminal.onKey((event) => {
    keys.push(event);
  });

  terminal.start();
  assert.equal(
    stdout.writes.at(-1),
    ANSI.queryKittyKeyboard + ANSI.queryPrimaryDeviceAttributes
  );

  stdin.emitData("\x1b[?1u");

  assert.equal(stdout.writes.at(-1), ANSI.enableKittyKeyboard);
  assert.equal(terminal.keyboardCapabilities?.protocol, "kitty");
  assert.deepEqual(protocols, ["kitty"]);
  assert.deepEqual(keys, []);
  assert.equal(
    trace.some((record) => record.recordType === "event"),
    false
  );

  terminal.stop();
  assert.equal(stdout.writes.at(-1), ANSI.disableKittyKeyboard);
});

test("auto keyboard protocol handles split response and user input in one chunk", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    keyboardProtocol: "auto",
    keyboardProbeTimeoutMs: 1000
  });
  const keys: TerminalKeyEvent[] = [];
  terminal.onKey((event) => {
    keys.push(event);
  });

  terminal.start();
  stdin.emitData("\x1b[?");
  assert.deepEqual(keys, []);
  stdin.emitData("1u\x1b[?1;2ca");

  assert.equal(terminal.keyboardCapabilities?.protocol, "kitty");
  assert.deepEqual(keys, [semanticText("a", "kitty")]);
  terminal.stop();
});

test("auto keyboard protocol falls back on primary DA without Kitty response", async () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    keyboardProtocol: "auto",
    keyboardProbeTimeoutMs: 1000
  });
  const keys: TerminalKeyEvent[] = [];
  terminal.onKey((event) => {
    keys.push(event);
  });

  terminal.start();
  stdin.emitData("\x1b[?1;2c");
  await new Promise((resolve) => setTimeout(resolve, 5));
  stdin.emitData("a");

  assert.equal(terminal.keyboardCapabilities?.protocol, "legacy-vt");
  assert.deepEqual(keys, [semanticText("a")]);
  assert.equal(stdout.writes.includes(ANSI.enableKittyKeyboard), false);
  terminal.stop();
});

test("auto keyboard protocol consumes malformed query responses and falls back safely", async () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    keyboardProtocol: "auto",
    keyboardProbeTimeoutMs: 5
  });
  const keys: TerminalKeyEvent[] = [];
  terminal.onKey((event) => {
    keys.push(event);
  });

  terminal.start();
  stdin.emitData("\x1b[?1;2u");
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(terminal.keyboardCapabilities?.protocol, "legacy-vt");
  assert.deepEqual(keys, []);
  assert.equal(stdout.writes.includes(ANSI.enableKittyKeyboard), false);
  terminal.stop();
});

test("auto keyboard protocol falls back after probe timeout with no response", async () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    keyboardProtocol: "auto",
    keyboardProbeTimeoutMs: 5
  });

  terminal.start();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(terminal.keyboardCapabilities?.protocol, "legacy-vt");
  assert.equal(stdout.writes.includes(ANSI.enableKittyKeyboard), false);
  terminal.stop();
});

test("default raw protocol negotiation restarts cleanly", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    keyboardProbeTimeoutMs: 1000
  });
  const query =
    ANSI.queryKittyKeyboard +
    ANSI.queryPrimaryDeviceAttributes;

  terminal.start();
  terminal.stop();
  terminal.start();

  assert.equal(stdout.writes.filter((chunk) => chunk === query).length, 2);
  terminal.stop();
});

test("readline backend reports readline capabilities without protocol probe", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    inputBackend: "readline"
  });

  terminal.start();

  assert.equal(terminal.keyboardCapabilities?.protocol, "readline");
  assert.deepEqual(stdout.writes, []);
  terminal.stop();
});

test("explicit keyboard protocol enables only the selected protocol", () => {
  const kittyStdout = createMockStdout();
  const kitty = createNodeTerminal({
    stdout: kittyStdout,
    keyboardProtocol: "kitty"
  });
  kitty.start();
  kitty.stop();
  assert.deepEqual(kittyStdout.writes, [
    ANSI.enableKittyKeyboard,
    ANSI.disableKittyKeyboard
  ]);

  const modifyStdout = createMockStdout();
  const modify = createNodeTerminal({
    stdout: modifyStdout,
    keyboardProtocol: "modify-other-keys"
  });
  modify.start();
  modify.stop();
  assert.deepEqual(modifyStdout.writes, [
    ANSI.enableModifyOtherKeys,
    ANSI.disableModifyOtherKeys
  ]);

  const legacyStdout = createMockStdout();
  const legacy = createNodeTerminal({
    stdout: legacyStdout,
    keyboardProtocol: "legacy",
    enhancedKeyboard: true
  });
  legacy.start();
  legacy.stop();
  assert.deepEqual(legacyStdout.writes, []);
});

test("native Win32 input bypasses VT negotiation and preserves modified keys", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  let win32Listener: ((record: Parameters<typeof mapWin32KeyRecord>[0]) => void) | undefined;
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    keyboardProtocol: "kitty",
    platformAdapter: new Win32PlatformAdapter(),
    win32InputProvider: {
      attach(listener) {
        win32Listener = listener;
        return () => {
          win32Listener = undefined;
        };
      }
    }
  });
  const keys: TerminalKeyEvent[] = [];
  terminal.onKey((event) => {
    keys.push(event);
  });

  terminal.start();
  assert.deepEqual(stdout.writes, []);
  assert.equal(terminal.keyboardCapabilities?.protocol, "win32");

  win32Listener?.({
    keyDown: true,
    virtualKeyCode: 0x71,
    scanCode: 0x3c,
    unicode: "",
    controlKeyState: 0,
    repeatCount: 1
  });
  win32Listener?.({
    keyDown: true,
    virtualKeyCode: 0x0d,
    scanCode: 0x1c,
    unicode: "\r",
    controlKeyState: 0x0008,
    repeatCount: 1
  });

  assert.deepEqual(
    keys,
    [
      {
        kind: "key",
        protocol: "win32",
        key: "f2",
        modifiers: {
          ctrl: false,
          alt: false,
          meta: false,
          shift: false
        },
        repeat: 1,
        sequence: "win32:71:3c"
      },
      {
        kind: "key",
        protocol: "win32",
        key: "enter",
        modifiers: {
          ctrl: true,
          alt: false,
          meta: false,
          shift: false
        },
        repeat: 1,
        sequence: "win32:d:1c"
      }
    ]
  );

  terminal.stop();
  assert.equal(win32Listener, undefined);
});

test("start tolerates streams without optional lifecycle APIs", () => {
  const stdout: TerminalStdout & { writes: string[] } = {
    writes: [],
    write(chunk: string) {
      this.writes.push(chunk);
    }
  };
  const terminal = createNodeTerminal({
    stdout,
    rawMode: true
  });

  terminal.start();
  terminal.stop();
  terminal.dispose();

  assert.deepEqual(stdout.writes, []);
});

test("start is idempotent", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true,
    keyboardProtocol: "legacy"
  });

  terminal.start();
  terminal.start();

  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.hideCursor
  ]);
  assert.deepEqual(stdin.rawModeCalls, [true]);
  assert.equal(stdin.resumeCalls, 1);
});

test("restart reapplies terminal lifecycle state", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true,
    keyboardProtocol: "legacy"
  });

  terminal.start();
  terminal.stop();
  terminal.start();

  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.hideCursor,
    ANSI.showCursor,
    ANSI.exitAltScreen,
    ANSI.enterAltScreen,
    ANSI.hideCursor
  ]);
  assert.deepEqual(stdin.rawModeCalls, [true, false, true]);
  assert.equal(stdin.resumeCalls, 2);
  assert.equal(stdout.listenerCount(), 1);
  assert.equal(stdin.listenerCount(), 1);
  assert.equal(stdin.dataListenerCount(), 1);
  assert.equal(stdin.keypressListenerCount(), 0);
});

test("stop restores raw mode cursor and alternate screen in order", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true,
    keyboardProtocol: "legacy"
  });

  terminal.start();
  terminal.stop();

  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.hideCursor,
    ANSI.showCursor,
    ANSI.exitAltScreen
  ]);
  assert.deepEqual(stdin.rawModeCalls, [true, false]);
});

test("stop is idempotent", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true,
    keyboardProtocol: "legacy"
  });

  terminal.start();
  terminal.stop();
  terminal.stop();

  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.hideCursor,
    ANSI.showCursor,
    ANSI.exitAltScreen
  ]);
  assert.deepEqual(stdin.rawModeCalls, [true, false]);
});

test("write remains available after stop until dispose", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({
    stdout,
    useAltScreen: true
  });

  terminal.start();
  terminal.stop();
  terminal.write("after stop");

  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.exitAltScreen,
    "after stop"
  ]);
});

test("dispose stops once clears listeners and makes write no-op", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true,
    keyboardProtocol: "legacy"
  });
  const unsubscribeResize = terminal.onResize(() => {});
  const unsubscribeKey = terminal.onKey(() => {});

  terminal.start();
  terminal.dispose();
  terminal.dispose();
  terminal.write("after dispose");
  unsubscribeResize();
  unsubscribeKey();

  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.hideCursor,
    ANSI.showCursor,
    ANSI.exitAltScreen
  ]);
  assert.deepEqual(stdin.rawModeCalls, [true, false]);
});

test("dispose after stop does not repeat terminal restore sequences", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true,
    keyboardProtocol: "legacy"
  });

  terminal.start();
  terminal.stop();
  terminal.dispose();

  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.hideCursor,
    ANSI.showCursor,
    ANSI.exitAltScreen
  ]);
  assert.deepEqual(stdin.rawModeCalls, [true, false]);
});

test("start and listener registration are no-ops after dispose", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({
    stdout,
    useAltScreen: true,
    hideCursor: true
  });

  terminal.dispose();
  terminal.start();
  terminal.onResize(() => {})();
  terminal.onKey(() => {})();
  terminal.write("ignored");

  assert.deepEqual(stdout.writes, []);
});

test("viewport reads stdout dimensions fallback and defaults", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({ stdout });
  const fallbackTerminal = createNodeTerminal({
    stdout: { write() {} },
    fallbackViewport: {
      width: 20,
      height: 5
    }
  });
  const defaultTerminal = createNodeTerminal({
    stdout: { write() {} }
  });

  assert.deepEqual(terminal.viewport, { width: 10, height: 3 });
  stdout.columns = 12;
  stdout.rows = 4;
  assert.deepEqual(terminal.viewport, { width: 12, height: 4 });
  assert.deepEqual(fallbackTerminal.viewport, { width: 20, height: 5 });
  assert.deepEqual(defaultTerminal.viewport, { width: 80, height: 24 });
});

test("start registers stdout resize listener and emits resize events", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({ stdout });
  const events: TerminalResizeEvent[] = [];

  terminal.onResize((event) => {
    events.push(event);
  });
  stdout.emitResize();

  assert.equal(events.length, 0);
  assert.equal(stdout.listenerCount(), 0);

  terminal.start();

  assert.equal(stdout.listenerCount(), 1);

  stdout.columns = 12;
  stdout.rows = 4;
  stdout.emitResize();

  assert.deepEqual(events, [
    {
      viewport: { width: 12, height: 4 },
      previousViewport: { width: 10, height: 3 },
      source: "event"
    }
  ]);
  assert.deepEqual(terminal.viewport, { width: 12, height: 4 });
});

test(
  "resize events publish only after the stdout viewport actually changes",
  async () => {
    const stdout = createMockStdout();
    stdout.isTTY = true;
    const terminal = createNodeTerminal({
      stdout,
      resizePollIntervalMs: 10
    });
    const events: TerminalResizeEvent[] = [];

    terminal.onResize((event) => {
      events.push(event);
    });

    terminal.start();
    stdout.emitResize();
    stdout.columns = 20;

    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });

    terminal.stop();
    assert.deepEqual(events, [
      {
        viewport: { width: 20, height: 3 },
        previousViewport: { width: 10, height: 3 },
        source: "poll"
      }
    ]);
  }
);

test(
  "resize event remains authoritative while polling is enabled",
  () => {
    const stdout = createMockStdout();
    stdout.isTTY = true;
    const terminal = createNodeTerminal({
      stdout,
      resizePollIntervalMs: 60_000
    });
    const events: TerminalResizeEvent[] = [];

    terminal.onResize((event) => {
      events.push(event);
    });

    terminal.start();

    // Cursor/xterm.js can expose the new viewport at event time even when a
    // later polling sample is stale. The event must not be discarded merely
    // because the Windows polling fallback is active.
    stdout.columns = 120;
    stdout.rows = 36;
    stdout.emitResize();
    stdout.columns = 10;
    stdout.rows = 3;

    terminal.stop();
    assert.deepEqual(events, [
      {
        viewport: { width: 120, height: 36 },
        previousViewport: { width: 10, height: 3 },
        source: "event"
      }
    ]);
  }
);

test(
  "configured resize burst publishes an immediate and final viewport only",
  async () => {
    const stdout = createMockStdout();
    const terminal = createNodeTerminal({
      stdout,
      resizePollIntervalMs: 0,
      resizeMinFrameIntervalMs: 80,
      resizeSettleDelayMs: 80
    });
    const events: TerminalResizeEvent[] = [];

    terminal.onResize((event) => {
      events.push(event);
    });

    terminal.start();
    for (let index = 1; index <= 50; index += 1) {
      stdout.columns = 10 + index;
      stdout.rows = 3 + (index % 5);
      stdout.emitResize();
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });

    terminal.stop();
    assert.ok(
      events.length <= 2,
      `expected at most immediate + settled events, received ${events.length}`
    );
    assert.deepEqual(events.at(-1)?.viewport, {
      width: 60,
      height: 3
    });
  }
);

test("stop cancels a pending resize frame and restart begins a new burst", async () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({
    stdout,
    resizePollIntervalMs: 0,
    resizeMinFrameIntervalMs: 80,
    resizeSettleDelayMs: 80
  });
  const events: TerminalResizeEvent[] = [];

  terminal.onResize((event) => {
    events.push(event);
  });

  terminal.start();
  stdout.columns = 11;
  stdout.emitResize();
  stdout.columns = 12;
  stdout.emitResize();
  terminal.stop();

  await new Promise((resolve) => {
    setTimeout(resolve, 120);
  });

  assert.deepEqual(events.map((event) => event.viewport), [
    { width: 11, height: 3 }
  ]);

  terminal.start();
  stdout.columns = 13;
  stdout.emitResize();
  terminal.stop();

  assert.deepEqual(events.map((event) => event.viewport), [
    { width: 11, height: 3 },
    { width: 13, height: 3 }
  ]);
});

test("resize polling detects the latest viewport when events are missing", async () => {
  const stdout = createMockStdout();
  stdout.isTTY = true;
  const terminal = createNodeTerminal({
    stdout,
    resizePollIntervalMs: 20
  });
  const events: TerminalResizeEvent[] = [];

  terminal.onResize((event) => {
    events.push(event);
  });

  terminal.start();
  stdout.columns = 11;
  stdout.columns = 12;
  stdout.columns = 13;

  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

  terminal.stop();
  assert.deepEqual(events, [
    {
      viewport: { width: 13, height: 3 },
      previousViewport: { width: 10, height: 3 },
      source: "poll"
    }
  ]);
});

test("resize event and polling fallback share one deduplicated viewport", async () => {
  const stdout = createMockStdout();
  stdout.isTTY = true;
  const terminal = createNodeTerminal({
    stdout,
    resizePollIntervalMs: 20
  });
  const events: TerminalResizeEvent[] = [];

  terminal.onResize((event) => {
    events.push(event);
  });

  terminal.start();
  stdout.columns = 11;
  stdout.emitResize();

  await new Promise((resolve) => {
    setTimeout(resolve, 30);
  });

  stdout.columns = 12;

  await new Promise((resolve) => {
    setTimeout(resolve, 30);
  });

  terminal.stop();
  assert.deepEqual(events, [
    {
      viewport: { width: 11, height: 3 },
      previousViewport: { width: 10, height: 3 },
      source: "event"
    },
    {
      viewport: { width: 12, height: 3 },
      previousViewport: { width: 11, height: 3 },
      source: "poll"
    }
  ]);
});

test("resize events ignore duplicate dimensions", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({ stdout });
  let resizeCount = 0;

  terminal.onResize(() => {
    resizeCount += 1;
  });

  terminal.start();
  stdout.emitResize();
  stdout.emitResize();

  assert.equal(resizeCount, 0);

  stdout.columns = 12;
  stdout.emitResize();
  stdout.emitResize();

  assert.equal(resizeCount, 1);
});

test("running viewport remains on the published snapshot until resize", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({ stdout });

  terminal.start();
  stdout.columns = 12;
  stdout.rows = 4;

  assert.deepEqual(terminal.viewport, { width: 10, height: 3 });

  stdout.emitResize();

  assert.deepEqual(terminal.viewport, { width: 12, height: 4 });
});

test("invalid resize dimensions keep the last published viewport", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({
    stdout,
    fallbackViewport: { width: 80, height: 24 }
  });
  let resizeCount = 0;

  terminal.onResize(() => {
    resizeCount += 1;
  });

  terminal.start();
  stdout.columns = 0;
  stdout.rows = Number.NaN;
  stdout.emitResize();

  assert.deepEqual(terminal.viewport, { width: 10, height: 3 });
  assert.equal(resizeCount, 0);
});

test("onResize unsubscribe prevents future resize notifications", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({ stdout });
  let resizeCount = 0;
  const unsubscribe = terminal.onResize(() => {
    resizeCount += 1;
  });

  terminal.start();
  unsubscribe();
  stdout.columns = 12;
  stdout.emitResize();

  assert.equal(resizeCount, 0);
  assert.equal(stdout.listenerCount(), 1);
});

test("resize listeners can unsubscribe while resize is being dispatched", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({ stdout });
  let resizeCount = 0;
  let unsubscribe = () => {};

  unsubscribe = terminal.onResize(() => {
    resizeCount += 1;
    unsubscribe();
  });

  terminal.start();
  stdout.columns = 11;
  stdout.emitResize();
  stdout.columns = 12;
  stdout.emitResize();

  assert.equal(resizeCount, 1);
});

test("win32 polls TTY stdout viewport when columns change without resize event", async (t) => {
  if (process.platform !== "win32") {
    t.skip("win32-only resize polling");
    return;
  }

  const stdout = createMockStdout();
  stdout.isTTY = true;
  const terminal = createNodeTerminal({ stdout, resizePollIntervalMs: 20 });
  let resizeCount = 0;

  terminal.onResize(() => {
    resizeCount += 1;
  });

  terminal.start();
  assert.equal(resizeCount, 0);

  stdout.columns = 20;
  await new Promise((resolve) => {
    setTimeout(resolve, 80);
  });

  assert.equal(resizeCount, 1);
  terminal.stop();
});

test("win32 resize polling is disabled when resizePollIntervalMs is 0", async (t) => {
  if (process.platform !== "win32") {
    t.skip("win32-only resize polling");
    return;
  }

  const stdout = createMockStdout();
  stdout.isTTY = true;
  const terminal = createNodeTerminal({ stdout, resizePollIntervalMs: 0 });
  let resizeCount = 0;

  terminal.onResize(() => {
    resizeCount += 1;
  });

  terminal.start();
  stdout.columns = 20;
  await new Promise((resolve) => {
    setTimeout(resolve, 80);
  });

  assert.equal(resizeCount, 0);
  terminal.stop();
});

test("stop removes stdout resize listener and restart registers it again", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({ stdout });
  let resizeCount = 0;

  terminal.onResize(() => {
    resizeCount += 1;
  });

  terminal.start();
  terminal.stop();

  assert.equal(stdout.listenerCount(), 0);

  stdout.emitResize();

  assert.equal(resizeCount, 0);

  terminal.start();
  stdout.columns = 12;
  stdout.emitResize();

  assert.equal(stdout.listenerCount(), 1);
  assert.equal(resizeCount, 1);
});

test("dispose removes stdout resize listener and clears resize listeners", () => {
  const stdout = createMockStdout();
  const terminal = createNodeTerminal({ stdout });
  let resizeCount = 0;

  terminal.onResize(() => {
    resizeCount += 1;
  });

  terminal.start();
  terminal.dispose();

  assert.equal(stdout.listenerCount(), 0);

  stdout.columns = 12;
  stdout.emitResize();

  assert.equal(resizeCount, 0);
});

test("normalizeKeypressEvent maps missing values to a stable event shape", () => {
  assert.deepEqual(
    normalizeKeypressEvent(undefined, undefined),
    semanticKey("", undefined, {}, "readline")
  );

  assert.deepEqual(
    normalizeKeypressEvent("a", {
      name: "a",
      ctrl: true,
      meta: true,
      shift: true,
      sequence: "a"
    }),
    semanticKey(
      "a",
      "a",
      { ctrl: true, alt: true, meta: false, shift: true },
      "readline"
    )
  );
});

test("start registers stdin keypress listener and emits normalized key events", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({ stdout, stdin });
  const events: TerminalKeyEvent[] = [];

  terminal.onKey((event) => {
    events.push(event);
  });
  stdin.emitKey("a", { name: "a", sequence: "a" });

  assert.deepEqual(events, []);
  assert.equal(stdin.listenerCount(), 0);

  terminal.start();

  assert.equal(stdin.listenerCount(), 1);

  stdin.emitKey("a", { name: "a", sequence: "a" });

  assert.deepEqual(events, [semanticText("a", "readline")]);
});

test("onKey unsubscribe prevents future key notifications", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({ stdout, stdin });
  let keyCount = 0;
  const unsubscribe = terminal.onKey(() => {
    keyCount += 1;
  });

  terminal.start();
  unsubscribe();
  stdin.emitKey("a", { name: "a" });

  assert.equal(keyCount, 0);
  assert.equal(stdin.listenerCount(), 1);
  assert.equal(stdin.keypressListenerCount(), 1);
  assert.equal(stdin.dataListenerCount(), 0);
});

test("key listeners can unsubscribe while keypress is being dispatched", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({ stdout, stdin });
  let keyCount = 0;
  let unsubscribe = () => {};

  unsubscribe = terminal.onKey(() => {
    keyCount += 1;
    unsubscribe();
  });

  terminal.start();
  stdin.emitKey("a", { name: "a" });
  stdin.emitKey("b", { name: "b" });

  assert.equal(keyCount, 1);
});

test("stop removes stdin keypress listener and restart registers it again", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({ stdout, stdin });
  let keyCount = 0;

  terminal.onKey(() => {
    keyCount += 1;
  });

  terminal.start();
  terminal.stop();

  assert.equal(stdin.listenerCount(), 0);

  stdin.emitKey("a", { name: "a" });

  assert.equal(keyCount, 0);

  terminal.start();
  stdin.emitKey("a", { name: "a" });

  assert.equal(stdin.listenerCount(), 1);
  assert.equal(keyCount, 1);
});

test("dispose removes stdin keypress listener and clears key listeners", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({ stdout, stdin });
  let keyCount = 0;

  terminal.onKey(() => {
    keyCount += 1;
  });

  terminal.start();
  terminal.dispose();

  assert.equal(stdin.listenerCount(), 0);

  stdin.emitKey("a", { name: "a" });

  assert.equal(keyCount, 0);
});

test("ctrl c disposes terminal when exitOnCtrlC is enabled", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true,
    keyboardProtocol: "legacy"
  });
  let keyCount = 0;

  terminal.onKey(() => {
    keyCount += 1;
  });

  terminal.start();
  stdin.emitData("\x03");
  terminal.write("ignored");

  assert.equal(keyCount, 0);
  assert.equal(stdin.listenerCount(), 0);
  assert.deepEqual(stdin.rawModeCalls, [true, false]);
  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.hideCursor,
    ANSI.showCursor,
    ANSI.exitAltScreen
  ]);
});

test("ctrl c is dispatched when exitOnCtrlC is disabled", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    exitOnCtrlC: false
  });
  const events: TerminalKeyEvent[] = [];

  terminal.onKey((event) => {
    events.push(event);
  });

  terminal.start();
  stdin.emitKey("c", { name: "c", ctrl: true, sequence: "\x03" });
  terminal.write("still running");

  assert.equal(stdin.listenerCount(), 1);
  assert.deepEqual(events, [
    semanticKey("c", "\x03", { ctrl: true }, "readline")
  ]);
  assert.deepEqual(stdout.writes, ["still running"]);
});

test("parseRawChunk maps printable characters without name for text input", () => {
  const events = [...parseRawChunk("ab")];

  assert.deepEqual(events, [semanticText("a"), semanticText("b")]);
  assert.equal(events[0]?.kind, "text");
});

test("parseRawChunk maps non-BMP printable characters as one input event", () => {
  const events = [...parseRawChunk("中🙂")];

  assert.deepEqual(events, [semanticText("中"), semanticText("🙂")]);
});

test("parseRawChunk maps control keys used by raw stdin adapter", () => {
  const events = [...parseRawChunk("\r\x7f\x03\t ")];

  assert.deepEqual(events, [
    semanticKey("enter", "\r"),
    semanticKey("backspace", "\x7f"),
    semanticKey("c", "\x03", { ctrl: true }),
    semanticKey("tab", "\t"),
    semanticText(" ")
  ]);
});

test("parseRawChunk maps CSI and SS3 navigation keys", () => {
  const events = [
    ...parseRawChunk("\x1b[B\x1b[A\x1b[C\x1b[D"),
    ...parseRawChunk("\x1b[5~\x1b[6~"),
    ...parseRawChunk("\x1b[H\x1b[F"),
    ...parseRawChunk("\x1bOB")
  ];

  assert.deepEqual(
    events.map((event) => event.kind === "key" ? event.key : event.kind),
    [
      "down",
      "up",
      "right",
      "left",
      "pageup",
      "pagedown",
      "home",
      "end",
      "down"
    ]
  );
});

test("parseRawChunk maps common modified Enter sequences", () => {
  assert.deepEqual(
    [
      ...parseRawChunk("\x1b[13;5u"),
      ...parseRawChunk("\x1b[10;5u"),
      ...parseRawChunk("\x1b[13;5:3u"),
      ...parseRawChunk("\x1b[27;5;13~"),
      ...parseRawChunk("\x1b[13;5~")
    ],
    [
      semanticKey("enter", "\x1b[13;5u", { ctrl: true }),
      semanticKey("enter", "\x1b[10;5u", { ctrl: true }),
      semanticKey("enter", "\x1b[13;5:3u", { ctrl: true }),
      semanticKey("enter", "\x1b[27;5;13~", { ctrl: true }),
      semanticKey("enter", "\x1b[13;5~", { ctrl: true })
    ]
  );
});

test("parseRawChunk consumes unknown CSI sequences without leaking text input", () => {
  assert.deepEqual([...parseRawChunk("a\x1b[99;9~\x1b[99;9:1ub")], [
    semanticText("a"),
    semanticUnknown("\x1b[99;9~"),
    semanticUnknown("\x1b[99;9:1u"),
    semanticText("b")
  ]);
});

test("parseRawChunk maps Windows console prefixed arrow keys", () => {
  const events = [...parseRawChunk("\xE0H\xE0P\xE0M\xE0K\x00I\x00Q")];

  assert.deepEqual(events.map((event) => event.kind === "key" ? event.key : event.kind), [
    "up",
    "down",
    "right",
    "left",
    "pageup",
    "pagedown"
  ]);
});

test("default platform selects RawStdinInput when rawMode is enabled", () => {
  const platform = new DefaultPlatformAdapter();
  const stdout = createMockStdout();
  assert.equal(platform.createStdinInput({ stdout, rawMode: true }).kind, "raw");
  assert.ok(platform.createStdinInput({ stdout, rawMode: true }) instanceof RawStdinInput);
});

test("default platform keeps ReadlineStdinInput when rawMode is disabled", () => {
  const platform = new DefaultPlatformAdapter();
  const stdout = createMockStdout();
  assert.equal(platform.createStdinInput({ stdout }).kind, "readline");
  assert.ok(platform.createStdinInput({ stdout }) instanceof ReadlineStdinInput);
});

test("createNodeTerminal with rawMode uses raw stdin parser", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({ stdout, stdin, rawMode: true });
  const events: TerminalKeyEvent[] = [];
  terminal.onKey((event) => { events.push(event); });
  terminal.start();
  stdin.emitData("\x1b[A");
  terminal.stop();
  assert.deepEqual(events.map((event) => event.kind === "key" ? event.key : event.kind), ["up"]);
  assert.equal(stdin.dataListenerCount(), 0);
});

test("createNodeTerminal publishes standalone Escape using the configured ambiguity timeout", async () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    escapeAmbiguityTimeoutMs: 0
  });
  const events: TerminalKeyEvent[] = [];
  terminal.onKey((event) => events.push(event));
  terminal.start();

  stdin.emitData("\x1b");
  await new Promise((resolve) => setTimeout(resolve, 5));
  terminal.stop();

  assert.deepEqual(events, [semanticKey("escape", "\x1b")]);
});

test("TerminalHost onKey publishes bracketed paste as one semantic event", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({ stdout, stdin, rawMode: true });
  const events: TerminalKeyEvent[] = [];
  terminal.onKey((event) => events.push(event));
  terminal.start();

  stdin.emitData("\x1b[200~first\n中🙂\x1b[201~");
  terminal.stop();

  assert.deepEqual(events, [{
    kind: "paste",
    text: "first\n中🙂",
    protocol: "legacy-vt",
    sequence: "\x1b[200~first\n中🙂\x1b[201~"
  }]);
});
test("stdinInputAdapter injection selects a fixed stdin reader", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const fixedStdinInput: StdinInputAdapter = {
    kind: "readline",
    prepare() {},
    attach() { return () => {}; }
  };
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    stdinInputAdapter: fixedStdinInput
  });

  terminal.start();

  assert.equal(stdin.listenerCount(), 0);
});

test("RawStdinInput preserves split raw input sequences", () => {
  const stdin = new PassThrough();
  const adapter = new RawStdinInput();
  const events: TerminalKeyEvent[] = [];
  const detach = adapter.attach(stdin, (event) => {
    events.push(event);
  });

  stdin.write("\x1b[13;");
  stdin.write("5u");
  detach();

  assert.deepEqual(events, [
    semanticKey("enter", "\x1b[13;5u", { ctrl: true })
  ]);
});

test("RawStdinInput preserves split SS3 sequences atomically", () => {
  const stdin = new PassThrough();
  const adapter = new RawStdinInput();
  const events: TerminalKeyEvent[] = [];
  const detach = adapter.attach(stdin, (event) => {
    events.push(event);
  });

  stdin.write("\x1bO");
  assert.deepEqual(events, []);
  stdin.write("Q");
  detach();

  assert.deepEqual(events, [semanticKey("f2", "\x1bOQ")]);
});

test("RawStdinInput distinguishes complete Alt text from standalone Escape", () => {
  const stdin = new PassThrough();
  const adapter = new RawStdinInput();
  const events: TerminalKeyEvent[] = [];
  const detach = adapter.attach(stdin, (event) => {
    events.push(event);
  });

  stdin.write("\x1bx");
  stdin.write("\x1b");
  detach();

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], semanticKey("x", "\x1bx", { alt: true }));
});

test("RawStdinInput detach discards an incomplete parser sequence", () => {
  const stdin = new PassThrough();
  const adapter = new RawStdinInput();
  const firstEvents: TerminalKeyEvent[] = [];
  const secondEvents: TerminalKeyEvent[] = [];
  const firstDetach = adapter.attach(stdin, (event) => {
    firstEvents.push(event);
  });

  stdin.write("\x1b[13;");
  firstDetach();

  const secondDetach = adapter.attach(stdin, (event) => {
    secondEvents.push(event);
  });
  stdin.write("5u");
  secondDetach();

  assert.deepEqual(firstEvents, []);
  assert.deepEqual(
    secondEvents.map((event) => event.kind === "text" ? event.text : event.kind),
    ["5", "u"]
  );
});

test("RawStdinInput publishes standalone Escape after the ambiguity timeout", () => {
  const stdin = new PassThrough();
  const callbacks = new Map<number, () => void>();
  let nextTimer = 1;
  const adapter = new RawStdinInput(undefined, {
    escapeAmbiguityTimeoutMs: 25,
    clock: {
      setTimeout(callback, delayMs) {
        assert.equal(delayMs, 25);
        const id = nextTimer++;
        callbacks.set(id, callback);
        return id;
      },
      clearTimeout(handle) {
        callbacks.delete(handle as number);
      }
    }
  });
  const events: TerminalKeyEvent[] = [];
  const detach = adapter.attach(stdin, (event) => events.push(event));

  stdin.write("\x1b");
  assert.deepEqual(events, []);
  assert.equal(callbacks.size, 1);
  callbacks.values().next().value?.();

  assert.deepEqual(events, [semanticKey("escape", "\x1b")]);
  detach();
});

test("RawStdinInput cancels the ambiguity timer when a split CSI completes", () => {
  const stdin = new PassThrough();
  const callbacks = new Map<number, () => void>();
  let nextTimer = 1;
  const adapter = new RawStdinInput(undefined, {
    escapeAmbiguityTimeoutMs: 30,
    clock: {
      setTimeout(callback) {
        const id = nextTimer++;
        callbacks.set(id, callback);
        return id;
      },
      clearTimeout(handle) {
        callbacks.delete(handle as number);
      }
    }
  });
  const events: TerminalKeyEvent[] = [];
  const detach = adapter.attach(stdin, (event) => events.push(event));

  stdin.write("\x1b[13;");
  assert.equal(callbacks.size, 1);
  stdin.write("5u");

  assert.equal(callbacks.size, 0);
  assert.deepEqual(events, [
    semanticKey("enter", "\x1b[13;5u", { ctrl: true })
  ]);
  detach();
});

test("RawStdinInput detach cancels a pending ambiguity timer", () => {
  const stdin = new PassThrough();
  const callbacks = new Map<number, () => void>();
  const adapter = new RawStdinInput(undefined, {
    clock: {
      setTimeout(callback) {
        callbacks.set(1, callback);
        return 1;
      },
      clearTimeout(handle) {
        callbacks.delete(handle as number);
      }
    }
  });
  const events: TerminalKeyEvent[] = [];
  const detach = adapter.attach(stdin, (event) => events.push(event));

  stdin.write("\x1b");
  assert.equal(callbacks.size, 1);
  detach();

  assert.equal(callbacks.size, 0);
  assert.deepEqual(events, []);
});

test("RawStdinInput rejects invalid ambiguity timeout values", () => {
  assert.throws(
    () => new RawStdinInput(undefined, { escapeAmbiguityTimeoutMs: -1 }),
    /finite non-negative/
  );
  assert.throws(
    () => new RawStdinInput(undefined, { escapeAmbiguityTimeoutMs: Number.NaN }),
    /finite non-negative/
  );
});

test("RawStdinInput traces raw bytes without changing dispatch", () => {
  const stdin = new PassThrough();
  const records: InputTraceRecord[] = [];
  const events: TerminalKeyEvent[] = [];
  const adapter = new RawStdinInput((record) => {
    records.push(record);
  });
  const detach = adapter.attach(stdin, (event) => {
    events.push(event);
  });

  stdin.write(Buffer.from("\x1bOQ"));
  detach();

  assert.equal(records[0]?.rawHex, "1b4f51");
  assert.equal(records[0]?.rawLength, 3);
  assert.equal(records[0]?.adapter, "raw");
  assert.equal(records[0]?.recordType, "raw");
  assert.equal(records.length, 1);
  assert.equal(events[0]?.kind, "key");
  assert.equal(events[0]?.kind === "key" ? events[0].key : undefined, "f2");
});

test("terminal trace records environment backend capabilities raw input and final event", () => {
  const stdin = createMockStdin();
  const stdout = createMockStdout();
  stdout.isTTY = true;
  const records: InputTraceRecord[] = [];
  const terminal = createNodeTerminal({
    stdin,
    stdout,
    rawMode: true,
    platformAdapter: new DefaultPlatformAdapter(),
    inputTrace(record) {
      records.push(record);
    }
  });

  terminal.start();
  stdin.emitData(Buffer.from("\x1bOQ"));
  terminal.stop();

  assert.deepEqual(
    records.map((record) => record.recordType),
    ["environment", "backend", "capabilities", "raw", "event"]
  );
  assert.equal(records[0]?.environment?.platform, process.platform);
  assert.equal(records[0]?.environment?.stdinIsTTY, true);
  assert.equal(records[0]?.environment?.stdoutIsTTY, true);
  assert.deepEqual(records[1]?.backend, {
    platformAdapter: "default",
    stdinAdapter: "raw",
    reason: "raw-mode-requested"
  });
  assert.equal(records[2]?.capabilities?.protocol, "legacy-vt");
  assert.equal(records[3]?.rawHex, "1b4f51");
  assert.equal(records[4]?.event?.key, "f2");
  assert.equal(records[4]?.event?.kind, "key");
  assert.equal(records[4]?.event?.protocol, "legacy-vt");
  assert.equal(records[4]?.event?.repeat, 1);
});

test("RawStdinInput trace redacts bracketed paste across chunks", () => {
  const stdin = new PassThrough();
  const records: InputTraceRecord[] = [];
  const adapter = new RawStdinInput((record) => {
    records.push(record);
  });
  const detach = adapter.attach(stdin, () => {});

  stdin.write("\x1b[20");
  stdin.write("0~secret");
  stdin.write("-continued");
  stdin.write("\x1b[201~");
  detach();

  const rawRecords = records.filter((record) => record.rawLength !== undefined);
  assert.equal(rawRecords[0]?.rawHex, "1b5b3230");
  assert.deepEqual(
    rawRecords.slice(1).map(({ rawHex, redacted }) => ({ rawHex, redacted })),
    [
      { rawHex: undefined, redacted: "paste" },
      { rawHex: undefined, redacted: "paste" },
      { rawHex: undefined, redacted: "paste" }
    ]
  );
  assert.equal(JSON.stringify(records).includes("secret"), false);
});

test("RawStdinInput publishes bracketed paste as one semantic event", () => {
  const stdin = new PassThrough();
  const adapter = new RawStdinInput();
  const events: TerminalKeyEvent[] = [];
  const detach = adapter.attach(stdin, (event) => events.push(event));

  stdin.write("\x1b[200~A中🙂\n");
  stdin.write("e\u0301\x1b[201~");
  detach();

  assert.deepEqual(events, [{
    kind: "paste",
    text: "A中🙂\ne\u0301",
    protocol: "legacy-vt",
    sequence: "\x1b[200~A中🙂\ne\u0301\x1b[201~"
  }]);
});

test("mapWin32KeyRecord preserves F2 and Ctrl Enter semantics", () => {
  assert.deepEqual(mapWin32KeyRecord({
    keyDown: true,
    virtualKeyCode: 0x71,
    scanCode: 0x3c,
    unicode: "",
    controlKeyState: 0,
    repeatCount: 1
  }), semanticKey("f2", "win32:71:3c", {}, "win32"));

  assert.deepEqual(mapWin32KeyRecord({
    keyDown: true,
    virtualKeyCode: 0x0d,
    scanCode: 0x1c,
    unicode: "\r",
    controlKeyState: 0x0008,
    repeatCount: 1
  }), semanticKey(
    "enter",
    "win32:d:1c",
    { ctrl: true },
    "win32"
  ));

  assert.deepEqual(mapWin32KeyRecord({
    keyDown: true,
    virtualKeyCode: 0x43,
    scanCode: 0x2e,
    unicode: "\x03",
    controlKeyState: 0x0008,
    repeatCount: 1
  }), semanticKey(
    "c",
    "win32:43:2e",
    { ctrl: true },
    "win32"
  ));
});

test("mapWin32KeyRecord covers F1-F24 and modifier combinations", () => {
  for (let index = 0; index < 24; index += 1) {
    const virtualKeyCode = 0x70 + index;
    const event = mapWin32KeyRecord({
      keyDown: true,
      virtualKeyCode,
      scanCode: index,
      unicode: "",
      controlKeyState: 0x0008 | 0x0002 | 0x0010,
      repeatCount: index + 1
    });

    assert.deepEqual(
      event,
      semanticKey(
        `f${index + 1}`,
        `win32:${virtualKeyCode.toString(16)}:${index.toString(16)}`,
        {
          ctrl: true,
          alt: true,
          meta: false,
          shift: true
        },
        "win32",
        index + 1
      )
    );
  }
});

test("Win32ConsoleInput ignores key-up and expands repeat count", () => {
  let listener: ((record: Parameters<typeof mapWin32KeyRecord>[0]) => void) | undefined;
  const provider = {
    attach(next: typeof listener) {
      listener = next;
      return () => {
        listener = undefined;
      };
    }
  };
  const adapter = new Win32ConsoleInput(provider);
  const events: TerminalKeyEvent[] = [];
  const detach = adapter.attach(new PassThrough(), (event) => {
    events.push(event);
  });

  listener?.({
    keyDown: false,
    virtualKeyCode: 0x71,
    scanCode: 0x3c,
    unicode: "",
    controlKeyState: 0,
    repeatCount: 1
  });
  listener?.({
    keyDown: true,
    virtualKeyCode: 0x71,
    scanCode: 0x3c,
    unicode: "",
    controlKeyState: 0,
    repeatCount: 2
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, "key");
  assert.equal(events[0]?.kind === "key" ? events[0].key : undefined, "f2");
  assert.equal(events[0]?.kind === "key" ? events[0].repeat : undefined, 2);
  detach();
});

test("Win32ConsoleInput combines UTF-16 surrogate records and repeats text", () => {
  let listener: ((record: Parameters<typeof mapWin32KeyRecord>[0]) => void) | undefined;
  const adapter = new Win32ConsoleInput({
    attach(next) {
      listener = next;
      return () => {
        listener = undefined;
      };
    }
  });
  const events: TerminalKeyEvent[] = [];
  const detach = adapter.attach(new PassThrough(), (event) => {
    events.push(event);
  });
  const base = {
    keyDown: true,
    virtualKeyCode: 0,
    scanCode: 0,
    controlKeyState: 0,
    repeatCount: 1
  };

  listener?.({ ...base, unicode: "\ud83d" });
  assert.deepEqual(events, []);
  listener?.({ ...base, unicode: "\ude42" });
  listener?.({ ...base, unicode: "中", repeatCount: 2 });

  assert.deepEqual(events, [
    semanticText("🙂", "win32", "win32:0:0"),
    semanticText("中中", "win32", "win32:0:0")
  ]);
  detach();
});

test("Win32PlatformAdapter selects native record provider when supplied", () => {
  const provider = {
    attach() {
      return () => {};
    }
  };
  const adapter = new Win32PlatformAdapter().createStdinInput({
    stdout: createMockStdout(),
    win32InputProvider: provider
  });

  assert.ok(adapter instanceof Win32ConsoleInput);
});

test("Win32PlatformAdapter auto-selects raw input without application wiring", () => {
  const stdin = createMockStdin();
  const adapter = new Win32PlatformAdapter().createStdinInput({
    stdout: createMockStdout(),
    stdin
  });

  assert.equal(adapter.kind, "raw");
});

test("Win32 terminal auto-selection owns raw mode lifecycle and trace reason", () => {
  const stdin = createMockStdin();
  const trace: InputTraceRecord[] = [];
  const terminal = createNodeTerminal({
    stdout: createMockStdout(),
    stdin,
    platformAdapter: new Win32PlatformAdapter(),
    inputTrace(record) {
      trace.push(record);
    }
  });

  terminal.start();
  assert.deepEqual(stdin.rawModeCalls, [true]);
  assert.equal(stdin.dataListenerCount(), 1);
  assert.equal(stdin.keypressListenerCount(), 0);
  assert.equal(
    trace.find((record) => record.recordType === "backend")?.backend?.reason,
    "tty-raw-input-available"
  );

  terminal.stop();
  assert.deepEqual(stdin.rawModeCalls, [true, false]);
});
