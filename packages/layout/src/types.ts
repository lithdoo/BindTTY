import type { MountedNode } from "@bindtty/vnode";

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutViewport {
  width: number;
  height: number;
}

export interface LayoutNode {
  mounted: MountedNode;
  rect: LayoutRect;
  contentRect: LayoutRect;
  children: LayoutNode[];
}

export interface LayoutEngineOptions {
  viewport: LayoutViewport;
}

export interface LayoutEngine {
  layout(root: MountedNode | null, options: LayoutEngineOptions): LayoutNode | null;
}

export interface LayoutOptions extends LayoutEngineOptions {
  engine?: LayoutEngine;
}
