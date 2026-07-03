import assert from "node:assert/strict";
import test from "node:test";

import { createSignal } from "@bindtty/signal";
import {
  elementTemplate,
  emptyTemplate,
  forTemplate,
  fragmentTemplate,
  showTemplate
} from "@bindtty/vnode";
import { createRuntimeRoot } from "@bindtty/runtime";
import type { MountedElementApi, Template } from "@bindtty/vnode";
import type {
  RuntimeFlushRecord,
  RuntimeLifecycleError
} from "@bindtty/runtime";

test("createRuntimeRoot mounts and exposes root", () => {
  const runtime = createRuntimeRoot(elementTemplate("text", { value: "Hello" }));

  assert.equal(runtime.root?.kind, "element");
  assert.equal(runtime.root.props.value, "Hello");
});

test("createRuntimeRoot supports empty roots", () => {
  const runtime = createRuntimeRoot(emptyTemplate());
  let calls = 0;

  runtime.onFlush(() => {
    calls += 1;
  });

  assert.equal(runtime.root, null);
  assert.equal(runtime.flushNow(), null);
  runtime.clearDirty();
  runtime.dispose();
  runtime.dispose();
  assert.equal(calls, 0);
});

test("signal prop updates queue a microtask flush", async () => {
  const title = createSignal("A");
  const runtime = createRuntimeRoot(elementTemplate("text", { value: title }));
  const records: RuntimeFlushRecord[] = [];

  runtime.onFlush((record) => {
    records.push(record);
  });

  title.set("B");
  await Promise.resolve();

  assert.equal(records.length, 1);
  assert.equal(records[0]?.root, runtime.root);
  assert.equal(records[0]?.dirtyNodes.length, 1);
  assert.equal(records[0]?.dirtyNodes[0], runtime.root);
  assert.equal(runtime.root?.kind, "element");
  assert.equal(runtime.root.props.value, "B");
});

test("signal prop updates do not flush synchronously", async () => {
  const title = createSignal("A");
  const runtime = createRuntimeRoot(elementTemplate("text", { value: title }));
  let calls = 0;

  runtime.onFlush(() => {
    calls += 1;
  });

  title.set("B");

  assert.equal(calls, 0);

  await Promise.resolve();

  assert.equal(calls, 1);
});

test("flush coalesces repeated updates to the same node", () => {
  const title = createSignal("A");
  const runtime = createRuntimeRoot(elementTemplate("text", { value: title }));
  const records: RuntimeFlushRecord[] = [];

  runtime.onFlush((record) => {
    records.push(record);
  });

  title.set("B");
  title.set("C");

  const record = runtime.flushNow();

  assert.equal(records.length, 1);
  assert.equal(record?.dirtyNodes.length, 1);
  assert.equal(record?.dirtyNodes[0], runtime.root);
  assert.equal(runtime.root?.kind, "element");
  assert.equal(runtime.root.props.value, "C");
});

test("microtask flush coalesces multiple same-tick updates into one listener call", async () => {
  const first = createSignal("A");
  const second = createSignal("B");
  const runtime = createRuntimeRoot(
    fragmentTemplate([
      elementTemplate("text", { value: first }),
      elementTemplate("text", { value: second })
    ])
  );
  const records: RuntimeFlushRecord[] = [];

  runtime.onFlush((record) => {
    records.push(record);
  });

  first.set("A2");
  second.set("B2");
  first.set("A3");

  await Promise.resolve();

  assert.equal(records.length, 1);
  assert.equal(records[0]?.dirtyNodes.length, 2);
});

test("manual flush prevents the queued microtask from emitting an empty flush", async () => {
  const title = createSignal("A");
  const runtime = createRuntimeRoot(elementTemplate("text", { value: title }));
  let calls = 0;

  runtime.onFlush(() => {
    calls += 1;
  });

  title.set("B");

  const record = runtime.flushNow();
  await Promise.resolve();

  assert.equal(record?.dirtyNodes.length, 1);
  assert.equal(calls, 1);
});

test("updates triggered inside a flush listener are emitted in the next flush", async () => {
  const first = createSignal("A");
  const second = createSignal("B");
  const runtime = createRuntimeRoot(
    fragmentTemplate([
      elementTemplate("text", { value: first }),
      elementTemplate("text", { value: second })
    ])
  );
  assert.equal(runtime.root?.kind, "fragment");
  const firstNode = runtime.root.children[0];
  const secondNode = runtime.root.children[1];
  const records: RuntimeFlushRecord[] = [];

  runtime.onFlush((record) => {
    records.push(record);

    if (records.length === 1) {
      second.set("B2");
    }
  });

  first.set("A2");

  await Promise.resolve();

  assert.equal(records.length, 1);
  assert.deepEqual(records[0]?.dirtyNodes, [firstNode]);

  await Promise.resolve();

  assert.equal(records.length, 2);
  assert.deepEqual(records[1]?.dirtyNodes, [secondNode]);
});

