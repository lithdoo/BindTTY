import assert from "node:assert/strict";
import test from "node:test";

import { createSignal } from "@bindtty/signal";
import {
  componentTemplate,
  elementTemplate,
  emptyTemplate,
  fragmentTemplate,
  showTemplate,
  forTemplate,
  type MountedElementApi,
  type Template
} from "@bindtty/vnode";
import {
  clearDirty,
  disposeMountedNode,
  markDirty,
  mountTemplate,
  notifyElementLayout
} from "@bindtty/runtime";
import type {
  RuntimeContext,
  RuntimeLifecycleError,
  RuntimeScheduler
} from "@bindtty/runtime";

function createTestRuntimeContext(
  errors: RuntimeLifecycleError[] = []
): RuntimeContext {
  const scheduler: RuntimeScheduler = {
    queueDirty() {},
    flushNow() {
      return null;
    },
    onFlush() {
      return () => {};
    },
    clear() {}
  };

  return {
    scheduler,
    onLifecycleError(error) {
      errors.push(error);
    }
  };
}

test("mounts empty templates to null", () => {
  assert.equal(mountTemplate(emptyTemplate()), null);
});

test("mounts elements with static props", () => {
  const mounted = mountTemplate(elementTemplate("text", { value: "Hello", color: "green" }));

  assert.equal(mounted?.kind, "element");
  assert.deepEqual(mounted?.props, {
    value: "Hello",
    color: "green"
  });
  assert.deepEqual(mounted?.propSources, {
    value: "Hello",
    color: "green"
  });
  assert.deepEqual(mounted?.bindings, {});
  assert.equal(mounted?.dirty, null);
});

test("mounts elements with signal props and updates dirty state", () => {
  const title = createSignal("A");
  const mounted = mountTemplate(elementTemplate("text", { value: title }));

  assert.equal(mounted?.kind, "element");
  assert.equal(mounted.props.value, "A");
  assert.equal(mounted.bindings.value.value, "A");
  assert.equal(mounted.dirty, null);

  title.set("B");

  assert.equal(mounted.props.value, "B");
  assert.equal(mounted.bindings.value.value, "B");
  assert.equal(mounted.dirty, "layout");
});

test("element ref receives a stable api without entering ordinary props", () => {
  let api: MountedElementApi | undefined;
  const mounted = mountTemplate(
    elementTemplate("box", {
      id: "panel",
      ref(nextApi: MountedElementApi) {
        api = nextApi;
      }
    })
  );

  assert.equal(mounted?.kind, "element");
  assert.ok(api);
  const mountedApi = api;
  assert.equal(mountedApi.tag, "box");
  assert.equal(mountedApi.id, "panel");
  assert.equal(mountedApi.getProp("id"), "panel");
  assert.equal(mountedApi.focus(), undefined);
  assert.equal(mountedApi.isFocused(), false);
  assert.equal(mounted.api, mountedApi);
  assert.deepEqual(mounted.props, {
    id: "panel"
  });
  assert.deepEqual(mounted.propSources, {
    id: "panel"
  });
  assert.equal("ref" in mounted.props, false);
  assert.equal("ref" in mounted.propSources, false);
  assert.equal("ref" in mounted.bindings, false);
});

test("element api forwards focus actions from runtime context", () => {
  let api: MountedElementApi | undefined;
  let focusedNode: unknown;
  let isFocusedNode: unknown;
  const context = createTestRuntimeContext();
  context.elementActions = {
    focus(node) {
      focusedNode = node;
      return { handled: true, dirtyNodes: [node] };
    },
    isFocused(node) {
      isFocusedNode = node;
      return true;
    }
  };
  const mounted = mountTemplate(
    elementTemplate("box", {
      id: "panel",
      ref(nextApi: MountedElementApi) {
        api = nextApi;
      }
    }),
    { context }
  );

  assert.equal(mounted?.kind, "element");
  assert.ok(api);
  assert.deepEqual(api.focus(), { handled: true, dirtyNodes: [mounted] });
  assert.equal(focusedNode, mounted);
  assert.equal(api.isFocused(), true);
  assert.equal(isFocusedNode, mounted);

  mounted.dispose();
  assert.equal(api.focus(), undefined);
  assert.equal(api.isFocused(), false);
});

