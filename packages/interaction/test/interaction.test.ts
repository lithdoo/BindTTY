import assert from "node:assert/strict";
import test from "node:test";

import {
  createInteractionController,
  isArrowKey,
  isEnterKey,
  isEscapeKey,
  isShiftTabKey,
  isTabKey,
  isTextInputKey
} from "@bindtty/interaction";
import type {
  BindTTYKeyEvent,
  InteractionController,
  InteractionFocusChangeEvent,
  InteractionKeyHandler,
  InteractionNodeFocusChangeEvent,
  InteractionResult
} from "@bindtty/interaction";
import type { TerminalKeyEvent } from "@bindtty/terminal";
import type {
  MountedElementNode,
  MountedFragmentNode,
  MountedForNode,
  MountedNode,
  MountedShowNode
} from "@bindtty/vnode";

function createMountedElement(
  id = "box",
  props: Record<string, unknown> = {},
  children: MountedNode[] = []
): MountedElementNode {
  return {
    kind: "element",
    tag: "box",
    props: id === "" ? props : { id, ...props },
    propSources: id === "" ? props : { id, ...props },
    bindings: {},
    children,
    state: {},
    dirty: null,
    dispose() {}
  };
}

function createMountedBox(id = "box"): MountedElementNode {
  return createMountedElement(id);
}

function fragment(children: MountedNode[]): MountedFragmentNode {
  return {
    kind: "fragment",
    children,
    dirty: null,
    dispose() {}
  };
}

function show(activeBranch: MountedNode | null): MountedShowNode {
  return {
    kind: "show",
    when: true,
    activeTemplate: null,
    activeBranch,
    dirty: null,
    dispose() {}
  };
}

function forNode(nodes: MountedNode[]): MountedForNode {
  return {
    kind: "for",
    each: [],
    items: nodes.map((node, index) => ({
      key: index,
      item: index,
      node
    })),
    dirty: null,
    dispose() {}
  };
}

function createKeyEvent(input = "x"): TerminalKeyEvent {
  return {
    input,
    ctrl: false,
    meta: false,
    shift: false
  };
}

function createNamedKeyEvent(
  name: string,
  overrides: Partial<TerminalKeyEvent> = {}
): TerminalKeyEvent {
  return {
    input: "",
    name,
    ctrl: false,
    meta: false,
    shift: false,
    ...overrides
  };
}

function reasons(
  events: InteractionFocusChangeEvent[]
): InteractionFocusChangeEvent["reason"][] {
  return events.map((event) => event.reason);
}

test("exports expected interaction types", () => {
  const controller: InteractionController = createInteractionController();
  const focusEvent: InteractionFocusChangeEvent = {
    previous: null,
    current: {
      id: "box"
    },
    reason: "initial"
  };
  const nodeFocusEvent: InteractionNodeFocusChangeEvent = {
    id: "box",
    focused: true,
    reason: "initial"
  };
  const handler: InteractionKeyHandler = (event) => {
    assert.equal(event.input, "x");
    assert.equal(event.phase, "target");
    return true;
  };
  const result: InteractionResult = {
    handled: false,
    dirtyNodes: [],
    focusChange: focusEvent
  };

  assert.equal(typeof controller.refresh, "function");
  assert.equal(nodeFocusEvent.focused, true);
  assert.equal(result.focusChange?.reason, "initial");
  assert.equal(typeof handler, "function");
});

test("refresh collects onKey=true and chooses initial focus", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { onKey: true });
  const second = createMountedElement("second", { onKey: true });
  const events: InteractionFocusChangeEvent[] = [];

  controller.onFocusChange((event) => events.push(event));
  const result = controller.refresh(fragment([first, second]));

  assert.equal(controller.getFocusedId(), "first");
  assert.equal(controller.getFocusedNode(), first);
  assert.equal(controller.isFocused(first), true);
  assert.equal(controller.isFocused(second), false);
  assert.deepEqual(result, {
    handled: false,
    dirtyNodes: [first],
    focusChange: {
      previous: null,
      current: {
        id: "first"
      },
      reason: "initial"
    }
  });
  assert.deepEqual(reasons(events), ["initial"]);
});

