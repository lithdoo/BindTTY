import assert from "node:assert/strict";
import test from "node:test";

import { createSignal } from "@bindtty/signal";
import {
  Textarea,
  type TextareaProps,
  type TextareaStyleProps
} from "@bindtty/widgets";
import type {
  BindTTYKeyEvent,
  InteractionKeyBinding,
  InteractionKeyHandler,
  InteractionNodeFocusChangeEvent
} from "@bindtty/interaction";
import type {
  ElementTemplate,
  ReadableSignal,
  Template
} from "@bindtty/vnode";

type TextareaRenderLine =
  | {
      key: string;
      kind: "text";
      text: string;
    }
  | {
      key: string;
      kind: "cursor";
      before: string;
      cursor: string;
      after: string;
    };

function asElement(template: Template): ElementTemplate {
  assert.equal(template.kind, "element");
  return template;
}

function childElement(template: ElementTemplate, index: number): ElementTemplate {
  return asElement(template.children[index]!);
}

function resolveSignal<T>(value: unknown): T {
  if (typeof value === "object" && value !== null && "get" in value) {
    return (value as ReadableSignal<T>).get();
  }
  return value as T;
}

function readOnKeyHandler(template: ElementTemplate): InteractionKeyHandler {
  const onKey = template.props.onKey as InteractionKeyBinding;

  assert.equal(typeof onKey, "function");
  return onKey as InteractionKeyHandler;
}

function key(
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

function focusEvent(focused: boolean): InteractionNodeFocusChangeEvent {
  return {
    id: "textarea",
    focused,
    reason: "programmatic"
  };
}

function callOnKey(
  handler: InteractionKeyHandler,
  event: BindTTYKeyEvent
): boolean | void {
  return handler(event);
}

function readRenderLines(template: ElementTemplate): readonly TextareaRenderLine[] {
  const viewport = childElement(template, 0);
  const lines: TextareaRenderLine[] = [];

  for (let index = 0; index < viewport.children.length; index += 1) {
    const row = asElement(viewport.children[index]!);
    const before = resolveSignal<string>(childElement(row, 0).props.value);
    const cursor = resolveSignal<string>(childElement(row, 1).props.value);
    const after = resolveSignal<string>(childElement(row, 2).props.value);

    if (before === "" && cursor === "" && after === "") {
      continue;
    }

    if (cursor === "") {
      lines.push({
        key: `line:${index}`,
        kind: "text",
        text: before + after
      });
      continue;
    }

    lines.push({
      key: `line:${index}`,
      kind: "cursor",
      before,
      cursor,
      after
    });
  }

  return lines;
}

test("Textarea renders as a borderless focusable box that fills horizontal space by default", () => {
  const focusChanges: boolean[] = [];
  const template = asElement(
    Textarea({
      id: "notes",
      value: "",
      placeholder: "Write notes",
      onFocusChange(event) {
        focusChanges.push(event.focused);
      }
    })
  );
  const viewport = childElement(template, 0);

  assert.equal(template.tag, "box");
  assert.equal(template.props.id, "notes");
  assert.equal(template.props.focusStyle, "none");
  assert.equal(template.props.overflow, "clip");
  assert.equal(template.props.border, undefined);
  assert.equal(template.props.padding, undefined);
  assert.equal(template.props.flexGrow, 1);
  assert.equal(viewport.tag, "vstack");
  assert.deepEqual(readRenderLines(template), [
    {
      key: "line:0",
      kind: "text",
      text: "Write notes"
    }
  ]);

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.deepEqual(focusChanges, [true]);
  assert.deepEqual(readRenderLines(template), [
    {
      key: "line:0",
      kind: "cursor",
      before: "",
      cursor: " ",
      after: ""
    }
  ]);
});

test("Textarea exposes the planned props types", () => {
  const style: TextareaStyleProps = {
    color: "green",
    background: "blue",
    bold: true,
    dim: false
  };
  const props: TextareaProps = {
    ...style,
    id: "typed",
    value: "Typed",
    placeholder: "Body",
    disabled: false,
    minRows: 1,
    maxRows: 4,
    width: 20,
    height: 2,
    wrap: "soft",
    submitKeys: ["ctrl-enter"],
    onChange() {},
    onSubmit() {},
    onViewportRowsChange() {}
  };

  assert.equal(asElement(Textarea(props)).props.id, "typed");
});

test("Textarea edits controlled multiline value and submits with Ctrl Enter", () => {
  const value = createSignal("");
  const changes: string[] = [];
  const submits: string[] = [];
  const template = asElement(
    Textarea({
      value,
      onChange(nextValue) {
        changes.push(nextValue);
        value.set(nextValue);
      },
      onSubmit(nextValue) {
        submits.push(nextValue);
      }
    })
  );
  const onKey = readOnKeyHandler(template);

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.equal(callOnKey(onKey, key("h")), true);
  assert.equal(callOnKey(onKey, key("\r", { name: "return" })), true);
  assert.equal(callOnKey(onKey, key("i")), true);
  assert.equal(value.get(), "h\ni");
  assert.deepEqual(changes, ["h", "h\n", "h\ni"]);
  assert.deepEqual(readRenderLines(template), [
    {
      key: "line:0",
      kind: "text",
      text: "h"
    },
    {
      key: "line:1",
      kind: "cursor",
      before: "i",
      cursor: " ",
      after: ""
    }
  ]);

  assert.equal(callOnKey(onKey, key("\r", { name: "return", ctrl: true })), true);
  assert.deepEqual(submits, ["h\ni"]);
  assert.equal(value.get(), "h\ni");
});

test("Textarea moves the cursor by grapheme around wide characters", () => {
  const value = createSignal("A🙂B");
  const template = asElement(
    Textarea({
      value
    })
  );
  const onKey = readOnKeyHandler(template);

  (template.props.onFocusChange as (event: InteractionNodeFocusChangeEvent) => void)(
    focusEvent(true)
  );

  assert.equal(callOnKey(onKey, key("", { name: "left" })), true);
  assert.deepEqual(readRenderLines(template), [
    {
      key: "line:0",
      kind: "cursor",
      before: "A🙂",
      cursor: "B",
      after: ""
    }
  ]);

  assert.equal(callOnKey(onKey, key("", { name: "left" })), true);
  assert.deepEqual(readRenderLines(template), [
    {
      key: "line:0",
      kind: "cursor",
      before: "A",
      cursor: "🙂",
      after: "B"
    }
  ]);
});

test("Textarea disabled state keeps navigation scrollable but blocks edits", () => {
  const value = createSignal("one\ntwo\nthree");
  const changes: string[] = [];
  const template = asElement(
    Textarea({
      value,
      disabled: true,
      height: 1,
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

  assert.deepEqual(readRenderLines(template), [
    {
      key: "line:0",
      kind: "text",
      text: "one"
    }
  ]);

  assert.equal(callOnKey(onKey, key("", { name: "down" })), true);
  assert.deepEqual(readRenderLines(template), [
    {
      key: "line:0",
      kind: "text",
      text: "two"
    }
  ]);

  assert.equal(callOnKey(onKey, key("X")), false);
  assert.deepEqual(changes, []);
  assert.equal(value.get(), "one\ntwo\nthree");
});
