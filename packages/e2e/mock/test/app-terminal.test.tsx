import assert from "node:assert/strict";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";

import { Button, List, ScrollView, TextInput, createApp } from "bindtty";
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

test("tsx app dispatches terminal keys through interaction focus", async () => {
  const stdout = createFakeStdout(2, 1);
  const stdin = createFakeStdin();
  const first = createSignal("A");
  const second = createSignal("B");
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <hstack>
      <text
        value={first}
        onKey={(event) => {
          if (event.name === "return") {
            first.set("X");
            return true;
          }
          return false;
        }}
      />
      <text
        value={second}
        onKey={(event) => {
          if (event.name === "return") {
            second.set("Y");
            return true;
          }
          return false;
        }}
      />
    </hstack>,
    { terminal }
  );

  app.start();

  assert.equal(stdin.listenerCount(), 1);
  assert.match(visibleText(stdout.writes.at(-1)), /AB/);
  assert.match(stdout.writes.at(-1) ?? "", /\x1b\[7mA/);

  stdin.emitKey(undefined, { name: "tab" });

  assert.match(visibleText(stdout.writes.at(-1)), /AB/);
  assert.match(stdout.writes.at(-1) ?? "", /\x1b\[7mB/);

  stdin.emitKey("\r", { name: "return" });
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /Y/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /X/);
  assert.match(stdout.writes.at(-1) ?? "", /\x1b\[7mY/);

  app.dispose();
  const writeCountAfterDispose = stdout.writes.length;

  stdin.emitKey("\r", { name: "return" });
  await nextMicrotask();

  assert.equal(stdout.writes.length, writeCountAfterDispose);
  assert.equal(stdin.listenerCount(), 0);
  assert.deepEqual(stdin.rawModeCalls, [true, false]);
});

test("tsx app dispatches terminal keys through Button widgets", async () => {
  const stdout = createFakeStdout(24, 12);
  const stdin = createFakeStdin();
  const first = createSignal("First");
  const second = createSignal("Second");
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <vstack>
      <Button
        label={first}
        onPress={() => {
          first.set("First pressed");
        }}
      />
      <Button
        label={second}
        onPress={() => {
          second.set(second.get() === "Second" ? "Enter pressed" : "Space pressed");
        }}
      />
    </vstack>,
    { terminal }
  );

  app.start();

  assert.match(visibleText(stdout.writes.at(-1)), /First/);
  assert.match(visibleText(stdout.writes.at(-1)), /Second/);

  stdin.emitKey(undefined, { name: "tab" });
  stdin.emitKey("\r", { name: "return" });
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /Enter pressed/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /First pressed/);

  stdin.emitKey(" ", { name: "space" });
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /Space/);

  app.dispose();
  const writeCountAfterDispose = stdout.writes.length;

  stdin.emitKey(" ", { name: "space" });
  await nextMicrotask();

  assert.equal(stdout.writes.length, writeCountAfterDispose);
});

test("tsx app dispatches terminal keys through TextInput widgets", async () => {
  const stdout = createFakeStdout(32, 14);
  const stdin = createFakeStdin();
  const value = createSignal("");
  const submitted = createSignal("idle");
  const action = createSignal("ready");
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <vstack>
      <TextInput
        value={value}
        placeholder="Name"
        onChange={(nextValue) => {
          value.set(nextValue);
        }}
        onSubmit={(nextValue) => {
          submitted.set(`sent:${nextValue}`);
        }}
      />
      <Button
        label={action}
        onPress={() => {
          action.set("clicked");
        }}
      />
      <text value={submitted} />
    </vstack>,
    { terminal }
  );

  app.start();

  assert.match(visibleText(stdout.writes.at(-1)), /ready/);

  stdin.emitKey("h");
  await nextMicrotask();
  stdin.emitKey("i");
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.join("")), /h/);
  assert.match(visibleText(stdout.writes.join("")), /i/);

  stdin.emitKey("\r", { name: "return" });
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /sent:hi/);

  stdin.emitKey(undefined, { name: "tab" });
  stdin.emitKey(" ", { name: "space" });
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /clicked/);

  app.dispose();
  const writeCountAfterDispose = stdout.writes.length;

  stdin.emitKey("!");
  await nextMicrotask();

  assert.equal(stdout.writes.length, writeCountAfterDispose);
});