test("refresh collects onKey=function and ignores false null and missing values", () => {
  const controller = createInteractionController();
  const handler: InteractionKeyHandler = () => true;
  const enabled = createMountedElement("enabled", { onKey: handler });
  const disabled = createMountedElement("disabled", { onKey: false });
  const nullish = createMountedElement("nullish", { onKey: null });
  const missing = createMountedElement("missing");

  controller.refresh(fragment([disabled, nullish, missing, enabled]));

  assert.equal(controller.getFocusedId(), "enabled");
});

test("focusable=true enters focus list", () => {
  const controller = createInteractionController();
  const node = createMountedElement("node", { focusable: true });

  controller.refresh(node);

  assert.equal(controller.getFocusedId(), "node");
});

test("focusable=false with onKey does not enter focus list", () => {
  const controller = createInteractionController();
  const node = createMountedElement("node", {
    focusable: false,
    onKey: () => true
  });

  controller.refresh(node);

  assert.equal(controller.getFocusedId(), null);
});

test("Tab traversal skips non-focusable nodes", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { focusable: true, onKey: true });
  const disabled = createMountedElement("disabled", {
    focusable: false,
    onKey: false
  });
  const third = createMountedElement("third", { focusable: true, onKey: true });

  controller.refresh(fragment([first, disabled, third]));
  assert.equal(controller.getFocusedId(), "first");

  controller.focusNext();
  assert.equal(controller.getFocusedId(), "third");

  controller.focusNext();
  assert.equal(controller.getFocusedId(), "first");
});

test("refresh moves focus when focusable becomes false", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { focusable: true, onKey: true });
  const disabled = createMountedElement("disabled", {
    focusable: true,
    onKey: () => true
  });

  controller.refresh(fragment([first, disabled]));
  controller.focus("disabled");

  disabled.props.focusable = false;
  disabled.props.onKey = false;

  const result = controller.refresh(fragment([first, disabled]));

  assert.equal(result.focusChange?.reason, "refresh");
  assert.equal(controller.getFocusedId(), "first");
});

test("legacy onKey=function still enters focus list without focusable", () => {
  const controller = createInteractionController();
  const node = createMountedElement("node", { onKey: () => true });

  controller.refresh(node);

  assert.equal(controller.getFocusedId(), "node");
});

test("nested onKey nodes follow preorder traversal", () => {
  const controller = createInteractionController();
  const childA = createMountedElement("child-a", { onKey: true });
  const childB = createMountedElement("child-b", { onKey: true });
  const parent = createMountedElement("parent", { onKey: true }, [childA, childB]);

  controller.refresh(parent);
  assert.equal(controller.getFocusedId(), "parent");

  controller.focusNext();
  assert.equal(controller.getFocusedId(), "child-a");

  controller.focusNext();
  assert.equal(controller.getFocusedId(), "child-b");
});

test("focus change dirty includes ancestor path nodes", () => {
  const controller = createInteractionController();
  const child = createMountedElement("child", { onKey: true });
  const parent = createMountedElement("parent", { onKey: true }, [child]);

  controller.refresh(parent);
  const result = controller.focus("child");

  assert.deepEqual(result.dirtyNodes, [parent, child]);
});

test("structure nodes are traversed through active children and for items", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { onKey: true });
  const hidden = createMountedElement("hidden", { onKey: true });
  const second = createMountedElement("second", { onKey: true });
  const third = createMountedElement("third", { onKey: true });

  controller.refresh(fragment([
    show(first),
    show(null),
    forNode([second, third]),
    hidden
  ]));

  assert.equal(controller.getFocusedId(), "first");
  controller.focusNext();
  assert.equal(controller.getFocusedId(), "second");
  controller.focusNext();
  assert.equal(controller.getFocusedId(), "third");
  controller.focusNext();
  assert.equal(controller.getFocusedId(), "hidden");
});

test("internal ids are stable across refreshes", () => {
  const controller = createInteractionController();
  const node = createMountedElement("", { onKey: true });

  controller.refresh(node);
  const firstId = controller.getFocusedId();

  controller.refresh(node);

  assert.match(firstId ?? "", /^bindtty-internal-focus-/);
  assert.equal(controller.getFocusedId(), firstId);
});

