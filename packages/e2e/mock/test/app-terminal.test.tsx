import assert from "node:assert/strict";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";

import { Button, Checkbox, HScrollView, List, ProgressBar, ScrollView, Select, VScrollView, TextInput } from "@bindtty/widgets";
import { createApp } from "bindtty";
import type { LayoutNode } from "@bindtty/layout";
import { createSignal } from "@bindtty/signal";
import { ANSI, createNodeTerminal } from "@bindtty/terminal";
import type {
  KeypressKey,
  KeypressListener,
  TerminalStdin,
  TerminalStdout
} from "@bindtty/terminal";
import type { MountedElementApi, ReadableSignal, Template } from "@bindtty/vnode";

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

function lastFrameText(stdout: FakeStdout): string {
  return visibleText(stdout.writes.at(-1));
}

function columnIndexOf(text: string, needle: string): number {
  for (const line of text.split("\n")) {
    const index = line.indexOf(needle);

    if (index !== -1) {
      return index;
    }
  }

  return -1;
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

test("tsx app toggles Checkbox with Space", async () => {
  const stdout = createFakeStdout(24, 12);
  const stdin = createFakeStdin();
  const checked = createSignal(false);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <Checkbox
      label="Agree"
      checked={checked}
      onChange={(nextChecked) => {
        checked.set(nextChecked);
      }}
    />,
    { terminal }
  );

  app.start();

  assert.match(visibleText(stdout.writes.at(-1)), /\[ \] Agree/);

  stdin.emitKey(" ", { name: "space" });
  await nextMicrotask();

  assert.equal(checked.get(), true);
  stdout.emitResize();
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /\[x\] Agree/);

  app.dispose();
});

test("tsx app changes Select with Down", async () => {
  const stdout = createFakeStdout(24, 12);
  const stdin = createFakeStdin();
  const value = createSignal("a");
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <Select
      label="Pick"
      height={3}
      options={[
        { value: "a", label: "Option A" },
        { value: "b", label: "Option B" },
        { value: "c", label: "Option C" }
      ]}
      value={value}
      onChange={(nextValue) => {
        value.set(nextValue);
      }}
    />,
    { terminal }
  );

  app.start();

  assert.match(visibleText(stdout.writes.at(-1)), /> Option A/);

  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(value.get(), "b");
  stdout.emitResize();
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /> Option B/);

  app.dispose();
});

test("tsx app ProgressBar updates when value signal changes", async () => {
  const stdout = createFakeStdout(40, 6);
  const progress = createSignal(0);
  const terminal = createNodeTerminal({
    stdout,
    stdin: createFakeStdin(),
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <ProgressBar width={10} value={progress} max={100} />,
    { terminal }
  );

  app.start();
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /░/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /█/);

  progress.set(50);
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /█/);

  app.dispose();
});

