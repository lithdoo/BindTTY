import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeRoot } from "@bindtty/runtime";
import { createSignal } from "@bindtty/signal";
import {
  createBasicLayoutEngine,
  createYogaLayoutEngine,
  futureLayoutProps,
  getLayoutPropMatrixStatus,
  layoutRoot,
  matrixLayoutProps,
  resolveMargin,
  resolvePadding,
  yogaSupportedPropsByTag,
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

function layoutRootWithBasic(
  root: MountedNode | null,
  nextViewport: LayoutViewport = viewport
): ReturnType<typeof layoutRoot> {
  return layoutRoot(root, {
    viewport: nextViewport,
    engine: createBasicLayoutEngine()
  });
}

function layoutRootWithYoga(
  root: MountedNode | null,
  nextViewport: LayoutViewport = viewport
): ReturnType<typeof layoutRoot> {
  return layoutRoot(root, {
    viewport: nextViewport,
    engine: createYogaLayoutEngine()
  });
}

function layoutRootWithBasicAndYoga(
  root: MountedNode,
  nextViewport: LayoutViewport = viewport
): {
  basicLayout: ReturnType<typeof layoutRoot>;
  yogaLayout: ReturnType<typeof layoutRoot>;
} {
  return {
    basicLayout: layoutRootWithBasic(root, nextViewport),
    yogaLayout: layoutRootWithYoga(root, nextViewport)
  };
}

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

test("layoutRoot uses YogaLayoutEngine by default", () => {
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

test("layoutRoot default supports Yoga-only props", () => {
  const root = createMountedElement(
    "hstack",
    {
      gap: 1
    },
    [createMountedText("A"), createMountedText("B")]
  );
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.children[1]?.rect, {
    x: 2,
    y: 0,
    width: 1,
    height: 1
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
  const layout = layoutRootWithBasic(root);

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 7,
    height: 1
  });
  assert.deepEqual(layout?.contentRect, layout?.rect);
});

test("lays out text wrap none with explicit newlines", () => {
  const root = createMountedElement("text", {
    value: "A\nLong",
    wrap: "none"
  });
  const layout = layoutRootWithBasic(root);

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 4,
    height: 2
  });
});

test("lays out wrapped text using available constraint width", () => {
  const first = createMountedElement("text", {
    value: "hello world",
    wrap: "wrap"
  });
  const second = createMountedText("Z");
  const root = createMountedElement("box", { width: 5 }, [first, second]);
  const layout = layoutRootWithBasic(root);

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 5,
    height: 3
  });
  assert.deepEqual(layout.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 5,
    height: 2
  });
  assert.deepEqual(layout.children[1]?.rect, {
    x: 0,
    y: 2,
    width: 1,
    height: 1
  });
});

test("records clipped box content size from wrapped text", () => {
  const child = createMountedElement("text", {
    value: "hello world",
    wrap: "wrap"
  });
  const root = createMountedElement(
    "box",
    {
      width: 5,
      height: 1,
      overflow: "clip",
      scrollY: 9
    },
    [child]
  );
  const layout = layoutRootWithBasic(root);

  assert.deepEqual(layout?.contentSize, {
    width: 5,
    height: 2
  });
  assert.deepEqual(layout?.scrollOffset, {
    x: 0,
    y: 1
  });
});

test("throws for unsupported text wrap values", () => {
  const root = createMountedElement("text", {
    value: "A",
    wrap: "later"
  });

  assert.throws(
    () => layoutRoot(root, { viewport }),
    /Unsupported text wrap mode/
  );
});

test("lays out vstack children in column flow", () => {
  const first = createMountedText("A");
  const second = createMountedText("Long");
  const root = createMountedElement("vstack", {}, [first, second]);
  const layout = layoutRootWithBasic(root);

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
  const layout = layoutRootWithBasic(root);

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
  const layout = layoutRootWithBasic(root);

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
  const layout = layoutRootWithBasic(root);

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

test("lays out boxes with fixed width and height", () => {
  const child = createMountedText("Long child");
  const root = createMountedElement("box", {
    width: 6,
    height: 3
  }, [child]);
  const layout = layoutRootWithBasic(root);

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 6,
    height: 3
  });
  assert.deepEqual(layout?.contentRect, layout?.rect);
  assert.deepEqual(layout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 10,
    height: 1
  });
});

