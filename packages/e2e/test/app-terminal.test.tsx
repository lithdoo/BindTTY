import assert from "node:assert/strict";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";

import { createApp } from "bindtty";
import { createSignal } from "@bindtty/signal";
import { ANSI, createNodeTerminal } from "@bindtty/terminal";
import type {
  KeypressKey,
  KeypressListener,
  TerminalStdin,
  TerminalStdout
} from "@bindtty/terminal";
import type { ReadableSignal, Template } from "@bindtty/vnode";

interface FakeStdout extends TerminalStdout {
  writes: string[];
  emitResize(): void;
  listenerCount(): number;
}

interface FakeStdin extends TerminalStdin {
  rawModeCalls: boolean[];
  resumeCalls: number;
  emitKey(input?: string, key?: KeypressKey): void;
  listenerCount(): number;
}

interface Item {
  id: number;
  label: string;
}

function createFakeStdout(columns: number, rows: number): FakeStdout {
  const resizeListeners = new Set<() => void>();

  return {
    columns,
    rows,
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
    emitResize() {
      for (const listener of [...resizeListeners]) {
        listener();
      }
    },
    listenerCount() {
      return resizeListeners.size;
    }
  };
}

function createFakeStdin(): FakeStdin {
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
    emitKey(input?: string, key?: KeypressKey) {
      for (const listener of [...keyListeners]) {
        listener(input, key);
      }
    },
    listenerCount() {
      return keyListeners.size;
    }
  };
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
}

function visibleText(output: string | undefined): string {
  return stripVTControlCharacters(output ?? "");
}

function Title(props: { value: ReadableSignal<string> }): Template {
  return <text value={props.value} bold />;
}

test("tsx app renders updates resizes and disposes through the real node terminal host", async () => {
  const stdout = createFakeStdout(12, 6);
  const stdin = createFakeStdin();
  const title = createSignal("A");
  const ready = createSignal(false);
  const items = createSignal<readonly Item[]>([
    { id: 1, label: "one" }
  ]);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true
  });
  const app = createApp(
    <screen>
      <vstack>
        <Title value={title} />
        <show when={ready} fallback={<text value="wait" />}>
          <text value="ready" color="green" />
        </show>
        <for
          each={items}
          key={(item) => (item as Item).id}
        >
          {(item) => <text value={(item as Item).label} />}
        </for>
      </vstack>
    </screen>,
    { terminal }
  );

  app.start();

  assert.deepEqual(stdout.writes.slice(0, 2), [
    ANSI.enterAltScreen,
    ANSI.hideCursor
  ]);
  assert.deepEqual(stdin.rawModeCalls, [true]);
  assert.equal(stdin.resumeCalls, 1);
  assert.equal(stdout.listenerCount(), 1);
  assert.equal(stdin.listenerCount(), 1);
  assert.match(visibleText(stdout.writes[2]), /A/);
  assert.match(visibleText(stdout.writes[2]), /wait/);
  assert.match(visibleText(stdout.writes[2]), /one/);

  title.set("B");
  ready.set(true);
  items.set([
    { id: 2, label: "two" },
    { id: 1, label: "one" }
  ]);
  await nextMicrotask();

  assert.equal(stdout.writes.length, 4);
  assert.match(visibleText(stdout.writes[3]), /B/);
  assert.match(visibleText(stdout.writes[3]), /ready/);
  assert.match(visibleText(stdout.writes[3]), /two/);

  stdout.columns = 16;
  stdout.rows = 6;
  stdout.emitResize();

  assert.equal(stdout.writes.length, 5);
  assert.match(visibleText(stdout.writes[4]), /ready/);
  assert.match(visibleText(stdout.writes[4]), /two/);

  app.stop();

  assert.deepEqual(stdout.writes.slice(-2), [
    ANSI.showCursor,
    ANSI.exitAltScreen
  ]);
  assert.deepEqual(stdin.rawModeCalls, [true, false]);
  assert.equal(stdout.listenerCount(), 0);
  assert.equal(stdin.listenerCount(), 0);

  title.set("C");
  await nextMicrotask();

  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /C/);

  app.start();

  assert.deepEqual(stdout.writes.slice(-3, -1), [
    ANSI.enterAltScreen,
    ANSI.hideCursor
  ]);
  assert.match(visibleText(stdout.writes.at(-1)), /C/);
  assert.deepEqual(stdin.rawModeCalls, [true, false, true]);

  app.dispose();
  title.set("D");
  stdout.emitResize();
  await nextMicrotask();

  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /D/);
  assert.equal(stdout.listenerCount(), 0);
  assert.equal(stdin.listenerCount(), 0);
  assert.deepEqual(stdin.rawModeCalls, [true, false, true, false]);
});

test("ctrl c from fake stdin disposes the real node terminal lifecycle", () => {
  const stdout = createFakeStdout(4, 2);
  const stdin = createFakeStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true
  });

  terminal.start();
  stdin.emitKey("c", { name: "c", ctrl: true, sequence: "\x03" });
  terminal.write("ignored");

  assert.deepEqual(stdout.writes, [
    ANSI.enterAltScreen,
    ANSI.hideCursor,
    ANSI.showCursor,
    ANSI.exitAltScreen
  ]);
  assert.deepEqual(stdin.rawModeCalls, [true, false]);
  assert.equal(stdout.listenerCount(), 0);
  assert.equal(stdin.listenerCount(), 0);
});
