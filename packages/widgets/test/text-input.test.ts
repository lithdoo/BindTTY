import assert from "node:assert/strict";
import test from "node:test";

import { createSignal } from "@bindtty/signal";
import {
  TextInput,
  type TextInputProps,
  type TextInputStyleProps
} from "@bindtty/widgets";
import type {
  InteractionKeyBinding,
  InteractionKeyHandler,
  InteractionNodeFocusChangeEvent
} from "@bindtty/interaction";
import type { ElementTemplate, ReadableSignal, Template } from "@bindtty/vnode";
import type { TerminalKeyEvent } from "@bindtty/terminal";

function asElement(template: Template): ElementTemplate {
  assert.equal(template.kind, "element");
  return template;
}

function childElement(template: ElementTemplate, index: number): ElementTemplate {
  return asElement(template.children[index]!);
}

function resolveSignal<T>(value: unknown): T {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return (value as ReadableSignal<T>).get();
}

function readOnKey(template: ElementTemplate): InteractionKeyBinding {
  return template.props.onKey as InteractionKeyBinding;
}

function readOnKeyHandler(template: ElementTemplate): InteractionKeyHandler {
  const onKey = readOnKey(template);

  assert.equal(typeof onKey, "function");
  return onKey as InteractionKeyHandler;
}

function key(
  input: string,
  overrides: Partial<TerminalKeyEvent> = {}
): TerminalKeyEvent {
  return {
    input,
    ctrl: false,
    meta: false,
    shift: false,
    ...overrides
  };
}

function focusEvent(focused: boolean): InteractionNodeFocusChangeEvent {
  return {
    id: "input",
    node: {} as never,
    focused,
    reason: "programmatic"
  };
}

function callOnKey(
  handler: InteractionKeyHandler,
  event: TerminalKeyEvent
): boolean | void {
  return handler(event, {
    node: {} as never,
    isFocused: true
  });
}

function readParts(template: ElementTemplate): {
  hstack: ElementTemplate;
  before: ElementTemplate;
  cursor: ElementTemplate;
  after: ElementTemplate;
} {
  const hstack = childElement(template, 0);

  return {
    hstack,
    before: childElement(hstack, 0),
    cursor: childElement(hstack, 1),
    after: childElement(hstack, 2)
  };
}

test("TextInput renders as a focusable box with split cursor text nodes", () => {
  const value = createSignal("Hello");
  const focusChanges: boolean[] = [];
  const template = asElement(
    TextInput({
      id: "name",
      value,
      onFocusChange(event) {
        focusChanges.push(event.focused);
      }
    })
  );
  const { hstack, before, cursor, after } = readParts(template);

  assert.equal(template.tag, "box");
  assert.equal(template.props.id, "name");
  assert.equal(template.props.focusStyle, "none");
  assert.equal(template.props.border, true);
  assert.equal(template.props.padding, 1);
  assert.equal(typeof template.props.onFocusChange, "function");
  assert.equal(typeof template.props.onKey, "function");
  assert.equal(hstack.tag, "hstack");
  assert.equal(before.tag, "text");
  assert.equal(cursor.tag, "text");
  assert.equal(after.tag, "text");
  assert.equal(resolveSignal<string>(before.props.value), "Hello");
  assert.equal(resolveSignal<string>(cursor.props.value), "");
  assert.equal(resolveSignal<string>(after.props.value), "");

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.deepEqual(focusChanges, [true]);
});

test("TextInput exposes the planned props types", () => {
  const style: TextInputStyleProps = {
    color: "green",
    background: "blue",
    borderColor: "cyan",
    bold: true,
    dim: false,
    padding: 2,
    border: true
  };
  const props: TextInputProps = {
    ...style,
    id: "typed",
    value: "Typed",
    placeholder: "Name",
    disabled: false,
    onChange() {},
    onSubmit() {}
  };

  assert.equal(asElement(TextInput(props)).props.id, "typed");
});

test("TextInput shows dimmed placeholder only when empty and unfocused", () => {
  const value = createSignal("");
  const template = asElement(
    TextInput({
      value,
      placeholder: "Type..."
    })
  );
  const { before, cursor } = readParts(template);

  assert.equal(resolveSignal<string>(before.props.value), "Type...");
  assert.equal(resolveSignal<boolean>(before.props.dim), true);
  assert.equal(resolveSignal<string>(cursor.props.value), "");

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.equal(resolveSignal<string>(before.props.value), "");
  assert.equal(resolveSignal<string>(cursor.props.value), " ");

  value.set("A");

  assert.equal(resolveSignal<string>(before.props.value), "");
  assert.equal(resolveSignal<string>(cursor.props.value), "A");
});