test("treats invalid and negative box fixed sizes as zero", () => {
  const root = createMountedElement("box", {
    width: "wide",
    height: -2
  }, [createMountedText("Hidden")]);
  const layout = layoutRootWithBasic(root);

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 0,
    height: 0
  });
  assert.deepEqual(layout?.contentRect, layout?.rect);
});

test("lays out screen at viewport size", () => {
  const child = createMountedText("A");
  const root = createMountedElement("screen", {}, [child]);
  const layout = layoutRootWithBasic(root);

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

  const columnLayout = layoutRootWithBasic(columnRoot);
  const rowLayout = layoutRootWithBasic(rowRoot);

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
  const layout = layoutRootWithBasic(root);

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
    () => layoutRoot(createMountedElement("box", { flexDirection: "row" }), { viewport }),
    /Unsupported layout prop: flexDirection/
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

test("throws for unsupported overflow values", () => {
  assert.throws(
    () => layoutRoot(createMountedElement("box", { overflow: "scroll" }), { viewport }),
    /Unsupported overflow value: scroll/
  );
});

test("outputs clip and content size for clipped boxes", () => {
  const root = createMountedElement("box", {
    height: 2,
    overflow: "clip"
  }, [
    createMountedText("A"),
    createMountedText("BC"),
    createMountedText("DEF")
  ]);
  const layout = layoutRootWithBasic(root);

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 3,
    height: 2
  });
  assert.deepEqual(layout?.clip, {
    x: 0,
    y: 0,
    width: 3,
    height: 2
  });
  assert.deepEqual(layout?.contentSize, {
    width: 3,
    height: 3
  });
  assert.deepEqual(layout?.children[2]?.rect, {
    x: 0,
    y: 2,
    width: 3,
    height: 1
  });
});

test("clamps scroll offset using content size and clip height", () => {
  const root = createMountedElement("box", {
    height: 2,
    overflow: "clip",
    scrollY: 99
  }, [
    createMountedText("A"),
    createMountedText("B"),
    createMountedText("C"),
    createMountedText("D")
  ]);
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.contentSize, {
    width: 1,
    height: 4
  });
  assert.deepEqual(layout?.scrollOffset, {
    x: 0,
    y: 2
  });
});

test("clamps scroll offset to zero when content fits", () => {
  const root = createMountedElement("box", {
    height: 5,
    overflow: "clip",
    scrollY: 3
  }, [createMountedText("A")]);
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.contentSize, {
    width: 1,
    height: 5
  });
  assert.deepEqual(layout?.scrollOffset, {
    x: 0,
    y: 0
  });
});

test("contentSize is at least contentRect size when content fits", () => {
  const root = createMountedElement("box", {
    height: 5,
    overflow: "clip",
    scrollY: 3
  }, [createMountedText("A")]);
  const { basicLayout, yogaLayout } = layoutRootWithBasicAndYoga(root);

  assert.deepEqual(basicLayout?.contentRect, {
    x: 0,
    y: 0,
    width: 1,
    height: 5
  });
  assert.deepEqual(yogaLayout?.contentRect, basicLayout?.contentRect);
  assert.deepEqual(basicLayout?.contentSize, {
    width: 1,
    height: 5
  });
  assert.deepEqual(yogaLayout?.contentSize, basicLayout?.contentSize);
  assert.deepEqual(basicLayout?.scrollOffset, {
    x: 0,
    y: 0
  });
  assert.deepEqual(yogaLayout?.scrollOffset, basicLayout?.scrollOffset);
});

test("contentSize grows beyond contentRect when content overflows", () => {
  const root = createMountedElement("box", {
    height: 2,
    overflow: "clip",
    scrollY: 99
  }, [
    createMountedText("A"),
    createMountedText("B"),
    createMountedText("C"),
    createMountedText("D")
  ]);
  const { basicLayout, yogaLayout } = layoutRootWithBasicAndYoga(root);

  assert.deepEqual(basicLayout?.contentSize, {
    width: 1,
    height: 4
  });
  assert.deepEqual(yogaLayout?.contentSize, basicLayout?.contentSize);
  assert.deepEqual(basicLayout?.scrollOffset, {
    x: 0,
    y: 2
  });
  assert.deepEqual(yogaLayout?.scrollOffset, basicLayout?.scrollOffset);
});

