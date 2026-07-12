import assert from "node:assert/strict";
import test from "node:test";

import { createSignal } from "@bindtty/signal";
import {
  Button,
  List,
  VScrollView,
  HScrollView,
  ScrollView,
  ProgressBar,
  renderProgressBar,
  renderProgressPercent,
  computeScrollbarThumb,
  renderScrollbarColumn,
  renderScrollbarRow,
  type ButtonProps,
  type ButtonStyleProps,
  type ListProps,
  type VScrollViewProps,
  type VScrollViewStyleProps,
  type HScrollViewProps,
  type ScrollViewProps
} from "@bindtty/widgets";
import type {
  BindTTYKeyEvent,
  InteractionKeyBinding,
  InteractionKeyHandler
} from "@bindtty/interaction";
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

function key(name: string): BindTTYKeyEvent {
  const event: BindTTYKeyEvent = {
    input: "",
    name,
    ctrl: false,
    meta: false,
    shift: false,
    phase: "target",
    propagationStopped: false,
    stopPropagation() {
      event.propagationStopped = true;
    }
  };

  return event;
}

function rawKey(
  input: string,
  overrides: Partial<BindTTYKeyEvent> = {}
): BindTTYKeyEvent {
  const event: BindTTYKeyEvent = {
    input,
    ctrl: false,
    meta: false,
    shift: false,
    phase: "target",
    propagationStopped: false,
    stopPropagation() {
      event.propagationStopped = true;
    },
    ...overrides
  };

  return event;
}

interface TestScrollApi {
  onLayout?: (layout: unknown) => void;
  onUnmount?: () => void;
}

function connectVScrollViewRef(template: ElementTemplate): TestScrollApi {
  const scrollBox = getVScrollViewScrollBox(template);
  const ref = scrollBox.props.ref;
  assert.equal(typeof ref, "function");

  const api: TestScrollApi = {};
  (ref as (api: TestScrollApi) => void)(api);
  return api;
}

function getVScrollViewScrollBox(template: ElementTemplate): ElementTemplate {
  if (hasOwn(template.props, "scrollY") || hasOwn(template.props, "scrollX")) {
    return template;
  }

  if (template.tag === "box" && template.children[0]?.kind === "element") {
    const firstChild = asElement(template.children[0] as Template);
    if (firstChild.tag === "hstack" && firstChild.children[0]?.kind === "element") {
      return asElement(firstChild.children[0] as Template);
    }
  } else if (template.tag === "hstack" && template.children[0]?.kind === "element") {
    return asElement(template.children[0] as Template);
  }

  return template;
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
  assert.equal(onKey(rawKey("\r", { name: "return" })), true);
  assert.equal(onKey(rawKey(" ")), true);
  assert.equal(presses, 2);
});

test("Button defaults focusable to true", () => {
  const template = asElement(
    Button({
      label: "Run"
    })
  );

  assert.equal(template.props.focusable, true);
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
  assert.equal(onKey(rawKey("x")), false);
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
  assert.equal(template.props.focusable, false);
  assert.equal(label.props.dim, true);
});

