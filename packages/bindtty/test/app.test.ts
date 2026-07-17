import assert from "node:assert/strict";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";

import {
  computed,
  createApp,
  createSignal,
  effect,
  type AppStdout,
  type CreateAppOptions
} from "bindtty";
import {
  Button,
  Checkbox,
  HScrollView,
  List,
  ProgressBar,
  ScrollView,
  Select,
  TextInput,
  VScrollView
} from "@bindtty/widgets";
import {
  createYogaLayoutEngine,
  type LayoutEngine,
  type LayoutNode,
  type LayoutViewport
} from "@bindtty/layout";
import type { Dispose, TerminalHost, TerminalKeyEvent, TerminalViewport } from "@bindtty/terminal";
import type { InteractionNodeFocusChangeEvent } from "@bindtty/interaction";
import {
  elementTemplate,
  forTemplate,
  showTemplate,
  type MountedElementApi
} from "@bindtty/vnode";
import type { RuntimeLifecycleError } from "@bindtty/runtime";

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

function createRecordingLayoutEngine(
  calls: Array<{ root: unknown; viewport: LayoutViewport }>
): LayoutEngine {
  return {
    layout(root, options): LayoutNode | null {
      calls.push({
        root,
        viewport: options.viewport
      });

      if (!root) {
        return null;
      }

      return {
        mounted: root,
        rect: {
          x: 0,
          y: 0,
          width: 1,
          height: 1
        },
        contentRect: {
          x: 0,
          y: 0,
          width: 1,
          height: 1
        },
        children: []
      };
    }
  };
}

test("bindtty exports the createApp entrypoint", () => {
  assert.equal(typeof createApp, "function");
});

