import assert from "node:assert/strict";
import test from "node:test";

import { createSignal } from "@bindtty/signal";
import {
  Button,
  type ButtonProps,
  type ButtonStyleProps
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