test("Button disabled overrides explicit focusable true", () => {
  const template = asElement(
    Button({
      label: "Disabled",
      disabled: true,
      focusable: true
    })
  );

  assert.equal(template.props.focusable, false);
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
  assert.equal(resolveSignal<boolean>(template.props.focusable), true);
  assert.equal(resolveSignal<boolean>(label.props.dim), false);

  disabled.set(true);

  assert.equal(resolveSignal<InteractionKeyBinding>(template.props.onKey), false);
  assert.equal(resolveSignal<boolean>(template.props.focusable), false);
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

test("VScrollView renders as a clipped box with scroll metadata", () => {
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
    VScrollView({
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

test("VScrollView exposes the planned props types", () => {
  const style: VScrollViewStyleProps = {
    background: "blue",
    borderColor: "cyan",
    padding: 1,
    border: true,
    focusStyle: "none"
  };
  const props: VScrollViewProps = {
    ...style,
    id: "typed",
    height: 3,
    width: 20,
    offset: 1,
    scrollOnArrow: true,
    onOffsetChange() {}
  };

  const template = asElement(VScrollView(props));
  assert.equal(template.props.id, "typed");
  assert.equal(template.props.focusStyle, "none");
});

test("VScrollView forwards focusStyle to the focusable scroll box", () => {
  const none = asElement(
    VScrollView({
      height: 3,
      focusStyle: "none",
      onOffsetChange() {}
    })
  );
  const inverse = asElement(
    VScrollView({
      height: 3,
      focusStyle: "inverse",
      onOffsetChange() {}
    })
  );
  const unset = asElement(
    VScrollView({
      height: 3,
      onOffsetChange() {}
    })
  );

  assert.equal(none.props.focusStyle, "none");
  assert.equal(inverse.props.focusStyle, "inverse");
  assert.equal(unset.props.focusStyle, undefined);
});

test("VScrollView with showScrollbar keeps focusStyle on the inner scroll box", () => {
  const template = asElement(
    VScrollView({
      height: 3,
      showScrollbar: true,
      focusStyle: "none",
      border: true,
      onOffsetChange() {}
    })
  );
  const scrollBox = getVScrollViewScrollBox(template);

  assert.notEqual(template, scrollBox);
  assert.equal(template.props.focusStyle, undefined);
  assert.equal(template.props.focusable, undefined);
  assert.equal(scrollBox.props.focusStyle, "none");
  assert.equal(scrollBox.props.focusable, true);
});

test("VScrollView supports dynamic focusStyle signals", () => {
  const focusStyle = createSignal<"inverse" | "none">("none");
  const template = asElement(
    VScrollView({
      height: 3,
      focusStyle,
      onOffsetChange() {}
    })
  );

  assert.equal(template.props.focusStyle, focusStyle);
  assert.equal(resolveSignal<"inverse" | "none">(template.props.focusStyle), "none");
  focusStyle.set("inverse");
  assert.equal(resolveSignal<"inverse" | "none">(template.props.focusStyle), "inverse");
});

test("VScrollView emits offset intents for scroll keys", () => {
  const offset = createSignal(5);
  const height = createSignal(3);
  const changes: number[] = [];
  const template = asElement(
    VScrollView({
      height,
      offset,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  assert.equal(onKey(key("up")), true);
  assert.equal(onKey(key("down")), true);
  assert.equal(onKey(key("pageup")), true);
  assert.equal(onKey(key("pagedown")), true);
  assert.equal(onKey(key("home")), true);
  assert.equal(onKey(key("end")), true);
  assert.equal(onKey(key("left")), false);

  assert.deepEqual(changes, [
    4,
    6,
    2,
    8,
    0,
    Number.MAX_SAFE_INTEGER
  ]);
});

test("VScrollView uses applied layout state for scroll keys after layout", () => {
  const changes: number[] = [];
  const template = asElement(
    VScrollView({
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

  assert.equal(onKey(key("down")), true);
  assert.equal(onKey(key("pagedown")), true);
  assert.equal(onKey(key("end")), true);
  assert.equal(onKey(key("up")), true);
  assert.deepEqual(changes, [7, 7, 7, 6]);
});

test("VScrollView defaults focusable to true without an offset change handler", () => {
  const template = asElement(
    VScrollView({
      height: 3,
      offset: 0
    })
  );

  assert.equal(template.props.focusable, true);
  assert.equal(template.props.onKey, false);
});

test("VScrollView supports dynamic scrollOnArrow values", () => {
  const scrollOnArrow = createSignal(true);
  const template = asElement(
    VScrollView({
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

test("List renders as VScrollView with an internal for template", () => {
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

test("List forwards focusStyle to the focusable VScrollView box", () => {
  const template = asElement(
    List({
      height: 3,
      focusStyle: "none",
      items: [{ id: 1 }],
      getKey: (item) => item.id,
      render: () => ({
        kind: "element",
        tag: "text",
        props: { value: "row" },
        children: []
      })
    })
  );

  assert.equal(template.props.focusStyle, "none");
});

test("List with showScrollbar keeps focusStyle on the inner scroll box", () => {
  const template = asElement(
    List({
      height: 3,
      showScrollbar: true,
      focusStyle: "none",
      items: [{ id: 1 }],
      getKey: (item) => item.id,
      render: () => ({
        kind: "element",
        tag: "text",
        props: { value: "row" },
        children: []
      })
    })
  );
  const scrollBox = getVScrollViewScrollBox(template);

  assert.notEqual(template, scrollBox);
  assert.equal(template.props.focusStyle, undefined);
  assert.equal(scrollBox.props.focusStyle, "none");
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

test("VScrollView stickToBottom requests max offset after layout", () => {
  const changes: number[] = [];
  const template = asElement(
    VScrollView({
      height: 2,
      offset: 0,
      stickToBottom: true,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
      }
    })
  );
  const api = connectVScrollViewRef(template);

  api.onLayout?.(layoutPayload(0, 4, 2));

  assert.deepEqual(changes, [2]);
});

test("VScrollView stickToBottom stays detached after up key", () => {
  const changes: number[] = [];
  const template = asElement(
    VScrollView({
      height: 2,
      offset: 0,
      stickToBottom: true,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
      }
    })
  );
  const api = connectVScrollViewRef(template);
  const scrollBox =
    template.tag === "hstack"
      ? asElement(template.children[0] as Template)
      : template;
  const onKey = readOnKeyHandler(scrollBox);

  api.onLayout?.(layoutPayload(0, 4, 2));
  api.onLayout?.(layoutPayload(2, 4, 2));
  changes.length = 0;

  assert.equal(onKey(key("up")), true);
  api.onLayout?.(layoutPayload(1, 5, 2));

  assert.deepEqual(changes, [1]);
});

test("VScrollView stickToBottom re-attaches after end key", () => {
  const offset = createSignal(0);
  const changes: number[] = [];
  const template = asElement(
    VScrollView({
      height: 2,
      offset,
      stickToBottom: true,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
        offset.set(nextOffset);
      }
    })
  );
  const api = connectVScrollViewRef(template);
  const scrollBox =
    template.tag === "hstack"
      ? asElement(template.children[0] as Template)
      : template;
  const onKey = readOnKeyHandler(scrollBox);

  api.onLayout?.(layoutPayload(0, 4, 2));
  api.onLayout?.(layoutPayload(2, 4, 2));
  onKey(key("up"));
  api.onLayout?.(layoutPayload(1, 5, 2));
  changes.length = 0;

  onKey(key("end"));
  api.onLayout?.(layoutPayload(3, 5, 2));
  changes.length = 0;

  api.onLayout?.(layoutPayload(3, 6, 2));

  assert.deepEqual(changes, [4]);
});

test("VScrollView stickToBottom false does not auto scroll", () => {
  const changes: number[] = [];
  const template = asElement(
    VScrollView({
      height: 2,
      offset: 0,
      stickToBottom: false,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
      }
    })
  );
  const api = connectVScrollViewRef(template);

  api.onLayout?.(layoutPayload(0, 4, 2));

  assert.deepEqual(changes, []);
});

test("VScrollView stickToBottom without onOffsetChange does not auto scroll", () => {
  const template = asElement(
    VScrollView({
      height: 2,
      offset: 0,
      stickToBottom: true
    })
  );
  const api = connectVScrollViewRef(template);

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
  const api = connectVScrollViewRef(template);

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
  assert.equal(renderScrollbarColumn(0, 4, 4, 8), "\u2588\n\u2588\n\u2502\n\u2502");
  assert.equal(renderScrollbarColumn(0, 0, 4, 8), "");
});

test("VScrollView with showScrollbar renders an hstack wrapper", () => {
  const template = asElement(
    VScrollView({
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

function connectHScrollViewRef(template: ElementTemplate): TestScrollApi {
  const scrollBox = getHScrollViewScrollBox(template);
  const ref = scrollBox.props.ref;
  assert.equal(typeof ref, "function");

  const api: TestScrollApi = {};
  (ref as (api: TestScrollApi) => void)(api);
  return api;
}

function getHScrollViewScrollBox(template: ElementTemplate): ElementTemplate {
  if (hasOwn(template.props, "scrollX") || hasOwn(template.props, "scrollY")) {
    return template;
  }

  if (template.tag === "box" && template.children[0]?.kind === "element") {
    const firstChild = asElement(template.children[0] as Template);
    if (firstChild.tag === "vstack" && firstChild.children[0]?.kind === "element") {
      return asElement(firstChild.children[0] as Template);
    }
  }

  return template;
}

function layoutPayloadX(
  scrollOffsetX: number,
  contentWidth: number,
  viewportWidth: number
) {
  return {
    rect: { width: viewportWidth },
    contentRect: { width: viewportWidth },
    clip: { width: viewportWidth },
    scrollOffset: { x: scrollOffsetX },
    contentSize: { width: contentWidth }
  };
}

test("HScrollView renders as a clipped box with horizontal scroll metadata", () => {
  const template = asElement(
    HScrollView({
      width: 10,
      offset: 2,
      onOffsetChange() {}
    })
  );

  assert.equal(template.tag, "box");
  assert.equal(template.props.width, 10);
  assert.equal(template.props.overflow, "clip");
  assert.equal(template.props.scrollX, 2);
  assert.equal(template.props.scrollY, 0);
});

test("HScrollView emits offset intents for horizontal scroll keys", () => {
  const changes: number[] = [];
  const template = asElement(
    HScrollView({
      width: 4,
      offset: 1,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  assert.equal(onKey(key("left")), true);
  assert.equal(onKey(key("right")), true);
  assert.equal(onKey(key("home")), true);
  assert.equal(onKey(key("end")), true);
  assert.equal(onKey(key("up")), false);
  assert.deepEqual(changes, [0, 2, 0, Number.MAX_SAFE_INTEGER]);
});

test("HScrollView stickToEnd requests max offset after layout", () => {
  const changes: number[] = [];
  const template = asElement(
    HScrollView({
      width: 2,
      offset: 0,
      stickToEnd: true,
      onOffsetChange(nextOffset) {
        changes.push(nextOffset);
      }
    })
  );
  const api = connectHScrollViewRef(template);

  api.onLayout?.(layoutPayloadX(0, 4, 2));

  assert.deepEqual(changes, [2]);
});

test("renderScrollbarRow draws track and thumb characters", () => {
  assert.equal(renderScrollbarRow(0, 4, 4, 8), "\u2588\u2588\u2500\u2500");
  assert.equal(renderScrollbarRow(0, 0, 4, 8), "");
});

test("HScrollView with showScrollbar renders a vstack wrapper", () => {
  const template = asElement(
    HScrollView({
      width: 6,
      offset: 0,
      showScrollbar: true,
      onOffsetChange() {}
    })
  );
  const column = asElement(template.children[0] as Template);

  assert.equal(template.tag, "box");
  assert.equal(column.tag, "vstack");
  assert.equal(asElement(column.children[0] as Template).tag, "box");
  assert.equal(asElement(column.children[1] as Template).props.height, 1);
});

test("HScrollView forwards focusStyle to the focusable scroll box", () => {
  const none = asElement(
    HScrollView({
      width: 6,
      focusStyle: "none",
      onOffsetChange() {}
    })
  );
  const inverse = asElement(
    HScrollView({
      width: 6,
      focusStyle: "inverse",
      onOffsetChange() {}
    })
  );
  const unset = asElement(
    HScrollView({
      width: 6,
      onOffsetChange() {}
    })
  );

  assert.equal(none.props.focusStyle, "none");
  assert.equal(inverse.props.focusStyle, "inverse");
  assert.equal(unset.props.focusStyle, undefined);
});

test("HScrollView with showScrollbar keeps focusStyle on the inner scroll box", () => {
  const template = asElement(
    HScrollView({
      width: 6,
      showScrollbar: true,
      focusStyle: "none",
      border: true,
      onOffsetChange() {}
    })
  );
  const scrollBox = getHScrollViewScrollBox(template);

  assert.notEqual(template, scrollBox);
  assert.equal(template.props.focusStyle, undefined);
  assert.equal(template.props.focusable, undefined);
  assert.equal(scrollBox.props.focusStyle, "none");
  assert.equal(scrollBox.props.focusable, true);
});

test("HScrollView supports dynamic focusStyle signals", () => {
  const focusStyle = createSignal<"inverse" | "none">("inverse");
  const template = asElement(
    HScrollView({
      width: 6,
      focusStyle,
      onOffsetChange() {}
    })
  );

  assert.equal(template.props.focusStyle, focusStyle);
  assert.equal(resolveSignal<"inverse" | "none">(template.props.focusStyle), "inverse");
  focusStyle.set("none");
  assert.equal(resolveSignal<"inverse" | "none">(template.props.focusStyle), "none");
});

function connectScrollViewRef(template: ElementTemplate): TestScrollApi {
  const scrollBox = getScrollViewScrollBox(template);
  const ref = scrollBox.props.ref;
  assert.equal(typeof ref, "function");

  const api: TestScrollApi = {};
  (ref as (api: TestScrollApi) => void)(api);
  return api;
}

function getScrollViewScrollBox(template: ElementTemplate): ElementTemplate {
  if (hasOwn(template.props, "scrollX") || hasOwn(template.props, "scrollY")) {
    return template;
  }

  assert.equal(template.tag, "box");
  const firstChild = asElement(template.children[0] as Template);

  if (firstChild.tag === "vstack" && firstChild.children[0]?.kind === "element") {
    const topRow = asElement(firstChild.children[0] as Template);
    if (topRow.tag === "hstack" && topRow.children[0]?.kind === "element") {
      return asElement(topRow.children[0] as Template);
    }
  }

  throw new Error("ScrollView scroll box not found");
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readScrollViewOnKeyHandler(template: ElementTemplate): InteractionKeyHandler {
  return readOnKeyHandler(getScrollViewScrollBox(template));
}

function layoutPayloadXY(
  scrollOffsetX: number,
  scrollOffsetY: number,
  contentWidth: number,
  contentHeight: number,
  viewportWidth: number,
  viewportHeight: number
) {
  return {
    rect: { width: viewportWidth, height: viewportHeight },
    contentRect: { width: viewportWidth, height: viewportHeight },
    clip: { width: viewportWidth, height: viewportHeight },
    scrollOffset: { x: scrollOffsetX, y: scrollOffsetY },
    contentSize: { width: contentWidth, height: contentHeight }
  };
}

test("ScrollView renders as a clipped box with dual scroll metadata", () => {
  const template = asElement(
    ScrollView({
      width: 10,
      height: 8,
      offsetX: 1,
      offsetY: 2,
      onOffsetXChange() {},
      onOffsetYChange() {}
    })
  );

  assert.equal(template.tag, "box");
  assert.equal(template.props.width, 10);
  assert.equal(template.props.height, 8);
  assert.equal(template.props.overflow, "clip");
  assert.equal(template.props.scrollX, 1);
  assert.equal(template.props.scrollY, 2);
});

test("ScrollView exposes the planned props types", () => {
  const props: ScrollViewProps = {
    width: 10,
    height: 8,
    offsetX: 0,
    offsetY: 0,
    focusStyle: "none",
    showScrollbar: { vertical: true, horizontal: false },
    onOffsetXChange() {},
    onOffsetYChange() {}
  };

  const template = asElement(ScrollView(props));
  assert.equal(template.props.width, 10);
  assert.equal(getScrollViewScrollBox(template).props.focusStyle, "none");
});

test("ScrollView forwards focusStyle to the focusable scroll box", () => {
  const none = asElement(
    ScrollView({
      width: 10,
      height: 8,
      focusStyle: "none",
      onOffsetXChange() {},
      onOffsetYChange() {}
    })
  );
  const inverse = asElement(
    ScrollView({
      width: 10,
      height: 8,
      focusStyle: "inverse",
      onOffsetXChange() {},
      onOffsetYChange() {}
    })
  );
  const unset = asElement(
    ScrollView({
      width: 10,
      height: 8,
      onOffsetXChange() {},
      onOffsetYChange() {}
    })
  );

  assert.equal(none.props.focusStyle, "none");
  assert.equal(inverse.props.focusStyle, "inverse");
  assert.equal(unset.props.focusStyle, undefined);
});

test("ScrollView with showScrollbar keeps focusStyle on the inner scroll box", () => {
  const template = asElement(
    ScrollView({
      width: 10,
      height: 8,
      showScrollbar: true,
      focusStyle: "none",
      border: true,
      onOffsetXChange() {},
      onOffsetYChange() {}
    })
  );
  const scrollBox = getScrollViewScrollBox(template);

  assert.notEqual(template, scrollBox);
  assert.equal(template.props.focusStyle, undefined);
  assert.equal(template.props.focusable, undefined);
  assert.equal(scrollBox.props.focusStyle, "none");
  assert.equal(scrollBox.props.focusable, true);
});

test("ScrollView supports dynamic focusStyle signals", () => {
  const focusStyle = createSignal<"inverse" | "none">("none");
  const template = asElement(
    ScrollView({
      width: 10,
      height: 8,
      focusStyle,
      onOffsetXChange() {},
      onOffsetYChange() {}
    })
  );

  assert.equal(template.props.focusStyle, focusStyle);
  assert.equal(resolveSignal<"inverse" | "none">(template.props.focusStyle), "none");
  focusStyle.set("inverse");
  assert.equal(resolveSignal<"inverse" | "none">(template.props.focusStyle), "inverse");
});

test("ScrollView vertical keys change only Y offset", () => {
  const changesY: number[] = [];
  const changesX: number[] = [];
  const template = asElement(
    ScrollView({
      width: 4,
      height: 4,
      offsetX: 0,
      offsetY: 1,
      onOffsetXChange(nextOffset) {
        changesX.push(nextOffset);
      },
      onOffsetYChange(nextOffset) {
        changesY.push(nextOffset);
      }
    })
  );
  const onKey = readScrollViewOnKeyHandler(template);

  assert.equal(onKey(key("up")), true);
  assert.equal(onKey(key("down")), true);
  assert.equal(onKey(key("pageup")), true);
  assert.equal(onKey(key("pagedown")), true);
  assert.deepEqual(changesX, []);
  assert.deepEqual(changesY, [0, 2, 0, 5]);
});

test("ScrollView horizontal keys change only X offset", () => {
  const changesY: number[] = [];
  const changesX: number[] = [];
  const template = asElement(
    ScrollView({
      width: 4,
      height: 4,
      offsetX: 1,
      offsetY: 0,
      onOffsetXChange(nextOffset) {
        changesX.push(nextOffset);
      },
      onOffsetYChange(nextOffset) {
        changesY.push(nextOffset);
      }
    })
  );
  const onKey = readScrollViewOnKeyHandler(template);

  assert.equal(onKey(key("left")), true);
  assert.equal(onKey(key("right")), true);
  assert.deepEqual(changesY, []);
  assert.deepEqual(changesX, [0, 2]);
});

test("ScrollView home and end update both axes", () => {
  const changesY: number[] = [];
  const changesX: number[] = [];
  const template = asElement(
    ScrollView({
      width: 2,
      height: 2,
      offsetX: 1,
      offsetY: 1,
      onOffsetXChange(nextOffset) {
        changesX.push(nextOffset);
      },
      onOffsetYChange(nextOffset) {
        changesY.push(nextOffset);
      }
    })
  );
  const onKey = readScrollViewOnKeyHandler(template);
  const api = connectScrollViewRef(template);

  api.onLayout?.(layoutPayloadXY(1, 1, 6, 6, 2, 2));

  assert.equal(onKey(key("home")), true);
  assert.equal(onKey(key("end")), true);
  assert.deepEqual(changesX, [0, 4]);
  assert.deepEqual(changesY, [0, 4]);
});

test("ScrollView uses applied layout state for scroll keys after layout", () => {
  const changesY: number[] = [];
  const template = asElement(
    ScrollView({
      width: 2,
      height: 2,
      offsetY: 100,
      onOffsetYChange(nextOffset) {
        changesY.push(nextOffset);
      }
    })
  );
  const onKey = readScrollViewOnKeyHandler(template);
  const api = connectScrollViewRef(template);

  api.onLayout?.(layoutPayloadXY(0, 4, 2, 6, 2, 2));

  assert.equal(onKey(key("down")), true);
  assert.deepEqual(changesY, [4]);
});

test("ScrollView defaults focusable to true without offset change handlers", () => {
  const template = asElement(
    ScrollView({
      width: 4,
      height: 4
    })
  );

  assert.equal(template.props.focusable, true);
  assert.equal(readOnKey(template), false);
});

test("ScrollView stickToBottom requests max Y offset after layout", () => {
  const changesY: number[] = [];
  const template = asElement(
    ScrollView({
      width: 2,
      height: 2,
      offsetY: 0,
      stickToBottom: true,
      onOffsetYChange(nextOffset) {
        changesY.push(nextOffset);
      }
    })
  );
  const api = connectScrollViewRef(template);

  api.onLayout?.(layoutPayloadXY(0, 0, 2, 6, 2, 2));

  assert.deepEqual(changesY, [4]);
});

test("ScrollView stickToEnd requests max X offset after layout", () => {
  const changesX: number[] = [];
  const template = asElement(
    ScrollView({
      width: 2,
      height: 2,
      offsetX: 0,
      stickToEnd: true,
      onOffsetXChange(nextOffset) {
        changesX.push(nextOffset);
      }
    })
  );
  const api = connectScrollViewRef(template);

  api.onLayout?.(layoutPayloadXY(0, 0, 6, 2, 2, 2));

  assert.deepEqual(changesX, [4]);
});

test("ScrollView with showScrollbar renders a vstack wrapper with two rows", () => {
  const template = asElement(
    ScrollView({
      width: 6,
      height: 4,
      offsetX: 0,
      offsetY: 0,
      showScrollbar: true,
      onOffsetXChange() {},
      onOffsetYChange() {}
    })
  );
  const column = asElement(template.children[0] as Template);
  const topRow = asElement(column.children[0] as Template);
  const bottomRow = asElement(column.children[1] as Template);

  assert.equal(template.tag, "box");
  assert.equal(column.tag, "vstack");
  assert.equal(topRow.tag, "hstack");
  assert.equal(bottomRow.tag, "box");
  assert.equal(asElement(topRow.children[0] as Template).tag, "box");
});

test("ScrollView showScrollbar hides horizontal row when only Y overflows", () => {
  const template = asElement(
    ScrollView({
      width: 4,
      height: 3,
      offsetX: 0,
      offsetY: 0,
      showScrollbar: true,
      onOffsetXChange() {},
      onOffsetYChange() {}
    })
  );
  const api = connectScrollViewRef(template);

  api.onLayout?.(layoutPayloadXY(0, 0, 4, 8, 4, 3));

  const column = asElement(template.children[0] as Template);
  const bottomRow = asElement(column.children[1] as Template);

  assert.equal(resolveSignal<number>(bottomRow.props.height), 0);
});

function getProgressBarTrackBox(template: ElementTemplate): ElementTemplate {
  const row = asElement(template.children[0] as Template);
  assert.equal(row.tag, "hstack");

  for (const child of row.children) {
    if (child.kind === "element") {
      const element = asElement(child);
      if (element.tag === "box" && element.props.width !== undefined) {
        return element;
      }
    }
  }

  throw new Error("ProgressBar track box not found");
}

function getProgressBarTrackText(template: ElementTemplate): ElementTemplate {
  const trackBox = getProgressBarTrackBox(template);
  return asElement(trackBox.children[0] as Template);
}

test("renderProgressBar follows the round formula", () => {
  assert.equal(renderProgressBar(50, 100, 10, "\u2588", "\u2591"), "\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591\u2591");
  assert.equal(renderProgressBar(100, 100, 4, "\u2588", "\u2591"), "\u2588\u2588\u2588\u2588");
  assert.equal(renderProgressBar(150, 100, 4, "\u2588", "\u2591"), "\u2588\u2588\u2588\u2588");
  assert.equal(renderProgressBar(0, 100, 4, "\u2588", "\u2591"), "\u2591\u2591\u2591\u2591");
  assert.equal(renderProgressBar(50, 0, 10, "\u2588", "\u2591"), "");
  assert.equal(renderProgressBar(50, 100, 0, "\u2588", "\u2591"), "");
});

test("renderProgressBar width 1 uses round", () => {
  assert.equal(renderProgressBar(40, 100, 1, "\u2588", "\u2591"), "\u2591");
  assert.equal(renderProgressBar(60, 100, 1, "\u2588", "\u2591"), "\u2588");
});

test("renderProgressPercent formats percentage text", () => {
  assert.equal(renderProgressPercent(42, 100), " 42%");
  assert.equal(renderProgressPercent(0, 0), " 0%");
});

test("ProgressBar renders hstack with track box and text", () => {
  const template = asElement(
    ProgressBar({
      width: 8,
      value: 4,
      max: 8
    })
  );
  const row = asElement(template.children[0] as Template);
  const trackBox = getProgressBarTrackBox(template);
  const trackText = getProgressBarTrackText(template);

  assert.equal(template.tag, "box");
  assert.equal(row.tag, "hstack");
  assert.equal(row.children.length, 1);
  assert.equal(trackBox.props.width, 8);
  assert.equal(trackText.tag, "text");
  assert.equal(trackText.props.value, "\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591");
});

test("ProgressBar renders label and showPercent in hstack", () => {
  const template = asElement(
    ProgressBar({
      width: 4,
      value: 2,
      max: 4,
      label: "Load",
      showPercent: true
    })
  );
  const row = asElement(template.children[0] as Template);

  assert.equal(row.children.length, 3);
  assert.equal(asElement(row.children[0] as Template).props.value, "Load");
  assert.equal(
    asElement(row.children[2] as Template).props.value,
    " 50%"
  );
});

test("ProgressBar is not focusable", () => {
  const template = asElement(
    ProgressBar({
      width: 4,
      value: 1,
      max: 2
    })
  );

  assert.equal(template.props.onKey, undefined);
});

test("ProgressBar updates bar text from a dynamic value signal", () => {
  const value = createSignal(0);
  const template = asElement(
    ProgressBar({
      width: 4,
      value,
      max: 100
    })
  );
  const trackText = getProgressBarTrackText(template);

  assert.equal(resolveSignal<string>(trackText.props.value), "\u2591\u2591\u2591\u2591");

  value.set(100);
  assert.equal(resolveSignal<string>(trackText.props.value), "\u2588\u2588\u2588\u2588");
});
