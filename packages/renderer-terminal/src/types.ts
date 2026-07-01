export interface Frame {
  width: number;
  height: number;
  cells: Cell[];
}

export interface Cell {
  char: string;
  style: CellStyle;
}

export interface CellStyle {
  foreground?: string;
  background?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

export interface FramePatch {
  width: number;
  height: number;
  changes: CellChange[];
}

export interface CellChange {
  x: number;
  y: number;
  cell: Cell;
}

export interface RenderOptions {
  viewport: {
    width: number;
    height: number;
  };
  isFocused?: (mounted: import("@bindtty/vnode").MountedNode) => boolean;
}

export interface TerminalRenderer {
  render(root: import("@bindtty/layout").LayoutNode | null, options: RenderOptions): string;
  reset(): void;
}
