import {
  isReadableSignal,
  isTemplate,
  type ElementTemplate,
  type ForTemplate,
  type FragmentTemplate,
  type MountedElementNode,
  type MountedElementRefHandler,
  type MountedForItemNode,
  type MountedForNode,
  type MountedFragmentNode,
  type MountedNode,
  type MountedShowNode,
  type ShowTemplate,
  type Template
} from "@bindtty/vnode";
import { createBinding, bindProps } from "./binding.js";
import { disposeMountedNode } from "./dispose.js";
import { markDirty } from "./dirty.js";
import { notifyElementMounted, runElementRef } from "./element-api.js";
import {
  collectErrors,
  mountControlWithOwner,
  mountWithOwner,
  throwCollectedErrors,
  type ReactiveOwner
} from "./ownership.js";
import type { MountOptions } from "./types.js";

export function mountTemplate(
  template: Template,
  options: MountOptions = {}
): MountedNode | null {
  switch (template.kind) {
    case "empty":
      return null;
    case "element":
      return mountElementTemplate(template, options);
    case "fragment":
      return mountFragmentTemplate(template, options);
    case "component":
      return mountComponentTemplate(template, options);
    case "show":
      return mountShowTemplate(template, options);
    case "for":
      return mountForTemplate(template, options);
  }
}

function mountForTemplate(
  template: ForTemplate<unknown>,
  options: MountOptions
): MountedForNode<unknown> {
  return mountControlWithOwner((owner) => {
    const node: MountedForNode<unknown> = {
      kind: "for",
      each: template.each,
      items: mountForItems(template, resolveItems(template.each), options, owner),
      dirty: options.markInitiallyDirty ? "structure" : null,
      dispose() {
        disposeMountedNode(node);
      }
    };

    if (isReadableSignal(template.each)) {
      node.binding = createBinding(template.each, (items) => {
        updateForItems(node, template, items, options, owner);
      });
    }

    return node;
  });
}

function mountShowTemplate(
  template: ShowTemplate,
  options: MountOptions
): MountedShowNode {
  return mountControlWithOwner((owner) => {
    const node: MountedShowNode = {
      kind: "show",
      when: template.when,
      activeBranch: null,
      activeTemplate: null,
      dirty: options.markInitiallyDirty ? "structure" : null,
      dispose() {
        disposeMountedNode(node);
      }
    };

    const initialValue = resolveBoolean(template.when);
    mountShowBranch(node, template, initialValue, options, owner);

    if (isReadableSignal(template.when)) {
      node.binding = createBinding(template.when, (value) => {
        updateShowBranch(node, template, value, options, owner);
      });
    }

    return node;
  });
}

function mountElementTemplate(
  template: ElementTemplate,
  options: MountOptions
): MountedElementNode {
  const { ref, props } = extractElementRef(template.props);
  const node: MountedElementNode = {
    kind: "element",
    tag: template.tag,
    props: {},
    propSources: {},
    bindings: {},
    children: [],
    state: {},
    dirty: options.markInitiallyDirty ? "structure" : null,
    dispose() {
      disposeMountedNode(node);
    }
  };

  bindProps(node, props, options.context);
  runElementRef(node, ref, options.context);
  node.children = mountChildren(template.children, options);
  notifyElementMounted(node);

  return node;
}

function extractElementRef(
  props: ElementTemplate["props"]
): {
  ref?: MountedElementRefHandler;
  props: ElementTemplate["props"];
} {
  const ordinaryProps: ElementTemplate["props"] = {};
  let ref: MountedElementRefHandler | undefined;

  for (const [name, value] of Object.entries(props)) {
    if (name !== "ref") {
      ordinaryProps[name] = value;
      continue;
    }

    if (value == null) {
      continue;
    }

    if (isReadableSignal(value)) {
      throw new TypeError("Element ref must be a static function.");
    }

    if (typeof value !== "function") {
      throw new TypeError("Element ref must be a function.");
    }

    ref = value as MountedElementRefHandler;
  }

  return {
    ref,
    props: ordinaryProps
  };
}

function mountFragmentTemplate(
  template: FragmentTemplate,
  options: MountOptions
): MountedFragmentNode {
  const node: MountedFragmentNode = {
    kind: "fragment",
    children: mountChildren(template.children, options),
    dirty: options.markInitiallyDirty ? "structure" : null,
    dispose() {
      disposeMountedNode(node);
    }
  };

  return node;
}

function mountComponentTemplate(
  template: Extract<Template, { kind: "component" }>,
  options: MountOptions
): MountedNode | null {
  return mountWithOwner(() => {
    const rendered = template.component(template.props);
    if (!isTemplate(rendered)) {
      throw new TypeError("Component returned invalid Template.");
    }
    return mountTemplate(rendered, options);
  });
}

function mountForItems(
  template: ForTemplate<unknown>,
  items: readonly unknown[],
  options: MountOptions,
  owner: ReactiveOwner
): MountedForItemNode<unknown>[] {
  const mountedItems: MountedForItemNode<unknown>[] = [];
  const keys = new Set<string | number>();

  try {
    items.forEach((item, index) => {
      const key = getItemKey(template, item, index);
      assertUniqueForKey(keys, key);
      const node = mountForItem(template, item, index, options, owner);

      if (node) {
        mountedItems.push({
          key,
          item,
          node
        });
      }
    });
  } catch (error) {
    const errors: unknown[] = [error];
    for (const mounted of mountedItems) {
      try {
        disposeMountedNode(mounted.node);
      } catch (cleanupError) {
        collectErrors(errors, cleanupError);
      }
    }
    throwCollectedErrors(errors);
  }

  return mountedItems;
}

