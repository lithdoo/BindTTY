import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeRoot } from "@bindtty/runtime";
import { createSignal } from "@bindtty/signal";
import {
  createBasicLayoutEngine,
  layoutRoot,
  type LayoutEngine,
  type LayoutViewport
} from "@bindtty/layout";
import { elementTemplate, forTemplate, fragmentTemplate, showTemplate } from "@bindtty/vnode";
import type {
  MountedElementNode,
  MountedForNode,
  MountedFragmentNode,
  MountedNode,
  MountedShowNode
} from "@bindtty/vnode";

const viewport: LayoutViewport = {
  width: 80,
  height: 24
};

function createMountedElement(
  tag: MountedElementNode["tag"],
  props: Record<string, unknown> = {},
  children: MountedNode[] = []
): MountedElementNode {
  const node: MountedElementNode = {
    kind: "element",
    tag,
    props,
    propSources: props,
    bindings: {},
    children,
    state: {},
    dirty: null,
    dispose() {}
  };

  return node;
}

function createMountedText(value = "Hello"): MountedElementNode {
  return createMountedElement("text", { value });
}

function createMountedFragment(children: MountedNode[]): MountedFragmentNode {
  return {
    kind: "fragment",
    children,
    dirty: null,
    dispose() {}
  };
}

function createMountedShow(activeBranch: MountedNode | null): MountedShowNode {
  return {
    kind: "show",
    when: true,
    activeTemplate: null,
    activeBranch,
    dirty: null,
    dispose() {}
  };
}

function createMountedFor(nodes: MountedNode[]): MountedForNode {
  return {
    kind: "for",
    each: [],
    items: nodes.map((node, index) => ({
      key: index,
      item: index,
      node
    })),
    dirty: null,
    dispose() {}
  };
}

test("layoutRoot returns null for null roots", () => {
  assert.equal(layoutRoot(null, { viewport }), null);
});

test("layoutRoot uses BasicLayoutEngine by default", () => {
  const root = createMountedText();
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout, {
    mounted: root,
    rect: {
      x: 0,
      y: 0,
      width: 5,
      height: 1
    },
    contentRect: {
      x: 0,
      y: 0,
      width: 5,
      height: 1
    },
    children: []
  });
});

test("layoutRoot accepts a custom layout engine", () => {
  const root = createMountedText();
  const calls: Array<{ root: MountedNode | null; viewport: LayoutViewport }> = [];
  const engine: LayoutEngine = {
    layout(nextRoot, options) {
      calls.push({
        root: nextRoot,
        viewport: options.viewport
      });

      return null;
    }
  };

  assert.equal(layoutRoot(root, { viewport, engine }), null);
  assert.deepEqual(calls, [{ root, viewport }]);
});

test("createBasicLayoutEngine exposes the layout engine contract", () => {
  const root = createMountedText();
  const engine = createBasicLayoutEngine();
  const layout = engine.layout(root, { viewport });

  assert.equal(layout?.mounted, root);
  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 5,
    height: 1
  });
  assert.deepEqual(layout?.contentRect, layout?.rect);
  assert.deepEqual(layout?.children, []);
});

test("lays out text as a single line using string length", () => {
  const root = createMountedText("BindTTY");
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 7,
    height: 1
  });
  assert.deepEqual(layout?.contentRect, layout?.rect);
});

test("lays out vstack children in column flow", () => {
  const first = createMountedText("A");
  const second = createMountedText("Long");
  const root = createMountedElement("vstack", {}, [first, second]);
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 4,
    height: 2
  });
  assert.equal(layout.children.length, 2);
  assert.deepEqual(layout.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 1,
    height: 1
  });
  assert.deepEqual(layout.children[1]?.rect, {
    x: 0,
    y: 1,
    width: 4,
    height: 1
  });
});

test("lays out hstack children in row flow", () => {
  const first = createMountedText("A");
  const second = createMountedText("BC");
  const root = createMountedElement("hstack", {}, [first, second]);
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 3,
    height: 1
  });
  assert.deepEqual(layout.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 1,
    height: 1
  });
  assert.deepEqual(layout.children[1]?.rect, {
    x: 1,
    y: 0,
    width: 2,
    height: 1
  });
});

