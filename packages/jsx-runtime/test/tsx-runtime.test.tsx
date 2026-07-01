import assert from "node:assert/strict";
import test from "node:test";

import {
  CustomButton,
  Header,
  appView,
  customButtonView,
  interactionView,
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

test("compiled TSX preserves shared style and interaction props", () => {
  const root = interactionView as {
    kind: "element";
    tag: string;
    props: Record<string, unknown>;
    children: unknown[];
  };

  assert.equal(root.kind, "element");
  assert.equal(root.tag, "box");
  assert.equal(root.props.id, "panel");
  assert.equal(root.props.onKey, true);
  assert.equal(typeof root.props.onFocusChange, "function");
  assert.equal(root.props.border, true);
  assert.equal(root.props.padding, 1);
  assert.equal(root.props.background, "blue");
  assert.equal(root.children.length, 1);
});

test("compiled TSX keeps custom component props on the component boundary", () => {
  const component = customButtonView as {
    kind: "component";
    component: unknown;
    props: Record<string, unknown>;
  };

  assert.equal(component.kind, "component");
  assert.equal(component.component, CustomButton);
  assert.equal(component.props.id, "submit");
  assert.equal(component.props.label, "Submit");
  assert.equal(component.props.disabled, false);
  assert.equal(typeof component.props.onPress, "function");
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
