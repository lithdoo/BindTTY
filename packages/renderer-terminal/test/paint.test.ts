import assert from "node:assert/strict";
import test from "node:test";

import type { LayoutNode, LayoutRect, LayoutViewport } from "@bindtty/layout";
import {
  frameToDebugLines,
  frameToLines,
  getCell,
  paintLayout
} from "@bindtty/renderer-terminal";
import type {
  MountedElementNode,
  MountedFragmentNode,
  MountedNode,
  MountedShowNode
} from "@bindtty/vnode";

const viewport: LayoutViewport = {
  width: 8,
  height: 4
};

function rect(
  x: number,
  y: number,
  width: number,
  height: number
): LayoutRect {
  return { x, y, width, height };
}

function element(
  tag: MountedElementNode["tag"],
  props: Record<string, unknown> = {},
  children: MountedNode[] = []
): MountedElementNode {
  return {
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
}

function fragment(children: MountedNode[]): MountedFragmentNode {
  return {
    kind: "fragment",
    children,
    dirty: null,
    dispose() {}
  };
}

function show(activeBranch: MountedNode | null): MountedShowNode {
  return {
    kind: "show",
    when: true,
    activeTemplate: null,
    activeBranch,
    dirty: null,
    dispose() {}
  };
}

function layout(
  mounted: MountedNode,
  nodeRect: LayoutRect,
  children: LayoutNode[] = [],
  contentRect: LayoutRect = nodeRect
): LayoutNode {
  return {
    mounted,
    rect: nodeRect,
    contentRect,
    children
  };
}

test("paintLayout returns a blank frame for null roots", () => {
  const frame = paintLayout(null, { viewport });

  assert.equal(frame.width, 8);
  assert.equal(frame.height, 4);
  assert.deepEqual(frameToLines(frame), [
    "        ",
    "        ",
    "        ",
    "        "
  ]);
});

test("paintLayout paints text at absolute layout rects", () => {
  const root = layout(
    element("text", { value: "Hello", color: "red", bold: true }),
    rect(2, 1, 3, 1)
  );
  const frame = paintLayout(root, { viewport });

  assert.deepEqual(frameToLines(frame), [
    "        ",
    "  Hel   ",
    "        ",
    "        "
  ]);
  assert.deepEqual(getCell(frame, 2, 1)?.style, {
    foreground: "red",
    bold: true
  });
});

test("paintLayout clips text to viewport and first line", () => {
  const root = layout(
    element("text", { value: "abcdef\nignored" }),
    rect(-2, 0, 6, 1)
  );
  const frame = paintLayout(root, { viewport: { width: 4, height: 1 } });

  assert.deepEqual(frameToLines(frame), ["cdef"]);
});

test("paintLayout paints explicit multiline text", () => {
  const root = layout(
    element("text", { value: "A\nBC", wrap: "none", color: "green" }),
    rect(1, 0, 2, 2)
  );
  const frame = paintLayout(root, { viewport: { width: 4, height: 3 } });

  assert.deepEqual(frameToLines(frame), [
    " A  ",
    " BC ",
    "    "
  ]);
  assert.deepEqual(getCell(frame, 1, 0)?.style, {
    foreground: "green"
  });
  assert.deepEqual(getCell(frame, 1, 1)?.style, {
    foreground: "green"
  });
});

test("paintLayout paints wrapped text within the layout rect height", () => {
  const root = layout(
    element("text", { value: "hello world", wrap: "wrap" }),
    rect(0, 0, 5, 2)
  );
  const frame = paintLayout(root, { viewport: { width: 5, height: 3 } });

  assert.deepEqual(frameToLines(frame), [
    "hello",
    "world",
    "     "
  ]);
});

test("paintLayout paints wide text with placeholder cells", () => {
  const root = layout(
    element("text", { value: "A中B" }),
    rect(0, 0, 4, 1)
  );
  const frame = paintLayout(root, { viewport: { width: 4, height: 1 } });

  assert.deepEqual(frameToLines(frame), ["A中B"]);
  assert.deepEqual(frameToDebugLines(frame), ["A中·B"]);
  assert.deepEqual(getCell(frame, 1, 0), {
    char: "中",
    style: {},
    width: 2
  });
  assert.deepEqual(getCell(frame, 2, 0), {
    char: "",
    style: {},
    width: 0
  });
});

test("paintLayout clips wide text by whole grapheme", () => {
  const root = layout(
    element("text", { value: "中" }),
    rect(0, 0, 1, 1)
  );
  const frame = paintLayout(root, { viewport: { width: 1, height: 1 } });

  assert.deepEqual(frameToLines(frame), [" "]);
});

test("paintLayout treats null and undefined text values as empty text", () => {
  const nullText = layout(element("text", { value: null }), rect(0, 0, 4, 1));
  const undefinedText = layout(
    element("text", { value: undefined }),
    rect(0, 1, 4, 1)
  );
  const root = layout(
    element("vstack"),
    rect(0, 0, 4, 2),
    [nullText, undefinedText]
  );
  const frame = paintLayout(root, { viewport: { width: 4, height: 2 } });

  assert.deepEqual(frameToLines(frame), ["    ", "    "]);
});

test("paintLayout paints box background and border", () => {
  const root = layout(
    element("box", {
      background: "blue",
      border: true,
      borderColor: "cyan"
    }),
    rect(1, 0, 5, 3),
    [],
    rect(2, 1, 3, 1)
  );
  const frame = paintLayout(root, { viewport });

  assert.deepEqual(frameToLines(frame), [
    " ┌───┐  ",
    " │   │  ",
    " └───┘  ",
    "        "
  ]);
  assert.deepEqual(getCell(frame, 3, 1)?.style, {
    background: "blue"
  });
  assert.deepEqual(getCell(frame, 1, 0)?.style, {
    background: "blue",
    foreground: "cyan"
  });
});

test("paintLayout ignores interaction props", () => {
  const root = layout(
    element("text", {
      value: "A",
      id: "label",
      onKey: true,
      onFocusChange: () => {}
    }),
    rect(0, 0, 1, 1)
  );
  const frame = paintLayout(root, {
    viewport,
    isFocused: () => false
  });

  assert.deepEqual(frameToLines(frame), [
    "A       ",
    "        ",
    "        ",
    "        "
  ]);
  assert.deepEqual(getCell(frame, 0, 0)?.style, {});
});

test("paintLayout applies inverse style to focused text", () => {
  const root = layout(
    element("text", { value: "A", color: "red", bold: true }),
    rect(0, 0, 1, 1)
  );
  const frame = paintLayout(root, {
    viewport,
    isFocused: (mounted) => mounted === root.mounted
  });

  assert.deepEqual(frameToLines(frame), [
    "A       ",
    "        ",
    "        ",
    "        "
  ]);
  assert.deepEqual(getCell(frame, 0, 0)?.style, {
    foreground: "red",
    bold: true,
    inverse: true
  });
});

test("paintLayout can disable default focused inverse with focusStyle none", () => {
  const root = layout(
    element("text", { value: "A", color: "red", focusStyle: "none" }),
    rect(0, 0, 1, 1)
  );
  const frame = paintLayout(root, {
    viewport,
    isFocused: (mounted) => mounted === root.mounted
  });

  assert.deepEqual(frameToLines(frame), [
    "A       ",
    "        ",
    "        ",
    "        "
  ]);
  assert.deepEqual(getCell(frame, 0, 0)?.style, {
    foreground: "red"
  });
});

test("paintLayout applies inverse style to focused container rects", () => {
  const child = layout(element("text", { value: "A" }), rect(1, 0, 1, 1));
  const root = layout(
    element("box", { background: "blue", border: true }),
    rect(0, 0, 3, 3),
    [child]
  );
  const frame = paintLayout(root, {
    viewport,
    isFocused: (mounted) => mounted === root.mounted
  });

  assert.deepEqual(frameToLines(frame), [
    "┌A┐     ",
    "│ │     ",
    "└─┘     ",
    "        "
  ]);
  assert.equal(getCell(frame, 1, 0)?.style.inverse, true);
  assert.equal(getCell(frame, 1, 1)?.style.inverse, true);
  assert.equal(getCell(frame, 3, 0)?.style.inverse, undefined);
});

test("paintLayout supports kebab-case border color aliases", () => {
  const root = layout(
    element("box", {
      border: true,
      "border-color": "yellow"
    }),
    rect(0, 0, 2, 2)
  );
  const frame = paintLayout(root, { viewport });

  assert.deepEqual(frameToLines(frame), [
    "┌┐      ",
    "└┘      ",
    "        ",
    "        "
  ]);
  assert.deepEqual(getCell(frame, 0, 0)?.style, {
    foreground: "yellow"
  });
});

test("paintLayout rejects duplicate paint prop aliases", () => {
  const root = layout(
    element("box", {
      border: true,
      borderColor: "cyan",
      "border-color": "yellow"
    }),
    rect(0, 0, 2, 2)
  );

  assert.throws(
    () => paintLayout(root, { viewport }),
    /Duplicate paint prop: borderColor \/ border-color/
  );
});

test("paintLayout rejects foreground and color duplicates", () => {
  const root = layout(
    element("text", {
      value: "X",
      color: "red",
      foreground: "green"
    }),
    rect(0, 0, 1, 1)
  );

  assert.throws(
    () => paintLayout(root, { viewport }),
    /Duplicate paint prop: foreground \/ color/
  );
});

test("paintLayout lets children cover parent background", () => {
  const child = layout(
    element("text", { value: "OK", color: "green" }),
    rect(2, 1, 2, 1)
  );
  const root = layout(
    element("box", { background: "blue" }, [child.mounted]),
    rect(0, 0, 5, 3),
    [child],
    rect(0, 0, 5, 3)
  );
  const frame = paintLayout(root, { viewport });

  assert.deepEqual(frameToLines(frame), [
    "        ",
    "  OK    ",
    "        ",
    "        "
  ]);
  assert.deepEqual(getCell(frame, 2, 1)?.style, {
    foreground: "green"
  });
  assert.deepEqual(getCell(frame, 0, 0)?.style, {
    background: "blue"
  });
});

test("paintLayout treats fragment and show nodes as transparent", () => {
  const text = layout(element("text", { value: "A" }), rect(1, 1, 1, 1));
  const fragmentNode = fragment([text.mounted]);
  const fragmentLayout = layout(fragmentNode, rect(1, 1, 1, 1), [text]);
  const showNode = show(fragmentNode);
  const showLayout = layout(showNode, rect(1, 1, 1, 1), [fragmentLayout]);
  const frame = paintLayout(showLayout, { viewport: { width: 3, height: 3 } });

  assert.deepEqual(frameToLines(frame), [
    "   ",
    " A ",
    "   "
  ]);
});

test("paintLayout supports small box border sizes", () => {
  const oneCell = layout(element("box", { border: true }), rect(0, 0, 1, 1));
  const oneColumn = layout(element("box", { border: true }), rect(2, 0, 1, 3));
  const oneRow = layout(element("box", { border: true }), rect(0, 3, 4, 1));
  const root = layout(
    element("screen"),
    rect(0, 0, 5, 4),
    [oneCell, oneColumn, oneRow]
  );
  const frame = paintLayout(root, { viewport: { width: 5, height: 4 } });

  assert.deepEqual(frameToLines(frame), [
    "│ │  ",
    "  │  ",
    "  │  ",
    "──── "
  ]);
});

test("paintLayout throws for unsupported interactive elements", () => {
  const root = layout(element("input"), rect(0, 0, 1, 1));

  assert.throws(
    () => paintLayout(root, { viewport }),
    /Unsupported paint element: input/
  );
});