test("lays out box content using padding and border", () => {
  const child = createMountedText("Hi");
  const root = createMountedElement("box", { padding: 1, border: true }, [child]);
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 6,
    height: 5
  });
  assert.deepEqual(layout?.contentRect, {
    x: 2,
    y: 2,
    width: 2,
    height: 1
  });
  assert.deepEqual(layout.children[0]?.rect, {
    x: 2,
    y: 2,
    width: 2,
    height: 1
  });
});

test("lays out empty boxes using padding and border only", () => {
  const root = createMountedElement("box", { padding: 1, border: true });
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 4,
    height: 4
  });
  assert.deepEqual(layout?.contentRect, {
    x: 2,
    y: 2,
    width: 0,
    height: 0
  });
  assert.deepEqual(layout?.children, []);
});

test("lays out screen at viewport size", () => {
  const child = createMountedText("A");
  const root = createMountedElement("screen", {}, [child]);
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 80,
    height: 24
  });
  assert.deepEqual(layout?.contentRect, layout?.rect);
  assert.deepEqual(layout.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 1,
    height: 1
  });
});

test("lays out spacer according to parent flow", () => {
  const columnSpacer = createMountedElement("spacer", { size: 2 });
  const rowSpacer = createMountedElement("spacer", { size: 3 });
  const columnRoot = createMountedElement("vstack", {}, [columnSpacer]);
  const rowRoot = createMountedElement("hstack", {}, [rowSpacer]);

  const columnLayout = layoutRoot(columnRoot, { viewport });
  const rowLayout = layoutRoot(rowRoot, { viewport });

  assert.deepEqual(columnLayout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 80,
    height: 2
  });
  assert.deepEqual(rowLayout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 3,
    height: 24
  });
});

test("treats invalid and negative spacer sizes as zero", () => {
  const negativeSpacer = createMountedElement("spacer", { size: -2 });
  const invalidSpacer = createMountedElement("spacer", { size: "large" });
  const root = createMountedElement("vstack", {}, [negativeSpacer, invalidSpacer]);
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 80,
    height: 0
  });
  assert.deepEqual(layout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 80,
    height: 0
  });
  assert.deepEqual(layout?.children[1]?.rect, {
    x: 0,
    y: 0,
    width: 80,
    height: 0
  });
});

test("throws for unsupported layout elements", () => {
  assert.throws(
    () => layoutRoot(createMountedElement("button", { value: "Click" }), { viewport }),
    /Unsupported layout element: button/
  );

  assert.throws(
    () => layoutRoot(createMountedElement("input"), { viewport }),
    /Unsupported layout element: input/
  );
});

test("throws for unsupported future layout props and duplicate aliases", () => {
  assert.throws(
    () => layoutRoot(createMountedElement("box", { paddingTop: 1 }), { viewport }),
    /Unsupported layout prop: paddingTop/
  );

  assert.throws(
    () =>
      layoutRoot(
        createMountedElement("box", { paddingTop: 1, "padding-top": 2 }),
        { viewport }
      ),
    /Duplicate layout prop: paddingTop \/ padding-top/
  );
});

test("ignores non-layout paint props while measuring layout", () => {
  const root = createMountedElement("text", {
    value: "Color",
    color: "green",
    bold: true
  });
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 5,
    height: 1
  });
});

test("ignores interaction props while measuring layout", () => {
  const root = createMountedElement("box", {
    id: "panel",
    onKey: true,
    onFocusChange: () => {},
    padding: 1
  }, [createMountedText("A")]);
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 3,
    height: 3
  });
});

test("lays out fragment roots with column fallback flow", () => {
  const root = createMountedFragment([
    createMountedText("A"),
    createMountedText("BC")
  ]);
  const layout = layoutRoot(root, { viewport });

  assert.equal(layout?.mounted, root);
  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 2,
    height: 2
  });
  assert.deepEqual(layout?.contentRect, layout.rect);
  assert.deepEqual(layout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 1,
    height: 1
  });
  assert.deepEqual(layout?.children[1]?.rect, {
    x: 0,
    y: 1,
    width: 2,
    height: 1
  });
});

test("lays out show active branches and empty show nodes", () => {
  const activeRoot = createMountedShow(createMountedText("Visible"));
  const emptyRoot = createMountedShow(null);

  const activeLayout = layoutRoot(activeRoot, { viewport });
  const emptyLayout = layoutRoot(emptyRoot, { viewport });

  assert.deepEqual(activeLayout?.rect, {
    x: 0,
    y: 0,
    width: 7,
    height: 1
  });
  assert.equal(activeLayout?.children.length, 1);
  assert.deepEqual(activeLayout?.children[0]?.rect, activeLayout?.rect);

  assert.deepEqual(emptyLayout?.rect, {
    x: 0,
    y: 0,
    width: 0,
    height: 0
  });
  assert.deepEqual(emptyLayout?.children, []);
});