test("flush includes multiple dirty nodes in one record", () => {
  const first = createSignal("A");
  const second = createSignal("B");
  const runtime = createRuntimeRoot(
    fragmentTemplate([
      elementTemplate("text", { value: first }),
      elementTemplate("text", { value: second })
    ])
  );

  assert.equal(runtime.root?.kind, "fragment");
  const firstNode = runtime.root.children[0];
  const secondNode = runtime.root.children[1];

  first.set("A2");
  second.set("B2");

  const record = runtime.flushNow();

  assert.deepEqual(record?.dirtyNodes, [firstNode, secondNode]);
});

test("multiple RuntimeRoot instances keep scheduler queues isolated", async () => {
  const firstTitle = createSignal("A");
  const secondTitle = createSignal("B");
  const firstRuntime = createRuntimeRoot(elementTemplate("text", { value: firstTitle }));
  const secondRuntime = createRuntimeRoot(elementTemplate("text", { value: secondTitle }));
  const firstRecords: RuntimeFlushRecord[] = [];
  const secondRecords: RuntimeFlushRecord[] = [];

  firstRuntime.onFlush((record) => {
    firstRecords.push(record);
  });
  secondRuntime.onFlush((record) => {
    secondRecords.push(record);
  });

  firstTitle.set("A2");

  await Promise.resolve();

  assert.equal(firstRecords.length, 1);
  assert.equal(firstRecords[0]?.root, firstRuntime.root);
  assert.deepEqual(firstRecords[0]?.dirtyNodes, [firstRuntime.root]);
  assert.equal(secondRecords.length, 0);

  secondTitle.set("B2");

  await Promise.resolve();

  assert.equal(firstRecords.length, 1);
  assert.equal(secondRecords.length, 1);
  assert.equal(secondRecords[0]?.root, secondRuntime.root);
  assert.deepEqual(secondRecords[0]?.dirtyNodes, [secondRuntime.root]);
});

test("onFlush returns an unsubscribe function", () => {
  const title = createSignal("A");
  const runtime = createRuntimeRoot(elementTemplate("text", { value: title }));
  let calls = 0;

  const unsubscribe = runtime.onFlush(() => {
    calls += 1;
  });

  unsubscribe();
  title.set("B");
  runtime.flushNow();

  assert.equal(calls, 0);
});

test("onFlush after RuntimeRoot.dispose returns a noop unsubscribe", () => {
  const title = createSignal("A");
  const runtime = createRuntimeRoot(elementTemplate("text", { value: title }));
  let calls = 0;

  runtime.dispose();

  const unsubscribe = runtime.onFlush(() => {
    calls += 1;
  });

  title.set("B");
  unsubscribe();

  assert.equal(runtime.flushNow(), null);
  assert.equal(calls, 0);
});

test("queued nodes disposed before flush are filtered out", () => {
  const title = createSignal("A");
  const runtime = createRuntimeRoot(elementTemplate("text", { value: title }));

  title.set("B");
  runtime.root?.dispose();

  assert.equal(runtime.flushNow(), null);
});

test("show and for structure updates queue control nodes", () => {
  const visible = createSignal(true);
  const items = createSignal([{ id: 1, title: "A" }]);
  const runtime = createRuntimeRoot(
    fragmentTemplate([
      showTemplate({
        when: visible,
        children: elementTemplate("text", { value: "Visible" }),
        fallback: elementTemplate("text", { value: "Hidden" })
      }),
      forTemplate<{ id: number; title: string }>({
        each: items,
        key: (item) => item.id,
        renderItem: (item) => elementTemplate("text", { value: item.title })
      })
    ])
  );

  assert.equal(runtime.root?.kind, "fragment");
  const showNode = runtime.root.children[0];
  const forNode = runtime.root.children[1];

  visible.set(false);
  items.set([
    { id: 1, title: "A" },
    { id: 2, title: "B" }
  ]);

  const record = runtime.flushNow();

  assert.deepEqual(record?.dirtyNodes, [showNode, forNode]);
});

