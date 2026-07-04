import assert from "node:assert/strict";
import test from "node:test";

import { createSignal } from "@bindtty/signal";
import {
  Button,
  List,
  ScrollView,
  computeScrollbarThumb,
  renderScrollbarColumn,
  type ButtonProps,
  type ButtonStyleProps,
  type ListProps,
  type ScrollViewProps,
  type ScrollViewStyleProps
} from "@bindtty/widgets";
import type { InteractionKeyBinding } from "@bindtty/interaction";
import type { InteractionKeyHandler } from "@bindtty/interaction";
import type { ElementTemplate, ReadableSignal, Template } from "@bindtty/vnode";

function asElement(template: Template): ElementTemplate {
  assert.equal(template.kind, "element");
  return template;
}

function readOnKey(template: ElementTemplate): InteractionKeyBinding {
  return template.props.onKey as InteractionKeyBinding;
}

function readOnKeyHandler(template: ElementTemplate): InteractionKeyHandler {
  const onKey = readOnKey(template);

  assert.equal(typeof onKey, "function");
  return onKey as InteractionKeyHandler;
}

function resolveSignal<T>(value: unknown): T {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return (value as ReadableSignal<T>).get();
}

function key(name: string): Parameters<InteractionKeyHandler>[0] {
  return {
    input: "",
    name,
    ctrl: false,
    meta: false,
    shift: false
  };
}

interface TestScrollApi {
  onLayout?: (layout: unknown) => void;
  onUnmount?: () => void;
}

function connectScrollViewRef(template: ElementTemplate): TestScrollApi {
  let scrollBox = template;

  if (template.tag === "box" && template.children[0]?.kind === "element") {
    const firstChild = asElement(template.children[0] as Template);
    if (firstChild.tag === "hstack" && firstChild.children[0]?.kind === "element") {
      scrollBox = asElement(firstChild.children[0] as Template);
    }
  } else if (template.tag === "hstack" && template.children[0]?.kind === "element") {
    scrollBox = asElement(template.children[0] as Template);
  }

  const ref = scrollBox.props.ref;
  assert.equal(typeof ref, "function");

  const api: TestScrollApi = {};
  (ref as (api: TestScrollApi) => void)(api);
  return api;
}

function layoutPayload(
  scrollOffsetY: number,
  contentHeight: number,
  viewportHeight: number
) {
  return {
    rect: { height: viewportHeight },
    contentRect: { height: viewportHeight },
    clip: { height: viewportHeight },
    scrollOffset: { y: scrollOffsetY },
    contentSize: { height: contentHeight }
  };
}

test("Button renders as a focusable box with text label", () => {
  const onFocusChange = () => {};
  const template = asElement(
    Button({
      id: "save",
      label: "Save",
      onFocusChange
    })
  );
  const label = asElement(template.children[0]!);

  assert.equal(template.tag, "box");
  assert.equal(template.props.id, "save");
  assert.equal(template.props.border, true);
  assert.equal(template.props.padding, 1);
  assert.equal(template.props.onFocusChange, onFocusChange);
  assert.equal(typeof template.props.onKey, "function");
  assert.equal(label.tag, "text");
  assert.equal(label.props.value, "Save");
});

test("Button exposes the planned props types", () => {
  const style: ButtonStyleProps = {
    color: "green",
    background: "blue",
    borderColor: "cyan",
    bold: true,
    dim: false,
    padding: 2,
    border: true
  };
  const props: ButtonProps = {
    ...style,
    id: "typed",
    label: "Typed",
    disabled: false,
    onPress() {}
  };

  assert.equal(asElement(Button(props)).props.id, "typed");
});

test("Button triggers onPress for Enter and Space", () => {
  let presses = 0;
  const template = asElement(
    Button({
      label: "Run",
      onPress() {
        presses += 1;
      }
    })
  );
  const onKey = readOnKeyHandler(template);
  assert.equal(onKey({ input: "\r", name: "return", ctrl: false, meta: false, shift: false }, {
    node: {} as never,
    isFocused: true
  }), true);
  assert.equal(onKey({ input: " ", ctrl: false, meta: false, shift: false }, {
    node: {} as never,
    isFocused: true
  }), true);
  assert.equal(presses, 2);
});