test("element ref accepts null and undefined as no-op lifecycle props", () => {
  const nullRefMounted = mountTemplate(
    elementTemplate("box", {
      id: "null-ref",
      ref: null
    })
  );
  const undefinedRefMounted = mountTemplate(
    elementTemplate("box", {
      id: "undefined-ref",
      ref: undefined
    })
  );

  assert.equal(nullRefMounted?.kind, "element");
  assert.equal(undefinedRefMounted?.kind, "element");
  assert.equal(nullRefMounted.api, undefined);
  assert.equal(undefinedRefMounted.api, undefined);
  assert.deepEqual(nullRefMounted.props, {
    id: "null-ref"
  });
  assert.deepEqual(undefinedRefMounted.props, {
    id: "undefined-ref"
  });
  assert.equal("ref" in nullRefMounted.props, false);
  assert.equal("ref" in nullRefMounted.propSources, false);
  assert.equal("ref" in nullRefMounted.bindings, false);
  assert.equal("ref" in undefinedRefMounted.props, false);
  assert.equal("ref" in undefinedRefMounted.propSources, false);
  assert.equal("ref" in undefinedRefMounted.bindings, false);
});

test("element ref rejects signal and non-function values", () => {
  const signalRef = createSignal(() => {});

  assert.throws(
    () => mountTemplate(elementTemplate("box", { ref: signalRef })),
    /Element ref must be a static function/
  );

  assert.throws(
    () => mountTemplate(elementTemplate("box", { ref: "nope" })),
    /Element ref must be a function/
  );
});

test("element api fires mounted after children and unmount before children", () => {
  const events: string[] = [];
  const mounted = mountTemplate(
    elementTemplate(
      "box",
      {
        ref(api: MountedElementApi) {
          const mountedApi = api;
          mountedApi.onMounted = () => events.push("parent mounted");
          mountedApi.onUnmount = () => events.push("parent unmount");
        }
      },
      [
        elementTemplate("text", {
          value: "A",
          ref(api: MountedElementApi) {
            const mountedApi = api;
            mountedApi.onMounted = () => events.push("child mounted");
            mountedApi.onUnmount = () => events.push("child unmount");
          }
        })
      ]
    )
  );

  assert.deepEqual(events, ["child mounted", "parent mounted"]);

  mounted?.dispose();
  mounted?.dispose();

  assert.deepEqual(events, [
    "child mounted",
    "parent mounted",
    "parent unmount",
    "child unmount"
  ]);
});

test("element lifecycle callback errors are reported without stopping sibling callbacks", () => {
  const errors: RuntimeLifecycleError[] = [];
  const events: string[] = [];
  const context = createTestRuntimeContext(errors);
  const mounted = mountTemplate(
    elementTemplate(
      "box",
      {
        ref(api: MountedElementApi) {
          api.onMounted = () => events.push("parent mounted");
          api.onUnmount = () => events.push("parent unmount");
        }
      },
      [
        elementTemplate("text", {
          value: "A",
          ref(api: MountedElementApi) {
            api.onMounted = () => {
              events.push("first mounted");
              throw new Error("mounted failed");
            };
            api.onUnmount = () => {
              events.push("first unmount");
              throw new Error("unmount failed");
            };
          }
        }),
        elementTemplate("text", {
          value: "B",
          ref(api: MountedElementApi) {
            api.onMounted = () => events.push("second mounted");
            api.onUnmount = () => events.push("second unmount");
          }
        })
      ]
    ),
    { context }
  );

  assert.deepEqual(events, [
    "first mounted",
    "second mounted",
    "parent mounted"
  ]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.phase, "mounted");
  assert.match(String((errors[0]?.error as Error).message), /mounted failed/);

  mounted?.dispose();

  assert.deepEqual(events, [
    "first mounted",
    "second mounted",
    "parent mounted",
    "parent unmount",
    "first unmount",
    "second unmount"
  ]);
  assert.equal(errors.length, 2);
  assert.equal(errors[1]?.phase, "unmount");
  assert.match(String((errors[1]?.error as Error).message), /unmount failed/);
});

