import assert from "node:assert/strict";
import test from "node:test";

import { createApp, type AppStdout } from "bindtty";
import { createSignal } from "@bindtty/signal";
import type { ReadableSignal, Template } from "@bindtty/vnode";

interface MockStdout extends AppStdout {
  writes: string[];
}

function createMockStdout(columns: number, rows: number): MockStdout {
  return {
    columns,
    rows,
    writes: [],
    write(chunk: string) {
      this.writes.push(chunk);
    }
  };
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
}

function Title(props: { value: ReadableSignal<string> }): Template {
  return <text value={props.value} />;
}

test("createApp renders real TSX templates", () => {
  const stdout = createMockStdout(1, 2);
  const title = createSignal("A");
  const ready = createSignal(false);

  const app = createApp(
    <vstack>
      <Title value={title} />
      <show when={ready} fallback={<text value="N" />}>
        <text value="Y" />
      </show>
    </vstack>,
    { stdout }
  );

  app.start();

  assert.equal(stdout.writes.length, 1);
  assert.match(stdout.writes[0], /A/);
  assert.match(stdout.writes[0], /N/);
});

test("createApp updates real TSX signal bindings", async () => {
  const stdout = createMockStdout(1, 2);
  const title = createSignal("A");
  const ready = createSignal(false);
  const app = createApp(
    <vstack>
      <Title value={title} />
      <show when={ready} fallback={<text value="N" />}>
        <text value="Y" />
      </show>
    </vstack>,
    { stdout }
  );

  app.start();
  title.set("B");
  ready.set(true);
  await nextMicrotask();

  assert.equal(stdout.writes.length, 2);
  assert.match(stdout.writes[1], /B/);
  assert.match(stdout.writes[1], /Y/);
});
