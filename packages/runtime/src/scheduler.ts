import type { MountedNode } from "@bindtty/vnode";
import { isDisposed } from "./dispose.js";
import type {
  Dispose,
  RuntimeFlushListener,
  RuntimeFlushRecord,
  RuntimeScheduler
} from "./types.js";

export function createRuntimeScheduler(
  getRoot: () => MountedNode | null
): RuntimeScheduler {
  const dirtyNodes = new Set<MountedNode>();
  const listeners = new Set<RuntimeFlushListener>();
  let flushQueued = false;

  function queueDirty(node: MountedNode): void {
    if (isDisposed(node)) {
      return;
    }

    dirtyNodes.add(node);

    if (!flushQueued) {
      flushQueued = true;
      queueMicrotask(flushNow);
    }
  }

  function flushNow(): RuntimeFlushRecord | null {
    if (!flushQueued && dirtyNodes.size === 0) {
      return null;
    }

    flushQueued = false;
    const nodes = Array.from(dirtyNodes).filter((node) => !isDisposed(node));
    dirtyNodes.clear();

    if (nodes.length === 0) {
      return null;
    }

    const record: RuntimeFlushRecord = {
      root: getRoot(),
      dirtyNodes: nodes
    };

    for (const listener of Array.from(listeners)) {
      listener(record);
    }

    return record;
  }

  function onFlush(listener: RuntimeFlushListener): Dispose {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function clear(): void {
    dirtyNodes.clear();
    listeners.clear();
    flushQueued = false;
  }

  return {
    queueDirty,
    flushNow,
    onFlush,
    clear
  };
}