test("tsx app clips overflowing box content without scroll offset", async () => {
  const stdout = createFakeStdout(8, 4);
  const stdin = createFakeStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <box height={2} overflow="clip">
      <text value="A" />
      <text value="B" />
      <text value="C" />
      <text value="D" />
    </box>,
    { terminal }
  );

  app.start();

  assert.match(visibleText(stdout.writes.at(-1)), /A/);
  assert.match(visibleText(stdout.writes.at(-1)), /B/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /C/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /D/);

  app.dispose();
});

test("tsx app clips and scrolls box content with signal offset", async () => {
  const stdout = createFakeStdout(8, 4);
  const stdin = createFakeStdin();
  const offset = createSignal(0);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <box height={2} overflow="clip" scrollY={offset}>
      <text value="A" />
      <text value="B" />
      <text value="C" />
      <text value="D" />
    </box>,
    { terminal }
  );

  app.start();

  assert.match(visibleText(stdout.writes.at(-1)), /A/);
  assert.match(visibleText(stdout.writes.at(-1)), /B/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /C/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /D/);

  offset.set(2);
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /C/);
  assert.match(visibleText(stdout.writes.at(-1)), /D/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /A/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /B/);

  app.dispose();
});

test("tsx app scrolls ScrollView with keyboard focus", async () => {
  const stdout = createFakeStdout(12, 5);
  const stdin = createFakeStdin();
  const offset = createSignal(0);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <ScrollView
      height={2}
      offset={offset}
      onOffsetChange={(nextOffset) => {
        offset.set(nextOffset);
      }}
    >
      <text value="A" />
      <text value="B" />
      <text value="C" />
      <text value="D" />
    </ScrollView>,
    { terminal }
  );

  app.start();

  assert.match(visibleText(stdout.writes.at(-1)), /A/);
  assert.match(visibleText(stdout.writes.at(-1)), /B/);

  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(offset.get(), 1);
  assert.match(visibleText(stdout.writes.at(-1)), /C/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /A/);

  stdin.emitKey(undefined, { name: "pagedown" });
  await nextMicrotask();

  assert.equal(offset.get(), 2);
  assert.match(visibleText(stdout.writes.at(-1)), /D/);

  stdin.emitKey(undefined, { name: "home" });
  await nextMicrotask();

  assert.equal(offset.get(), 0);
  assert.match(visibleText(stdout.writes.at(-1)), /A/);

  app.dispose();
});

test("tsx app scrolls ScrollView with pageup end and up keys", async () => {
  const stdout = createFakeStdout(12, 5);
  const stdin = createFakeStdin();
  const offset = createSignal(0);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <ScrollView
      height={2}
      offset={offset}
      onOffsetChange={(nextOffset) => {
        offset.set(nextOffset);
      }}
    >
      <text value="A" />
      <text value="B" />
      <text value="C" />
      <text value="D" />
    </ScrollView>,
    { terminal }
  );

  app.start();

  stdin.emitKey(undefined, { name: "pagedown" });
  await nextMicrotask();

  assert.equal(offset.get(), 2);
  assert.match(visibleText(stdout.writes.at(-1)), /C/);
  assert.match(visibleText(stdout.writes.at(-1)), /D/);

  stdin.emitKey(undefined, { name: "pageup" });
  await nextMicrotask();

  assert.equal(offset.get(), 0);
  assert.match(visibleText(stdout.writes.at(-1)), /A/);
  assert.match(visibleText(stdout.writes.at(-1)), /B/);

  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(offset.get(), 1);
  assert.match(visibleText(stdout.writes.at(-1)), /B/);
  assert.match(visibleText(stdout.writes.at(-1)), /C/);

  stdin.emitKey(undefined, { name: "up" });
  await nextMicrotask();

  assert.equal(offset.get(), 0);

  stdin.emitKey(undefined, { name: "end" });
  await nextMicrotask();

  assert.equal(offset.get(), 2);
  assert.match(visibleText(stdout.writes.at(-1)), /C/);
  assert.match(visibleText(stdout.writes.at(-1)), /D/);

  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(offset.get(), 2);

  app.dispose();
});

