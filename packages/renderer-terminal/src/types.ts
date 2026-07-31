export interface Frame {
  width: number;
  height: number;
  cells: Cell[];
}

export interface Cell {
  char: string;
  style: CellStyle;
  width?: 0 | 1 | 2;
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
  kind: "full" | "incremental";
  width: number;
  height: number;
  changes: CellChange[];
  /** Internal producer hint; omitted public patches retain defensive sorting. */
  ordered?: boolean;
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
  prepare(
    root: import("@bindtty/layout").LayoutNode | null,
    options: RenderOptions,
    resetBaseline?: boolean
  ): PreparedTerminalRender;
  reset(): void;
}

export interface PreparedTerminalRender {
  readonly patch: string;
  commit(): void;
}
