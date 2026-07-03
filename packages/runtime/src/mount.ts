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
  const node: MountedForNode<unknown> = {
    kind: "for",
    each: template.each,
    items: mountForItems(template, resolveItems(template.each), options),
    dirty: options.markInitiallyDirty ? "structure" : null,
    dispose() {
      disposeMountedNode(node);
    }
  };

  if (isReadableSignal(template.each)) {
    node.binding = createBinding(template.each, (items) => {
      updateForItems(node, template, items, options);
    });
  }

  return node;
}

function mountShowTemplate(
  template: ShowTemplate,
  options: MountOptions
): MountedShowNode {
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
  mountShowBranch(node, template, initialValue, options);

  if (isReadableSignal(template.when)) {
    node.binding = createBinding(template.when, (value) => {
      updateShowBranch(node, template, value, options);
    });
  }

  return node;
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
  runElementRef(node, ref);
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
  const rendered = template.component(template.props);

  if (!isTemplate(rendered)) {
    throw new TypeError("Component returned invalid Template.");
  }

  return mountTemplate(rendered, options);
}

function mountForItems(
  template: ForTemplate<unknown>,
  items: readonly unknown[],
  options: MountOptions
): MountedForItemNode<unknown>[] {
  const mountedItems: MountedForItemNode<unknown>[] = [];

  items.forEach((item, index) => {
    const childTemplate = template.renderItem(item, index);
    const node = mountTemplate(childTemplate, options);

    if (node) {
      mountedItems.push({
        key: getItemKey(template, item, index),
        item,
        node
      });
    }
  });

  return mountedItems;
}

function updateForItems(
  node: MountedForNode<unknown>,
  template: ForTemplate<unknown>,
  nextItems: readonly unknown[],
  options: MountOptions
): void {
  const previousByKey = new Map<string | number, MountedForItemNode<unknown>>();

  for (const itemNode of node.items) {
    previousByKey.set(itemNode.key, itemNode);
  }

  const nextMountedItems: MountedForItemNode<unknown>[] = [];
  const reusedKeys = new Set<string | number>();

  nextItems.forEach((item, index) => {
    const key = getItemKey(template, item, index);
    const previous = previousByKey.get(key);

    if (previous) {
      previous.item = item;
      nextMountedItems.push(previous);
      reusedKeys.add(key);
      return;
    }

    const childTemplate = template.renderItem(item, index);
    const mounted = mountTemplate(childTemplate, options);

    if (mounted) {
      nextMountedItems.push({ key, item, node: mounted });
    }
  });

  for (const previous of node.items) {
    if (!reusedKeys.has(previous.key)) {
      disposeMountedNode(previous.node);
    }
  }

  node.items = nextMountedItems;
  markDirty(node, "structure");
  options.context?.scheduler.queueDirty(node);
}

function getItemKey(
  template: ForTemplate<unknown>,
  item: unknown,
  index: number
): string | number {
  return template.key ? template.key(item, index) : index;
}

function updateShowBranch(
  node: MountedShowNode,
  template: ShowTemplate,
  value: boolean,
  options: MountOptions
): void {
  const nextTemplate = selectShowTemplate(template, value);

  if (node.activeTemplate === nextTemplate) {
    return;
  }

  disposeMountedNode(node.activeBranch);
  node.activeTemplate = nextTemplate;
  node.activeBranch = nextTemplate ? mountTemplate(nextTemplate, options) : null;
  markDirty(node, "structure");
  options.context?.scheduler.queueDirty(node);
}

function mountShowBranch(
  node: MountedShowNode,
  template: ShowTemplate,
  value: boolean,
  options: MountOptions
): void {
  const activeTemplate = selectShowTemplate(template, value);
  node.activeTemplate = activeTemplate;
  node.activeBranch = activeTemplate ? mountTemplate(activeTemplate, options) : null;
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