test("element api stores latest layout and clears it after dispose", () => {
  let api: MountedElementApi | undefined;
  const mounted = mountTemplate(
    elementTemplate("box", {
      ref(nextApi: MountedElementApi) {
        api = nextApi;
      }
    })
  );
  assert.equal(mounted?.kind, "element");
  assert.ok(api);
  const mountedApi = api;
  const layouts: unknown[] = [];
  mountedApi.onLayout = (layout: unknown) => {
    layouts.push(layout);
  };
  const layout = { rect: { x: 0, y: 0, width: 1, height: 1 } };

  assert.equal(mountedApi.getLayout(), null);
  notifyElementLayout(mounted, layout);

  assert.equal(mountedApi.getLayout(), layout);
  assert.deepEqual(layouts, [layout]);

  mounted.dispose();
  notifyElementLayout(mounted, { rect: { x: 0, y: 0, width: 2, height: 2 } });

  assert.equal(mountedApi.getLayout(), null);
  assert.deepEqual(layouts, [layout]);
});

test("element layout callback errors are reported after latest layout is stored", () => {
  const errors: RuntimeLifecycleError[] = [];
  const context = createTestRuntimeContext(errors);
  let api: MountedElementApi | undefined;
  const mounted = mountTemplate(
    elementTemplate("box", {
      ref(nextApi: MountedElementApi) {
        api = nextApi;
        nextApi.onLayout = () => {
          throw new Error("layout failed");
        };
      }
    }),
    { context }
  );
  assert.equal(mounted?.kind, "element");
  assert.ok(api);
  const layout = { rect: { x: 0, y: 0, width: 1, height: 1 } };

  notifyElementLayout(mounted, layout);

  assert.equal(api.getLayout(), layout);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.phase, "layout");
  assert.match(String((errors[0]?.error as Error).message), /layout failed/);
});

test("updates multiple signal props and keeps the highest dirty severity", () => {
  const title = createSignal("A");
  const color = createSignal("red");
  const mounted = mountTemplate(elementTemplate("text", { value: title, color }));

  assert.equal(mounted?.kind, "element");

  color.set("green");
  assert.equal(mounted.props.color, "green");
  assert.equal(mounted.dirty, "paint");

  title.set("B");
  assert.equal(mounted.props.value, "B");
  assert.equal(mounted.dirty, "layout");

  color.set("blue");
  assert.equal(mounted.props.color, "blue");
  assert.equal(mounted.dirty, "layout");
});

test("static props do not create bindings", () => {
  const mounted = mountTemplate(elementTemplate("text", { value: "Hello", color: "green" }));

  assert.equal(mounted?.kind, "element");
  assert.deepEqual(mounted.bindings, {});
});

test("merges dirty state by severity", () => {
  const mounted = mountTemplate(elementTemplate("text", { value: "Hello" }));
  assert.ok(mounted);

  markDirty(mounted, "paint");
  assert.equal(mounted.dirty, "paint");

  markDirty(mounted, "layout");
  assert.equal(mounted.dirty, "layout");

  markDirty(mounted, "paint");
  assert.equal(mounted.dirty, "layout");

  markDirty(mounted, "structure");
  assert.equal(mounted.dirty, "structure");

  clearDirty(mounted);
  assert.equal(mounted.dirty, null);
});

test("mounts fragments and filters empty children", () => {
  const first = elementTemplate("text", { value: "A" });
  const second = elementTemplate("text", { value: "B" });
  const mounted = mountTemplate(fragmentTemplate([emptyTemplate(), first, second]));

  assert.equal(mounted?.kind, "fragment");
  assert.equal(mounted.children.length, 2);
  assert.deepEqual(
    mounted.children.map((child) => child.kind),
    ["element", "element"]
  );
});