test("focusNext and focusPrevious move and wrap focus", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { onKey: true });
  const second = createMountedElement("second", { onKey: true });
  const third = createMountedElement("third", { onKey: true });

  controller.refresh(fragment([first, second, third]));

  assert.equal(controller.focusNext().focusChange?.reason, "next");
  assert.equal(controller.getFocusedId(), "second");

  controller.focusNext();
  assert.equal(controller.getFocusedId(), "third");

  controller.focusNext();
  assert.equal(controller.getFocusedId(), "first");

  assert.equal(controller.focusPrevious().focusChange?.reason, "previous");
  assert.equal(controller.getFocusedId(), "third");
});

test("focusNext handles empty and single-entry focus lists", () => {
  const controller = createInteractionController();
  const single = createMountedElement("single", { onKey: true });

  assert.deepEqual(controller.focusNext(), {
    handled: false,
    dirtyNodes: []
  });

  controller.refresh(single);

  assert.deepEqual(controller.focusNext(), {
    handled: true,
    dirtyNodes: []
  });
});

test("focus by id and node changes focused entry", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { onKey: true });
  const second = createMountedElement("second", { onKey: true });

  controller.refresh(fragment([first, second]));

  assert.equal(controller.focus("second").focusChange?.reason, "programmatic");
  assert.equal(controller.getFocusedNode(), second);

  assert.equal(controller.focus(first).focusChange?.reason, "programmatic");
  assert.equal(controller.getFocusedId(), "first");

  assert.deepEqual(controller.focus("missing"), {
    handled: false,
    dirtyNodes: []
  });
});

test("duplicate ids focus the first matching entry in tree order", () => {
  const controller = createInteractionController();
  const first = createMountedElement("same", { onKey: true });
  const second = createMountedElement("same", { onKey: true });

  controller.refresh(fragment([first, second]));
  controller.focusNext();
  assert.equal(controller.getFocusedNode(), second);

  controller.focus("same");
  assert.equal(controller.getFocusedNode(), first);
});

test("clearFocus clears current focus and traversal restarts from edges", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { onKey: true });
  const second = createMountedElement("second", { onKey: true });

  controller.refresh(fragment([first, second]));
  controller.focus("second");

  const result = controller.clearFocus();

  assert.equal(result.focusChange?.reason, "clear");
  assert.deepEqual(result.dirtyNodes, [second]);
  assert.equal(controller.getFocusedId(), null);

  controller.focusNext();
  assert.equal(controller.getFocusedId(), "first");

  controller.clearFocus();
  controller.focusPrevious();
  assert.equal(controller.getFocusedId(), "second");
});

test("refresh keeps still-focusable mounted node", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { onKey: true });
  const second = createMountedElement("second", { onKey: true });

  controller.refresh(fragment([first, second]));
  controller.focus("second");

  const result = controller.refresh(fragment([second, first]));

  assert.deepEqual(result, {
    handled: false,
    dirtyNodes: []
  });
  assert.equal(controller.getFocusedNode(), second);
  assert.equal(controller.getFocusedId(), "second");
});

test("refresh moves focus when focused node is removed", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { onKey: true });
  const second = createMountedElement("second", { onKey: true });
  const third = createMountedElement("third", { onKey: true });

  controller.refresh(fragment([first, second, third]));
  controller.focus("second");

  const result = controller.refresh(fragment([first, third]));

  assert.equal(result.focusChange?.reason, "refresh");
  assert.deepEqual(result.dirtyNodes, [second, third]);
  assert.equal(controller.getFocusedNode(), third);
});

test("refresh moves focus when onKey changes to false", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { onKey: true });
  const second = createMountedElement("second", { onKey: true });

  controller.refresh(fragment([first, second]));
  first.props.onKey = false;
  const result = controller.refresh(fragment([first, second]));

  assert.equal(result.focusChange?.reason, "refresh");
  assert.deepEqual(result.dirtyNodes, [first, second]);
  assert.equal(controller.getFocusedNode(), second);
});

