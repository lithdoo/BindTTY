import assert from "node:assert/strict";
import test from "node:test";

import {
  createYogaLayoutEngine,
  layoutRoot,
  type LayoutNode
} from "@bindtty/layout";
import { createRuntimeRoot, notifyElementLayout } from "@bindtty/runtime";
import { createSignal } from "@bindtty/signal";
import { elementTemplate } from "@bindtty/vnode";
import type { MountedElementNode, MountedNode } from "@bindtty/vnode";
import {
  Textarea,
  buildTextareaLayout,
  findCursorVisualPosition
} from "@bindtty/widgets";

const viewport = {
  width: 80,
  height: 24
};

const LONG_VALUE = "a".repeat(120);

function findElementById(layout: LayoutNode | null, id: string): LayoutNode | null {
  if (!layout) {
    return null;
  }

  if (
    layout.mounted.kind === "element" &&
    layout.mounted.props.id === id
  ) {
    return layout;
  }

  for (const child of layout.children) {
    const found = findElementById(child, id);
    if (found) {
      return found;
    }
  }

  return null;
}

function dispatchLayout(layout: LayoutNode | null): void {
  if (!layout) {
    return;
  }

  if (layout.mounted.kind === "element") {
    notifyElementLayout(layout.mounted, layout);
  }

  for (const child of layout.children) {
    dispatchLayout(child);
  }
}

function layoutYoga(root: MountedNode | null): LayoutNode | null {
  return layoutRoot(root, {
    viewport,
    engine: createYogaLayoutEngine()
  });
}

test("scene A: Textarea flexGrow fills remaining hstack width for soft wrap", () => {
  const runtime = createRuntimeRoot(
    elementTemplate(
      "screen",
      {},
      [
        elementTemplate(
          "hstack",
          {},
          [
            elementTemplate("text", { value: "$ " }),
            Textarea({
              id: "ta-a",
              value: LONG_VALUE,
              maxRows: 8
            })
          ]
        )
      ]
    )
  );
  const layout = layoutYoga(runtime.root);
  const textarea = findElementById(layout, "ta-a");

  assert.ok(textarea);
  assert.ok(textarea.contentRect.width >= 1);
  assert.equal(textarea.contentRect.width, 78);

  dispatchLayout(layout);

  const soft = buildTextareaLayout(LONG_VALUE, textarea.contentRect.width);
  assert.ok(soft.visualLines.length > 1);

  const caret = findCursorVisualPosition(soft, {
    offset: LONG_VALUE.length,
    preferredColumn: null
  });
  assert.ok(caret.column < textarea.contentRect.width);
});

test("scene B: outer flexGrow box passes remaining width into nested Textarea", () => {
  const runtime = createRuntimeRoot(
    elementTemplate(
      "screen",
      {},
      [
        elementTemplate(
          "hstack",
          {},
          [
            elementTemplate("text", { value: "$ " }),
            elementTemplate(
              "box",
              {
                id: "grow-b",
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0
              },
              [
                Textarea({
                  id: "ta-b",
                  value: LONG_VALUE,
                  maxRows: 8
                })
              ]
            )
          ]
        )
      ]
    )
  );
  const layout = layoutYoga(runtime.root);
  const outer = findElementById(layout, "grow-b");
  const textarea = findElementById(layout, "ta-b");

  assert.ok(outer);
  assert.ok(textarea);
  assert.equal(outer.contentRect.width, 78);
  assert.equal(textarea.contentRect.width, outer.contentRect.width);

  dispatchLayout(layout);

  const soft = buildTextareaLayout(LONG_VALUE, textarea.contentRect.width);
  assert.ok(soft.visualLines.length > 1);
});