test("mounts components once and does not keep ComponentTemplate in MountedNode", () => {
  let runs = 0;
  const title = createSignal("A");

  function Header(): Template {
    runs += 1;
    return elementTemplate("text", { value: title });
  }

  const mounted = mountTemplate({
    kind: "component",
    component: Header,
    props: {}
  });

  assert.equal(runs, 1);
  assert.equal(mounted?.kind, "element");
  assert.equal(mounted.props.value, "A");

  title.set("B");

  assert.equal(runs, 1);
  assert.equal(mounted.props.value, "B");
});

test("component props can pass signals into child bindings", () => {
  const title = createSignal("A");

  function Header(props: Record<string, unknown>): Template {
    return elementTemplate("text", { value: props.title as typeof title });
  }

  const mounted = mountTemplate({
    kind: "component",
    component: Header,
    props: { title }
  });

  assert.equal(mounted?.kind, "element");
  assert.equal(mounted.props.value, "A");

  title.set("B");

  assert.equal(mounted.props.value, "B");
  assert.equal(mounted.dirty, "layout");
});

test("components can return control and fragment templates", () => {
  function ShowComponent(): Template {
    return showTemplate({
      when: true,
      children: elementTemplate("text", { value: "Visible" })
    });
  }

  function FragmentComponent(): Template {
    return fragmentTemplate([
      elementTemplate("text", { value: "A" }),
      elementTemplate("text", { value: "B" })
    ]);
  }

  const showNode = mountTemplate(componentTemplate(ShowComponent, {}));
  const fragmentNode = mountTemplate(componentTemplate(FragmentComponent, {}));

  assert.equal(showNode?.kind, "show");
  assert.equal(fragmentNode?.kind, "fragment");
  assert.equal(fragmentNode.children.length, 2);
});

test("component errors bubble out of mount", () => {
  assert.throws(
    () =>
      mountTemplate(
        componentTemplate(() => {
          throw new Error("boom");
        }, {})
      ),
    /boom/
  );
});

test("mounts show true branch and fallback branch", () => {
  const mountedTrue = mountTemplate(
    showTemplate({
      when: true,
      children: elementTemplate("text", { value: "Visible" }),
      fallback: elementTemplate("text", { value: "Hidden" })
    })
  );

  assert.equal(mountedTrue?.kind, "show");
  assert.equal(mountedTrue.activeBranch?.kind, "element");
  assert.equal(mountedTrue.activeBranch.props.value, "Visible");
  assert.equal(mountedTrue.dirty, null);

  const mountedFalse = mountTemplate(
    showTemplate({
      when: false,
      children: elementTemplate("text", { value: "Visible" }),
      fallback: elementTemplate("text", { value: "Hidden" })
    })
  );

  assert.equal(mountedFalse?.kind, "show");
  assert.equal(mountedFalse.activeBranch?.kind, "element");
  assert.equal(mountedFalse.activeBranch.props.value, "Hidden");
});

test("mounts show false branch without fallback to null", () => {
  const mounted = mountTemplate(
    showTemplate({
      when: false,
      children: elementTemplate("text", { value: "Visible" })
    })
  );

  assert.equal(mounted?.kind, "show");
  assert.equal(mounted.activeBranch, null);
  assert.equal(mounted.activeTemplate, null);
});

test("show switches branches on signal update and disposes old branch", () => {
  const visible = createSignal(true);
  const oldTitle = createSignal("Visible");
  const mounted = mountTemplate(
    showTemplate({
      when: visible,
      children: elementTemplate("text", { value: oldTitle }),
      fallback: elementTemplate("text", { value: "Hidden" })
    })
  );

  assert.equal(mounted?.kind, "show");
  const oldBranch = mounted.activeBranch;
  assert.equal(oldBranch?.kind, "element");
  assert.equal(oldBranch.props.value, "Visible");

  visible.set(false);

  assert.equal(mounted.dirty, "structure");
  assert.equal(mounted.activeBranch?.kind, "element");
  assert.equal(mounted.activeBranch.props.value, "Hidden");

  oldTitle.set("Updated after dispose");
  assert.equal(oldBranch.props.value, "Visible");
});

