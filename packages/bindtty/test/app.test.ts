import assert from "node:assert/strict";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";

import {
  Button,
  ScrollView,
  TextInput,
  createApp,
  type AppStdout,
  type CreateAppOptions
} from "bindtty";
import { createSignal } from "@bindtty/signal";
import type { Dispose, TerminalHost, TerminalKeyEvent, TerminalViewport } from "@bindtty/terminal";
import {
  elementTemplate,
  forTemplate,
  showTemplate
} from "@bindtty/vnode";

interface MockStdout extends AppStdout {
  writes: string[];
  listenerCount(): number;
  emitResize(): void;
}

interface MockStdin {
  rawModeCalls: number;
  setRawMode(value: boolean): void;
}

interface MockTerminal extends TerminalHost {
  writes: string[];
  startCalls: number;
  stopCalls: number;
  disposeCalls: number;
  resizeListenerCount(): number;
  keyListenerCount(): number;
  emitResize(): void;
  emitKey(event: TerminalKeyEvent): void;
  setViewport(viewport: TerminalViewport): void;
}

function createMockStdout(columns?: number, rows?: number): MockStdout {
  const listeners = new Set<() => void>();

  return {
    columns,
    rows,
    writes: [],
    write(chunk: string) {
      this.writes.push(chunk);
    },
    on(event: "resize", listener: () => void) {
      if (event === "resize") {
        listeners.add(listener);
      }
    },
    off(event: "resize", listener: () => void) {
      if (event === "resize") {
        listeners.delete(listener);
      }
    },
    listenerCount() {
      return listeners.size;
    },
    emitResize() {
      for (const listener of [...listeners]) {
        listener();
      }
    }
  };
}

function createMockStdin(): MockStdin {
  return {
    rawModeCalls: 0,
    setRawMode(_value: boolean) {
      this.rawModeCalls += 1;
    }
  };
}

function createMockTerminal(width = 1, height = 1): MockTerminal {
  let currentViewport = {
    width,
    height
  };
  const resizeListeners = new Set<() => void>();
  const keyListeners = new Set<(event: TerminalKeyEvent) => void>();

  return {
    writes: [],
    startCalls: 0,
    stopCalls: 0,
    disposeCalls: 0,
    get viewport() {
      return currentViewport;
    },
    start() {
      this.startCalls += 1;
    },
    stop() {
      this.stopCalls += 1;
    },
    dispose() {
      this.disposeCalls += 1;
    },
    write(chunk: string) {
      this.writes.push(chunk);
    },
    onResize(listener: () => void): Dispose {
      resizeListeners.add(listener);
      return () => {
        resizeListeners.delete(listener);
      };
    },
    onKey(listener: (event: TerminalKeyEvent) => void): Dispose {
      keyListeners.add(listener);
      return () => {
        keyListeners.delete(listener);
      };
    },
    resizeListenerCount() {
      return resizeListeners.size;
    },
    keyListenerCount() {
      return keyListeners.size;
    },
    emitResize() {
      for (const listener of [...resizeListeners]) {
        listener();
      }
    },
    emitKey(event: TerminalKeyEvent) {
      for (const listener of [...keyListeners]) {
        listener(event);
      }
    },
    setViewport(viewport: TerminalViewport) {
      currentViewport = viewport;
    }
  };
}

function keyEvent(
  input: string,
  overrides: Partial<TerminalKeyEvent> = {}
): TerminalKeyEvent {
  return {
    input,
    ctrl: false,
    meta: false,
    shift: false,
    ...overrides
  };
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
}

test("bindtty exports the createApp entrypoint", () => {
  assert.equal(typeof createApp, "function");
});

test("bindtty exports the Button widget", () => {
  assert.equal(typeof Button, "function");
});

test("bindtty exports the TextInput widget", () => {
  assert.equal(typeof TextInput, "function");
});