test("Button leaves unrelated keys unhandled", () => {
  let presses = 0;
  const template = asElement(
    Button({
      label: "Run",
      onPress() {
        presses += 1;
      }
    })
  );
  const onKey = readOnKeyHandler(template);
  assert.equal(onKey({ input: "x", ctrl: false, meta: false, shift: false }, {
    node: {} as never,
    isFocused: true
  }), false);
  assert.equal(presses, 0);
});

test("Button disabled maps onKey to false and dims the label", () => {
  const template = asElement(
    Button({
      label: "Disabled",
      disabled: true
    })
  );
  const label = asElement(template.children[0]!);

  assert.equal(template.props.onKey, false);
  assert.equal(label.props.dim, true);
});

test("Button supports dynamic disabled values", () => {
  const disabled = createSignal(false);
  const template = asElement(
    Button({
      label: "Dynamic",
      disabled
    })
  );
  const label = asElement(template.children[0]!);

  assert.equal(typeof resolveSignal<InteractionKeyBinding>(template.props.onKey), "function");
  assert.equal(resolveSignal<boolean>(label.props.dim), false);

  disabled.set(true);

  assert.equal(resolveSignal<InteractionKeyBinding>(template.props.onKey), false);
  assert.equal(resolveSignal<boolean>(label.props.dim), true);
});

test("Button forwards style props to the correct intrinsic elements", () => {
  const template = asElement(
    Button({
      label: "Styled",
      color: "green",
      background: "blue",
      borderColor: "cyan",
      bold: true,
      dim: true,
      padding: 2,
      border: 1
    })
  );
  const label = asElement(template.children[0]!);

  assert.equal(template.props.background, "blue");
  assert.equal(template.props.borderColor, "cyan");
  assert.equal(template.props.padding, 2);
  assert.equal(template.props.border, 1);
  assert.equal(label.props.color, "green");
  assert.equal(label.props.bold, true);
  assert.equal(label.props.dim, true);
});

test("ScrollView renders as a clipped box with scroll metadata", () => {
  const onFocusChange = () => {};
  const child = asElement({
    kind: "element",
    tag: "text",
    props: {
      value: "Row"
    },
    children: []
  });
  const template = asElement(
    ScrollView({
      id: "logs",
      height: 3,
      width: 20,
      offset: 2,
      onOffsetChange() {},
      onFocusChange,
      children: child
    })
  );

  assert.equal(template.tag, "box");
  assert.equal(template.props.id, "logs");
  assert.equal(template.props.height, 3);
  assert.equal(template.props.width, 20);
  assert.equal(template.props.overflow, "clip");
  assert.equal(template.props.scrollX, 0);
  assert.equal(template.props.scrollY, 2);
  assert.equal(typeof template.props.ref, "function");
  assert.equal(typeof template.props.onKey, "function");
  assert.equal(template.props.onFocusChange, onFocusChange);
  assert.equal(template.children[0], child);
});

test("ScrollView exposes the planned props types", () => {
  const style: ScrollViewStyleProps = {
    background: "blue",
    borderColor: "cyan",
    padding: 1,
    border: true
  };
  const props: ScrollViewProps = {
    ...style,
    id: "typed",
    height: 3,
    width: 20,
    offset: 1,
    scrollOnArrow: true,
    onOffsetChange() {}
  };

  assert.equal(asElement(ScrollView(props)).props.id, "typed");
});