test("refresh uses the latest dynamic onKey handler for focused nodes", () => {
  const controller = createInteractionController();
  const calls: string[] = [];
  const node = createMountedElement("node", {
    onKey: () => {
      calls.push("first");
      return true;
    }
  });

  controller.refresh(node);
  assert.equal(controller.handleKey(createKeyEvent("x")).handled, true);

  node.props.onKey = () => {
    calls.push("second");
    return true;
  };

  assert.equal(controller.handleKey(createKeyEvent("x")).handled, true);
  assert.deepEqual(calls, ["first", "second"]);
});

test("node and controller focus change listeners fire in order", () => {
  const controller = createInteractionController();
  const calls: string[] = [];
  const first = createMountedElement("first", {
    onKey: true,
    onFocusChange: (event: InteractionNodeFocusChangeEvent) => {
      calls.push(`first:${event.focused}:${event.reason}`);
    }
  });
  const second = createMountedElement("second", {
    onKey: true,
    onFocusChange: (event: InteractionNodeFocusChangeEvent) => {
      calls.push(`second:${event.focused}:${event.reason}`);
    }
  });

  controller.onFocusChange((event) => {
    calls.push(`controller:${event.reason}`);
  });

  controller.refresh(fragment([first, second]));
  controller.focusNext();

  assert.deepEqual(calls, [
    "first:true:initial",
    "controller:initial",
    "first:false:next",
    "second:true:next",
    "controller:next"
  ]);
});

test("onFocusChange alone does not make a node focusable", () => {
  const controller = createInteractionController();
  const node = createMountedElement("node", {
    onFocusChange: () => {}
  });

  controller.refresh(node);

  assert.equal(controller.getFocusedId(), null);
});

test("focus change subscriptions can unsubscribe and are cleared on dispose", () => {
  const controller = createInteractionController();
  let calls = 0;
  const unsubscribe = controller.onFocusChange(() => {
    calls += 1;
  });

  unsubscribe();
  controller.dispose();
  controller.dispose();

  assert.equal(calls, 0);
  assert.doesNotThrow(() => controller.onFocusChange(() => {})());
  assert.deepEqual(controller.refresh(createMountedElement("box", { onKey: true })), {
    handled: false,
    dirtyNodes: []
  });
});

test("keyboard helpers classify traversal and common key events", () => {
  assert.equal(isTabKey(createNamedKeyEvent("tab")), true);
  assert.equal(isTabKey(createKeyEvent("\t")), true);
  assert.equal(isShiftTabKey(createNamedKeyEvent("tab", { shift: true })), true);
  assert.equal(isShiftTabKey(createNamedKeyEvent("tab")), false);
  assert.equal(isEnterKey(createNamedKeyEvent("return")), true);
  assert.equal(isEnterKey(createKeyEvent("\r")), true);
  assert.equal(isEscapeKey(createNamedKeyEvent("escape")), true);
  assert.equal(isEscapeKey(createKeyEvent("\u001b")), true);
  assert.equal(isArrowKey(createNamedKeyEvent("left")), true);
  assert.equal(isArrowKey(createNamedKeyEvent("right")), true);
  assert.equal(isArrowKey(createNamedKeyEvent("up")), true);
  assert.equal(isArrowKey(createNamedKeyEvent("down")), true);
  assert.equal(isTextInputKey(createKeyEvent("a")), true);
  assert.equal(isTextInputKey(createNamedKeyEvent("left")), false);
});

test("handleKey uses Tab and Shift+Tab for focus traversal", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { onKey: true });
  const second = createMountedElement("second", { onKey: true });
  const third = createMountedElement("third", { onKey: true });

  controller.refresh(fragment([first, second, third]));

  const tabResult = controller.handleKey(createNamedKeyEvent("tab"));

  assert.equal(tabResult.handled, true);
  assert.equal(tabResult.focusChange?.reason, "next");
  assert.deepEqual(tabResult.dirtyNodes, [first, second]);
  assert.equal(controller.getFocusedId(), "second");

  const shiftTabResult = controller.handleKey(
    createNamedKeyEvent("tab", { shift: true })
  );

  assert.equal(shiftTabResult.handled, true);
  assert.equal(shiftTabResult.focusChange?.reason, "previous");
  assert.deepEqual(shiftTabResult.dirtyNodes, [second, first]);
  assert.equal(controller.getFocusedId(), "first");
});