test("scene C: parent fixed width box drives Textarea content width", () => {
  const runtime = createRuntimeRoot(
    elementTemplate(
      "screen",
      {},
      [
        elementTemplate(
          "box",
          {
            id: "fixed-c",
            width: 40
          },
          [
            Textarea({
              id: "ta-c",
              value: LONG_VALUE,
              maxRows: 8
            })
          ]
        )
      ]
    )
  );
  const layout = layoutYoga(runtime.root);
  const parent = findElementById(layout, "fixed-c");
  const textarea = findElementById(layout, "ta-c");

  assert.ok(parent);
  assert.ok(textarea);
  assert.equal(parent.contentRect.width, 40);
  assert.equal(textarea.contentRect.width, 40);

  const soft = buildTextareaLayout(LONG_VALUE, textarea.contentRect.width);
  assert.ok(soft.visualLines.length > 1);
});

test("scene D: explicit Textarea width disables flexGrow and wraps at that width", () => {
  const runtime = createRuntimeRoot(
    elementTemplate(
      "screen",
      {},
      [
        elementTemplate(
          "hstack",
          {},
          [
            elementTemplate("text", { value: "$ " }),
            Textarea({
              id: "ta-d",
              value: LONG_VALUE,
              width: 25,
              maxRows: 8
            })
          ]
        )
      ]
    )
  );
  const layout = layoutYoga(runtime.root);
  const textarea = findElementById(layout, "ta-d");

  assert.ok(textarea);
  assert.equal(textarea.contentRect.width, 25);
  assert.equal((textarea.mounted as MountedElementNode).props.flexGrow, undefined);

  const soft = buildTextareaLayout(LONG_VALUE, 25);
  assert.ok(soft.visualLines.length > 1);
  assert.ok(soft.visualLines.every((line) => line.width <= 25));
});

test("Yoga remaining width stays available even with long unwrapped content children", () => {
  const long = createSignal(LONG_VALUE);
  const runtime = createRuntimeRoot(
    elementTemplate(
      "screen",
      {},
      [
        elementTemplate(
          "hstack",
          {},
          [
            elementTemplate("text", { value: "$ " }),
            elementTemplate(
              "box",
              {
                id: "grow-long",
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
                overflow: "clip"
              },
              [elementTemplate("text", { value: long })]
            )
          ]
        )
      ]
    )
  );
  const layout = layoutYoga(runtime.root);
  const grow = findElementById(layout, "grow-long");

  assert.ok(grow);
  assert.equal(grow.contentRect.width, 78);
});

test("Yoga empty Textarea rows keep height 1 after consecutive Enter", () => {
  const value = createSignal("hello");
  const textarea = Textarea({
    id: "ta-enter",
    value,
    minRows: 2,
    maxRows: 8,
    onChange(next) {
      value.set(next);
    }
  });
  assert.equal(textarea.kind, "element");

  const onKey = (textarea as { props: { onKey?: unknown } }).props.onKey as
    | ((event: {
        input: string;
        name: string;
        ctrl: boolean;
        meta: boolean;
        shift: boolean;
        phase: "target";
        propagationStopped: boolean;
        stopPropagation(): void;
      }) => boolean)
    | undefined;
  assert.equal(typeof onKey, "function");

  const enter = () => {
    const event = {
      input: "\r",
      name: "return",
      ctrl: false,
      meta: false,
      shift: false,
      phase: "target" as const,
      propagationStopped: false,
      stopPropagation() {
        event.propagationStopped = true;
      }
    };
    assert.equal(onKey?.(event), true);
  };

  enter();
  enter();
  enter();
  assert.equal(value.get(), "hello\n\n\n");

  const runtime = createRuntimeRoot(
    elementTemplate("screen", {}, [textarea])
  );
  let layout = layoutYoga(runtime.root);
  dispatchLayout(layout);
  layout = layoutYoga(runtime.root);

  const node = findElementById(layout, "ta-enter");
  assert.ok(node);
  assert.ok(node.rect.height >= 4);

  const viewport = node.children[0];
  assert.ok(viewport);
  const rowHeights = viewport.children.slice(0, 4).map((row) => row.rect.height);
  assert.deepEqual(rowHeights, [1, 1, 1, 1]);
});
