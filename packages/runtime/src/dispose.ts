import type {
  MountedBinding,
  MountedElementNode,
  MountedForNode,
  MountedFragmentNode,
  MountedNode,
  MountedShowNode
} from "@bindtty/vnode";
import { disposeElementApi } from "./element-api.js";

const disposedNodes = new WeakSet<MountedNode>();

export function disposeMountedNode(node: MountedNode | null): void {
  if (!node || disposedNodes.has(node)) {
    return;
  }

  disposedNodes.add(node);

  switch (node.kind) {
    case "element":
      disposeElementNode(node);
      return;
    case "fragment":
      disposeFragmentNode(node);
      return;
    case "show":
      disposeShowNode(node);
      return;
    case "for":
      disposeForNode(node);
      return;
  }
}

export function isDisposed(node: MountedNode): boolean {
  return disposedNodes.has(node);
}

function disposeElementNode(node: MountedElementNode): void {
  disposeElementApi(node);
  disposeBindings(node.bindings);
  for (const child of node.children) {
    disposeMountedNode(child);
  }
  node.bindings = {};
}

function disposeFragmentNode(node: MountedFragmentNode): void {
  for (const child of node.children) {
    disposeMountedNode(child);
  }
}

function disposeShowNode(node: MountedShowNode): void {
  node.binding?.dispose();
  disposeMountedNode(node.activeBranch);
}

function disposeForNode(node: MountedForNode): void {
  node.binding?.dispose();
  for (const item of node.items) {
    disposeMountedNode(item.node);
  }
  node.items = [];
}

function disposeBindings(bindings: Record<string, MountedBinding>): void {
  for (const binding of Object.values(bindings)) {
    binding.dispose();
  }
}