test("lays out for roots with column fallback flow", () => {
  const root = createMountedFor([
    createMountedText("A"),
    createMountedText("BCD")
  ]);
  const layout = layoutRoot(root, { viewport });

  assert.equal(layout?.mounted, root);
  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 3,
    height: 2
  });
  assert.deepEqual(layout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 1,
    height: 1
  });
  assert.deepEqual(layout?.children[1]?.rect, {
    x: 0,
    y: 1,
    width: 3,
    height: 1
  });
});

test("structure nodes inherit row flow from hstack parents", () => {
  const forNode = createMountedFor([
    createMountedText("A"),
    createMountedText("BC")
  ]);
  const root = createMountedElement("hstack", {}, [
    createMountedText("X"),
    forNode
  ]);
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 4,
    height: 1
  });

  const forLayout = layout?.children[1];
  assert.equal(forLayout?.mounted, forNode);
  assert.deepEqual(forLayout?.rect, {
    x: 1,
    y: 0,
    width: 3,
    height: 1
  });
  assert.deepEqual(forLayout?.children[0]?.rect, {
    x: 1,
    y: 0,
    width: 1,
    height: 1
  });
  assert.deepEqual(forLayout?.children[1]?.rect, {
    x: 2,
    y: 0,
    width: 2,
    height: 1
  });
});

test("structure nodes inherit column flow from vstack parents", () => {
  const fragment = createMountedFragment([
    createMountedText("A"),
    createMountedText("BC")
  ]);
  const root = createMountedElement("vstack", {}, [
    createMountedText("Top"),
    fragment
  ]);
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 3,
    height: 3
  });

  const fragmentLayout = layout?.children[1];
  assert.equal(fragmentLayout?.mounted, fragment);
  assert.deepEqual(fragmentLayout?.rect, {
    x: 0,
    y: 1,
    width: 2,
    height: 2
  });
  assert.deepEqual(fragmentLayout?.children[0]?.rect, {
    x: 0,
    y: 1,
    width: 1,
    height: 1
  });
  assert.deepEqual(fragmentLayout?.children[1]?.rect, {
    x: 0,
    y: 2,
    width: 2,
    height: 1
  });
});

test("nested structure nodes recursively inherit the nearest explicit flow", () => {
  const nested = createMountedShow(
    createMountedFragment([
      createMountedText("A"),
      createMountedText("BC")
    ])
  );
  const root = createMountedElement("hstack", {}, [
    createMountedText("X"),
    nested
  ]);
  const layout = layoutRoot(root, { viewport });

  const showLayout = layout?.children[1];
  const fragmentLayout = showLayout?.children[0];

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 4,
    height: 1
  });
  assert.deepEqual(showLayout?.rect, {
    x: 1,
    y: 0,
    width: 3,
    height: 1
  });
  assert.deepEqual(fragmentLayout?.rect, {
    x: 1,
    y: 0,
    width: 3,
    height: 1
  });
  assert.deepEqual(fragmentLayout?.children[0]?.rect, {
    x: 1,
    y: 0,
    width: 1,
    height: 1
  });
  assert.deepEqual(fragmentLayout?.children[1]?.rect, {
    x: 2,
    y: 0,
    width: 2,
    height: 1
  });
});

test("keeps non-screen root natural size without clipping to the viewport", () => {
  const smallViewport = {
    width: 3,
    height: 1
  };
  const child = createMountedText("ABCDE");
  const root = createMountedElement("vstack", {}, [child]);
  const layout = layoutRoot(root, { viewport: smallViewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 5,
    height: 1
  });
  assert.deepEqual(layout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 5,
    height: 1
  });
});

