export { bindProp, bindProps } from "./binding.js";
export { clearDirty, markDirty } from "./dirty.js";
export { disposeMountedNode, isDisposed } from "./dispose.js";
export { notifyElementLayout } from "./element-api.js";
export { mountTemplate } from "./mount.js";
export { createRuntimeRoot } from "./root.js";
export { createRuntimeScheduler } from "./scheduler.js";
export type {
  Dispose,
  MountOptions,
  RuntimeContext,
  RuntimeFlushListener,
  RuntimeFlushRecord,
  RuntimeRoot,
  RuntimeScheduler
} from "./types.js";
