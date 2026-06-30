import { createBasicLayoutEngine } from "./basic-engine.js";
import type { LayoutNode, LayoutOptions } from "./types.js";
import type { MountedNode } from "@bindtty/vnode";

const defaultEngine = createBasicLayoutEngine();

export function layoutRoot(
  root: MountedNode | null,
  options: LayoutOptions
): LayoutNode | null {
  return (options.engine ?? defaultEngine).layout(root, {
    viewport: options.viewport
  });
}