test("show does not mark dirty when the selected branch template is unchanged", () => {
  const visible = createSignal(true);
  const mounted = mountTemplate(
    showTemplate({
      when: visible,
      children: elementTemplate("text", { value: "Visible" }),
      fallback: elementTemplate("text", { value: "Hidden" })
    })
  );

  assert.equal(mounted?.kind, "show");
  const activeBranch = mounted.activeBranch;

  visible.set(true);

  assert.equal(mounted.activeBranch, activeBranch);
  assert.equal(mounted.dirty, null);
});

test("show supports fragment, empty, and component fallback branches", () => {
  function Fallback(): Template {
    return elementTemplate("text", { value: "Component fallback" });
  }

  const fragmentFallback = mountTemplate(
    showTemplate({
      when: false,
      children: elementTemplate("text", { value: "Visible" }),
      fallback: fragmentTemplate([
        elementTemplate("text", { value: "A" }),
        elementTemplate("text", { value: "B" })
      ])
    })
  );
  const emptyFallback = mountTemplate(
    showTemplate({
      when: false,
      children: elementTemplate("text", { value: "Visible" }),
      fallback: emptyTemplate()
    })
  );
  const componentFallback = mountTemplate(
    showTemplate({
      when: false,
      children: elementTemplate("text", { value: "Visible" }),
      fallback: componentTemplate(Fallback, {})
    })
  );

  assert.equal(fragmentFallback?.kind, "show");
  assert.equal(fragmentFallback.activeBranch?.kind, "fragment");
  assert.equal(emptyFallback?.kind, "show");
  assert.equal(emptyFallback.activeBranch, null);
  assert.equal(componentFallback?.kind, "show");
  assert.equal(componentFallback.activeBranch?.kind, "element");
  assert.equal(componentFallback.activeBranch.props.value, "Component fallback");
});

test("show dispose unsubscribes when binding and active branch", () => {
  const visible = createSignal(true);
  const title = createSignal("Visible");
  const mounted = mountTemplate(
    showTemplate({
      when: visible,
      children: elementTemplate("text", { value: title }),
      fallback: elementTemplate("text", { value: "Hidden" })
    })
  );

  assert.equal(mounted?.kind, "show");
  const activeBranch = mounted.activeBranch;
  assert.equal(activeBranch?.kind, "element");

  mounted.dispose();
  visible.set(false);
  title.set("Updated after dispose");

  assert.equal(mounted.activeBranch, activeBranch);
  assert.equal(activeBranch.props.value, "Visible");
});

test("mounts for templates with static items", () => {
  const mounted = mountTemplate(
    forTemplate<{ id: number; title: string }>({
      each: [
        { id: 1, title: "A" },
        { id: 2, title: "B" }
      ],
      key: (item) => item.id,
      renderItem: (item) => elementTemplate("text", { value: item.title })
    })
  );

  assert.equal(mounted?.kind, "for");
  assert.equal(mounted.items.length, 2);
  assert.deepEqual(
    mounted.items.map((item) => item.key),
    [1, 2]
  );
  assert.deepEqual(
    mounted.items.map((item) => {
      assert.equal(item.node.kind, "element");
      return item.node.props.value;
    }),
    ["A", "B"]
  );
  assert.equal(mounted.dirty, null);
});

test("for updates keyed structure by reusing, disposing, and mounting nodes", () => {
  const titleA = createSignal("A");
  const titleB = createSignal("B");
  const titleC = createSignal("C");
  const items = createSignal([
    { id: 1, title: titleA },
    { id: 2, title: titleB }
  ]);
  let renderCount = 0;

  const mounted = mountTemplate(
    forTemplate<{ id: number; title: typeof titleA }>({
      each: items,
      key: (item) => item.id,
      renderItem: (item) => {
        renderCount += 1;
        return elementTemplate("text", { value: item.title });
      }
    })
  );

  assert.equal(mounted?.kind, "for");
  assert.equal(renderCount, 2);
  const nodeA = mounted.items[0]?.node;
  const nodeB = mounted.items[1]?.node;
  assert.equal(nodeA?.kind, "element");
  assert.equal(nodeB?.kind, "element");

  items.set([
    { id: 2, title: titleB },
    { id: 3, title: titleC }
  ]);

  assert.equal(mounted.dirty, "structure");
  assert.equal(renderCount, 3);
  assert.equal(mounted.items.length, 2);
  assert.equal(mounted.items[0]?.key, 2);
  assert.equal(mounted.items[0]?.node, nodeB);
  assert.equal(mounted.items[1]?.key, 3);
  assert.notEqual(mounted.items[1]?.node, nodeA);

  titleA.set("A after dispose");
  assert.equal(nodeA.props.value, "A");

  titleB.set("B updated");
  assert.equal(nodeB.props.value, "B updated");
});

