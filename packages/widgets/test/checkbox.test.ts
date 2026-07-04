import assert from "node:assert/strict";
import test from "node:test";

import { createSignal } from "@bindtty/signal";
import {
  Checkbox,
  type CheckboxProps,
  type CheckboxStyleProps
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
    input: name === "return" ? "\r" : "",
    name,
    ctrl: false,
    meta: false,
    shift: false
  };
}

function spaceKey(): Parameters<InteractionKeyHandler>[0] {
  return {
    input: " ",
    ctrl: false,
    meta: false,
    shift: false
  };
}

const focusContext = {
  node: {} as never,
  isFocused: true as const
};

test("Checkbox renders as a focusable box with hstack marker and label", () => {
  const template = asElement(
    Checkbox({
      label: "Agree",
      checked: false
    })
  );
  const row = asElement(template.children[0]!);
  const marker = asElement(row.children[0]!);
  const label = asElement(row.children[1]!);

  assert.equal(template.tag, "box");
  assert.equal(template.props.border, false);
  assert.equal(template.props.padding, 0);
  assert.equal(typeof template.props.onKey, "function");
  assert.equal(row.tag, "hstack");
  assert.equal(row.props.gap, 1);
  assert.equal(marker.tag, "text");
  assert.equal(marker.props.value, "[ ]");
  assert.equal(label.tag, "text");
  assert.equal(label.props.value, "Agree");
});

test("Checkbox exposes the planned props types", () => {
  const style: CheckboxStyleProps = {
    color: "green",
    background: "blue",
    bold: true,
    dim: false,
    padding: 1
  };
  const props: CheckboxProps = {
    ...style,
    id: "agree",
    label: "Typed",
    checked: true,
    disabled: false,
    onChange() {}
  };

  assert.equal(asElement(Checkbox(props)).props.id, "agree");
});

test("Checkbox marker reflects checked state", () => {
  const unchecked = asElement(
    Checkbox({
      label: "A",
      checked: false
    })
  );
  const checked = asElement(
    Checkbox({
      label: "B",
      checked: true
    })
  );
  const uncheckedMarker = asElement(asElement(unchecked.children[0]!).children[0]!);
  const checkedMarker = asElement(asElement(checked.children[0]!).children[0]!);

  assert.equal(uncheckedMarker.props.value, "[ ]");
  assert.equal(checkedMarker.props.value, "[x]");
});

test("Checkbox toggles on Space and Enter", () => {
  const changes: boolean[] = [];
  const template = asElement(
    Checkbox({
      label: "Toggle",
      checked: false,
      onChange(nextChecked) {
        changes.push(nextChecked);
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  assert.equal(onKey(spaceKey(), focusContext), true);
  assert.equal(onKey(key("return"), focusContext), true);
  assert.deepEqual(changes, [true, true]);
});

test("Checkbox leaves unrelated keys unhandled", () => {
  let changes = 0;
  const template = asElement(
    Checkbox({
      label: "Toggle",
      checked: false,
      onChange() {
        changes += 1;
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  assert.equal(onKey(key("down"), focusContext), false);
  assert.equal(changes, 0);
});

test("Checkbox disabled maps onKey to false and dims the label", () => {
  const template = asElement(
    Checkbox({
      label: "Disabled",
      checked: false,
      disabled: true
    })
  );
  const label = asElement(asElement(template.children[0]!).children[1]!);

  assert.equal(template.props.onKey, false);
  assert.equal(label.props.dim, true);
});

test("Checkbox supports dynamic disabled values", () => {
  const disabled = createSignal(false);
  const template = asElement(
    Checkbox({
      label: "Dynamic",
      checked: false,
      disabled
    })
  );
  const label = asElement(asElement(template.children[0]!).children[1]!);

  assert.equal(typeof resolveSignal<InteractionKeyBinding>(template.props.onKey), "function");
  assert.equal(resolveSignal<boolean>(label.props.dim), false);

  disabled.set(true);

  assert.equal(resolveSignal<InteractionKeyBinding>(template.props.onKey), false);
  assert.equal(resolveSignal<boolean>(label.props.dim), true);
});

test("Checkbox marker updates when checked is a signal", () => {
  const checked = createSignal(false);
  const template = asElement(
    Checkbox({
      label: "Signal",
      checked
    })
  );
  const marker = asElement(asElement(template.children[0]!).children[0]!);

  assert.equal(resolveSignal<string>(marker.props.value), "[ ]");

  checked.set(true);

  assert.equal(resolveSignal<string>(marker.props.value), "[x]");
});