test("ScrollView emits offset intents for scroll keys", () => {
  const offset = createSignal(5);
  const height = createSignal(3);
  const changes: number[] = [];
  const template = asElement(
    ScrollView({
      height,
      offset,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  assert.equal(onKey(key("up"), { node: {} as never, isFocused: true }), true);
  assert.equal(onKey(key("down"), { node: {} as never, isFocused: true }), true);
  assert.equal(onKey(key("pageup"), { node: {} as never, isFocused: true }), true);
  assert.equal(onKey(key("pagedown"), { node: {} as never, isFocused: true }), true);
  assert.equal(onKey(key("home"), { node: {} as never, isFocused: true }), true);
  assert.equal(onKey(key("end"), { node: {} as never, isFocused: true }), true);
  assert.equal(onKey(key("left"), { node: {} as never, isFocused: true }), false);

  assert.deepEqual(changes, [
    4,
    6,
    2,
    8,
    0,
    Number.MAX_SAFE_INTEGER
  ]);
});

test("ScrollView uses applied layout state for scroll keys after layout", () => {
  const changes: number[] = [];
  const template = asElement(
    ScrollView({
      height: 3,
      offset: 99,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
      }
    })
  );
  const ref = template.props.ref;
  assert.equal(typeof ref, "function");
  interface TestApi {
    onLayout?: (layout: unknown) => void;
    onUnmount?: () => void;
  }
  const api = {
    onLayout: undefined as ((layout: unknown) => void) | undefined
  } satisfies TestApi;
  (ref as (api: TestApi) => void)(api);
  api.onLayout?.({
    rect: { height: 3 },
    contentRect: { height: 3 },
    clip: { height: 3 },
    scrollOffset: { y: 7 },
    contentSize: { height: 10 }
  });

  const onKey = readOnKeyHandler(template);

  assert.equal(onKey(key("down"), { node: {} as never, isFocused: true }), true);
  assert.equal(onKey(key("pagedown"), { node: {} as never, isFocused: true }), true);
  assert.equal(onKey(key("end"), { node: {} as never, isFocused: true }), true);
  assert.equal(onKey(key("up"), { node: {} as never, isFocused: true }), true);
  assert.deepEqual(changes, [7, 7, 7, 6]);
});

test("ScrollView is not focusable without an offset change handler", () => {
  const template = asElement(
    ScrollView({
      height: 3,
      offset: 0
    })
  );

  assert.equal(template.props.onKey, false);
});

test("ScrollView supports dynamic scrollOnArrow values", () => {
  const scrollOnArrow = createSignal(true);
  const template = asElement(
    ScrollView({
      height: 3,
      offset: 0,
      scrollOnArrow,
      onOffsetChange() {}
    })
  );

  assert.equal(typeof resolveSignal<InteractionKeyBinding>(template.props.onKey), "function");

  scrollOnArrow.set(false);

  assert.equal(resolveSignal<InteractionKeyBinding>(template.props.onKey), false);
});

test("List renders as ScrollView with an internal for template", () => {
  const items = createSignal([
    { id: 1, label: "One" }
  ]);
  const template = asElement(
    List({
      height: 4,
      offset: 1,
      items,
      getKey: (item) => item.id,
      render: (item) => ({
        kind: "element",
        tag: "text",
        props: {
          value: item.label
        },
        children: []
      })
    })
  );
  const child = template.children[0]!;

  assert.equal(template.tag, "box");
  assert.equal(template.props.height, 4);
  assert.equal(template.props.scrollY, 1);
  assert.equal(child.kind, "for");

  if (child.kind !== "for") {
    throw new Error("Expected list child to be a for template.");
  }

  assert.equal(child.each, items);
  assert.equal(child.key?.(items.get()[0]!, 0), 1);
  assert.deepEqual(child.renderItem(items.get()[0]!, 0), {
    kind: "element",
    tag: "text",
    props: {
      value: "One"
    },
    children: []
  });
});

test("List exposes the planned props types", () => {
  const props: ListProps<{ id: number; label: string }> = {
    id: "typed",
    items: [{ id: 1, label: "One" }],
    getKey: (item) => item.id,
    render: (item) => ({
      kind: "element",
      tag: "text",
      props: {
        value: item.label
      },
      children: []
    }),
    height: 3,
    width: 12,
    offset: 0,
    onOffsetChange() {}
  };

  assert.equal(asElement(List(props)).props.id, "typed");
});

test("ScrollView stickToBottom requests max offset after layout", () => {
  const changes: number[] = [];
  const template = asElement(
    ScrollView({
      height: 2,
      offset: 0,
      stickToBottom: true,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
      }
    })
  );
  const api = connectScrollViewRef(template);

  api.onLayout?.(layoutPayload(0, 4, 2));

  assert.deepEqual(changes, [2]);
});

test("ScrollView stickToBottom stays detached after up key", () => {
  const changes: number[] = [];
  const template = asElement(
    ScrollView({
      height: 2,
      offset: 0,
      stickToBottom: true,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
      }
    })
  );
  const api = connectScrollViewRef(template);
  const scrollBox =
    template.tag === "hstack"
      ? asElement(template.children[0] as Template)
      : template;
  const onKey = readOnKeyHandler(scrollBox);

  api.onLayout?.(layoutPayload(0, 4, 2));
  api.onLayout?.(layoutPayload(2, 4, 2));
  changes.length = 0;

  assert.equal(onKey(key("up"), { node: {} as never, isFocused: true }), true);
  api.onLayout?.(layoutPayload(1, 5, 2));

  assert.deepEqual(changes, [1]);
});

