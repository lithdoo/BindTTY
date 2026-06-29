import assert from "node:assert/strict";
import test from "node:test";

import {
  Header,
  appView,
  loading,
  textView,
  title
} from "./tsx-runtime-fixture.js";

test("compiled TSX creates Template values through the automatic runtime", () => {
  assert.deepEqual(textView, {
    kind: "element",
    tag: "text",
    props: {
      value: title,
      color: "green"
    },
    children: []
  });

  assert.equal((textView as { props: Record<string, unknown> }).props.value, title);
});

test("compiled TSX preserves components and control nodes", () => {
  const root = appView as {
    kind: "element";
    tag: string;
    props: Record<string, unknown>;
    children: unknown[];
  };

  assert.equal(root.kind, "element");
  assert.equal(root.tag, "vstack");
  assert.deepEqual(root.props, {});
  assert.equal(root.children.length, 2);

  const component = root.children[0] as {
    kind: "component";
    component: unknown;
    props: Record<string, unknown>;
  };
  assert.equal(component.kind, "component");
  assert.equal(component.component, Header);
  assert.deepEqual(component.props, {
    title
  });

  const show = root.children[1] as {
    kind: "show";
    when: unknown;
    children: unknown;
    fallback: unknown;
  };
  assert.equal(show.kind, "show");
  assert.equal(show.when, loading);
  assert.deepEqual(show.children, {
    kind: "element",
    tag: "text",
    props: {
      value: "Loading..."
    },
    children: []
  });
  assert.deepEqual(show.fallback, {
    kind: "element",
    tag: "text",
    props: {
      value: "Ready"
    },
    children: []
  });
});
