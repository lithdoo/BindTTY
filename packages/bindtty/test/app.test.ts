import assert from "node:assert/strict";
import test from "node:test";

import { createApp, type AppStdout, type CreateAppOptions } from "bindtty";
import { createSignal } from "@bindtty/signal";
import { elementTemplate, forTemplate, showTemplate } from "@bindtty/vnode";

interface MockStdout extends AppStdout {
  writes: string[];
  listenerCount(): number;
  emitResize(): void;
}

interface MockStdin {
  rawModeCalls: number;
  setRawMode(value: boolean): void;
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

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
}

test("bindtty exports the createApp entrypoint", () => {
  assert.equal(typeof createApp, "function");
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