test("ScrollView stickToBottom re-attaches after end key", () => {
  const offset = createSignal(0);
  const changes: number[] = [];
  const template = asElement(
    ScrollView({
      height: 2,
      offset,
      stickToBottom: true,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
        offset.set(nextOffset);
      }
    })
  );
  const api = connectScrollViewRef(template);
  const scrollBox =
    template.tag === "hstack"
      ? asElement(template.children[0] as Template)
      : template;
  const onKey = readOnKeyHandler(scrollBox);

  api.onLayout?.(layoutPayload(0, 4, 2));
  api.onLayout?.(layoutPayload(2, 4, 2));
  onKey(key("up"), { node: {} as never, isFocused: true });
  api.onLayout?.(layoutPayload(1, 5, 2));
  changes.length = 0;

  onKey(key("end"), { node: {} as never, isFocused: true });
  api.onLayout?.(layoutPayload(3, 5, 2));
  changes.length = 0;

  api.onLayout?.(layoutPayload(3, 6, 2));

  assert.deepEqual(changes, [4]);
});

test("ScrollView stickToBottom false does not auto scroll", () => {
  const changes: number[] = [];
  const template = asElement(
    ScrollView({
      height: 2,
      offset: 0,
      stickToBottom: false,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
      }
    })
  );
  const api = connectScrollViewRef(template);

  api.onLayout?.(layoutPayload(0, 4, 2));

  assert.deepEqual(changes, []);
});

test("ScrollView stickToBottom without onOffsetChange does not auto scroll", () => {
  const template = asElement(
    ScrollView({
      height: 2,
      offset: 0,
      stickToBottom: true
    })
  );
  const api = connectScrollViewRef(template);

  assert.doesNotThrow(() => {
    api.onLayout?.(layoutPayload(0, 4, 2));
  });
});

test("List stickToBottom auto scrolls after layout", () => {
  const changes: number[] = [];
  const template = asElement(
    List({
      height: 2,
      items: [{ id: 1, label: "One" }],
      stickToBottom: true,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
      },
      render: (item) => ({
        kind: "element",
        tag: "text",
        props: { value: item.label },
        children: []
      })
    })
  );
  const api = connectScrollViewRef(template);

  api.onLayout?.(layoutPayload(0, 4, 2));

  assert.deepEqual(changes, [2]);
});

test("computeScrollbarThumb follows the scroll viewport formula", () => {
  assert.deepEqual(computeScrollbarThumb(0, 10, 10, 100), {
    start: 0,
    size: 1
  });
  assert.deepEqual(computeScrollbarThumb(5, 10, 10, 100), {
    start: 5,
    size: 1
  });
  assert.deepEqual(computeScrollbarThumb(0, 0, 10, 100), {
    start: 0,
    size: 0
  });
});

test("renderScrollbarColumn draws track and thumb characters", () => {
  assert.equal(renderScrollbarColumn(0, 4, 4, 8), "█\n█\n│\n│");
  assert.equal(renderScrollbarColumn(0, 0, 4, 8), "");
});

test("ScrollView with showScrollbar renders an hstack wrapper", () => {
  const template = asElement(
    ScrollView({
      height: 3,
      offset: 0,
      showScrollbar: true,
      onOffsetChange() {}
    })
  );
  const row = asElement(template.children[0] as Template);

  assert.equal(template.tag, "box");
  assert.equal(row.tag, "hstack");
  assert.equal(asElement(row.children[0] as Template).tag, "box");
  assert.equal(asElement(row.children[1] as Template).props.width, 1);
});