test("createApp returns lifecycle methods without rendering by default", () => {
  const stdout = createMockStdout(5, 1);
  const options: CreateAppOptions = {
    stdout
  };
  const app = createApp(elementTemplate("text", { value: "Hello" }), options);

  assert.equal(typeof app.start, "function");
  assert.equal(typeof app.render, "function");
  assert.equal(typeof app.resize, "function");
  assert.equal(typeof app.stop, "function");
  assert.equal(typeof app.dispose, "function");
  assert.deepEqual(stdout.writes, []);
});

test("start writes the first rendered frame to stdout", () => {
  const stdout = createMockStdout(2, 1);
  const app = createApp(elementTemplate("text", { value: "Hi" }), { stdout });

  app.start();

  assert.equal(stdout.writes.length, 1);
  assert.match(stdout.writes[0], /H/);
  assert.match(stdout.writes[0], /i/);
});

test("start is idempotent and does not repeat the first frame", () => {
  const stdout = createMockStdout(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { stdout });

  app.start();
  app.start();

  assert.equal(stdout.writes.length, 1);
});

test("render returns an empty patch and does not write when unchanged", () => {
  const stdout = createMockStdout(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { stdout });

  app.start();

  assert.equal(app.render(), "");
  assert.equal(stdout.writes.length, 1);
});

test("autoStart true writes the first frame during createApp", () => {
  const stdout = createMockStdout(1, 1);

  createApp(elementTemplate("text", { value: "A" }), {
    stdout,
    autoStart: true
  });

  assert.equal(stdout.writes.length, 1);
  assert.match(stdout.writes[0], /A/);
});

test("fallback viewport is used when stdout size is unavailable", () => {
  const stdout = createMockStdout();
  const app = createApp(elementTemplate("text", { value: "AB" }), {
    stdout,
    fallbackViewport: {
      width: 1,
      height: 1
    }
  });

  app.start();

  assert.equal(stdout.writes.length, 1);
  assert.match(stdout.writes[0], /A/);
  assert.doesNotMatch(stdout.writes[0], /B/);
});

