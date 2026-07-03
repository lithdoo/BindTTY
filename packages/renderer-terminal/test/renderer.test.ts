import assert from "node:assert/strict";
import test from "node:test";

import type { LayoutNode, LayoutRect, LayoutViewport } from "@bindtty/layout";
import {
  createTerminalRenderer,
  frameToLines,
  paintLayout
} from "@bindtty/renderer-terminal";
import type { MountedElementNode, MountedNode } from "@bindtty/vnode";

const viewport: LayoutViewport = {
  width: 3,
  height: 1
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

function layout(
  mounted: MountedNode,
  nodeRect: LayoutRect,
  children: LayoutNode[] = [],
  contentRect: LayoutRect = nodeRect,
  extra: Partial<Omit<LayoutNode, "mounted" | "rect" | "contentRect" | "children">> = {}
): LayoutNode {
  return {
    mounted,
    rect: nodeRect,
    contentRect,
    ...extra,
    children
  };
}

function textLayout(value: string): LayoutNode {
  return layout(element("text", { value }), rect(0, 0, value.length, 1));
}

test("TerminalRenderer renders a full patch on first render", () => {
  const renderer = createTerminalRenderer();

  assert.equal(
    renderer.render(textLayout("A"), { viewport }),
    "\x1b[1;1H\x1b[0mA\x1b[1;2H\x1b[0m \x1b[1;3H\x1b[0m \x1b[0m"
  );
});

test("TerminalRenderer returns empty output when the frame is unchanged", () => {
  const renderer = createTerminalRenderer();

  renderer.render(textLayout("A"), { viewport });

  assert.equal(renderer.render(textLayout("A"), { viewport }), "");
});

test("TerminalRenderer paints focused state with inverse style", () => {
  const renderer = createTerminalRenderer();

  assert.equal(
    renderer.render(textLayout("A"), {
      viewport,
      isFocused: () => true
    }),
    "\x1b[1;1H\x1b[0m\x1b[7mA\x1b[1;2H\x1b[0m \x1b[1;3H\x1b[0m \x1b[0m"
  );
});

test("TerminalRenderer emits a patch when focused state changes", () => {
  const renderer = createTerminalRenderer();

  renderer.render(textLayout("A"), {
    viewport,
    isFocused: () => false
  });

  assert.equal(
    renderer.render(textLayout("A"), {
      viewport,
      isFocused: () => true
    }),
    "\x1b[1;1H\x1b[0m\x1b[7mA\x1b[0m"
  );
});

test("TerminalRenderer emits only changed cells on content updates", () => {
  const renderer = createTerminalRenderer();

  renderer.render(textLayout("A"), { viewport });

  assert.equal(
    renderer.render(textLayout("B"), { viewport }),
    "\x1b[1;1H\x1b[0mB\x1b[0m"
  );
});

test("TerminalRenderer reset forces the next render to be full", () => {
  const renderer = createTerminalRenderer();

  renderer.render(textLayout("A"), { viewport });
  renderer.reset();

  assert.equal(
    renderer.render(textLayout("A"), { viewport }),
    "\x1b[1;1H\x1b[0mA\x1b[1;2H\x1b[0m \x1b[1;3H\x1b[0m \x1b[0m"
  );
});

test("TerminalRenderer render null clears the previous frame", () => {
  const renderer = createTerminalRenderer();

  renderer.render(textLayout("ABC"), { viewport });

  assert.equal(
    renderer.render(null, { viewport }),
    "\x1b[1;1H\x1b[0m \x1b[1;2H\x1b[0m \x1b[1;3H\x1b[0m \x1b[0m"
  );
  assert.equal(renderer.render(null, { viewport }), "");
});

test("TerminalRenderer emits full patch when viewport size changes", () => {
  const renderer = createTerminalRenderer();

  renderer.render(textLayout("A"), { viewport });

  assert.equal(
    renderer.render(textLayout("A"), {
      viewport: {
        width: 2,
        height: 1
      }
    }),
    "\x1b[1;1H\x1b[0mA\x1b[1;2H\x1b[0m \x1b[0m"
  );
});

test("paintLayout paints explicit multiline text", () => {
  const root = layout(
    element("text", {
      value: "hello\nbye",
      wrap: "none"
    }),
    rect(0, 0, 5, 2)
  );
  const frame = paintLayout(root, {
    viewport: {
      width: 5,
      height: 2
    }
  });

  assert.deepEqual(frameToLines(frame), ["hello", "bye  "]);
});

test("paintLayout paints wrapped text lines", () => {
  const root = layout(
    element("text", {
      value: "hello world",
      wrap: "wrap"
    }),
    rect(0, 0, 5, 2)
  );
  const frame = paintLayout(root, {
    viewport: {
      width: 5,
      height: 2
    }
  });

  assert.deepEqual(frameToLines(frame), ["hello", "world"]);
});

test("paintLayout clips child text to node clip rects", () => {
  const child = layout(element("text", { value: "ABCDE" }), rect(0, 0, 5, 1));
  const root = layout(
    element("box", {}, [child.mounted]),
    rect(0, 0, 5, 1),
    [child],
    rect(0, 0, 5, 1),
    {
      clip: rect(0, 0, 3, 1)
    }
  );
  const frame = paintLayout(root, {
    viewport: {
      width: 5,
      height: 1
    }
  });

  assert.deepEqual(frameToLines(frame), ["ABC  "]);
});

test("paintLayout clips box background and border through parent clip", () => {
  const child = layout(
    element("box", { background: "blue", border: true }),
    rect(1, 0, 4, 3)
  );
  const root = layout(
    element("box", {}, [child.mounted]),
    rect(0, 0, 5, 3),
    [child],
    rect(0, 0, 5, 3),
    {
      clip: rect(0, 0, 3, 2)
    }
  );
  const frame = paintLayout(root, {
    viewport: {
      width: 5,
      height: 3
    }
  });

  assert.deepEqual(frameToLines(frame), [
    " ┌─  ",
    " │   ",
    "     "
  ]);
});

test("paintLayout clips focused inverse state", () => {
  const childMounted = element("text", { value: "ABCDE" });
  const child = layout(childMounted, rect(0, 0, 5, 1));
  const root = layout(
    element("box", {}, [child.mounted]),
    rect(0, 0, 5, 1),
    [child],
    rect(0, 0, 5, 1),
    {
      clip: rect(0, 0, 3, 1)
    }
  );
  const frame = paintLayout(root, {
    viewport: {
      width: 5,
      height: 1
    },
    isFocused: (node) => node === childMounted
  });

  assert.equal(frame.cells[0]?.style.inverse, true);
  assert.equal(frame.cells[1]?.style.inverse, true);
  assert.equal(frame.cells[2]?.style.inverse, true);
  assert.equal(frame.cells[3]?.style.inverse, undefined);
  assert.equal(frame.cells[4]?.style.inverse, undefined);
});

test("paintLayout scrolls children while keeping box border fixed", () => {
  const first = layout(element("text", { value: "A" }), rect(1, 1, 1, 1));
  const second = layout(element("text", { value: "B" }), rect(1, 2, 1, 1));
  const third = layout(element("text", { value: "C" }), rect(1, 3, 1, 1));
  const root = layout(
    element("box", { border: true }, [
      first.mounted,
      second.mounted,
      third.mounted
    ]),
    rect(0, 0, 3, 3),
    [first, second, third],
    rect(1, 1, 1, 1),
    {
      clip: rect(1, 1, 1, 1),
      scrollOffset: {
        x: 0,
        y: 1
      }
    }
  );
  const frame = paintLayout(root, {
    viewport: {
      width: 3,
      height: 3
    }
  });

  assert.deepEqual(frameToLines(frame), [
    "┌─┐",
    "│B│",
    "└─┘"
  ]);
});