test("uses absolute rects for nested renderer-facing layout nodes", () => {
  const text = createMountedText("Hi");
  const inner = createMountedElement("box", { padding: 1, border: true }, [text]);
  const outer = createMountedElement("box", { padding: 1, border: true }, [inner]);
  const layout = layoutRoot(outer, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 10,
    height: 9
  });
  assert.deepEqual(layout?.contentRect, {
    x: 2,
    y: 2,
    width: 6,
    height: 5
  });

  const innerLayout = layout?.children[0];
  assert.deepEqual(innerLayout?.rect, {
    x: 2,
    y: 2,
    width: 6,
    height: 5
  });
  assert.deepEqual(innerLayout?.contentRect, {
    x: 4,
    y: 4,
    width: 2,
    height: 1
  });
  assert.deepEqual(innerLayout?.children[0]?.rect, {
    x: 4,
    y: 4,
    width: 2,
    height: 1
  });
});

test("keeps structure nodes as transparent renderer-facing layout nodes", () => {
  const fragment = createMountedFragment([
    createMountedText("A"),
    createMountedText("BC")
  ]);
  const show = createMountedShow(fragment);
  const root = createMountedElement("box", { padding: 1 }, [show]);
  const layout = layoutRoot(root, { viewport });

  const showLayout = layout?.children[0];
  const fragmentLayout = showLayout?.children[0];

  assert.equal(showLayout?.mounted, show);
  assert.equal(fragmentLayout?.mounted, fragment);
  assert.deepEqual(showLayout?.contentRect, showLayout?.rect);
  assert.deepEqual(fragmentLayout?.contentRect, fragmentLayout?.rect);
  assert.deepEqual(showLayout?.rect, {
    x: 1,
    y: 1,
    width: 2,
    height: 2
  });
  assert.deepEqual(fragmentLayout?.rect, showLayout?.rect);
  assert.deepEqual(fragmentLayout?.children[0]?.rect, {
    x: 1,
    y: 1,
    width: 1,
    height: 1
  });
  assert.deepEqual(fragmentLayout?.children[1]?.rect, {
    x: 1,
    y: 2,
    width: 2,
    height: 1
  });
});

test("runtime flush can relayout changed text values", async () => {
  const title = createSignal("A");
  const runtime = createRuntimeRoot(elementTemplate("text", { value: title }));
  const layouts: NonNullable<ReturnType<typeof layoutRoot>>[] = [];

  runtime.onFlush(({ root }) => {
    const layout = layoutRoot(root, { viewport });

    if (layout) {
      layouts.push(layout);
    }

    runtime.clearDirty();
  });

  title.set("Long");
  await Promise.resolve();

  assert.equal(layouts.length, 1);
  assert.deepEqual(layouts[0]?.rect, {
    x: 0,
    y: 0,
    width: 4,
    height: 1
  });
  assert.equal(runtime.root?.dirty, null);
});

test("runtime flush can relayout show branch switches", async () => {
  const visible = createSignal(true);
  const runtime = createRuntimeRoot(
    showTemplate({
      when: visible,
      children: elementTemplate("text", { value: "On" }),
      fallback: elementTemplate("text", { value: "Hidden" })
    })
  );
  const layouts: NonNullable<ReturnType<typeof layoutRoot>>[] = [];

  runtime.onFlush(({ root }) => {
    const layout = layoutRoot(root, { viewport });

    if (layout) {
      layouts.push(layout);
    }

    runtime.clearDirty();
  });

  visible.set(false);
  await Promise.resolve();

  assert.equal(layouts.length, 1);
  assert.equal(layouts[0]?.mounted.kind, "show");
  assert.deepEqual(layouts[0]?.rect, {
    x: 0,
    y: 0,
    width: 6,
    height: 1
  });
  assert.deepEqual(layouts[0]?.children[0]?.rect, layouts[0]?.rect);
});

test("runtime flush can relayout for item updates", async () => {
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
  const layouts: NonNullable<ReturnType<typeof layoutRoot>>[] = [];

  runtime.onFlush(({ root }) => {
    const layout = layoutRoot(root, { viewport });

    if (layout) {
      layouts.push(layout);
    }

    runtime.clearDirty();
  });

  items.set([
    { id: 1, label: "A" },
    { id: 2, label: "B" },
    { id: 3, label: "CCC" }
  ]);
  await Promise.resolve();

  assert.equal(layouts.length, 1);
  assert.deepEqual(layouts[0]?.rect, {
    x: 0,
    y: 0,
    width: 3,
    height: 3
  });

  const forLayout = layouts[0]?.children[0];
  assert.equal(forLayout?.mounted.kind, "for");
  assert.deepEqual(forLayout?.children[2]?.rect, {
    x: 0,
    y: 2,
    width: 3,
    height: 1
  });
});