test("default viewport is used when stdout and fallback sizes are unavailable", () => {
  const stdout = createMockStdout();
  const app = createApp(elementTemplate("text", { value: "A" }), { stdout });

  app.start();

  assert.equal(stdout.writes.length, 1);
  assert.match(stdout.writes[0], /\x1b\[24;80H/);
});

test("signal updates render through the runtime flush listener", async () => {
  const stdout = createMockStdout(1, 1);
  const label = createSignal("A");
  const app = createApp(elementTemplate("text", { value: label }), { stdout });

  app.start();
  label.set("B");
  await nextMicrotask();

  assert.equal(stdout.writes.length, 2);
  assert.match(stdout.writes[1], /B/);
});

test("same-tick signal updates are coalesced by the runtime scheduler", async () => {
  const stdout = createMockStdout(1, 1);
  const label = createSignal("A");
  const app = createApp(elementTemplate("text", { value: label }), { stdout });

  app.start();
  label.set("B");
  label.set("C");
  await nextMicrotask();

  assert.equal(stdout.writes.length, 2);
  assert.match(stdout.writes[1], /C/);
  assert.doesNotMatch(stdout.writes[1], /B/);
});

test("show branch switches render through the app flush path", async () => {
  const stdout = createMockStdout(1, 1);
  const visible = createSignal(false);
  const app = createApp(
    showTemplate({
      when: visible,
      fallback: elementTemplate("text", { value: "F" }),
      children: elementTemplate("text", { value: "T" })
    }),
    { stdout }
  );

  app.start();

  assert.equal(stdout.writes.length, 1);
  assert.match(stdout.writes[0], /F/);

  visible.set(true);
  await nextMicrotask();

  assert.equal(stdout.writes.length, 2);
  assert.match(stdout.writes[1], /T/);
});

test("for keyed reorders render through the app flush path", async () => {
  const stdout = createMockStdout(1, 2);
  const items = createSignal([
    { id: 1, label: "A" },
    { id: 2, label: "B" }
  ]);
  const app = createApp(
    forTemplate<{ id: number; label: string }>({
      each: items,
      key: (item) => item.id,
      renderItem: (item) => elementTemplate("text", { value: item.label })
    }),
    { stdout }
  );

  app.start();

  assert.equal(stdout.writes.length, 1);
  assert.match(stdout.writes[0], /A/);
  assert.match(stdout.writes[0], /B/);

  items.set([
    { id: 2, label: "B" },
    { id: 1, label: "A" }
  ]);
  await nextMicrotask();

  assert.equal(stdout.writes.length, 2);
  assert.match(stdout.writes[1], /B/);
  assert.match(stdout.writes[1], /A/);
});

test("stop unsubscribes runtime flush and start restores it", async () => {
  const stdout = createMockStdout(1, 1);
  const label = createSignal("A");
  const app = createApp(elementTemplate("text", { value: label }), { stdout });

  app.start();
  app.stop();
  label.set("B");
  await nextMicrotask();

  assert.equal(stdout.writes.length, 1);

  app.start();

  assert.equal(stdout.writes.length, 2);
  assert.match(stdout.writes[1], /B/);

  label.set("C");
  await nextMicrotask();

  assert.equal(stdout.writes.length, 3);
  assert.match(stdout.writes[2], /C/);
});

test("dispose prevents later runtime flush writes", async () => {
  const stdout = createMockStdout(1, 1);
  const label = createSignal("A");
  const app = createApp(elementTemplate("text", { value: label }), { stdout });

  app.start();
  app.dispose();
  label.set("B");
  await nextMicrotask();

  assert.equal(stdout.writes.length, 1);
});

test("start registers a resize listener and resize emits a full repaint", () => {
  const stdout = createMockStdout(1, 1);
  const app = createApp(elementTemplate("text", { value: "AB" }), { stdout });

  app.start();
  assert.equal(stdout.listenerCount(), 1);

  stdout.columns = 2;
  stdout.emitResize();

  assert.equal(stdout.writes.length, 2);
  assert.match(stdout.writes[1], /A/);
  assert.match(stdout.writes[1], /B/);
});

test("manual resize resets the renderer and returns the repaint patch", () => {
  const stdout = createMockStdout(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { stdout });

  app.start();

  const patch = app.resize();

  assert.equal(stdout.writes.length, 2);
  assert.equal(stdout.writes[1], patch);
  assert.match(patch, /A/);
});

test("stop removes resize listener and start registers it again", () => {
  const stdout = createMockStdout(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { stdout });

  app.start();
  app.stop();

  assert.equal(stdout.listenerCount(), 0);

  stdout.columns = 2;
  stdout.emitResize();

  assert.equal(stdout.writes.length, 1);

  app.start();

  assert.equal(stdout.listenerCount(), 1);
  assert.equal(stdout.writes.length, 2);

  stdout.emitResize();

  assert.equal(stdout.writes.length, 3);
});

test("dispose removes resize listener and prevents resize writes", () => {
  const stdout = createMockStdout(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { stdout });

  app.start();
  app.dispose();

  assert.equal(stdout.listenerCount(), 0);

  stdout.columns = 2;
  stdout.emitResize();

  assert.equal(stdout.writes.length, 1);
});

test("stop is idempotent and leaves the app restartable", () => {
  const stdout = createMockStdout(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { stdout });

  app.start();
  app.stop();
  app.stop();

  assert.equal(stdout.listenerCount(), 0);
  assert.equal(stdout.writes.length, 1);

  app.start();

  assert.equal(stdout.listenerCount(), 1);
  assert.equal(stdout.writes.length, 1);

  stdout.columns = 2;
  stdout.emitResize();

  assert.equal(stdout.writes.length, 2);
});

test("dispose is idempotent and does not clear the terminal", () => {
  const stdout = createMockStdout(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { stdout });

  app.start();
  app.dispose();
  app.dispose();

  assert.equal(stdout.listenerCount(), 0);
  assert.equal(stdout.writes.length, 1);
});

test("start render and resize are no-ops after dispose", () => {
  const stdout = createMockStdout(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { stdout });

  app.start();
  app.dispose();

  app.start();

  assert.equal(app.render(), "");
  assert.equal(app.resize(), "");
  assert.equal(stdout.listenerCount(), 0);
  assert.equal(stdout.writes.length, 1);
});

test("dispose before start releases runtime bindings and prevents future writes", async () => {
  const stdout = createMockStdout(1, 1);
  const label = createSignal("A");
  const app = createApp(elementTemplate("text", { value: label }), { stdout });

  app.dispose();
  label.set("B");
  await nextMicrotask();
  app.start();

  assert.equal(stdout.listenerCount(), 0);
  assert.deepEqual(stdout.writes, []);
});

test("app lifecycle does not enter stdin raw mode", () => {
  const stdout = createMockStdout(1, 1);
  const stdin = createMockStdin();
  const app = createApp(elementTemplate("text", { value: "A" }), {
    stdout,
    stdin
  });

  app.start();
  app.stop();
  app.start();
  app.dispose();

  assert.equal(stdin.rawModeCalls, 0);
});

test("terminal mode starts terminal and writes first frame through terminal", () => {
  const terminal = createMockTerminal(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { terminal });

  app.start();

  assert.equal(terminal.startCalls, 1);
  assert.equal(terminal.resizeListenerCount(), 1);
  assert.equal(terminal.keyListenerCount(), 1);
  assert.equal(terminal.writes.length, 1);
  assert.match(terminal.writes[0], /A/);
});

test("terminal mode autoStart starts terminal and renders first frame", () => {
  const terminal = createMockTerminal(1, 1);

  createApp(elementTemplate("text", { value: "A" }), {
    terminal,
    autoStart: true
  });

  assert.equal(terminal.startCalls, 1);
  assert.equal(terminal.resizeListenerCount(), 1);
  assert.equal(terminal.keyListenerCount(), 1);
  assert.equal(terminal.writes.length, 1);
  assert.match(terminal.writes[0], /A/);
});

test("terminal mode uses terminal viewport for rendering", () => {
  const terminal = createMockTerminal(1, 1);
  const app = createApp(elementTemplate("text", { value: "AB" }), { terminal });

  app.start();

  assert.equal(terminal.writes.length, 1);
  assert.match(terminal.writes[0], /A/);
  assert.doesNotMatch(terminal.writes[0], /B/);
});

test("terminal mode render is a no-op when the frame is unchanged", () => {
  const terminal = createMockTerminal(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { terminal });

  app.start();

  assert.equal(app.render(), "");
  assert.equal(terminal.writes.length, 1);
});

test("terminal key events dispatch to the focused onKey handler and repaint", async () => {
  const terminal = createMockTerminal(1, 1);
  const label = createSignal("A");
  const app = createApp(
    elementTemplate("text", {
      value: label,
      onKey: (event: TerminalKeyEvent) => {
        if (event.input === "x") {
          label.set("B");
          return true;
        }
        return false;
      }
    }),
    { terminal }
  );

  app.start();
  terminal.emitKey(keyEvent("x"));
  await nextMicrotask();

  assert.equal(terminal.writes.length, 2);
  assert.match(terminal.writes[1], /B/);
});

test("terminal Tab traversal changes which onKey handler receives keys", () => {
  const terminal = createMockTerminal(2, 1);
  const firstLabel = createSignal("A");
  const secondLabel = createSignal("B");
  const app = createApp(
    elementTemplate("hstack", {}, [
      elementTemplate("text", {
        value: firstLabel,
        onKey: (event: TerminalKeyEvent) => {
          if (event.input === "x") {
            firstLabel.set("X");
            return true;
          }
          return false;
        }
      }),
      elementTemplate("text", {
        value: secondLabel,
        onKey: (event: TerminalKeyEvent) => {
          if (event.input === "x") {
            secondLabel.set("Y");
            return true;
          }
          return false;
        }
      })
    ]),
    { terminal }
  );

  app.start();
  terminal.emitKey(keyEvent("", { name: "tab" }));
  assert.equal(terminal.writes.length, 2);
  assert.match(terminal.writes[1], /\x1b\[7mB/);

  terminal.emitKey(keyEvent("x"));

  assert.equal(terminal.writes.length, 3);
  assert.match(terminal.writes[2], /Y/);
  assert.doesNotMatch(terminal.writes[2], /X/);
});

test("terminal runtime flush removes nodes whose dynamic onKey becomes false", async () => {
  const terminal = createMockTerminal(2, 1);
  const firstLabel = createSignal("A");
  const secondLabel = createSignal("B");
  const firstOnKey = createSignal<false | ((event: TerminalKeyEvent) => boolean)>(
    (event) => {
      if (event.name === "return") {
        firstLabel.set("X");
        return true;
      }
      return false;
    }
  );
  const app = createApp(
    elementTemplate("hstack", {}, [
      elementTemplate("text", {
        value: firstLabel,
        onKey: firstOnKey
      }),
      elementTemplate("text", {
        value: secondLabel,
        onKey: (event: TerminalKeyEvent) => {
          if (event.name === "return") {
            secondLabel.set("Y");
            return true;
          }
          return false;
        }
      })
    ]),
    { terminal }
  );

  app.start();
  firstOnKey.set(false);
  await nextMicrotask();

  terminal.emitKey(keyEvent("\r", { name: "return" }));
  await nextMicrotask();

  assert.match(terminal.writes.at(-1) ?? "", /Y/);
  assert.doesNotMatch(terminal.writes.at(-1) ?? "", /X/);
});

test("terminal mode dispatches Button onPress and repaints updated signal label", async () => {
  const terminal = createMockTerminal(8, 3);
  const label = createSignal("A");
  const app = createApp(
    Button({
      label,
      onPress() {
        label.set("B");
      }
    }),
    { terminal }
  );

  app.start();
  terminal.emitKey(keyEvent("\r", { name: "return" }));
  await nextMicrotask();

  assert.equal(terminal.writes.length, 2);
  assert.match(terminal.writes[1], /B/);

  app.dispose();
  terminal.emitKey(keyEvent("\r", { name: "return" }));
  await nextMicrotask();

  assert.equal(terminal.writes.length, 2);
});

test("terminal mode dispatches TextInput changes and submit value", async () => {
  const terminal = createMockTerminal(18, 6);
  const value = createSignal("");
  const submitted = createSignal("idle");
  const app = createApp(
    elementTemplate("vstack", {}, [
      TextInput({
        value,
        placeholder: "Name",
        onChange(nextValue) {
          value.set(nextValue);
        },
        onSubmit(nextValue) {
          submitted.set(`sent:${nextValue}`);
        }
      }),
      elementTemplate("text", { value: submitted })
    ]),
    { terminal }
  );

  app.start();
  terminal.emitKey(keyEvent("h"));
  await nextMicrotask();
  terminal.emitKey(keyEvent("i"));
  await nextMicrotask();

  assert.match(terminal.writes.at(-1) ?? "", /i/);

  terminal.emitKey(keyEvent("\r", { name: "return" }));
  await nextMicrotask();

  assert.match(stripVTControlCharacters(terminal.writes.at(-1) ?? ""), /sent:hi/);
});

test("terminal resize triggers app resize and full repaint", () => {
  const terminal = createMockTerminal(1, 1);
  const app = createApp(elementTemplate("text", { value: "AB" }), { terminal });

  app.start();
  terminal.setViewport({ width: 2, height: 1 });
  terminal.emitResize();

  assert.equal(terminal.writes.length, 2);
  assert.match(terminal.writes[1], /A/);
  assert.match(terminal.writes[1], /B/);
});

test("terminal mode manual resize returns and writes the repaint patch", () => {
  const terminal = createMockTerminal(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { terminal });

  app.start();

  const patch = app.resize();

  assert.equal(terminal.writes.length, 2);
  assert.equal(terminal.writes[1], patch);
  assert.match(patch, /A/);
});

test("terminal mode receives runtime flush renders", async () => {
  const terminal = createMockTerminal(1, 1);
  const label = createSignal("A");
  const app = createApp(elementTemplate("text", { value: label }), { terminal });

  app.start();
  label.set("B");
  await nextMicrotask();

  assert.equal(terminal.writes.length, 2);
  assert.match(terminal.writes[1], /B/);
});

test("terminal mode stop unsubscribes runtime flush and restart renders latest state", async () => {
  const terminal = createMockTerminal(1, 1);
  const label = createSignal("A");
  const app = createApp(elementTemplate("text", { value: label }), { terminal });

  app.start();
  app.stop();
  label.set("B");
  await nextMicrotask();

  assert.equal(terminal.writes.length, 1);

  app.start();

  assert.equal(terminal.writes.length, 2);
  assert.match(terminal.writes[1], /B/);
});

test("terminal mode stop and restart control terminal lifecycle", () => {
  const terminal = createMockTerminal(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { terminal });

  app.start();
  app.stop();

  assert.equal(terminal.stopCalls, 1);
  assert.equal(terminal.resizeListenerCount(), 0);
  assert.equal(terminal.keyListenerCount(), 0);

  terminal.setViewport({ width: 2, height: 1 });
  terminal.emitResize();
  terminal.emitKey(keyEvent("x"));

  assert.equal(terminal.writes.length, 1);

  app.start();

  assert.equal(terminal.startCalls, 2);
  assert.equal(terminal.resizeListenerCount(), 1);
  assert.equal(terminal.keyListenerCount(), 1);
  assert.equal(terminal.writes.length, 2);
});

test("terminal mode dispose stops and disposes terminal", () => {
  const terminal = createMockTerminal(1, 1);
  const app = createApp(elementTemplate("text", { value: "A" }), { terminal });

  app.start();
  app.dispose();
  app.dispose();
  app.start();

  assert.equal(terminal.stopCalls, 1);
  assert.equal(terminal.disposeCalls, 1);
  assert.equal(terminal.resizeListenerCount(), 0);
  assert.equal(terminal.keyListenerCount(), 0);
  assert.equal(terminal.writes.length, 1);
});

test("terminal mode dispose prevents later runtime flush writes", async () => {
  const terminal = createMockTerminal(1, 1);
  const label = createSignal("A");
  const app = createApp(elementTemplate("text", { value: label }), { terminal });

  app.start();
  app.dispose();
  label.set("B");
  await nextMicrotask();

  assert.equal(terminal.disposeCalls, 1);
  assert.equal(terminal.writes.length, 1);
});

test("terminal mode clamps scroll offset bindings after layout", () => {
  const terminal = createMockTerminal(12, 8);
  const offset = createSignal(0);
  const app = createApp(
    ScrollView({
      height: 2,
      offset,
      onOffsetChange: (nextOffset) => {
        offset.set(nextOffset);
      },
      children: [
        elementTemplate("text", { value: "A" }),
        elementTemplate("text", { value: "B" }),
        elementTemplate("text", { value: "C" }),
        elementTemplate("text", { value: "D" })
      ]
    }),
    { terminal }
  );

  app.start();

  offset.set(99);
  app.render();
  assert.equal(offset.get(), 2);

  terminal.emitKey(keyEvent("", { name: "end" }));
  assert.equal(offset.get(), 2);

  terminal.emitKey(keyEvent("", { name: "down" }));
  assert.equal(offset.get(), 2);

  terminal.emitKey(keyEvent("", { name: "home" }));
  assert.equal(offset.get(), 0);

  terminal.emitKey(keyEvent("", { name: "up" }));
  assert.equal(offset.get(), 0);

  app.dispose();
});

test("terminal mode clamps negative and oversized scroll offsets after layout", () => {
  const terminal = createMockTerminal(12, 8);
  const offset = createSignal(-4);
  const app = createApp(
    ScrollView({
      height: 2,
      offset,
      onOffsetChange: (nextOffset) => {
        offset.set(nextOffset);
      },
      children: [
        elementTemplate("text", { value: "A" }),
        elementTemplate("text", { value: "B" }),
        elementTemplate("text", { value: "C" }),
        elementTemplate("text", { value: "D" })
      ]
    }),
    { terminal }
  );

  app.start();
  app.render();

  assert.equal(offset.get(), 0);

  offset.set(1);
  app.render();
  assert.equal(offset.get(), 1);

  app.dispose();
});