test("tsx app uses applied ScrollView layout when controlled offset is out of range", async () => {
  const stdout = createFakeStdout(12, 5);
  const stdin = createFakeStdin();
  const offset = createSignal(99);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <ScrollView
      height={2}
      offset={offset}
      onOffsetChange={(nextOffset) => {
        offset.set(nextOffset);
      }}
    >
      <text value="A" />
      <text value="B" />
      <text value="C" />
      <text value="D" />
    </ScrollView>,
    { terminal }
  );

  app.start();

  assert.equal(offset.get(), 99);
  assert.match(visibleText(stdout.writes.at(-1)), /C/);
  assert.match(visibleText(stdout.writes.at(-1)), /D/);

  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(offset.get(), 2);
  assert.match(visibleText(stdout.writes.at(-1)), /C/);
  assert.match(visibleText(stdout.writes.at(-1)), /D/);

  app.dispose();
});

test("tsx app does not scroll ScrollView when scrollOnArrow is false", async () => {
  const stdout = createFakeStdout(12, 5);
  const stdin = createFakeStdin();
  const offset = createSignal(0);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <ScrollView
      height={2}
      offset={offset}
      scrollOnArrow={false}
      onOffsetChange={(nextOffset) => {
        offset.set(nextOffset);
      }}
    >
      <text value="A" />
      <text value="B" />
      <text value="C" />
    </ScrollView>,
    { terminal }
  );

  app.start();

  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(offset.get(), 0);
  assert.match(visibleText(stdout.writes.at(-1)), /A/);

  app.dispose();
});

test("tsx app keeps TextInput arrow keys from scrolling ScrollView", async () => {
  const stdout = createFakeStdout(24, 8);
  const stdin = createFakeStdin();
  const value = createSignal("abc");
  const offset = createSignal(0);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <vstack>
      <TextInput
        value={value}
        onChange={(nextValue) => {
          value.set(nextValue);
        }}
      />
      <ScrollView
        height={2}
        offset={offset}
        onOffsetChange={(nextOffset) => {
          offset.set(nextOffset);
        }}
      >
        <text value="A" />
        <text value="B" />
        <text value="C" />
      </ScrollView>
    </vstack>,
    { terminal }
  );

  app.start();

  stdin.emitKey(undefined, { name: "right" });
  await nextMicrotask();

  assert.equal(offset.get(), 0);

  stdin.emitKey(undefined, { name: "tab" });
  await nextMicrotask();
  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(offset.get(), 1);

  app.dispose();
});

test("tsx app scrolls dynamic List data with for keys", async () => {
  const stdout = createFakeStdout(12, 5);
  const stdin = createFakeStdin();
  const offset = createSignal(0);
  const items = createSignal<readonly Item[]>([
    { id: 1, label: "A" },
    { id: 2, label: "B" },
    { id: 3, label: "C" },
    { id: 4, label: "D" }
  ]);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <List
      height={2}
      offset={offset}
      items={items}
      getKey={(item) => (item as Item).id}
      render={(item) => <text value={(item as Item).label} />}
      onOffsetChange={(nextOffset) => {
        offset.set(nextOffset);
      }}
    />,
    { terminal }
  );

  app.start();

  assert.match(visibleText(stdout.writes.at(-1)), /A/);
  assert.match(visibleText(stdout.writes.at(-1)), /B/);

  offset.set(2);
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /C/);
  assert.match(visibleText(stdout.writes.at(-1)), /D/);

  items.set([
    ...items.get(),
    { id: 5, label: "E" }
  ]);
  offset.set(3);
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /E/);

  items.set([
    { id: 3, label: "C" },
    { id: 4, label: "D" },
    { id: 5, label: "E" }
  ]);
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /D/);
  assert.match(visibleText(stdout.writes.at(-1)), /E/);

  app.dispose();
});

