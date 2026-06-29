import type { MountedNode } from "@bindtty/vnode";

export interface MountOptions {
  markInitiallyDirty?: boolean;
  context?: RuntimeContext;
}

export interface RuntimeContext {
  scheduler: RuntimeScheduler;
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

export type Dispose = () => void;
