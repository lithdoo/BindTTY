import assert from "node:assert/strict";
import test from "node:test";

import { computed, createSignal } from "@bindtty/signal";
import { createRuntimeRoot, mountTemplate } from "@bindtty/runtime";

test("mounts real TSX templates and updates signal bindings", () => {
  const count = createSignal(0);
  const countLabel = computed(() => `Count: ${count.get()}`);

  const view = (
    <vstack>
      <text value={countLabel} />
    </vstack>
  );

  const root = mountTemplate(view);

  assert.equal(root?.kind, "element");
  assert.equal(root.tag, "vstack");
  assert.equal(root.children.length, 1);

  const text = root.children[0];
  assert.equal(text?.kind, "element");
  assert.equal(text.props.value, "Count: 0");
  assert.equal(text.dirty, null);

  count.set(1);

  assert.equal(text.props.value, "Count: 1");
  assert.equal(text.dirty, "layout");
});

test("RuntimeRoot flushes updates from real TSX templates", async () => {
  const visible = createSignal(true);
  type RowItem = {
    id: number;
    label: ReturnType<typeof createSignal<string>>;
  };
  const items = createSignal([
    { id: 1, label: createSignal("A") },
    { id: 2, label: createSignal("B") }
  ] satisfies RowItem[]);
  const records: unknown[] = [];

  function Row(props: { label: ReturnType<typeof createSignal<string>> }) {
    return <text value={props.label} />;
  }

  const runtime = createRuntimeRoot(
    <vstack>
      <show when={visible} fallback={<text value="Hidden" />}>
        <text value="Visible" />
      </show>
      <for each={items} key={(item) => (item as RowItem).id}>
        {(item) => <Row label={(item as RowItem).label} />}
      </for>
    </vstack>
  );

  runtime.onFlush((record) => {
    records.push(record);
  });

  assert.equal(runtime.root?.kind, "element");
  const showNode = runtime.root.children[0];
  const forNode = runtime.root.children[1];

  visible.set(false);
  items.get()[0]!.label.set("A2");
  items.set([
    { id: 1, label: items.get()[0]!.label },
    { id: 3, label: createSignal("C") }
  ]);

  await Promise.resolve();

  assert.equal(records.length, 1);
  assert.equal(showNode?.kind, "show");
  assert.equal(forNode?.kind, "for");
  assert.equal(showNode.dirty, "structure");
  assert.equal(forNode.dirty, "structure");
  assert.equal(forNode.items[0]?.node.kind, "element");
  assert.equal(forNode.items[0]?.node.props.value, "A2");
});