function updateForItems(
  node: MountedForNode<unknown>,
  template: ForTemplate<unknown>,
  nextItems: readonly unknown[],
  options: MountOptions,
  owner: ReactiveOwner
): void {
  const previousByKey = new Map<string | number, MountedForItemNode<unknown>>();
  const nextEntries = nextItems.map((item, index) => ({
    item,
    index,
    key: getItemKey(template, item, index)
  }));
  const nextKeys = new Set<string | number>();

  for (const entry of nextEntries) {
    assertUniqueForKey(nextKeys, entry.key);
  }

  for (const itemNode of node.items) {
    previousByKey.set(itemNode.key, itemNode);
  }

  const nextMountedItems: MountedForItemNode<unknown>[] = [];
  const reusedKeys = new Set<string | number>();
  const newlyMountedNodes: MountedNode[] = [];

  try {
    nextEntries.forEach(({ item, index, key }) => {
      const previous = previousByKey.get(key);

      if (previous && Object.is(previous.item, item)) {
        nextMountedItems.push(previous);
        reusedKeys.add(key);
        return;
      }

      const mounted = mountForItem(template, item, index, options, owner);

      if (mounted) {
        newlyMountedNodes.push(mounted);
        nextMountedItems.push({ key, item, node: mounted });
      }
    });
  } catch (error) {
    const errors: unknown[] = [error];
    for (const mounted of newlyMountedNodes) {
      try {
        disposeMountedNode(mounted);
      } catch (cleanupError) {
        collectErrors(errors, cleanupError);
      }
    }
    throwCollectedErrors(errors);
  }

  const changed =
    node.items.length !== nextMountedItems.length ||
    nextMountedItems.some((item, index) => node.items[index] !== item);
  const errors: unknown[] = [];
  for (const previous of node.items) {
    if (!reusedKeys.has(previous.key)) {
      try {
        disposeMountedNode(previous.node);
      } catch (error) {
        collectErrors(errors, error);
      }
    }
  }

  node.items = nextMountedItems;
  if (changed) {
    markDirty(node, "structure");
    options.context?.scheduler.queueDirty(node);
  }
  throwCollectedErrors(errors);
}

function getItemKey(
  template: ForTemplate<unknown>,
  item: unknown,
  index: number
): string | number {
  return template.key ? template.key(item, index) : index;
}

function assertUniqueForKey(
  keys: Set<string | number>,
  key: string | number
): void {
  if (keys.has(key)) {
    throw new Error(`Duplicate key in for template: ${String(key)}`);
  }
  keys.add(key);
}

function updateShowBranch(
  node: MountedShowNode,
  template: ShowTemplate,
  value: boolean,
  options: MountOptions,
  owner: ReactiveOwner
): void {
  const nextTemplate = selectShowTemplate(template, value);

  if (node.activeTemplate === nextTemplate) {
    return;
  }

  const errors: unknown[] = [];
  try {
    disposeMountedNode(node.activeBranch);
  } catch (error) {
    collectErrors(errors, error);
  }
  node.activeTemplate = nextTemplate;
  node.activeBranch = null;
  if (nextTemplate) {
    try {
      node.activeBranch = mountWithOwner(
        () => mountTemplate(nextTemplate, options),
        owner
      );
    } catch (error) {
      collectErrors(errors, error);
    }
  }
  markDirty(node, "structure");
  options.context?.scheduler.queueDirty(node);
  throwCollectedErrors(errors);
}

function mountShowBranch(
  node: MountedShowNode,
  template: ShowTemplate,
  value: boolean,
  options: MountOptions,
  owner: ReactiveOwner
): void {
  const activeTemplate = selectShowTemplate(template, value);
  node.activeTemplate = activeTemplate;
  node.activeBranch = activeTemplate
    ? mountWithOwner(() => mountTemplate(activeTemplate, options), owner)
    : null;
}

function mountForItem(
  template: ForTemplate<unknown>,
  item: unknown,
  index: number,
  options: MountOptions,
  owner: ReactiveOwner
): MountedNode | null {
  return mountWithOwner(() => {
    const childTemplate = template.renderItem(item, index);
    return mountTemplate(childTemplate, options);
  }, owner);
}

function selectShowTemplate(
  template: ShowTemplate,
  value: boolean
): Template | null {
  return value ? template.children : template.fallback ?? null;
}

function resolveBoolean(source: ShowTemplate["when"]): boolean {
  return isReadableSignal(source) ? source.get() : source;
}

function resolveItems(source: ForTemplate<unknown>["each"]): readonly unknown[] {
  return isReadableSignal(source) ? source.get() : source;
}

function mountChildren(
  templates: readonly Template[],
  options: MountOptions
): MountedNode[] {
  const children: MountedNode[] = [];

  for (const template of templates) {
    const child = mountTemplate(template, options);
    if (child) {
      children.push(child);
    }
  }

  return children;
}
