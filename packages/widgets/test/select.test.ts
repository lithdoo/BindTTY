import assert from "node:assert/strict";
import test from "node:test";

import { createSignal } from "@bindtty/signal";
import {
  Select,
  type SelectOption,
  type SelectProps,
  type SelectStyleProps
} from "@bindtty/widgets";
import type { BindTTYKeyEvent, InteractionKeyBinding, InteractionKeyHandler } from "@bindtty/interaction";
import type {
  ElementTemplate,
  ForTemplate,
  ReadableSignal,
  Template
} from "@bindtty/vnode";

const sampleOptions: readonly SelectOption[] = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" }
];

function asElement(template: Template): ElementTemplate {
  assert.equal(template.kind, "element");
  return template;
}

function asFor(template: Template): ForTemplate<SelectOption> {
  assert.equal(template.kind, "for");
  return template as ForTemplate<SelectOption>;
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

function readFocusable(template: ElementTemplate): boolean {
  const focusable = template.props.focusable;

  if (typeof focusable === "boolean") {
    return focusable;
  }

  return resolveSignal<boolean>(focusable);
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

function readListBox(template: ElementTemplate): ElementTemplate {
  const stack = asElement(template.children[0]!);
  return asElement(stack.children[stack.children.length - 1]!);
}

function readOptionsFor(template: ElementTemplate): ForTemplate<SelectOption> {
  const listBox = readListBox(template);
  const innerStack = asElement(listBox.children[0]!);
  return asFor(innerStack.children[0]!);
}

function renderOptionRow(
  template: ElementTemplate,
  index: number
): ElementTemplate {
  const optionsFor = readOptionsFor(template);
  return asElement(optionsFor.renderItem(sampleOptions[index]!, index));
}

test("Select renders as a focusable box with for option rows", () => {
  const template = asElement(
    Select({
      label: "Pick",
      options: sampleOptions,
      value: "a"
    })
  );
  const stack = asElement(template.children[0]!);
  const label = asElement(stack.children[0]!);
  const optionsFor = readOptionsFor(template);

  assert.equal(template.tag, "box");
  assert.equal(template.props.border, false);
  assert.equal(template.props.padding, 0);
  assert.equal(typeof template.props.onKey, "function");
  assert.equal(stack.tag, "vstack");
  assert.equal(label.tag, "text");
  assert.equal(label.props.value, "Pick");
  assert.equal(optionsFor.kind, "for");
});

test("Select exposes the planned props types", () => {
  const style: SelectStyleProps = {
    color: "green",
    background: "blue",
    bold: true,
    dim: false,
    padding: 1
  };
  const props: SelectProps = {
    ...style,
    id: "pick",
    label: "Typed",
    options: sampleOptions,
    value: "a",
    disabled: false,
    height: 3,
    onChange() {}
  };

  assert.equal(asElement(Select(props)).props.id, "pick");
});

test("Select marker reflects the current value", () => {
  const atA = asElement(
    Select({
      options: sampleOptions,
      value: "a"
    })
  );
  const atB = asElement(
    Select({
      options: sampleOptions,
      value: "b"
    })
  );

  assert.equal(renderOptionRow(atA, 0).props.value, "> Option A");
  assert.equal(renderOptionRow(atA, 1).props.value, "  Option B");
  assert.equal(renderOptionRow(atB, 0).props.value, "  Option A");
  assert.equal(renderOptionRow(atB, 1).props.value, "> Option B");
});

test("Select moves down with Down and calls onChange", () => {
  const changes: string[] = [];
  const value = createSignal("a");
  const template = asElement(
    Select({
      options: sampleOptions,
      value,
      onChange(nextValue) {
        changes.push(nextValue);
        value.set(nextValue);
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  assert.equal(onKey(key("down")), true);
  assert.deepEqual(changes, ["b"]);
});

test("Select does not move up from the first option", () => {
  let changes = 0;
  const template = asElement(
    Select({
      options: sampleOptions,
      value: "a",
      onChange() {
        changes += 1;
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  assert.equal(onKey(key("up")), false);
  assert.equal(changes, 0);
});

test("Select jumps to first and last options with Home and End", () => {
  const changes: string[] = [];
  const value = createSignal("b");
  const template = asElement(
    Select({
      options: sampleOptions,
      value,
      onChange(nextValue) {
        changes.push(nextValue);
        value.set(nextValue);
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  assert.equal(onKey(key("home")), true);
  assert.equal(onKey(key("end")), true);
  assert.deepEqual(changes, ["a", "c"]);
});

test("Select leaves unrelated keys unhandled", () => {
  let changes = 0;
  const template = asElement(
    Select({
      options: sampleOptions,
      value: "a",
      onChange() {
        changes += 1;
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  assert.equal(onKey(key("return")), false);
  assert.equal(changes, 0);
});

test("Select disabled maps onKey to false, focusable to false, and dims option rows", () => {
  const template = asElement(
    Select({
      options: sampleOptions,
      value: "a",
      disabled: true
    })
  );
  const row = renderOptionRow(template, 0);

  assert.equal(template.props.onKey, false);
  assert.equal(readFocusable(template), false);
  assert.equal(row.props.dim, true);
});

test("Select supports dynamic disabled values", () => {
  const disabled = createSignal(false);
  const template = asElement(
    Select({
      options: sampleOptions,
      value: "a",
      disabled
    })
  );
  const row = renderOptionRow(template, 0);

  assert.equal(typeof resolveSignal<InteractionKeyBinding>(template.props.onKey), "function");
  assert.equal(readFocusable(template), true);
  assert.equal(resolveSignal<boolean>(row.props.dim), false);

  disabled.set(true);

  assert.equal(resolveSignal<InteractionKeyBinding>(template.props.onKey), false);
  assert.equal(readFocusable(template), false);
  assert.equal(resolveSignal<boolean>(row.props.dim), true);
});

test("Select marker updates when value is a signal", () => {
  const value = createSignal("a");
  const template = asElement(
    Select({
      options: sampleOptions,
      value
    })
  );
  const row = renderOptionRow(template, 1);

  assert.equal(resolveSignal<string>(row.props.value), "  Option B");

  value.set("b");

  assert.equal(resolveSignal<string>(row.props.value), "> Option B");
});

test("Select scrollY follows the viewport when height is set", () => {
  const tallOptions: readonly SelectOption[] = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
    { value: "c", label: "C" },
    { value: "d", label: "D" },
    { value: "e", label: "E" }
  ];
  const value = createSignal("a");
  const template = asElement(
    Select({
      options: tallOptions,
      value,
      height: 3,
      onChange(nextValue) {
        value.set(nextValue);
      }
    })
  );
  const onKey = readOnKeyHandler(template);
  const listBox = readListBox(template);

  assert.equal(listBox.props.overflow, "clip");
  assert.equal(listBox.props.height, 3);
  assert.equal(resolveSignal<number>(listBox.props.scrollY), 0);

  assert.equal(onKey(key("down")), true);
  assert.equal(onKey(key("down")), true);
  assert.equal(onKey(key("down")), true);

  assert.equal(value.get(), "d");
  assert.equal(resolveSignal<number>(listBox.props.scrollY), 1);
});