test("TextInput inserts printable input as a controlled component", () => {
  const value = createSignal("");
  const changes: string[] = [];
  const template = asElement(
    TextInput({
      value,
      onChange(nextValue) {
        changes.push(nextValue);
        value.set(nextValue);
      }
    })
  );
  const onKey = readOnKeyHandler(template);
  const { before, cursor } = readParts(template);

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.equal(callOnKey(onKey, key("a")), true);
  assert.deepEqual(changes, ["a"]);
  assert.equal(resolveSignal<string>(before.props.value), "a");
  assert.equal(resolveSignal<string>(cursor.props.value), " ");

  assert.equal(callOnKey(onKey, key("b")), true);
  assert.deepEqual(changes, ["a", "ab"]);
  assert.equal(resolveSignal<string>(before.props.value), "ab");
});

test("TextInput does not change visible value unless parent updates controlled signal", () => {
  const value = createSignal("");
  const changes: string[] = [];
  const template = asElement(
    TextInput({
      value,
      onChange(nextValue) {
        changes.push(nextValue);
      }
    })
  );
  const onKey = readOnKeyHandler(template);
  const { before } = readParts(template);

  assert.equal(callOnKey(onKey, key("a")), true);

  assert.deepEqual(changes, ["a"]);
  assert.equal(resolveSignal<string>(before.props.value), "");
});

test("TextInput supports cursor movement middle insertions and deletion", () => {
  const value = createSignal("ab");
  const changes: string[] = [];
  const template = asElement(
    TextInput({
      value,
      onChange(nextValue) {
        changes.push(nextValue);
        value.set(nextValue);
      }
    })
  );
  const onKey = readOnKeyHandler(template);
  const { before, cursor, after } = readParts(template);

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.equal(callOnKey(onKey, key("", { name: "end" })), true);
  assert.equal(callOnKey(onKey, key("", { name: "left" })), true);
  assert.equal(resolveSignal<string>(before.props.value), "a");
  assert.equal(resolveSignal<string>(cursor.props.value), "b");
  assert.equal(resolveSignal<string>(after.props.value), "");

  assert.equal(callOnKey(onKey, key("X")), true);
  assert.equal(value.get(), "aXb");
  assert.equal(resolveSignal<string>(before.props.value), "aX");
  assert.equal(resolveSignal<string>(cursor.props.value), "b");

  assert.equal(callOnKey(onKey, key("", { name: "backspace" })), true);
  assert.equal(value.get(), "ab");

  assert.equal(callOnKey(onKey, key("", { name: "delete" })), true);
  assert.equal(value.get(), "a");

  assert.deepEqual(changes, ["aXb", "ab", "a"]);
});

test("TextInput handles home end right and edge deletion keys", () => {
  const value = createSignal("ab");
  const changes: string[] = [];
  const template = asElement(
    TextInput({
      value,
      onChange(nextValue) {
        changes.push(nextValue);
        value.set(nextValue);
      }
    })
  );
  const onKey = readOnKeyHandler(template);
  const { before, cursor } = readParts(template);

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.equal(callOnKey(onKey, key("", { name: "home" })), true);
  assert.equal(callOnKey(onKey, key("", { name: "backspace" })), true);
  assert.deepEqual(changes, []);
  assert.equal(callOnKey(onKey, key("", { name: "right" })), true);
  assert.equal(resolveSignal<string>(before.props.value), "a");
  assert.equal(resolveSignal<string>(cursor.props.value), "b");
  assert.equal(callOnKey(onKey, key("", { name: "end" })), true);
  assert.equal(callOnKey(onKey, key("", { name: "delete" })), true);
  assert.deepEqual(changes, []);
});

