import assert from "node:assert/strict";
import test from "node:test";

import { createSignal } from "@bindtty/signal";
import { mountTemplate } from "@bindtty/runtime";
import {
  componentTemplate,
  elementTemplate,
  type MountedNode,
  type Template
} from "@bindtty/vnode";
import { ScrollView, Textarea, TextInput } from "@bindtty/widgets";

function collectTextValues(node: MountedNode | null): string[] {
  if (!node) {
    return [];
  }
  switch (node.kind) {
    case "element":
      return [
        ...(node.tag === "text" && typeof node.props.value === "string"
          ? [node.props.value]
          : []),
        ...node.children.flatMap(collectTextValues)
      ];
    case "fragment":
      return node.children.flatMap(collectTextValues);
    case "show":
      return collectTextValues(node.activeBranch);
    case "for":
      return node.items.flatMap((item) => collectTextValues(item.node));
  }
}

test("TextInput component computed values stop after repeated unmounts", () => {
  const value = createSignal("A");

  for (let index = 0; index < 3; index += 1) {
    const mounted = mountTemplate(componentTemplate(
      (): Template => TextInput({
        value,
        onChange() {}
      }),
      {}
    ));
    assert.ok(collectTextValues(mounted).includes(value.get()));

    value.set(`mounted-${index}`);
    assert.ok(collectTextValues(mounted).includes(`mounted-${index}`));
    mounted?.dispose();
    const disposedValues = collectTextValues(mounted);

    value.set(`disposed-${index}`);
    assert.deepEqual(collectTextValues(mounted), disposedValues);
  }
});

test("Textarea owner releases computed values and internal subscriptions", () => {
  const value = createSignal("first");
  const viewportEvents: number[] = [];
  const mounted = mountTemplate(componentTemplate(
    (): Template => Textarea({
      value,
      onChange() {},
      onViewportRowsChange(rows) {
        viewportEvents.push(rows);
      }
    }),
    {}
  ));

  assert.ok(collectTextValues(mounted).some((text) => text.includes("first")));
  value.set("second");
  assert.ok(collectTextValues(mounted).some((text) => text.includes("second")));

  mounted?.dispose();
  const disposedValues = collectTextValues(mounted);
  const disposedViewportEvents = viewportEvents.length;
  value.set("third");

  assert.deepEqual(collectTextValues(mounted), disposedValues);
  assert.equal(viewportEvents.length, disposedViewportEvents);
});

test("ScrollView component bindings stop following offsets after unmount", () => {
  const offsetY = createSignal(0);
  const mounted = mountTemplate(componentTemplate(
    (): Template => ScrollView({
      width: 10,
      height: 3,
      offsetY,
      children: elementTemplate("text", { value: "content" })
    }),
    {}
  ));

  assert.equal(mounted?.kind, "element");
  assert.equal(mounted.props.scrollY, 0);
  offsetY.set(1);
  assert.equal(mounted.props.scrollY, 1);

  mounted.dispose();
  offsetY.set(2);
  assert.equal(mounted.props.scrollY, 1);
});