test("wrapped text contributes to scroll content size", () => {
  const root = createMountedElement(
    "box",
    {
      width: 5,
      height: 1,
      overflow: "clip",
      scrollY: 99
    },
    [
      createMountedElement("text", {
        value: "hello world",
        wrap: "wrap"
      })
    ]
  );
  const { basicLayout, yogaLayout } = layoutRootWithBasicAndYoga(root);

  assert.deepEqual(basicLayout?.contentSize, {
    width: 5,
    height: 2
  });
  assert.deepEqual(yogaLayout?.contentSize, basicLayout?.contentSize);
  assert.deepEqual(basicLayout?.scrollOffset, {
    x: 0,
    y: 1
  });
  assert.deepEqual(yogaLayout?.scrollOffset, basicLayout?.scrollOffset);
});

test("records content size for for nodes inside clipped boxes", () => {
  const root = createMountedElement("box", {
    height: 1,
    overflow: "clip"
  }, [
    createMountedFor([
      createMountedText("A"),
      createMountedText("BCD")
    ])
  ]);
  const layout = layoutRootWithBasic(root);

  assert.deepEqual(layout?.contentSize, {
    width: 3,
    height: 2
  });
  assert.deepEqual(layout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 3,
    height: 2
  });
});

test("ignores non-layout paint props while measuring layout", () => {
  const root = createMountedElement("text", {
    value: "Color",
    color: "green",
    bold: true
  });
  const layout = layoutRootWithBasic(root);

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
    focusStyle: "none",
    onKey: true,
    onFocusChange: () => {},
    padding: 1
  }, [createMountedText("A")]);
  const layout = layoutRootWithBasic(root);

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
  const layout = layoutRootWithBasic(root);

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
  const layout = layoutRootWithBasic(root);

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
  const layout = layoutRootWithBasic(root);

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
  const layout = layoutRootWithBasic(root);

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

test("createYogaLayoutEngine exposes the optional layout engine contract", () => {
  const root = createMountedText();
  const engine = createYogaLayoutEngine();
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

test("layoutRoot accepts YogaLayoutEngine as an injected engine", () => {
  const root = createMountedElement("vstack", {}, [
    createMountedText("A"),
    createMountedText("BC")
  ]);
  const layout = layoutRoot(root, {
    viewport,
    engine: createYogaLayoutEngine()
  });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 2,
    height: 2
  });
  assert.deepEqual(layout?.children[1]?.rect, {
    x: 0,
    y: 1,
    width: 2,
    height: 1
  });
});

test("YogaLayoutEngine lays out wrapped text through the text measure function", () => {
  const root = createMountedElement(
    "box",
    {
      width: 5
    },
    [
      createMountedElement("text", {
        value: "hello world",
        wrap: "wrap"
      })
    ]
  );
  const layout = layoutRoot(root, {
    viewport,
    engine: createYogaLayoutEngine()
  });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 5,
    height: 2
  });
  assert.deepEqual(layout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 5,
    height: 2
  });
});

test("YogaLayoutEngine keeps structure nodes as wrapper flex items", () => {
  const first = createMountedFragment([createMountedText("A"), createMountedText("BB")]);
  const second = createMountedText("C");
  const root = createMountedElement("hstack", {}, [first, second]);
  const layout = layoutRoot(root, {
    viewport,
    engine: createYogaLayoutEngine()
  });

  assert.equal(layout?.children[0]?.mounted.kind, "fragment");
  assert.deepEqual(layout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 3,
    height: 1
  });
  assert.deepEqual(layout?.children[1]?.rect, {
    x: 3,
    y: 0,
    width: 1,
    height: 1
  });
});

test("YogaLayoutEngine records clipped scroll metadata", () => {
  const root = createMountedElement(
    "box",
    {
      width: 5,
      height: 1,
      overflow: "clip",
      scrollY: 9
    },
    [
      createMountedElement("text", {
        value: "hello world",
        wrap: "wrap"
      })
    ]
  );
  const layout = layoutRoot(root, {
    viewport,
    engine: createYogaLayoutEngine()
  });

  assert.deepEqual(layout?.clip, {
    x: 0,
    y: 0,
    width: 5,
    height: 1
  });
  assert.deepEqual(layout?.contentSize, {
    width: 5,
    height: 2
  });
  assert.deepEqual(layout?.scrollOffset, {
    x: 0,
    y: 1
  });
});

