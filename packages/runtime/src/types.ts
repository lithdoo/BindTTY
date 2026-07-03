import type { MountedElementNode, MountedNode } from "@bindtty/vnode";

export interface MountOptions {
  markInitiallyDirty?: boolean;
  context?: RuntimeContext;
}

export interface RuntimeContext {
  scheduler: RuntimeScheduler;
  onLifecycleError?: RuntimeLifecycleErrorHandler;
}

export interface RuntimeRootOptions {
  onLifecycleError?: RuntimeLifecycleErrorHandler;
}

export type RuntimeLifecyclePhase = "mounted" | "layout" | "unmount";

export interface RuntimeLifecycleError {
  phase: RuntimeLifecyclePhase;
  node: MountedElementNode;
  error: unknown;
}

export interface RuntimeRoot {
  readonly root: MountedNode | null;

  onFlush(listener: RuntimeFlushListener): Dispose;
  flushNow(): RuntimeFlushRecord | null;
  clearDirty(): void;
  dispose(): void;
}

export interface RuntimeFlushRecord {
  root: MountedNode | null;
  dirtyNodes: MountedNode[];
}

export type RuntimeFlushListener = (record: RuntimeFlushRecord) => void;

export interface RuntimeScheduler {
  queueDirty(node: MountedNode): void;
  flushNow(): RuntimeFlushRecord | null;
  onFlush(listener: RuntimeFlushListener): Dispose;
  clear(): void;
}

export type RuntimeLifecycleErrorHandler = (
  error: RuntimeLifecycleError
) => void;

export type Dispose = () => void;