test("tsx app ProgressBar renders label and percent", async () => {
  const stdout = createFakeStdout(40, 6);
  const progress = createSignal(25);
  const terminal = createNodeTerminal({
    stdout,
    stdin: createFakeStdin(),
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <ProgressBar
      width={8}
      value={progress}
      max={100}
      label="Load"
      showPercent={true}
    />,
    { terminal }
  );

  app.start();
  await nextMicrotask();

  const rendered = visibleText(stdout.writes.at(-1));
  assert.match(rendered, /Load/);
  assert.match(rendered, /25%/);

  app.dispose();
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

test("tsx app scrolls VScrollView with keyboard focus", async () => {
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
    <VScrollView
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
    </VScrollView>,
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

test("tsx app scrolls VScrollView with pageup end and up keys", async () => {
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
    <VScrollView
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
    </VScrollView>,
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

test("tsx app uses applied VScrollView layout when controlled offset is out of range", async () => {
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
    <VScrollView
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
    </VScrollView>,
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

test("tsx app does not scroll VScrollView when scrollOnArrow is false", async () => {
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
    <VScrollView
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
    </VScrollView>,
    { terminal }
  );

  app.start();

  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(offset.get(), 0);
  assert.match(visibleText(stdout.writes.at(-1)), /A/);

  app.dispose();
});

test("tsx app keeps TextInput arrow keys from scrolling VScrollView", async () => {
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
      <VScrollView
        height={2}
        offset={offset}
        onOffsetChange={(nextOffset) => {
          offset.set(nextOffset);
        }}
      >
        <text value="A" />
        <text value="B" />
        <text value="C" />
      </VScrollView>
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

test("tsx app List stickToBottom auto scrolls on push", async () => {
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
      stickToBottom={true}
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
  await nextMicrotask();

  assert.equal(offset.get(), 2);
  assert.match(visibleText(stdout.writes.at(-1)), /C/);
  assert.match(visibleText(stdout.writes.at(-1)), /D/);

  items.set([
    ...items.get(),
    { id: 5, label: "E" }
  ]);
  await nextMicrotask();

  assert.equal(offset.get(), 3);
  assert.match(visibleText(stdout.writes.at(-1)), /D/);
  assert.match(visibleText(stdout.writes.at(-1)), /E/);

  app.dispose();
});

test("tsx app List stickToBottom detaches after up and re-attaches after end", async () => {
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
      stickToBottom={true}
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
  await nextMicrotask();

  stdin.emitKey(undefined, { name: "up" });
  await nextMicrotask();

  assert.equal(offset.get(), 1);

  items.set([
    ...items.get(),
    { id: 5, label: "E" }
  ]);
  await nextMicrotask();

  assert.equal(offset.get(), 1);
  assert.match(visibleText(stdout.writes.at(-1)), /B/);
  assert.match(visibleText(stdout.writes.at(-1)), /C/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /E/);

  stdin.emitKey(undefined, { name: "end" });
  await nextMicrotask();

  items.set([
    ...items.get(),
    { id: 6, label: "F" }
  ]);
  await nextMicrotask();

  assert.equal(offset.get(), 4);
  assert.match(visibleText(stdout.writes.at(-1)), /E/);
  assert.match(visibleText(stdout.writes.at(-1)), /F/);

  app.dispose();
});

test("tsx app VScrollView showScrollbar renders track characters", async () => {
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
    <VScrollView
      height={3}
      width={6}
      offset={offset}
      showScrollbar={true}
      onOffsetChange={(nextOffset) => {
        offset.set(nextOffset);
      }}
    >
      <text value="A" />
      <text value="B" />
      <text value="C" />
      <text value="D" />
      <text value="E" />
    </VScrollView>,
    { terminal }
  );

  app.start();
  await nextMicrotask();

  const rendered = visibleText(stdout.writes.join(""));
  assert.match(rendered, /[│█]/);

  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(offset.get(), 1);
  assert.match(visibleText(stdout.writes.join("")), /[│█]/);

  app.dispose();
});

test("tsx app scrolls HScrollView with keyboard focus", async () => {
  const stdout = createFakeStdout(20, 5);
  const stdin = createFakeStdin();
  const offset = createSignal(0);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <HScrollView
      width={2}
      offset={offset}
      onOffsetChange={(nextOffset) => {
        offset.set(nextOffset);
      }}
    >
      <text value="A" marginRight={5} wrap="none" />
    </HScrollView>,
    { terminal }
  );

  app.start();
  await nextMicrotask();

  stdin.emitKey(undefined, { name: "right" });
  await nextMicrotask();

  assert.equal(offset.get(), 1);

  stdin.emitKey(undefined, { name: "left" });
  await nextMicrotask();

  assert.equal(offset.get(), 0);

  app.dispose();
});

test("tsx app keeps TextInput arrow keys from scrolling HScrollView", async () => {
  const stdout = createFakeStdout(24, 6);
  const stdin = createFakeStdin();
  const offset = createSignal(0);
  const value = createSignal("abc");
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <vstack>
      <TextInput
        id="name"
        value={value}
        onChange={(nextValue) => {
          value.set(nextValue);
        }}
      />
      <HScrollView
        width={8}
        offset={offset}
        onOffsetChange={(nextOffset) => {
          offset.set(nextOffset);
        }}
      >
        <text value="0123456789ABCDEF" />
      </HScrollView>
    </vstack>,
    { terminal }
  );

  app.start();

  stdin.emitKey(undefined, { name: "tab" });
  await nextMicrotask();
  stdin.emitKey(undefined, { name: "right" });
  await nextMicrotask();

  assert.equal(offset.get(), 0);

  app.dispose();
});

test("tsx app scrolls ScrollView on both axes with keyboard focus", async () => {
  const stdout = createFakeStdout(20, 8);
  const stdin = createFakeStdin();
  const scrollX = createSignal(0);
  const scrollY = createSignal(0);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <ScrollView
      width={2}
      height={2}
      offsetX={scrollX}
      offsetY={scrollY}
      onOffsetXChange={(nextOffset) => {
        scrollX.set(nextOffset);
      }}
      onOffsetYChange={(nextOffset) => {
        scrollY.set(nextOffset);
      }}
    >
      <text value="A" marginRight={5} />
      <text value="B" />
      <text value="C" />
      <text value="D" />
    </ScrollView>,
    { terminal }
  );

  app.start();
  await nextMicrotask();

  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(scrollY.get(), 1);
  assert.equal(scrollX.get(), 0);

  stdin.emitKey(undefined, { name: "right" });
  await nextMicrotask();

  assert.equal(scrollX.get(), 1);
  assert.equal(scrollY.get(), 1);

  app.dispose();
});

test("tsx app ScrollView home and end move both axes", async () => {
  const stdout = createFakeStdout(20, 8);
  const stdin = createFakeStdin();
  const scrollX = createSignal(1);
  const scrollY = createSignal(1);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <ScrollView
      width={2}
      height={2}
      offsetX={scrollX}
      offsetY={scrollY}
      onOffsetXChange={(nextOffset) => {
        scrollX.set(nextOffset);
      }}
      onOffsetYChange={(nextOffset) => {
        scrollY.set(nextOffset);
      }}
    >
      <text value="A" marginRight={5} />
      <text value="B" />
      <text value="C" />
      <text value="D" />
    </ScrollView>,
    { terminal }
  );

  app.start();
  await nextMicrotask();

  stdin.emitKey(undefined, { name: "home" });
  await nextMicrotask();

  assert.equal(scrollX.get(), 0);
  assert.equal(scrollY.get(), 0);

  stdin.emitKey(undefined, { name: "end" });
  await nextMicrotask();

  assert.ok(scrollX.get() > 0);
  assert.ok(scrollY.get() > 0);

  app.dispose();
});

test("tsx app keeps TextInput arrow keys from scrolling ScrollView", async () => {
  const stdout = createFakeStdout(24, 8);
  const stdin = createFakeStdin();
  const scrollX = createSignal(0);
  const scrollY = createSignal(0);
  const value = createSignal("abc");
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <vstack>
      <TextInput
        id="name"
        value={value}
        onChange={(nextValue) => {
          value.set(nextValue);
        }}
      />
      <ScrollView
        width={8}
        height={3}
        offsetX={scrollX}
        offsetY={scrollY}
        onOffsetXChange={(nextOffset) => {
          scrollX.set(nextOffset);
        }}
        onOffsetYChange={(nextOffset) => {
          scrollY.set(nextOffset);
        }}
      >
        <vstack>
          <text value="0123456789ABCDEF" />
          <text value="ROW2" />
          <text value="ROW3" />
          <text value="ROW4" />
        </vstack>
      </ScrollView>
    </vstack>,
    { terminal }
  );

  app.start();

  stdin.emitKey(undefined, { name: "tab" });
  await nextMicrotask();
  stdin.emitKey(undefined, { name: "right" });
  await nextMicrotask();

  assert.equal(scrollX.get(), 0);
  assert.equal(scrollY.get(), 0);

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

test("tsx app renders a Yoga dashboard and handles scroll toggle and resize", async () => {
  const stdout = createFakeStdout(48, 24);
  const stdin = createFakeStdin();
  const offset = createSignal(0);
  const showSidebar = createSignal(true);
  const stats = createSignal("cpu=1.0% heap=12 MB rss=48 MB");
  const events = createSignal<readonly Item[]>([
    { id: 1, label: "event-1 boot" },
    { id: 2, label: "event-2 sample" },
    { id: 3, label: "event-3 sample" },
    { id: 4, label: "event-4 sample" },
    { id: 5, label: "event-5 sample" }
  ]);
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <screen gap={1} alignItems="stretch">
      <box padding={1} border>
        <hstack justifyContent="space-between" alignItems="center">
          <text value="Yoga Dashboard" bold />
          <text value={stats} />
        </hstack>
      </box>
      <hstack gap={1} flexGrow={1} alignItems="stretch">
        <box flexGrow={1} flexShrink={1} padding={1} border>
          <vstack gap={1}>
            <List
              height={2}
              items={events}
              offset={offset}
              getKey={(item) => (item as Item).id}
              render={(item) => <text value={(item as Item).label} />}
              onOffsetChange={(nextOffset) => {
                offset.set(nextOffset);
              }}
            />
            <hstack gap={1} flexWrap="wrap">
              <box width={12} flexGrow={1} flexShrink={1} padding={1} border>
                <text value="CPU" bold />
                <text value="1.0%" />
              </box>
              <box width={12} flexGrow={1} flexShrink={1} padding={1} border>
                <text value="Heap" bold />
                <text value="12 MB" />
              </box>
              <box width={12} flexGrow={1} flexShrink={1} padding={1} border>
                <text value="RSS" bold />
                <text value="48 MB" />
              </box>
            </hstack>
            <text
              value="This dashboard text rewraps when the terminal width changes."
              wrap="wrap"
            />
          </vstack>
        </box>
        <show when={showSidebar}>
          <box width={14} flexShrink={0} padding={1} border>
            <vstack gap={1}>
              <text value="Sidebar" bold />
              <Button
                label="Hide sidebar"
                onPress={() => {
                  showSidebar.set(false);
                }}
              />
            </vstack>
          </box>
        </show>
      </hstack>
    </screen>,
    { terminal }
  );

  app.start();

  assert.match(visibleText(stdout.writes.at(-1)), /Yoga Dashboard/);
  assert.match(visibleText(stdout.writes.at(-1)), /Sidebar/);
  assert.match(visibleText(stdout.writes.at(-1)), /CPU/);
  assert.match(visibleText(stdout.writes.at(-1)), /event-1/);

  stdin.emitKey(undefined, { name: "end" });
  await nextMicrotask();

  assert.equal(offset.get(), 3);
  assert.match(visibleText(stdout.writes.join("")), /sample5/);

  stdin.emitKey(undefined, { name: "tab" });
  stdin.emitKey("\r", { name: "return" });
  await nextMicrotask();

  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /Sidebar/);
  assert.match(visibleText(stdout.writes.join("")), /Yoga Dashboard/);

  stdout.columns = 28;
  stdout.rows = 40;
  stdout.emitResize();

  assert.match(visibleText(stdout.writes.at(-1)), /dashboard text/);
  assert.match(visibleText(stdout.writes.at(-1)), /rewraps/);

  app.dispose();
});

test("tsx app scrolls VScrollView with wrapped CJK lines", async () => {
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
    <VScrollView
      height={2}
      offset={offset}
      onOffsetChange={(nextOffset) => {
        offset.set(nextOffset);
      }}
    >
      <text value="甲" />
      <text value="乙" />
      <text value="丙" />
      <text value="丁" />
    </VScrollView>,
    { terminal }
  );

  app.start();

  assert.equal(offset.get(), 0);
  assert.match(visibleText(stdout.writes.join("")), /甲/);
  assert.match(visibleText(stdout.writes.join("")), /乙/);

  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(offset.get(), 1);
  assert.match(visibleText(stdout.writes.join("")), /丙/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /甲/);

  stdin.emitKey(undefined, { name: "down" });
  await nextMicrotask();

  assert.equal(offset.get(), 2);
  assert.match(visibleText(stdout.writes.join("")), /丁/);

  app.dispose();
});

test("tsx app applies focus inverse to wide text without breaking layout", async () => {
  const stdout = createFakeStdout(12, 4);
  const stdin = createFakeStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <hstack>
      <text
        value="中"
        onKey={(event) => {
          if (event.name === "return") {
            return true;
          }
          return false;
        }}
      />
      <text
        value="B"
        onKey={(event) => {
          if (event.name === "return") {
            return true;
          }
          return false;
        }}
      />
    </hstack>,
    { terminal }
  );

  app.start();

  assert.match(visibleText(stdout.writes.at(-1)), /中/);
  assert.match(stdout.writes.at(-1) ?? "", /\x1b\[7m中/);

  stdin.emitKey(undefined, { name: "tab" });
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /B/);
  assert.match(stdout.writes.at(-1) ?? "", /\x1b\[7mB/);
  assert.doesNotMatch(stdout.writes.at(-1) ?? "", /\x1b\[7m中/);

  assert.equal(app.render(), "");
  assert.match(visibleText(stdout.writes.at(-1)), /B/);

  app.dispose();
});

test("tsx app renders updates and resizes wide text through fake terminal", async () => {
  const stdout = createFakeStdout(20, 8);
  const stdin = createFakeStdin();
  const title = createSignal("A中🙂e\u0301");
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <screen gap={1}>
      <text value={title} />
      <box width={4} height={2} overflow="clip">
        <text value="中中🙂" wrap="hard" />
      </box>
    </screen>,
    { terminal }
  );

  app.start();

  assert.match(visibleText(stdout.writes.at(-1)), /A中🙂e\u0301/);

  title.set("AB");
  await nextMicrotask();

  assert.match(visibleText(stdout.writes.at(-1)), /B/);
  assert.doesNotMatch(visibleText(stdout.writes.at(-1)), /🙂/);

  stdout.columns = 4;
  stdout.rows = 8;
  stdout.emitResize();

  assert.match(visibleText(stdout.writes.at(-1)), /中/);
  assert.match(visibleText(stdout.writes.join("")), /🙂/);

  app.dispose();
});

test("tsx app types CJK into TextInput through fake terminal", async () => {
  const stdout = createFakeStdout(20, 6);
  const stdin = createFakeStdin();
  const value = createSignal("");
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <TextInput
      value={value}
      placeholder="名称"
      onChange={(nextValue) => {
        value.set(nextValue);
      }}
    />,
    { terminal }
  );

  app.start();

  stdin.emitKey("中");
  await nextMicrotask();

  assert.equal(value.get(), "中");
  assert.match(visibleText(stdout.writes.join("")), /中/);

  stdin.emitKey(undefined, { name: "backspace" });
  await nextMicrotask();

  assert.equal(value.get(), "");

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

test("tsx app renders wide-text example content through fake terminal", async () => {
  const stdout = createFakeStdout(40, 24);
  const stdin = createFakeStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <screen gap={1}>
      <box padding={1} border>
        <vstack gap={1}>
          <text value="Wide Text" bold color="brightCyan" />
          <text value="CJK: A中B renders with 中 occupying two terminal columns." />
          <text value="Emoji: status 🙂 ready 🚀" />
          <text value={"Combining: cafe\u0301 keeps the accent with e."} />
        </vstack>
      </box>

      <box width={12} padding={1} border>
        <vstack gap={1}>
          <text value="Hard wrap" color="yellow" />
          <text value="中中中🙂🙂ABC" wrap="hard" />
        </vstack>
      </box>

      <box padding={1} border>
        <text
          value="Resize the terminal: layout uses display columns, renderer stores wide placeholders, and ANSI output skips placeholders."
          wrap="wrap"
          color="gray"
        />
      </box>
    </screen>,
    { terminal }
  );

  app.start();

  const output = visibleText(stdout.writes.join(""));
  assert.match(output, /Wide Text/);
  assert.match(output, /A中B/);
  assert.match(output, /🙂/);
  assert.match(output, /🚀/);
  assert.match(output, /cafe\u0301/);
  assert.match(output, /Hard wra/);
  assert.match(output, /中/);
  assert.match(output, /Resize the terminal/);

  app.dispose();
});

test("tsx app types emoji into TextInput through fake terminal", async () => {
  const stdout = createFakeStdout(20, 6);
  const stdin = createFakeStdin();
  const value = createSignal("");
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <TextInput
      value={value}
      placeholder="emoji"
      onChange={(nextValue) => {
        value.set(nextValue);
      }}
    />,
    { terminal }
  );

  app.start();

  stdin.emitKey("🙂");
  await nextMicrotask();

  assert.equal(value.get(), "🙂");
  assert.match(visibleText(stdout.writes.join("")), /🙂/);

  stdin.emitKey(undefined, { name: "backspace" });
  await nextMicrotask();

  assert.equal(value.get(), "");

  app.dispose();
});

test("tsx app applies marginBottom spacing through Yoga layout", async () => {
  const stdout = createFakeStdout(12, 8);
  const stdin = createFakeStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  let bRect: LayoutNode["rect"] | null = null;
  const app = createApp(
    <vstack>
      <text value="A" marginBottom={2} />
      <text
        value="B"
        ref={(api: MountedElementApi) => {
          api.onLayout = (layout: unknown) => {
            bRect = (layout as LayoutNode).rect;
          };
        }}
      />
    </vstack>,
    { terminal }
  );

  app.start();

  assert.deepEqual(bRect, {
    x: 0,
    y: 3,
    width: 1,
    height: 1
  });
  assert.match(lastFrameText(stdout), /A/);
  assert.match(lastFrameText(stdout), /B/);

  app.dispose();
});

test("tsx app applies paddingLeft through Yoga layout", async () => {
  const stdout = createFakeStdout(12, 6);
  const stdin = createFakeStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <box paddingLeft={3}>
      <text value="P" />
    </box>,
    { terminal }
  );

  app.start();

  assert.equal(columnIndexOf(lastFrameText(stdout), "P"), 3);

  app.dispose();
});

test("tsx app wraps text using maxWidth through Yoga layout", async () => {
  const stdout = createFakeStdout(12, 6);
  const stdin = createFakeStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  let textRect: LayoutNode["rect"] | null = null;
  const app = createApp(
    <text
      value="abcd"
      wrap="wrap"
      maxWidth={2}
      ref={(api: MountedElementApi) => {
        api.onLayout = (layout: unknown) => {
          textRect = (layout as LayoutNode).rect;
        };
      }}
    />,
    { terminal }
  );

  app.start();

  assert.deepEqual(textRect, {
    x: 0,
    y: 0,
    width: 2,
    height: 2
  });
  assert.match(lastFrameText(stdout), /ab/);
  assert.match(lastFrameText(stdout), /cd/);

  app.dispose();
});

test("tsx app applies minWidth on spacer through Yoga layout", async () => {
  const stdout = createFakeStdout(12, 4);
  const stdin = createFakeStdin();
  const terminal = createNodeTerminal({
    stdout,
    stdin,
    rawMode: true,
    exitOnCtrlC: false
  });
  const app = createApp(
    <hstack>
      <spacer size={1} minWidth={5} />
      <text value="S" />
    </hstack>,
    { terminal }
  );

  app.start();

  assert.ok(columnIndexOf(lastFrameText(stdout), "S") >= 5);

  app.dispose();
});
