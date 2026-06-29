import type { DirtyKind, MountedNode } from "@bindtty/vnode";

const dirtyRank: Record<DirtyKind, number> = {
  paint: 1,
  layout: 2,
  structure: 3
};

export function markDirty(node: MountedNode, kind: DirtyKind): void {
  if (!node.dirty || dirtyRank[kind] > dirtyRank[node.dirty]) {
    node.dirty = kind;
  }
}

export function clearDirty(node: MountedNode): void {
  node.dirty = null;
}