test("for mounts a new node when a removed key appears again", () => {
  const items = createSignal([
    { id: 1, title: createSignal("A") },
    { id: 2, title: createSignal("B") }
  ]);

  const mounted = mountTemplate(
    forTemplate<{ id: number; title: ReturnType<typeof createSignal<string>> }>({
      each: items,
      key: (item) => item.id,
      renderItem: (item) => elementTemplate("text", { value: item.title })
    })
  );

  assert.equal(mounted?.kind, "for");
  const firstNode = mounted.items[0]?.node;

  items.set([{ id: 2, title: items.get()[1]!.title }]);
  items.set([
    { id: 1, title: createSignal("A again") },
    { id: 2, title: items.get()[0]!.title }
  ]);

  assert.equal(mounted.items[0]?.key, 1);
  assert.notEqual(mounted.items[0]?.node, firstNode);
  assert.equal(mounted.items[0]?.node.kind, "element");
  assert.equal(mounted.items[0]?.node.props.value, "A again");
});

test("for reorders keyed items without rerendering reused nodes", () => {
  const items = createSignal([
    { id: 1, title: "A" },
    { id: 2, title: "B" }
  ]);
  let renderCount = 0;

  const mounted = mountTemplate(
    forTemplate<{ id: number; title: string }>({
      each: items,
      key: (item) => item.id,
      renderItem: (item) => {
        renderCount += 1;
        return elementTemplate("text", { value: item.title });
      }
    })
  );

  assert.equal(mounted?.kind, "for");
  const node1 = mounted.items[0]?.node;
  const node2 = mounted.items[1]?.node;

  items.set([
    { id: 2, title: "B updated static" },
    { id: 1, title: "A updated static" }
  ]);

  assert.equal(renderCount, 2);
  assert.equal(mounted.items[0]?.key, 2);
  assert.equal(mounted.items[0]?.node, node2);
  assert.equal(mounted.items[1]?.key, 1);
  assert.equal(mounted.items[1]?.node, node1);
  assert.equal(mounted.items[0]?.node.kind, "element");
  assert.equal(mounted.items[0]?.node.props.value, "B");
});

test("for updates reused item references when keys are stable", () => {
  const items = createSignal([
    { id: 1, title: "A" },
    { id: 2, title: "B" }
  ]);
  const mounted = mountTemplate(
    forTemplate<{ id: number; title: string }>({
      each: items,
      key: (item) => item.id,
      renderItem: (item) => elementTemplate("text", { value: item.title })
    })
  );

  assert.equal(mounted?.kind, "for");
  const nextItem = { id: 1, title: "A updated" };

  items.set([nextItem, { id: 2, title: "B updated" }]);

  assert.equal(mounted.items[0]?.item, nextItem);
  assert.equal(mounted.items[0]?.node.kind, "element");
  assert.equal(mounted.items[0]?.node.props.value, "A");
});

test("for updates to an empty array dispose all item nodes", () => {
  const titleA = createSignal("A");
  const titleB = createSignal("B");
  const items = createSignal([
    { id: 1, title: titleA },
    { id: 2, title: titleB }
  ]);
  const mounted = mountTemplate(
    forTemplate<{ id: number; title: typeof titleA }>({
      each: items,
      key: (item) => item.id,
      renderItem: (item) => elementTemplate("text", { value: item.title })
    })
  );

  assert.equal(mounted?.kind, "for");
  const firstNode = mounted.items[0]?.node;
  const secondNode = mounted.items[1]?.node;
  assert.equal(firstNode?.kind, "element");
  assert.equal(secondNode?.kind, "element");

  items.set([]);
  titleA.set("A after dispose");
  titleB.set("B after dispose");

  assert.deepEqual(mounted.items, []);
  assert.equal(firstNode.props.value, "A");
  assert.equal(secondNode.props.value, "B");
});

