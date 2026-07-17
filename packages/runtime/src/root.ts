import type { MountedNode, Template } from "@bindtty/vnode";
import { clearDirty } from "./dirty.js";
import { disposeMountedNode } from "./dispose.js";
import { mountTemplate } from "./mount.js";
import { createRuntimeScheduler } from "./scheduler.js";
import type {
  Dispose,
  RuntimeFlushListener,
  RuntimeFlushRecord,
  RuntimeRoot,
  RuntimeRootOptions
} from "./types.js";

export function createRuntimeRoot(
  template: Template,
  options: RuntimeRootOptions = {}
): RuntimeRoot {
  let root: MountedNode | null = null;
  let disposed = false;
  const scheduler = createRuntimeScheduler(() => root);

  root = mountTemplate(template, {
    context: {
      scheduler,
      onLifecycleError: options.onLifecycleError,
      elementActions: options.elementActions
    }
  });

  return {
    get root() {
      return root;
    },

    onFlush(listener: RuntimeFlushListener): Dispose {
      if (disposed) {
        return () => {};
      }

      return scheduler.onFlush(listener);
    },

    flushNow(): RuntimeFlushRecord | null {
      if (disposed) {
        return null;
      }

      return scheduler.flushNow();
    },

    clearDirty(): void {
      clearDirtyTree(root);
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      disposeMountedNode(root);
      scheduler.clear();
    }
  };
}

function clearDirtyTree(node: MountedNode | null): void {
  if (!node) {
    return;
  }

  clearDirty(node);

  switch (node.kind) {
    case "element":
    case "fragment":
      for (const child of node.children) {
        clearDirtyTree(child);
      }
      return;
    case "show":
      clearDirtyTree(node.activeBranch);
      return;
    case "for":
      for (const item of node.items) {
        clearDirtyTree(item.node);
      }
      return;
  }
}
