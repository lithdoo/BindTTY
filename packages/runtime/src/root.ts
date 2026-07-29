import type { MountedNode, Template } from "@bindtty/vnode";
import { clearDirty } from "./dirty.js";
import { disposeMountedNode } from "./dispose.js";
import { mountTemplate } from "./mount.js";
import { createRuntimeScheduler } from "./scheduler.js";
import {
  collectErrors,
  createRuntimeOwner,
  disposeRuntimeOwner,
  runWithRuntimeOwner,
  throwCollectedErrors
} from "./ownership.js";
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
  const owner = createRuntimeOwner();

  try {
    root = runWithRuntimeOwner(owner, () =>
      mountTemplate(template, {
        context: {
          scheduler,
          onLifecycleError: options.onLifecycleError,
          elementActions: options.elementActions
        }
      })
    );
  } catch (error) {
    scheduler.clear();
    try {
      disposeRuntimeOwner(owner);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Runtime mount and cleanup failed"
      );
    }
    throw error;
  }

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
      const errors: unknown[] = [];
      try {
        disposeMountedNode(root);
      } catch (error) {
        collectErrors(errors, error);
      }
      try {
        disposeRuntimeOwner(owner);
      } catch (error) {
        collectErrors(errors, error);
      }
      scheduler.clear();
      throwCollectedErrors(errors);
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
