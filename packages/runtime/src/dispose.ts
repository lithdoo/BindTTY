import type {
  MountedBinding,
  MountedElementNode,
  MountedForNode,
  MountedFragmentNode,
  MountedNode,
  MountedShowNode
} from "@bindtty/vnode";
import { disposeElementApi } from "./element-api.js";
import {
  collectErrors,
  disposeMountedNodeOwners,
  throwCollectedErrors
} from "./ownership.js";

const disposedNodes = new WeakSet<MountedNode>();

export function disposeMountedNode(node: MountedNode | null): void {
  if (!node || disposedNodes.has(node)) {
    return;
  }

  disposedNodes.add(node);

  const errors: unknown[] = [];
  try {
    switch (node.kind) {
      case "element":
        disposeElementNode(node);
        break;
      case "fragment":
        disposeFragmentNode(node);
        break;
      case "show":
        disposeShowNode(node);
        break;
      case "for":
        disposeForNode(node);
        break;
    }
  } catch (error) {
    collectErrors(errors, error);
  }
  try {
    disposeMountedNodeOwners(node);
  } catch (error) {
    collectErrors(errors, error);
  }
  throwCollectedErrors(errors);
}

export function isDisposed(node: MountedNode): boolean {
  return disposedNodes.has(node);
}

function disposeElementNode(node: MountedElementNode): void {
  const errors: unknown[] = [];
  disposeElementApi(node);
  try {
    disposeBindings(node.bindings);
  } catch (error) {
    collectErrors(errors, error);
  }
  for (const child of node.children) {
    try {
      disposeMountedNode(child);
    } catch (error) {
      collectErrors(errors, error);
    }
  }
  node.bindings = {};
  throwCollectedErrors(errors);
}

function disposeFragmentNode(node: MountedFragmentNode): void {
  const errors: unknown[] = [];
  for (const child of node.children) {
    try {
      disposeMountedNode(child);
    } catch (error) {
      collectErrors(errors, error);
    }
  }
  throwCollectedErrors(errors);
}

function disposeShowNode(node: MountedShowNode): void {
  const errors: unknown[] = [];
  try {
    node.binding?.dispose();
  } catch (error) {
    collectErrors(errors, error);
  }
  try {
    disposeMountedNode(node.activeBranch);
  } catch (error) {
    collectErrors(errors, error);
  }
  throwCollectedErrors(errors);
}

function disposeForNode(node: MountedForNode): void {
  const errors: unknown[] = [];
  try {
    node.binding?.dispose();
  } catch (error) {
    collectErrors(errors, error);
  }
  for (const item of node.items) {
    try {
      disposeMountedNode(item.node);
    } catch (error) {
      collectErrors(errors, error);
    }
  }
  node.items = [];
  throwCollectedErrors(errors);
}

function disposeBindings(bindings: Record<string, MountedBinding>): void {
  const errors: unknown[] = [];
  for (const binding of Object.values(bindings)) {
    try {
      binding.dispose();
    } catch (error) {
      collectErrors(errors, error);
    }
  }
  throwCollectedErrors(errors);
}
