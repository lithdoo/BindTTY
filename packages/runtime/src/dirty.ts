import type { DirtyKind, MountedNode } from "@bindtty/vnode";

export const dirtyRank: Record<DirtyKind, number> = {
  paint: 1,
  layout: 2,
  structure: 3
};

export function markDirty(node: MountedNode, kind: DirtyKind): void {
  if (!node.dirty || dirtyRank[kind] > dirtyRank[node.dirty]) {
    node.dirty = kind;
  }
}

export function getHighestDirtyKind(nodes: readonly MountedNode[]): DirtyKind {
  let highest: DirtyKind = "paint";
  for (const node of nodes) {
    if (node.dirty && dirtyRank[node.dirty] > dirtyRank[highest]) {
      highest = node.dirty;
    }
  }
  return highest;
}

export function clearDirty(node: MountedNode): void {
  node.dirty = null;
}