test("show branch unmount errors do not stop mounting the next branch", () => {
  const visible = createSignal(true);
  const errors: RuntimeLifecycleError[] = [];
  const runtime = createRuntimeRoot(
    showTemplate({
      when: visible,
      children: elementTemplate("text", {
        value: "Visible",
        ref(api: MountedElementApi) {
          api.onUnmount = () => {
            throw new Error("unmount failed");
          };
        }
      }),
      fallback: elementTemplate("text", { value: "Hidden" })
    }),
    {
      onLifecycleError(error) {
        errors.push(error);
      }
    }
  );
  assert.equal(runtime.root?.kind, "show");

  visible.set(false);
  runtime.flushNow();

  assert.equal(runtime.root.activeBranch?.kind, "element");
  assert.equal(runtime.root.activeBranch.props.value, "Hidden");
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.phase, "unmount");
  assert.match(String((errors[0]?.error as Error).message), /unmount failed/);
});

test("clearDirty clears the mounted tree recursively", () => {
  const title = createSignal("A");
  const visible = createSignal(true);
  const runtime = createRuntimeRoot(
    fragmentTemplate([
      elementTemplate("text", { value: title }),
      showTemplate({
        when: visible,
        children: elementTemplate("text", { value: title })
      })
    ])
  );

  assert.equal(runtime.root?.kind, "fragment");
  const textNode = runtime.root.children[0];
  const showNode = runtime.root.children[1];
  assert.equal(showNode?.kind, "show");
  const activeBranch = showNode.activeBranch;

  title.set("B");
  visible.set(false);
  runtime.flushNow();

  assert.equal(textNode?.dirty, "layout");
  assert.equal(showNode.dirty, "structure");
  assert.equal(activeBranch?.dirty, "layout");

  runtime.clearDirty();

  assert.equal(runtime.root.dirty, null);
  assert.equal(textNode?.dirty, null);
  assert.equal(showNode.dirty, null);
  assert.equal(activeBranch?.dirty, "layout");
});

test("clearDirty clears for item nodes recursively", () => {
  const title = createSignal("A");
  const runtime = createRuntimeRoot(
    forTemplate<{ id: number; title: typeof title }>({
      each: [{ id: 1, title }],
      key: (item) => item.id,
      renderItem: (item) => elementTemplate("text", { value: item.title })
    })
  );

  assert.equal(runtime.root?.kind, "for");
  const itemNode = runtime.root.items[0]?.node;

  title.set("B");
  runtime.flushNow();

  assert.equal(itemNode?.dirty, "layout");

  runtime.clearDirty();

  assert.equal(runtime.root.dirty, null);
  assert.equal(itemNode?.dirty, null);
});

test("clearDirty does not visit removed for item nodes", () => {
  const title = createSignal("A");
  const items = createSignal([{ id: 1, title }]);
  const runtime = createRuntimeRoot(
    forTemplate<{ id: number; title: typeof title }>({
      each: items,
      key: (item) => item.id,
      renderItem: (item) => elementTemplate("text", { value: item.title })
    })
  );

  assert.equal(runtime.root?.kind, "for");
  const removedNode = runtime.root.items[0]?.node;
  assert.equal(removedNode?.kind, "element");

  title.set("B");
  items.set([]);
  runtime.flushNow();

  assert.equal(removedNode.dirty, "layout");

  runtime.clearDirty();

  assert.equal(runtime.root.dirty, null);
  assert.equal(removedNode.dirty, "layout");
});

test("RuntimeRoot.dispose disposes root, listeners, and pending queue", () => {
  const title = createSignal("A");
  const runtime = createRuntimeRoot(elementTemplate("text", { value: title }));
  let calls = 0;

  runtime.onFlush(() => {
    calls += 1;
  });

  title.set("B");
  runtime.dispose();
  title.set("C");

  assert.equal(runtime.flushNow(), null);
  assert.equal(calls, 0);
  assert.equal(runtime.root?.kind, "element");
  assert.equal(runtime.root.props.value, "B");
});

test("RuntimeRoot.dispose is idempotent and prevents later signal updates", () => {
  const title = createSignal("A");
  const runtime = createRuntimeRoot(elementTemplate("text", { value: title }));

  assert.equal(runtime.root?.kind, "element");
  const root = runtime.root;

  runtime.dispose();
  runtime.dispose();
  title.set("B");

  assert.equal(root.props.value, "A");
  assert.equal(runtime.flushNow(), null);
});

test("RuntimeRoot accepts component templates", () => {
  function App(): Template {
    return elementTemplate("text", { value: "App" });
  }

  const runtime = createRuntimeRoot({
    kind: "component",
    component: App,
    props: {}
  });

  assert.equal(runtime.root?.kind, "element");
  assert.equal(runtime.root.props.value, "App");
});
