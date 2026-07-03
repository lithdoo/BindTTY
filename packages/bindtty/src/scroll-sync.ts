import type { LayoutNode } from "@bindtty/layout";
import type { MountedElementNode } from "@bindtty/vnode";

export function syncClampedScrollBindings(layout: LayoutNode | null): boolean {
  if (!layout) {
    return false;
  }

  let changed = false;

  if (layout.scrollOffset && layout.mounted.kind === "element") {
    if (writeScrollBinding(layout.mounted, layout.scrollOffset.y)) {
      changed = true;
    }
  }

  for (const child of layout.children) {
    if (syncClampedScrollBindings(child)) {
      changed = true;
    }
  }

  return changed;
}

function writeScrollBinding(
  mounted: MountedElementNode,
  appliedY: number
): boolean {
  const binding = mounted.bindings.scrollY;
  if (!binding || typeof binding.value !== "number" || binding.value === appliedY) {
    return false;
  }

  const source = binding.source as { set?: (value: number) => void };
  if (typeof source.set !== "function") {
    return false;
  }

  source.set(appliedY);
  return true;
}