test("for skips items whose render result mounts to null", () => {
  const mounted = mountTemplate(
    forTemplate<string>({
      each: ["A", "skip", "B"],
      renderItem: (item) =>
        item === "skip" ? emptyTemplate() : elementTemplate("text", { value: item })
    })
  );

  assert.equal(mounted?.kind, "for");
  assert.equal(mounted.items.length, 2);
  assert.deepEqual(
    mounted.items.map((item) => item.item),
    ["A", "B"]
  );
});

test("for key and renderItem errors bubble out of updates", () => {
  const keyItems = createSignal([{ id: 1 }, { id: 2 }]);
  const keyMounted = mountTemplate(
    forTemplate<{ id: number }>({
      each: keyItems,
      key: (item) => {
        if (item.id === 3) {
          throw new Error("bad key");
        }
        return item.id;
      },
      renderItem: (item) => elementTemplate("text", { value: String(item.id) })
    })
  );

  assert.equal(keyMounted?.kind, "for");
  assert.throws(() => keyItems.set([{ id: 3 }]), /bad key/);

  const renderItems = createSignal([{ id: 1, title: "A" }]);
  const renderMounted = mountTemplate(
    forTemplate<{ id: number; title: string }>({
      each: renderItems,
      key: (item) => item.id,
      renderItem: (item) => {
        if (item.title === "boom") {
          throw new Error("bad render");
        }
        return elementTemplate("text", { value: item.title });
      }
    })
  );

  assert.equal(renderMounted?.kind, "for");
  assert.throws(() => renderItems.set([{ id: 2, title: "boom" }]), /bad render/);
});

test("for falls back to index keys when key is omitted", () => {
  const mounted = mountTemplate(
    forTemplate<string>({
      each: ["A", "B"],
      renderItem: (item) => elementTemplate("text", { value: item })
    })
  );

  assert.equal(mounted?.kind, "for");
  assert.deepEqual(
    mounted.items.map((item) => item.key),
    [0, 1]
  );
});

test("for dispose unsubscribes each binding and item nodes", () => {
  const title = createSignal("A");
  const items = createSignal([{ id: 1, title }]);
  const mounted = mountTemplate(
    forTemplate<{ id: number; title: typeof title }>({
      each: items,
      key: (item) => item.id,
      renderItem: (item) => elementTemplate("text", { value: item.title })
    })
  );

  assert.equal(mounted?.kind, "for");
  const child = mounted.items[0]?.node;
  assert.equal(child?.kind, "element");

  mounted.dispose();
  title.set("A after dispose");
  items.set([{ id: 2, title: createSignal("B") }]);

  assert.equal(child.props.value, "A");
  assert.deepEqual(mounted.items, []);
});

test("throws when a component returns an invalid template", () => {
  assert.throws(
    () =>
      mountTemplate({
        kind: "component",
        component: () => "not a template" as unknown as Template,
        props: {}
      }),
    /Component returned invalid Template/
  );
});

test("disposes element bindings idempotently", () => {
  const title = createSignal("A");
  const mounted = mountTemplate(elementTemplate("text", { value: title }));

  assert.equal(mounted?.kind, "element");
  disposeMountedNode(mounted);
  disposeMountedNode(mounted);

  title.set("B");

  assert.equal(mounted.props.value, "A");
  assert.deepEqual(mounted.bindings, {});
});

test("node.dispose disposes recursively", () => {
  const title = createSignal("A");
  const mounted = mountTemplate(
    fragmentTemplate([elementTemplate("text", { value: title })])
  );

  assert.equal(mounted?.kind, "fragment");
  const child = mounted.children[0];
  assert.equal(child?.kind, "element");

  mounted.dispose();
  title.set("B");

  assert.equal(child.props.value, "A");
});
