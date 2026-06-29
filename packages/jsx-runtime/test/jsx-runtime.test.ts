import assert from "node:assert/strict";
import test from "node:test";

import type { ReadableSignal, Template } from "@bindtty/vnode";
import { jsxDEV } from "@bindtty/jsx-runtime/jsx-dev-runtime";
import { Fragment, jsx, jsxs } from "@bindtty/jsx-runtime/jsx-runtime";

function signal<T>(value: T): ReadableSignal<T> {
  return {
    get() {
      return value;
    },
    subscribe() {
      return () => {};
    }
  };
}

test("creates intrinsic element templates", () => {
  const title = signal("Hello");
  const view = jsx("text", { value: title, color: "green" });

  assert.deepEqual(view, {
    kind: "element",
    tag: "text",
    props: {
      value: title,
      color: "green"
    },
    children: []
  });

  assert.equal((view as { props: Record<string, unknown> }).props.value, title);
});

test("creates container templates with normalized children", () => {
  const child = jsx("text", { value: "Hello" });
  const view = jsxs("box", {
    border: true,
    children: [null, child, false]
  });

  assert.deepEqual(view, {
    kind: "element",
    tag: "box",
    props: {
      border: true
    },
    children: [child]
  });
});

test("creates fragment templates", () => {
  const first = jsx("text", { value: "A" });
  const second = jsx("text", { value: "B" });
  const view = jsxs(Fragment, {
    children: [first, second]
  });

  assert.deepEqual(view, {
    kind: "fragment",
    children: [first, second]
  });
});

test("creates component templates without executing component", () => {
  let executed = false;
  function Header(): Template {
    executed = true;
    return jsx("text", { value: "Header" });
  }

  const child = jsx("text", { value: "Child" });
  const view = jsx(Header, { title: "Title", children: child });

  assert.equal(executed, false);
  assert.equal(view.kind, "component");
  assert.equal((view as { component: unknown }).component, Header);
  assert.deepEqual((view as { props: Record<string, unknown> }).props, {
    title: "Title",
    children: child
  });
});

test("creates show templates", () => {
  const loading = signal(true);
  const fallback = jsx("text", { value: "Ready" });
  const body = jsx("text", { value: "Loading..." });
  const view = jsx("show", {
    when: loading,
    fallback,
    children: body
  });

  assert.deepEqual(view, {
    kind: "show",
    when: loading,
    children: body,
    fallback
  });
});

test("creates for templates with render functions", () => {
  const items = signal([{ id: 1, title: "One" }]);
  const renderItem = (item: { title: string }) => jsx("text", { value: item.title });
  const view = jsx("for", {
    each: items,
    key: (item: { id: number }) => item.id,
    children: renderItem
  });
  const forView = view as {
    kind: "for";
    each: typeof items;
    key: (item: { id: number; title: string }, index: number) => string | number;
    renderItem: (item: { id: number; title: string }, index: number) => Template;
  };

  assert.equal(forView.kind, "for");
  assert.equal(forView.each, items);
  assert.equal(forView.key(items.get()[0]!, 0), 1);
  assert.deepEqual(forView.renderItem(items.get()[0]!, 0), {
    kind: "element",
    tag: "text",
    props: {
      value: "One"
    },
    children: []
  });
});

test("rejects invalid JSX shapes", () => {
  assert.throws(() => jsx("unknown", {}), /Unknown intrinsic element/);
  assert.throws(() => jsx("show", {}), /requires prop "when"/);
  assert.throws(() => jsx("for", { each: [] }), /render function/);
  assert.throws(() => jsxs("box", { children: "plain text" }), /Template children/);
  assert.throws(
    () => jsx("text", { value: "Hello", children: jsx("spacer", {}) }),
    /does not accept children/
  );
});

test("jsxDEV reuses jsx behavior", () => {
  assert.deepEqual(jsxDEV("text", { value: "Dev" }), {
    kind: "element",
    tag: "text",
    props: {
      value: "Dev"
    },
    children: []
  });
});
