import assert from "node:assert/strict";
import test from "node:test";

import type { LayoutNode, LayoutRect, LayoutViewport } from "@bindtty/layout";
import {
  createTerminalRenderer
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
  contentRect: LayoutRect = nodeRect
): LayoutNode {
  return {
    mounted,
    rect: nodeRect,
    contentRect,
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