test("TextInput submits current value and leaves unrelated keys unhandled", () => {
  const value = createSignal("send");
  const submitted: string[] = [];
  const template = asElement(
    TextInput({
      value,
      onSubmit(nextValue) {
        submitted.push(nextValue);
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  assert.equal(callOnKey(onKey, key("\r", { name: "return" })), true);
  assert.equal(callOnKey(onKey, key("", { name: "escape" })), false);
  assert.deepEqual(submitted, ["send"]);
});

test("TextInput disabled maps onKey to false and hides cursor", () => {
  const template = asElement(
    TextInput({
      value: "Disabled",
      disabled: true
    })
  );
  const { before, cursor, after } = readParts(template);

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.equal(template.props.onKey, false);
  assert.equal(resolveSignal<boolean>(before.props.dim), true);
  assert.equal(resolveSignal<boolean>(cursor.props.dim), true);
  assert.equal(resolveSignal<boolean>(after.props.dim), true);
  assert.equal(resolveSignal<string>(cursor.props.value), "");
});

test("TextInput supports dynamic disabled values", () => {
  const disabled = createSignal(false);
  const template = asElement(
    TextInput({
      value: "Dynamic",
      disabled
    })
  );

  assert.equal(typeof resolveSignal<InteractionKeyBinding>(template.props.onKey), "function");

  disabled.set(true);

  assert.equal(resolveSignal<InteractionKeyBinding>(template.props.onKey), false);
});

test("TextInput clamps cursor when controlled value shrinks externally", () => {
  const value = createSignal("abcd");
  const template = asElement(
    TextInput({
      value
    })
  );
  const onKey = readOnKeyHandler(template);
  const { before, cursor } = readParts(template);

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.equal(callOnKey(onKey, key("", { name: "end" })), true);

  value.set("a");

  assert.equal(resolveSignal<string>(before.props.value), "a");
  assert.equal(resolveSignal<string>(cursor.props.value), " ");
});

test("TextInput forwards style props to the correct intrinsic elements", () => {
  const template = asElement(
    TextInput({
      value: "Styled",
      color: "green",
      background: "blue",
      borderColor: "cyan",
      bold: true,
      dim: true,
      padding: 2,
      border: 1
    })
  );
  const { before, cursor, after } = readParts(template);

  assert.equal(template.props.background, "blue");
  assert.equal(template.props.borderColor, "cyan");
  assert.equal(template.props.padding, 2);
  assert.equal(template.props.border, 1);
  assert.equal(before.props.color, "green");
  assert.equal(before.props.bold, true);
  assert.equal(before.props.dim, true);
  assert.equal(resolveSignal<string>(cursor.props.color), "blue");
  assert.equal(resolveSignal<string>(cursor.props.background), "green");
  assert.equal(cursor.props.bold, true);
  assert.equal(cursor.props.dim, true);
  assert.equal(after.props.color, "green");
  assert.equal(after.props.bold, true);
  assert.equal(after.props.dim, true);
});

test("TextInput inserts and deletes CJK characters as whole code units", () => {
  const value = createSignal("");
  const changes: string[] = [];
  const template = asElement(
    TextInput({
      value,
      onChange(nextValue) {
        changes.push(nextValue);
        value.set(nextValue);
      }
    })
  );
  const onKey = readOnKeyHandler(template);
  const { before, cursor, after } = readParts(template);

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.equal(callOnKey(onKey, key("中")), true);
  assert.deepEqual(changes, ["中"]);
  assert.equal(resolveSignal<string>(before.props.value), "中");
  assert.equal(resolveSignal<string>(cursor.props.value), " ");
  assert.equal(resolveSignal<string>(after.props.value), "");

  assert.equal(callOnKey(onKey, key("A")), true);
  assert.equal(value.get(), "中A");
  assert.equal(resolveSignal<string>(before.props.value), "中A");
  assert.equal(resolveSignal<string>(cursor.props.value), " ");

  assert.equal(callOnKey(onKey, key("", { name: "left" })), true);
  assert.equal(resolveSignal<string>(before.props.value), "中");
  assert.equal(resolveSignal<string>(cursor.props.value), "A");
  assert.equal(resolveSignal<string>(after.props.value), "");

  assert.equal(callOnKey(onKey, key("", { name: "backspace" })), true);
  assert.equal(value.get(), "A");
  assert.deepEqual(changes, ["中", "中A", "A"]);
});

test("TextInput inserts emoji input as a single controlled value", () => {
  const value = createSignal("A");
  const changes: string[] = [];
  const template = asElement(
    TextInput({
      value,
      onChange(nextValue) {
        changes.push(nextValue);
        value.set(nextValue);
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.equal(callOnKey(onKey, key("", { name: "end" })), true);
  assert.equal(callOnKey(onKey, key("🙂")), true);
  assert.deepEqual(changes, ["A🙂"]);
  assert.equal(value.get(), "A🙂");
});

test("TextInput moves the cursor by JavaScript string index around emoji", () => {
  const value = createSignal("A🙂B");
  const template = asElement(
    TextInput({
      value
    })
  );
  const onKey = readOnKeyHandler(template);
  const { before, cursor, after } = readParts(template);

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.equal(callOnKey(onKey, key("", { name: "end" })), true);
  assert.equal(resolveSignal<string>(before.props.value), "A🙂B");
  assert.equal(resolveSignal<string>(cursor.props.value), " ");
  assert.equal(resolveSignal<string>(after.props.value), "");

  assert.equal(callOnKey(onKey, key("", { name: "left" })), true);
  assert.equal(resolveSignal<string>(before.props.value), "A🙂");
  assert.equal(resolveSignal<string>(cursor.props.value), "B");
  assert.equal(resolveSignal<string>(after.props.value), "");

  assert.equal(callOnKey(onKey, key("", { name: "left" })), true);
  assert.equal(resolveSignal<string>(before.props.value), "A\uD83D");
  assert.equal(resolveSignal<string>(cursor.props.value), value.get()[2] ?? "");
  assert.equal(resolveSignal<string>(after.props.value), "B");
});

test("TextInput backspace removes one JavaScript code unit from emoji input", () => {
  const value = createSignal("A🙂");
  const changes: string[] = [];
  const template = asElement(
    TextInput({
      value,
      onChange(nextValue) {
        changes.push(nextValue);
        value.set(nextValue);
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.equal(callOnKey(onKey, key("", { name: "end" })), true);
  assert.equal(callOnKey(onKey, key("", { name: "backspace" })), true);
  assert.equal(value.get(), "A\uD83D");
  assert.deepEqual(changes, ["A\uD83D"]);

  assert.equal(callOnKey(onKey, key("", { name: "backspace" })), true);
  assert.equal(value.get(), "A");
  assert.deepEqual(changes, ["A\uD83D", "A"]);
});