test("tsx app clamps List scroll offset at bottom after end and down keys", async () => {
  const stdout = createFakeStdout(20, 12);
  const stdin = createFakeStdin();
  const offset = createSignal(0);
  const items = createSignal<readonly Item[]>(
    Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      label: `line-${index + 1}`
    }))
  );
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <List
      height={6}
      offset={offset}
      items={items}
      getKey={(item) => (item as Item).id}
      render={(item) => <text value={(item as Item).label} />}
      onOffsetChange={(nextOffset) => {
        offset.set(nextOffset);
      }}
    />,
    { terminal }
  );

  app.start();

  stdin.emitKey(undefined, { name: "end" });
  await nextMicrotask();

  assert.equal(offset.get(), 14);

  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();
  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(offset.get(), 14);

  stdin.emitKey(undefined, { name: "home" });
  await nextMicrotask();

  assert.equal(offset.get(), 0);

  stdin.emitKey(undefined, { name: "up" });
  await nextMicrotask();

  assert.equal(offset.get(), 0);

  app.dispose();
});

test("tsx app edits TextInput with backspace arrows shift tab placeholder and empty submit", async () => {
  const stdout = createFakeStdout(40, 16);
  const stdin = createFakeStdin();
  const value = createSignal("");
  const submitted = createSignal("idle");
  const firstAction = createSignal("idle");
  const secondAction = createSignal("idle");
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <vstack>
      <TextInput
        value={value}
        placeholder="Name"
        onChange={(nextValue) => {
          value.set(nextValue);
        }}
        onSubmit={(nextValue) => {
          submitted.set(`sent:${nextValue}`);
        }}
      />
      <Button
        label="First"
        onPress={() => {
          firstAction.set("pressed");
        }}
      />
      <Button
        label="Second"
        onPress={() => {
          secondAction.set("pressed");
        }}
      />
      <text value={submitted} />
    </vstack>,
    { terminal }
  );

  app.start();

  stdin.emitKey(undefined, { name: "tab" });
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /Name/);

  stdin.emitKey(undefined, { name: "tab", shift: true });
  await nextMicrotask();

  stdin.emitKey("\r", { name: "return" });
  await nextMicrotask();

  assert.equal(submitted.get(), "sent:");

  stdin.emitKey("a");
  await nextMicrotask();
  stdin.emitKey("b");
  await nextMicrotask();
  stdin.emitKey("", { name: "backspace", sequence: "\x7f" });
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.join("")), /\ba\b/);
  assert.doesNotMatch(visibleText(stdout.writes.join("")), /\bab\b/);

  stdin.emitKey(undefined, { name: "left" });
  await nextMicrotask();
  stdin.emitKey("Z");
  await nextMicrotask();

  stdin.emitKey("\r", { name: "return" });
  await nextMicrotask();

  assert.equal(submitted.get(), "sent:Za");

  stdin.emitKey(undefined, { name: "tab" });
  await nextMicrotask();
  stdin.emitKey(undefined, { name: "tab" });
  await nextMicrotask();
  stdin.emitKey(undefined, { name: "tab", shift: true });
  await nextMicrotask();
  stdin.emitKey(" ", { name: "space" });
  await nextMicrotask();

  assert.equal(firstAction.get(), "pressed");
  assert.equal(secondAction.get(), "idle");

  app.dispose();
});