test("handleKey handles empty and single-entry Tab traversal", () => {
  const controller = createInteractionController();
  const single = createMountedElement("single", { onKey: true });

  assert.deepEqual(controller.handleKey(createNamedKeyEvent("tab")), {
    handled: false,
    dirtyNodes: []
  });

  controller.refresh(single);

  assert.deepEqual(controller.handleKey(createNamedKeyEvent("tab")), {
    handled: true,
    dirtyNodes: []
  });
});

test("handleKey delivers Tab to onKey handlers before fallback", () => {
  const controller = createInteractionController();
  let calls = 0;
  const node = createMountedElement("node", {
    onKey: (event: BindTTYKeyEvent) => {
      if (event.name === "tab") {
        calls += 1;
        return true;
      }
    }
  });

  controller.refresh(node);

  assert.equal(controller.handleKey(createNamedKeyEvent("tab")).handled, true);
  assert.equal(calls, 1);
  assert.equal(controller.getFocusedId(), "node");
});

test("handleKey dispatches non-traversal keys to the focused handler", () => {
  const controller = createInteractionController();
  const calls: string[] = [];
  const first = createMountedElement("first", {
    onKey: (event: BindTTYKeyEvent) => {
      calls.push(`first:${event.input}`);
      return true;
    }
  });
  const second = createMountedElement("second", {
    onKey: (event: BindTTYKeyEvent) => {
      calls.push(`second:${event.input}`);
      return true;
    }
  });

  controller.refresh(fragment([first, second]));
  controller.focus("second");

  const result = controller.handleKey(createKeyEvent("x"));

  assert.deepEqual(result, {
    handled: true,
    dirtyNodes: []
  });
  assert.deepEqual(calls, ["second:x"]);
});

test("handleKey reflects handler return values", () => {
  const controller = createInteractionController();
  const truthy = createMountedElement("truthy", {
    onKey: () => true
  });
  const falsy = createMountedElement("falsy", {
    onKey: () => false
  });
  const implicit = createMountedElement("implicit", {
    onKey: () => {}
  });

  controller.refresh(fragment([truthy, falsy, implicit]));

  assert.equal(controller.handleKey(createKeyEvent("a")).handled, true);

  controller.focus("falsy");
  assert.equal(controller.handleKey(createKeyEvent("b")).handled, false);

  controller.focus("implicit");
  assert.equal(controller.handleKey(createKeyEvent("c")).handled, false);
});

test("handleKey with onKey=true is focusable but has no handler", () => {
  const controller = createInteractionController();
  const node = createMountedElement("node", { onKey: true });

  controller.refresh(node);

  assert.equal(controller.getFocusedId(), "node");
  assert.deepEqual(controller.handleKey(createKeyEvent("x")), {
    handled: false,
    dirtyNodes: []
  });
});

test("handleKey bubbles from focused child to parent", () => {
  const controller = createInteractionController();
  const calls: string[] = [];
  const child = createMountedElement("child", {
    onKey: () => {
      calls.push("child");
      return false;
    }
  });
  const parent = createMountedElement("parent", {
    onKey: () => {
      calls.push("parent");
      return true;
    }
  }, [child]);

  controller.refresh(parent);
  controller.focus("child");

  const result = controller.handleKey(createKeyEvent("x"));

  assert.equal(result.handled, true);
  assert.deepEqual(calls, ["child", "parent"]);
});

test("handleKey capture runs root to parent before target", () => {
  const controller = createInteractionController();
  const phases: string[] = [];
  const child = createMountedElement("child", {
    onKey: (event: BindTTYKeyEvent) => {
      phases.push(`child:${event.phase}`);
      return false;
    }
  });
  const parent = createMountedElement("parent", {
    onKeyCapture: (event: BindTTYKeyEvent) => {
      phases.push(`parent-capture:${event.phase}`);
      return false;
    },
    onKey: (event: BindTTYKeyEvent) => {
      phases.push(`parent-bubble:${event.phase}`);
      return false;
    }
  }, [child]);

  controller.refresh(parent);
  controller.focus("child");
  controller.handleKey(createKeyEvent("x"));

  assert.deepEqual(phases, [
    "parent-capture:capture",
    "child:target",
    "parent-bubble:bubble"
  ]);
});