test("YogaLayoutEngine rewraps scroll content when viewport width changes", () => {
  const root = createMountedElement(
    "screen",
    {},
    [
      createMountedElement(
        "box",
        {
          height: 1,
          overflow: "clip",
          scrollY: 99
        },
        [
          createMountedElement("text", {
            value: "one two three four",
            wrap: "wrap"
          })
        ]
      )
    ]
  );
  const wide = layoutRoot(root, {
    viewport: { width: 20, height: 2 },
    engine: createYogaLayoutEngine()
  });
  const narrow = layoutRoot(root, {
    viewport: { width: 8, height: 1 },
    engine: createYogaLayoutEngine()
  });

  assert.deepEqual(wide?.children[0]?.contentSize, {
    width: 20,
    height: 1
  });
  assert.deepEqual(wide?.children[0]?.scrollOffset, {
    x: 0,
    y: 0
  });
  assert.deepEqual(narrow?.children[0]?.contentSize, {
    width: 8,
    height: 3
  });
  assert.deepEqual(narrow?.children[0]?.scrollOffset, {
    x: 0,
    y: 2
  });
});

test("YogaLayoutEngine clamps scroll offset after dynamic content shrink", () => {
  const children = [
    createMountedText("A"),
    createMountedText("B"),
    createMountedText("C"),
    createMountedText("D")
  ];
  const root = createMountedElement(
    "box",
    {
      height: 2,
      overflow: "clip",
      scrollY: 99
    },
    children
  );
  const full = layoutRoot(root, {
    viewport,
    engine: createYogaLayoutEngine()
  });

  root.children = [children[0] as MountedNode];
  const shrunk = layoutRoot(root, {
    viewport,
    engine: createYogaLayoutEngine()
  });

  assert.deepEqual(full?.contentSize, {
    width: 1,
    height: 4
  });
  assert.deepEqual(full?.scrollOffset, {
    x: 0,
    y: 2
  });
  assert.deepEqual(shrunk?.contentSize, {
    width: 1,
    height: 2
  });
  assert.deepEqual(shrunk?.scrollOffset, {
    x: 0,
    y: 0
  });
});

test("YogaLayoutEngine keeps scroll metadata correct when flexShrink reduces viewport height", () => {
  const root = createMountedElement(
    "screen",
    {},
    [
      createMountedElement("box", { height: 2 }, [createMountedText("Header")]),
      createMountedElement(
        "box",
        {
          flexGrow: 1,
          flexShrink: 1,
          overflow: "clip",
          scrollY: 99
        },
        [
          createMountedText("A"),
          createMountedText("B"),
          createMountedText("C"),
          createMountedText("D")
        ]
      )
    ]
  );
  const layout = layoutRoot(root, {
    viewport: { width: 10, height: 3 },
    engine: createYogaLayoutEngine()
  });
  const scroller = layout?.children[1];

  assert.deepEqual(scroller?.rect, {
    x: 0,
    y: 2,
    width: 10,
    height: 1
  });
  assert.deepEqual(scroller?.contentSize, {
    width: 10,
    height: 4
  });
  assert.deepEqual(scroller?.scrollOffset, {
    x: 0,
    y: 3
  });
});

test("YogaLayoutEngine updates scroll metadata after runtime text shrink", async () => {
  const value = createSignal("one two three four");
  const runtime = createRuntimeRoot(
    elementTemplate(
      "box",
      {
        width: 8,
        height: 2,
        overflow: "clip",
        scrollY: 99
      },
      [
        elementTemplate("text", {
          value,
          wrap: "wrap"
        })
      ]
    )
  );
  const layouts: NonNullable<ReturnType<typeof layoutRoot>>[] = [];

  runtime.onFlush(({ root }) => {
    const layout = layoutRoot(root, {
      viewport,
      engine: createYogaLayoutEngine()
    });

    if (layout) {
      layouts.push(layout);
    }

    runtime.clearDirty();
  });

  const full = layoutRoot(runtime.root, {
    viewport,
    engine: createYogaLayoutEngine()
  });

  value.set("short");
  await Promise.resolve();

  assert.deepEqual(full?.contentSize, {
    width: 8,
    height: 3
  });
  assert.deepEqual(full?.scrollOffset, {
    x: 0,
    y: 1
  });
  assert.equal(layouts.length, 1);
  assert.deepEqual(layouts[0]?.contentSize, {
    width: 8,
    height: 2
  });
  assert.deepEqual(layouts[0]?.scrollOffset, {
    x: 0,
    y: 0
  });
});

