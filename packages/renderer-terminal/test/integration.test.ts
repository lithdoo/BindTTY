import assert from "node:assert/strict";
import test from "node:test";

import { layoutRoot } from "@bindtty/layout";
import { createRuntimeRoot } from "@bindtty/runtime";
import { createSignal } from "@bindtty/signal";
import {
  createTerminalRenderer,
  frameToLines,
  paintLayout
} from "@bindtty/renderer-terminal";
import {
  elementTemplate,
  forTemplate,
  fragmentTemplate,
  showTemplate
} from "@bindtty/vnode";

const viewport = {
  width: 6,
  height: 3
};

test("runtime + layout + renderer updates signal text with a minimal patch", async () => {
  const title = createSignal("A");
  const runtime = createRuntimeRoot(
    elementTemplate("text", {
      value: title
    })
  );
  const renderer = createTerminalRenderer();

  const initialLayout = layoutRoot(runtime.root, { viewport });
  renderer.render(initialLayout, { viewport });

  const patches: string[] = [];
  runtime.onFlush(({ root }) => {
    const layout = layoutRoot(root, { viewport });
    patches.push(renderer.render(layout, { viewport }));
    runtime.clearDirty();
  });

  title.set("B");
  await Promise.resolve();

  assert.deepEqual(patches, ["\x1b[1;1H\x1b[0mB\x1b[0m"]);
});

test("runtime + layout + renderer paints show branch switches", async () => {
  const visible = createSignal(true);
  const runtime = createRuntimeRoot(
    showTemplate({
      when: visible,
      children: elementTemplate("text", { value: "On" }),
      fallback: elementTemplate("text", { value: "Off" })
    })
  );
  const renderer = createTerminalRenderer();

  renderer.render(layoutRoot(runtime.root, { viewport }), { viewport });

  const frames: string[][] = [];
  runtime.onFlush(({ root }) => {
    const layout = layoutRoot(root, { viewport });
    const frame = paintLayout(layout, { viewport });
    frames.push(frameToLines(frame));
    renderer.render(layout, { viewport });
    runtime.clearDirty();
  });

  visible.set(false);
  await Promise.resolve();

  assert.deepEqual(frames, [["Off   ", "      ", "      "]]);
});

test("runtime + layout + renderer paints for keyed reorders", async () => {
  const items = createSignal([
    { id: 1, label: "A" },
    { id: 2, label: "B" }
  ]);
  const runtime = createRuntimeRoot(
    fragmentTemplate([
      forTemplate<{ id: number; label: string }>({
        each: items,
        key: (item) => item.id,
        renderItem: (item) => elementTemplate("text", { value: item.label })
      })
    ])
  );
  const renderer = createTerminalRenderer();

  renderer.render(layoutRoot(runtime.root, { viewport }), { viewport });

  const frames: string[][] = [];
  runtime.onFlush(({ root }) => {
    const layout = layoutRoot(root, { viewport });
    const frame = paintLayout(layout, { viewport });
    frames.push(frameToLines(frame));
    renderer.render(layout, { viewport });
    runtime.clearDirty();
  });

  items.set([
    { id: 2, label: "B" },
    { id: 1, label: "A" },
    { id: 3, label: "C" }
  ]);
  await Promise.resolve();

  assert.deepEqual(frames, [["B     ", "A     ", "C     "]]);
});