test("handleKey onKeyCapture can intercept Escape before target", () => {
  const controller = createInteractionController();
  const calls: string[] = [];
  const child = createMountedElement("child", {
    onKey: () => {
      calls.push("child");
      return false;
    }
  });
  const parent = createMountedElement("parent", {
    focusable: false,
    onKeyCapture: (event: BindTTYKeyEvent) => {
      if (event.name === "escape") {
        calls.push("modal");
        return true;
      }
      return false;
    }
  }, [child]);

  controller.refresh(parent);
  controller.focus("child");
  controller.handleKey(createNamedKeyEvent("escape"));

  assert.deepEqual(calls, ["modal"]);
});

test("handleKey stopPropagation prevents bubble but not fallback", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { onKey: true });
  const second = createMountedElement("second", {
    onKey: (event: BindTTYKeyEvent) => {
      if (event.name === "tab") {
        event.stopPropagation();
      }
    }
  });

  controller.refresh(fragment([first, second]));
  controller.focus("second");

  const result = controller.handleKey(createNamedKeyEvent("tab"));

  assert.equal(result.handled, true);
  assert.equal(result.focusChange?.reason, "next");
  assert.equal(controller.getFocusedId(), "first");
});

test("handleKey return true stops propagation and prevents fallback", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { onKey: true });
  const second = createMountedElement("second", {
    onKey: () => true
  });

  controller.refresh(fragment([first, second]));
  controller.focus("second");

  const result = controller.handleKey(createKeyEvent("x"));

  assert.equal(result.handled, true);
  assert.equal(controller.getFocusedId(), "second");
});

test("handleKey bubbles Enter from child when child does not handle it", () => {
  const controller = createInteractionController();
  const calls: string[] = [];
  const child = createMountedElement("child", {
    onKey: (event: BindTTYKeyEvent) => {
      if (event.name === "return") {
        return false;
      }
      return false;
    }
  });
  const form = createMountedElement("form", {
    focusable: false,
    onKey: (event: BindTTYKeyEvent) => {
      if (event.name === "return") {
        calls.push("submit");
        return true;
      }
      return false;
    }
  }, [child]);

  controller.refresh(form);
  controller.focus("child");
  controller.handleKey(createNamedKeyEvent("return"));

  assert.deepEqual(calls, ["submit"]);
});

test("handleKey does not bubble when child handles Backspace", () => {
  const controller = createInteractionController();
  const calls: string[] = [];
  const child = createMountedElement("child", {
    onKey: (event: BindTTYKeyEvent) => {
      if (event.name === "backspace") {
        calls.push("child");
        return true;
      }
      return false;
    }
  });
  const form = createMountedElement("form", {
    focusable: false,
    onKey: () => {
      calls.push("form");
      return false;
    }
  }, [child]);

  controller.refresh(form);
  controller.focus("child");
  controller.handleKey(createNamedKeyEvent("backspace"));

  assert.deepEqual(calls, ["child"]);
});

test("handleKey bubbles unhandled arrow keys to scroll container", () => {
  const controller = createInteractionController();
  let offset = 0;
  const child = createMountedElement("input", {
    onKey: (event: BindTTYKeyEvent) => {
      if (event.name === "left" || event.name === "right") {
        return true;
      }
      return false;
    }
  });
  const scroll = createMountedElement("scroll", {
    focusable: false,
    onKey: (event: BindTTYKeyEvent) => {
      if (event.name === "down") {
        offset += 1;
        return true;
      }
      return false;
    }
  }, [child]);

  controller.refresh(scroll);
  controller.focus("input");
  controller.handleKey(createNamedKeyEvent("down"));

  assert.equal(offset, 1);
});

test("onKeyCapture can handle Tab and prevent focus traversal", () => {
  const controller = createInteractionController();
  const first = createMountedElement("first", { onKey: true });
  const second = createMountedElement("second", { onKey: true });
  const parent = createMountedElement("parent", {
    onKeyCapture: (event: BindTTYKeyEvent) => (event.name === "tab" ? true : false),
    onKey: true
  }, [first, second]);

  controller.refresh(parent);
  controller.focus("first");

  const result = controller.handleKey(createNamedKeyEvent("tab"));

  assert.equal(result.handled, true);
  assert.equal(controller.getFocusedId(), "first");
});