test("YogaLayoutEngine rejects unsupported layout elements and props", () => {
  assert.throws(
    () =>
      layoutRoot(createMountedElement("button", { value: "Go" }), {
        viewport,
        engine: createYogaLayoutEngine()
      }),
    /Unsupported layout element: button/
  );

  assert.throws(
    () =>
      layoutRoot(createMountedElement("box", { flexDirection: "row" }), {
        viewport,
        engine: createYogaLayoutEngine()
      }),
    /Unsupported layout prop: flexDirection/
  );
});

test("YogaLayoutEngine supports hstack gap with kebab-case aliases", () => {
  const root = createMountedElement(
    "hstack",
    {
      gap: 2
    },
    [createMountedText("A"), createMountedText("B")]
  );
  const layout = layoutRoot(root, {
    viewport,
    engine: createYogaLayoutEngine()
  });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 4,
    height: 1
  });
  assert.deepEqual(layout?.children[1]?.rect, {
    x: 3,
    y: 0,
    width: 1,
    height: 1
  });
});

test("YogaLayoutEngine supports alignItems and justifyContent", () => {
  const root = createMountedElement(
    "screen",
    {
      alignItems: "center",
      justifyContent: "center"
    },
    [createMountedText("A")]
  );
  const layout = layoutRoot(root, {
    viewport: {
      width: 5,
      height: 5
    },
    engine: createYogaLayoutEngine()
  });

  assert.deepEqual(layout?.children[0]?.rect, {
    x: 2,
    y: 2,
    width: 1,
    height: 1
  });
});

test("YogaLayoutEngine supports flexGrow and flexShrink", () => {
  const growing = createMountedElement("box", { flexGrow: 1 });
  const fixed = createMountedElement("box", { height: 1 });
  const root = createMountedElement("screen", {}, [growing, fixed]);
  const layout = layoutRoot(root, {
    viewport: {
      width: 6,
      height: 5
    },
    engine: createYogaLayoutEngine()
  });

  assert.deepEqual(layout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 6,
    height: 4
  });
  assert.deepEqual(layout?.children[1]?.rect, {
    x: 0,
    y: 4,
    width: 6,
    height: 1
  });

  const shrinking = createMountedElement("text", {
    value: "ABCDE",
    flexShrink: 1
  });
  const rootWithShrink = createMountedElement("box", { width: 3 }, [shrinking]);
  const shrinkLayout = layoutRoot(rootWithShrink, {
    viewport,
    engine: createYogaLayoutEngine()
  });

  assert.deepEqual(shrinkLayout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 3,
    height: 1
  });
});

test("YogaLayoutEngine supports flexWrap", () => {
  const root = createMountedElement(
    "box",
    {
      width: 3
    },
    [
      createMountedElement(
        "hstack",
        {
          flexWrap: "wrap"
        },
        [createMountedText("AA"), createMountedText("BB")]
      )
    ]
  );
  const layout = layoutRoot(root, {
    viewport,
    engine: createYogaLayoutEngine()
  });
  const hstackLayout = layout?.children[0];

  assert.deepEqual(hstackLayout?.rect, {
    x: 0,
    y: 0,
    width: 3,
    height: 2
  });
  assert.deepEqual(hstackLayout?.children[1]?.rect, {
    x: 0,
    y: 1,
    width: 2,
    height: 1
  });
});

test("BasicLayoutEngine measures CJK text using display width", () => {
  const root = createMountedText("中");
  const layout = layoutRootWithBasic(root);

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 2,
    height: 1
  });
});

test("BasicLayoutEngine records wrapped CJK content size", () => {
  const child = createMountedElement("text", {
    value: "中中中",
    wrap: "hard"
  });
  const root = createMountedElement(
    "box",
    {
      width: 4,
      height: 1,
      overflow: "clip",
      scrollY: 9
    },
    [child]
  );
  const layout = layoutRootWithBasic(root);

  assert.deepEqual(layout?.contentSize, {
    width: 4,
    height: 2
  });
  assert.deepEqual(layout?.scrollOffset, {
    x: 0,
    y: 1
  });
});

test("YogaLayoutEngine measures CJK text using display width", () => {
  const root = createMountedText("中");
  const layout = layoutRootWithYoga(root);

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 2,
    height: 1
  });
});

test("YogaLayoutEngine wraps CJK text by display width", () => {
  const root = createMountedElement(
    "box",
    {
      width: 4,
      height: 1,
      overflow: "clip",
      scrollY: 99
    },
    [
      createMountedElement("text", {
        value: "中中中",
        wrap: "hard"
      })
    ]
  );
  const layout = layoutRootWithYoga(root);

  assert.deepEqual(layout?.contentSize, {
    width: 4,
    height: 2
  });
  assert.deepEqual(layout?.scrollOffset, {
    x: 0,
    y: 1
  });
});