test("bindtty exports signal primitives", () => {
  assert.equal(typeof createSignal, "function");
  assert.equal(typeof computed, "function");
  assert.equal(typeof effect, "function");
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

test("stdout mode uses the injected layout engine", () => {
  const stdout = createMockStdout(7, 3);
  const calls: Array<{ root: unknown; viewport: LayoutViewport }> = [];
  const view = elementTemplate("text", { value: "A" });
  const app = createApp(view, {
    stdout,
    layoutEngine: createRecordingLayoutEngine(calls)
  });

  app.start();

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.viewport, {
    width: 7,
    height: 3
  });
  assert.equal((calls[0]?.root as { kind?: string }).kind, "element");
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

test("stdout mode renders and updates wide text without stale cells", async () => {
  const stdout = createMockStdout(4, 1);
  const label = createSignal("A中");
  const app = createApp(elementTemplate("text", { value: label }), { stdout });

  app.start();

  assert.match(stripVTControlCharacters(stdout.writes[0] ?? ""), /A中/);
  assert.equal(app.render(), "");
  assert.equal(stdout.writes.length, 1);

  label.set("AB");
  await nextMicrotask();

  assert.equal(stdout.writes.length, 2);
  assert.match(stripVTControlCharacters(stdout.writes[1] ?? ""), /B/);
  assert.match(stripVTControlCharacters(stdout.writes[1] ?? ""), / /);
  assert.doesNotMatch(stripVTControlCharacters(stdout.writes[1] ?? ""), /中/);
});

test("terminal mode renders and updates wide text without stale cells", async () => {
  const terminal = createMockTerminal(4, 1);
  const label = createSignal("A中");
  const app = createApp(elementTemplate("text", { value: label }), { terminal });

  app.start();

  assert.match(stripVTControlCharacters(terminal.writes[0] ?? ""), /A中/);
  assert.equal(app.render(), "");
  assert.equal(terminal.writes.length, 1);

  label.set("AB");
  await nextMicrotask();

  assert.equal(terminal.writes.length, 2);
  assert.match(stripVTControlCharacters(terminal.writes[1] ?? ""), /B/);
  assert.match(stripVTControlCharacters(terminal.writes[1] ?? ""), / /);
  assert.doesNotMatch(stripVTControlCharacters(terminal.writes[1] ?? ""), /中/);
});

test("terminal mode render is a no-op when wide text is unchanged", () => {
  const terminal = createMockTerminal(2, 1);
  const app = createApp(elementTemplate("text", { value: "中" }), { terminal });

  app.start();

  assert.match(stripVTControlCharacters(terminal.writes[0] ?? ""), /中/);
  assert.equal(app.render(), "");
  assert.equal(terminal.writes.length, 1);
});

test("terminal mode renders emoji on the first frame", () => {
  const terminal = createMockTerminal(3, 1);
  const app = createApp(elementTemplate("text", { value: "A🙂" }), { terminal });

  app.start();

  assert.match(stripVTControlCharacters(terminal.writes[0] ?? ""), /A/);
  assert.match(stripVTControlCharacters(terminal.writes[0] ?? ""), /🙂/);
});

test("terminal resize repaints wide text across viewport changes", () => {
  const terminal = createMockTerminal(3, 1);
  const app = createApp(elementTemplate("text", { value: "A中" }), { terminal });

  app.start();
  assert.match(stripVTControlCharacters(terminal.writes[0] ?? ""), /A中/);

  terminal.setViewport({ width: 6, height: 1 });
  terminal.emitResize();

  assert.equal(terminal.writes.length, 2);
  assert.match(stripVTControlCharacters(terminal.writes[1] ?? ""), /A中/);
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

test("terminal mode uses the injected layout engine", () => {
  const terminal = createMockTerminal(9, 4);
  const calls: Array<{ root: unknown; viewport: LayoutViewport }> = [];
  const app = createApp(elementTemplate("text", { value: "A" }), {
    terminal,
    layoutEngine: createRecordingLayoutEngine(calls)
  });

  app.start();

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.viewport, {
    width: 9,
    height: 4
  });
  assert.equal((calls[0]?.root as { kind?: string }).kind, "element");
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

test("app.focus programmatically focuses an element by id and repaints", () => {
  const terminal = createMockTerminal(2, 1);
  const focusEvents: string[] = [];
  const app = createApp(
    elementTemplate("hstack", {}, [
      elementTemplate("text", {
        id: "first",
        value: "A",
        onKey: true,
        onFocusChange: (event: InteractionNodeFocusChangeEvent) =>
          focusEvents.push(`first:${event.focused}`)
      }),
      elementTemplate("text", {
        id: "second",
        value: "B",
        onKey: true,
        onFocusChange: (event: InteractionNodeFocusChangeEvent) =>
          focusEvents.push(`second:${event.focused}`)
      })
    ]),
    { terminal }
  );

  app.start();
  assert.equal(app.getFocusedId(), "first");

  const result = app.focus("second");

  assert.equal(result.handled, true);
  assert.equal(app.getFocusedId(), "second");
  assert.deepEqual(focusEvents, [
    "first:true",
    "first:false",
    "second:true"
  ]);
  assert.equal(terminal.writes.length, 2);
  assert.match(terminal.writes[1], /\x1b\[7mB/);
});

test("app.focus missing id is safe and does not repaint", () => {
  const terminal = createMockTerminal(1, 1);
  const app = createApp(
    elementTemplate("text", {
      id: "first",
      value: "A",
      onKey: true
    }),
    { terminal }
  );

  app.start();
  const result = app.focus("missing");

  assert.equal(result.handled, false);
  assert.equal(app.getFocusedId(), "first");
  assert.equal(terminal.writes.length, 1);
});

test("element ref api focuses its mounted node through the app", () => {
  const terminal = createMockTerminal(2, 1);
  let firstApi: MountedElementApi | undefined;
  let secondApi: MountedElementApi | undefined;
  const app = createApp(
    elementTemplate("hstack", {}, [
      elementTemplate("text", {
        value: "A",
        onKey: true,
        ref(api: MountedElementApi) {
          firstApi = api;
        }
      }),
      elementTemplate("text", {
        value: "B",
        onKey: true,
        ref(api: MountedElementApi) {
          secondApi = api;
        }
      })
    ]),
    { terminal }
  );

  app.start();
  assert.ok(firstApi);
  assert.ok(secondApi);
  assert.equal(firstApi.isFocused(), true);
  assert.equal(secondApi.isFocused(), false);

  const result = secondApi.focus() as { handled: boolean };

  assert.equal(result.handled, true);
  assert.equal(firstApi.isFocused(), false);
  assert.equal(secondApi.isFocused(), true);
  assert.equal(terminal.writes.length, 2);
  assert.match(terminal.writes[1], /\x1b\[7mB/);
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

test("terminal mode reports layout callback errors without stopping sibling layout callbacks", () => {
  const terminal = createMockTerminal(10, 4);
  const errors: RuntimeLifecycleError[] = [];
  const events: string[] = [];
  const app = createApp(
    elementTemplate("box", {}, [
      elementTemplate("text", {
        value: "A",
        ref(api: MountedElementApi) {
          api.onLayout = () => {
            events.push("first layout");
            throw new Error("layout failed");
          };
        }
      }),
      elementTemplate("text", {
        value: "B",
        ref(api: MountedElementApi) {
          api.onLayout = () => {
            events.push("second layout");
          };
        }
      })
    ]),
    {
      terminal,
      onLifecycleError(error) {
        errors.push(error);
      }
    }
  );

  app.start();

  assert.deepEqual(events, ["first layout", "second layout"]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.phase, "layout");
  assert.match(String((errors[0]?.error as Error).message), /layout failed/);
  assert.equal(terminal.writes.length, 1);

  app.dispose();
});

test("terminal mode renders with YogaLayoutEngine injection", () => {
  const terminal = createMockTerminal(6, 3);
  const app = createApp(
    elementTemplate("box", { width: 5 }, [
      elementTemplate("text", {
        value: "hello world",
        wrap: "wrap"
      })
    ]),
    {
      terminal,
      layoutEngine: createYogaLayoutEngine()
    }
  );

  app.start();

  const output = stripVTControlCharacters(terminal.writes.join(""));
  assert.match(output, /hello/);
  assert.match(output, /world/);

  app.dispose();
});

test("terminal mode VScrollView uses YogaLayoutEngine scroll metadata", () => {
  const terminal = createMockTerminal(12, 8);
  const offset = createSignal(0);
  const app = createApp(
    VScrollView({
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
    {
      terminal,
      layoutEngine: createYogaLayoutEngine()
    }
  );

  app.start();

  terminal.emitKey(keyEvent("", { name: "end" }));
  assert.equal(offset.get(), 2);

  terminal.emitKey(keyEvent("", { name: "down" }));
  assert.equal(offset.get(), 2);

  terminal.emitKey(keyEvent("", { name: "home" }));
  assert.equal(offset.get(), 0);

  app.dispose();
});

test("terminal mode ScrollView uses YogaLayoutEngine dual scroll metadata", () => {
  const terminal = createMockTerminal(12, 8);
  const scrollX = createSignal(0);
  const scrollY = createSignal(0);
  const app = createApp(
    ScrollView({
      width: 2,
      height: 2,
      offsetX: scrollX,
      offsetY: scrollY,
      onOffsetXChange: (nextOffset) => {
        scrollX.set(nextOffset);
      },
      onOffsetYChange: (nextOffset) => {
        scrollY.set(nextOffset);
      },
      children: [
        elementTemplate("text", { value: "A", marginRight: 5 }),
        elementTemplate("text", { value: "B" }),
        elementTemplate("text", { value: "C" }),
        elementTemplate("text", { value: "D" })
      ]
    }),
    {
      terminal,
      layoutEngine: createYogaLayoutEngine()
    }
  );

  app.start();

  terminal.emitKey(keyEvent("", { name: "down" }));
  assert.equal(scrollY.get(), 1);

  terminal.emitKey(keyEvent("", { name: "right" }));
  assert.equal(scrollX.get(), 1);

  terminal.emitKey(keyEvent("", { name: "end" }));
  assert.ok(scrollX.get() > 0);
  assert.ok(scrollY.get() > 0);

  terminal.emitKey(keyEvent("", { name: "home" }));
  assert.equal(scrollX.get(), 0);
  assert.equal(scrollY.get(), 0);

  app.dispose();
});

test("terminal mode reports unmount callback errors after completing dispose cleanup", () => {
  const terminal = createMockTerminal(10, 4);
  const errors: RuntimeLifecycleError[] = [];
  const events: string[] = [];
  const app = createApp(
    elementTemplate("box", {}, [
      elementTemplate("text", {
        value: "A",
        ref(api: MountedElementApi) {
          api.onUnmount = () => {
            events.push("first unmount");
            throw new Error("unmount failed");
          };
        }
      }),
      elementTemplate("text", {
        value: "B",
        ref(api: MountedElementApi) {
          api.onUnmount = () => {
            events.push("second unmount");
          };
        }
      })
    ]),
    {
      terminal,
      onLifecycleError(error) {
        errors.push(error);
      }
    }
  );

  app.start();
  app.dispose();
  app.dispose();
  terminal.emitResize();
  terminal.emitKey(keyEvent("x"));

  assert.deepEqual(events, ["first unmount", "second unmount"]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.phase, "unmount");
  assert.match(String((errors[0]?.error as Error).message), /unmount failed/);
  assert.equal(terminal.disposeCalls, 1);
  assert.equal(terminal.resizeListenerCount(), 0);
  assert.equal(terminal.keyListenerCount(), 0);
  assert.equal(terminal.writes.length, 1);
});

test("terminal mode keeps scroll offset bindings controlled after layout clamp", () => {
  const terminal = createMockTerminal(12, 8);
  const offset = createSignal(0);
  const app = createApp(
    VScrollView({
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
  assert.equal(offset.get(), 99);

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

test("terminal mode scrolls from applied offset without implicit signal writeback", () => {
  const terminal = createMockTerminal(12, 8);
  const offset = createSignal(-4);
  const app = createApp(
    VScrollView({
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

  assert.equal(offset.get(), -4);

  offset.set(1);
  app.render();
  assert.equal(offset.get(), 1);

  offset.set(99);
  app.render();
  assert.equal(offset.get(), 99);

  terminal.emitKey(keyEvent("", { name: "down" }));
  assert.equal(offset.get(), 2);

  app.dispose();
});
