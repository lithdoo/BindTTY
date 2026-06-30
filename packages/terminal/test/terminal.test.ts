import assert from "node:assert/strict";
import test from "node:test";

import { ANSI, createNodeTerminal, normalizeKeypressEvent } from "@bindtty/terminal";
import type {
  CreateNodeTerminalOptions,
  KeypressKey,
  KeypressListener,
  TerminalHost,
  TerminalKeyEvent,
  TerminalStdin,
  TerminalStdout,
  TerminalViewport
} from "@bindtty/terminal";

interface MockStdout extends TerminalStdout {
  writes: string[];
  listenerCount(): number;
  emitResize(): void;
}

interface MockStdin extends TerminalStdin {
  rawModeCalls: boolean[];
  resumeCalls: number;
  listenerCount(): number;
  emitKey(input?: string, key?: KeypressKey): void;
}

function createMockStdout(): MockStdout {
  const resizeListeners = new Set<() => void>();

  return {
    columns: 10,
    rows: 3,
    writes: [],
    write(chunk: string) {
      this.writes.push(chunk);
    },
    on(event: "resize", listener: () => void) {
      if (event === "resize") {
        resizeListeners.add(listener);
      }
    },
    off(event: "resize", listener: () => void) {
      if (event === "resize") {
        resizeListeners.delete(listener);
      }
    },
    listenerCount() {
      return resizeListeners.size;
    },
    emitResize() {
      for (const listener of [...resizeListeners]) {
        listener();
      }
    }
  };
}

function createMockStdin(): MockStdin {
  const keyListeners = new Set<KeypressListener>();

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
    on(event: "keypress", listener: KeypressListener) {
      if (event === "keypress") {
        keyListeners.add(listener);
      }
    },
    off(event: "keypress", listener: KeypressListener) {
      if (event === "keypress") {
        keyListeners.delete(listener);
      }
    },
    listenerCount() {
      return keyListeners.size;
    },
    emitKey(input?: string, key?: KeypressKey) {
      for (const listener of [...keyListeners]) {
        listener(input, key);
      }
    }
  };
}

test("exports terminal ANSI lifecycle constants", () => {
  assert.deepEqual(ANSI, {
    enterAltScreen: "\x1b[?1049h",
    exitAltScreen: "\x1b[?1049l",
    hideCursor: "\x1b[?25l",
    showCursor: "\x1b[?25h",
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
    input: "a",
    name: "a",
    ctrl: false,
    meta: false,
    shift: false,
    sequence: "a"
  };
  const options: CreateNodeTerminalOptions = {
    stdout,
    stdin,
    fallbackViewport: viewport,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true,
    exitOnCtrlC: true
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

test("start applies alternate screen cursor and raw mode lifecycle", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true
  });

  terminal.start();

  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.hideCursor
  ]);
  assert.deepEqual(stdin.rawModeCalls, [true]);
  assert.equal(stdin.resumeCalls, 1);
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
    rawMode: true
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
    rawMode: true
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
});

test("stop restores raw mode cursor and alternate screen in order", () => {
  const stdout = createMockStdout();
  const stdin = createMockStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true
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
    rawMode: true
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
    rawMode: true
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
    rawMode: true
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
  let resizeCount = 0;

  terminal.onResize(() => {
    resizeCount += 1;
  });
  stdout.emitResize();

  assert.equal(resizeCount, 0);
  assert.equal(stdout.listenerCount(), 0);

  terminal.start();

  assert.equal(stdout.listenerCount(), 1);

  stdout.emitResize();

  assert.equal(resizeCount, 1);
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
  stdout.emitResize();
  stdout.emitResize();

  assert.equal(resizeCount, 1);
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

  stdout.emitResize();

  assert.equal(resizeCount, 0);
});

test("normalizeKeypressEvent maps missing values to a stable event shape", () => {
  assert.deepEqual(normalizeKeypressEvent(undefined, undefined), {
    input: "",
    name: undefined,
    ctrl: false,
    meta: false,
    shift: false,
    sequence: undefined
  });

  assert.deepEqual(
    normalizeKeypressEvent("a", {
      name: "a",
      ctrl: true,
      meta: true,
      shift: true,
      sequence: "a"
    }),
    {
      input: "a",
      name: "a",
      ctrl: true,
      meta: true,
      shift: true,
      sequence: "a"
    }
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

  assert.deepEqual(events, [
    {
      input: "a",
      name: "a",
      ctrl: false,
      meta: false,
      shift: false,
      sequence: "a"
    }
  ]);
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
    rawMode: true
  });
  let keyCount = 0;

  terminal.onKey(() => {
    keyCount += 1;
  });

  terminal.start();
  stdin.emitKey("c", { name: "c", ctrl: true, sequence: "\x03" });
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
    {
      input: "c",
      name: "c",
      ctrl: true,
      meta: false,
      shift: false,
      sequence: "\x03"
    }
  ]);
  assert.deepEqual(stdout.writes, ["still running"]);
});