test("YogaLayoutEngine updates CJK scroll metadata after resize rewrap", () => {
  const root = createMountedElement(
    "screen",
    {},
    [
      createMountedElement(
        "box",
        {
          height: 1,
          overflow: "clip",
          scrollY: 99
        },
        [
          createMountedElement("text", {
            value: "中中中",
            wrap: "hard"
          })
        ]
      )
    ]
  );
  const wide = layoutRoot(root, {
    viewport: { width: 4, height: 1 },
    engine: createYogaLayoutEngine()
  });
  const narrow = layoutRoot(root, {
    viewport: { width: 2, height: 1 },
    engine: createYogaLayoutEngine()
  });

  assert.deepEqual(wide?.children[0]?.contentSize, {
    width: 4,
    height: 2
  });
  assert.deepEqual(wide?.children[0]?.scrollOffset, {
    x: 0,
    y: 1
  });
  assert.deepEqual(narrow?.children[0]?.contentSize, {
    width: 2,
    height: 3
  });
  assert.deepEqual(narrow?.children[0]?.scrollOffset, {
    x: 0,
    y: 2
  });
});

test("YogaLayoutEngine updates emoji scroll metadata after resize rewrap", () => {
  const root = createMountedElement(
    "screen",
    {},
    [
      createMountedElement(
        "box",
        {
          height: 1,
          overflow: "clip",
          scrollY: 99
        },
        [
          createMountedElement("text", {
            value: "🙂🙂🙂",
            wrap: "hard"
          })
        ]
      )
    ]
  );
  const wide = layoutRoot(root, {
    viewport: { width: 4, height: 1 },
    engine: createYogaLayoutEngine()
  });
  const narrow = layoutRoot(root, {
    viewport: { width: 2, height: 1 },
    engine: createYogaLayoutEngine()
  });

  assert.deepEqual(wide?.children[0]?.contentSize, {
    width: 4,
    height: 2
  });
  assert.deepEqual(wide?.children[0]?.scrollOffset, {
    x: 0,
    y: 1
  });
  assert.deepEqual(narrow?.children[0]?.contentSize, {
    width: 2,
    height: 3
  });
  assert.deepEqual(narrow?.children[0]?.scrollOffset, {
    x: 0,
    y: 2
  });
});

test("YogaLayoutEngine clamps scroll offset after CJK content shrink", () => {
  const children = [
    createMountedText("甲"),
    createMountedText("乙"),
    createMountedText("丙"),
    createMountedText("丁")
  ];
  const root = createMountedElement(
    "box",
    {
      height: 2,
      overflow: "clip",
      scrollY: 99
    },
    children
  );
  const full = layoutRoot(root, {
    viewport,
    engine: createYogaLayoutEngine()
  });

  root.children = [children[0] as MountedNode];
  const shrunk = layoutRoot(root, {
    viewport,
    engine: createYogaLayoutEngine()
  });

  assert.deepEqual(full?.contentSize, {
    width: 2,
    height: 4
  });
  assert.deepEqual(full?.scrollOffset, {
    x: 0,
    y: 2
  });
  assert.deepEqual(shrunk?.contentSize, {
    width: 2,
    height: 2
  });
  assert.deepEqual(shrunk?.scrollOffset, {
    x: 0,
    y: 0
  });
});

test("YogaLayoutEngine measures wrapped emoji text height", () => {
  const root = createMountedElement(
    "box",
    {
      width: 2,
      height: 1,
      overflow: "clip",
      scrollY: 99
    },
    [
      createMountedElement("text", {
        value: "🙂🙂🙂",
        wrap: "hard"
      })
    ]
  );
  const layout = layoutRootWithYoga(root);

  assert.deepEqual(layout?.contentSize, {
    width: 2,
    height: 3
  });
  assert.deepEqual(layout?.scrollOffset, {
    x: 0,
    y: 2
  });
});

test("YogaLayoutEngine rejects invalid Yoga flex prop values", () => {
  assert.throws(
    () =>
      layoutRoot(createMountedElement("hstack", { flexWrap: "sideways" }), {
        viewport,
        engine: createYogaLayoutEngine()
      }),
    /Unsupported flexWrap value/
  );
  assert.throws(
    () =>
      layoutRoot(createMountedElement("hstack", { alignItems: "middle" }), {
        viewport,
        engine: createYogaLayoutEngine()
      }),
    /Unsupported alignItems value/
  );
  assert.throws(
    () =>
      layoutRoot(createMountedElement("hstack", { justifyContent: "between" }), {
        viewport,
        engine: createYogaLayoutEngine()
      }),
    /Unsupported justifyContent value/
  );
});

test("BasicLayoutEngine rejects Yoga-only flex props", () => {
  assert.throws(
    () => layoutRootWithBasic(createMountedElement("hstack", { gap: 1 })),
    /Unsupported layout prop: gap/
  );
  assert.throws(
    () =>
      layoutRootWithBasic(createMountedElement("hstack", { "flex-wrap": "wrap" })),
    /Unsupported layout prop: flexWrap/
  );
});

test("YogaLayoutEngine supports maxWidth on wrapped text", () => {
  const root = createMountedElement("text", {
    value: "abcdefghij",
    wrap: "wrap",
    maxWidth: 4
  });
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 4,
    height: 3
  });
});

test("YogaLayoutEngine supports minHeight on box", () => {
  const root = createMountedElement(
    "box",
    { minHeight: 5 },
    [createMountedText("A")]
  );
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 1,
    height: 5
  });
});

test("YogaLayoutEngine supports maxHeight with clip overflow", () => {
  const root = createMountedElement(
    "box",
    {
      maxHeight: 2,
      overflow: "clip"
    },
    [
      createMountedText("A"),
      createMountedText("B"),
      createMountedText("C")
    ]
  );
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 1,
    height: 2
  });
  assert.deepEqual(layout?.clip, {
    x: 0,
    y: 0,
    width: 1,
    height: 2
  });
  assert.equal(layout?.contentSize?.height, 3);
});

test("YogaLayoutEngine supports min/max size props with kebab-case aliases", () => {
  const root = createMountedElement("text", {
    value: "abcd",
    wrap: "wrap",
    "max-width": 2
  });
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 2,
    height: 2
  });
});

test("YogaLayoutEngine supports minWidth on spacer in row flow", () => {
  const root = createMountedElement(
    "hstack",
    {},
    [createMountedElement("spacer", { size: 1, minWidth: 4 })]
  );
  const layout = layoutRoot(root, { viewport });

  assert.equal(layout?.children[0]?.rect.width, 4);
});

test("BasicLayoutEngine rejects min/max size props", () => {
  assert.throws(
    () => layoutRootWithBasic(createMountedElement("box", { minHeight: 5 })),
    /Unsupported layout prop: minHeight/
  );
  assert.throws(
    () => layoutRootWithBasic(createMountedElement("text", { maxWidth: 4 })),
    /Unsupported layout prop: maxWidth/
  );
});

test("layoutRoot rejects min/max size props on screen", () => {
  assert.throws(
    () => layoutRoot(createMountedElement("screen", { maxHeight: 10 }), { viewport }),
    /Unsupported layout prop: maxHeight/
  );
});

test("resolvePadding applies edge over axis over uniform shorthand", () => {
  assert.deepEqual(resolvePadding({ padding: 2, paddingTop: 0 }), {
    top: 0,
    right: 2,
    bottom: 2,
    left: 2
  });
  assert.deepEqual(resolvePadding({ paddingX: 3, paddingY: 1 }), {
    top: 1,
    right: 3,
    bottom: 1,
    left: 3
  });
  assert.deepEqual(resolvePadding({ "padding-left": 4 }), {
    top: 0,
    right: 0,
    bottom: 0,
    left: 4
  });
});

test("YogaLayoutEngine supports asymmetric box padding in contentRect", () => {
  const root = createMountedElement(
    "box",
    {
      paddingTop: 1,
      paddingLeft: 2,
      paddingRight: 3,
      paddingBottom: 4
    },
    [createMountedText("A")]
  );
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 6,
    height: 6
  });
  assert.deepEqual(layout?.contentRect, {
    x: 2,
    y: 1,
    width: 1,
    height: 1
  });
  assert.deepEqual(layout?.children[0]?.rect, {
    x: 2,
    y: 1,
    width: 1,
    height: 1
  });
});

test("YogaLayoutEngine supports padding shorthand with edge override", () => {
  const root = createMountedElement(
    "box",
    {
      padding: 2,
      paddingTop: 0
    },
    [createMountedText("Hi")]
  );
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.contentRect, {
    x: 2,
    y: 0,
    width: 2,
    height: 1
  });
});

test("YogaLayoutEngine keeps clip metadata with asymmetric padding", () => {
  const root = createMountedElement(
    "box",
    {
      height: 4,
      paddingTop: 1,
      paddingBottom: 2,
      overflow: "clip"
    },
    [
      createMountedText("A"),
      createMountedText("B"),
      createMountedText("C"),
      createMountedText("D")
    ]
  );
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.contentRect, {
    x: 0,
    y: 1,
    width: 1,
    height: 1
  });
  assert.deepEqual(layout?.clip, layout?.contentRect);
  assert.equal(layout?.contentSize?.height, 4);
});

test("BasicLayoutEngine rejects edge padding props", () => {
  assert.throws(
    () => layoutRootWithBasic(createMountedElement("box", { paddingTop: 1 })),
    /Unsupported layout prop: paddingTop/
  );
  assert.throws(
    () => layoutRootWithBasic(createMountedElement("box", { paddingX: 1 })),
    /Unsupported layout prop: paddingX/
  );
});

test("resolveMargin applies edge over axis over uniform shorthand", () => {
  assert.deepEqual(resolveMargin({ margin: 2, marginTop: 0 }), {
    top: 0,
    right: 2,
    bottom: 2,
    left: 2
  });
  assert.deepEqual(resolveMargin({ marginX: 3, marginY: 1 }), {
    top: 1,
    right: 3,
    bottom: 1,
    left: 3
  });
  assert.deepEqual(resolveMargin({ "margin-left": 4 }), {
    top: 0,
    right: 0,
    bottom: 0,
    left: 4
  });
});

test("YogaLayoutEngine applies marginBottom between vstack children", () => {
  const root = createMountedElement("vstack", {}, [
    createMountedElement("text", { value: "A", marginBottom: 2 }),
    createMountedText("B")
  ]);
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.rect, {
    x: 0,
    y: 0,
    width: 1,
    height: 4
  });
  assert.deepEqual(layout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 1,
    height: 1
  });
  assert.deepEqual(layout?.children[1]?.rect, {
    x: 0,
    y: 3,
    width: 1,
    height: 1
  });
});

test("YogaLayoutEngine applies marginLeft between hstack children", () => {
  const root = createMountedElement("hstack", {}, [
    createMountedText("A"),
    createMountedElement("text", { value: "B", marginLeft: 2 })
  ]);
  const layout = layoutRoot(root, { viewport });

  assert.deepEqual(layout?.children[0]?.rect, {
    x: 0,
    y: 0,
    width: 1,
    height: 1
  });
  assert.deepEqual(layout?.children[1]?.rect, {
    x: 3,
    y: 0,
    width: 1,
    height: 1
  });
});

test("YogaLayoutEngine keeps box contentRect independent of margin", () => {
  const root = createMountedElement(
    "box",
    {
      margin: 2,
      padding: 1
    },
    [createMountedText("A")]
  );
  const layout = layoutRoot(root, { viewport });
  const rect = layout?.rect;
  const contentRect = layout?.contentRect;

  assert.ok(rect);
  assert.ok(contentRect);
  assert.equal(contentRect.x, rect.x + 1);
  assert.equal(contentRect.y, rect.y + 1);
  assert.equal(contentRect.width, rect.width - 2);
  assert.equal(contentRect.height, rect.height - 2);
});

test("BasicLayoutEngine rejects margin props", () => {
  assert.throws(
    () => layoutRootWithBasic(createMountedElement("text", { marginBottom: 1 })),
    /Unsupported layout prop: marginBottom/
  );
  assert.throws(
    () => layoutRootWithBasic(createMountedElement("vstack", { marginTop: 1 })),
    /Unsupported layout prop: marginTop/
  );
});

test("layout prop matrix status matches yogaSupportedPropsByTag", () => {
  for (const prop of matrixLayoutProps) {
    for (const tag of Object.keys(yogaSupportedPropsByTag) as Array<
      keyof typeof yogaSupportedPropsByTag
    >) {
      const supported = yogaSupportedPropsByTag[tag];
      const expected = supported.has(prop)
        ? "supported"
        : futureLayoutProps.has(prop)
          ? "future"
          : "na";

      assert.equal(getLayoutPropMatrixStatus(tag, prop, "yoga"), expected, `${tag}.${prop}`);
    }
  }
});
