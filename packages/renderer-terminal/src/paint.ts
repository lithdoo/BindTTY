import type { LayoutNode, LayoutViewport } from "@bindtty/layout";
import type { MountedElementNode } from "@bindtty/vnode";
import { createFrame, getCell, setCell, writeText } from "./frame.js";
import { readPaintStyle, toBorderCellStyle, toCellStyle } from "./style.js";
import type { CellStyle, Frame } from "./types.js";

export interface PaintOptions {
  viewport: LayoutViewport;
  isFocused?: (mounted: LayoutNode["mounted"]) => boolean;
}

const BORDER = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│"
} as const;

export function paintLayout(
  root: LayoutNode | null,
  options: PaintOptions
): Frame {
  const frame = createFrame(options.viewport.width, options.viewport.height);

  if (root) {
    paintNode(frame, root, options);
  }

  return frame;
}

function paintNode(frame: Frame, node: LayoutNode, options: PaintOptions): void {
  const mounted = node.mounted;

  if (mounted.kind !== "element") {
    paintChildren(frame, node, options);
    return;
  }

  switch (mounted.tag) {
    case "screen":
    case "vstack":
    case "hstack":
      paintChildren(frame, node, options);
      paintFocusedState(frame, node, options);
      return;
    case "box":
      paintBox(frame, node, mounted);
      paintChildren(frame, node, options);
      paintFocusedState(frame, node, options);
      return;
    case "text":
      paintText(frame, node, mounted);
      paintFocusedState(frame, node, options);
      return;
    case "spacer":
      paintFocusedState(frame, node, options);
      return;
    case "button":
    case "input":
      throw new Error(`Unsupported paint element: ${mounted.tag}`);
  }
}

function paintChildren(
  frame: Frame,
  node: LayoutNode,
  options: PaintOptions
): void {
  for (const child of node.children) {
    paintNode(frame, child, options);
  }
}

function paintText(
  frame: Frame,
  node: LayoutNode,
  mounted: MountedElementNode
): void {
  if (node.rect.width <= 0 || node.rect.height <= 0) {
    return;
  }

  const value = mounted.props.value;
  const text = value === null || value === undefined ? "" : String(value);
  const clippedText = text.split("\n", 1)[0]?.slice(0, node.rect.width) ?? "";

  writeText(
    frame,
    node.rect.x,
    node.rect.y,
    clippedText,
    toCellStyle(readPaintStyle(mounted.props))
  );
}

function paintBox(
  frame: Frame,
  node: LayoutNode,
  mounted: MountedElementNode
): void {
  const style = readPaintStyle(mounted.props);

  if (style.background !== undefined) {
    fillRect(frame, node.rect, {
      background: style.background
    });
  }

  if (shouldPaintBorder(style.border)) {
    paintBorder(frame, node, toBorderCellStyle(style));
  }
}

function fillRect(
  frame: Frame,
  rect: LayoutNode["rect"],
  style: CellStyle
): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      setCell(frame, x, y, {
        char: " ",
        style
      });
    }
  }
}

function paintBorder(frame: Frame, node: LayoutNode, style: CellStyle): void {
  const { x, y, width, height } = node.rect;

  if (width <= 0 || height <= 0) {
    return;
  }

  if (width === 1) {
    for (let row = y; row < y + height; row += 1) {
      paintChar(frame, x, row, BORDER.vertical, style);
    }
    return;
  }

  if (height === 1) {
    for (let col = x; col < x + width; col += 1) {
      paintChar(frame, col, y, BORDER.horizontal, style);
    }
    return;
  }

  paintChar(frame, x, y, BORDER.topLeft, style);
  paintChar(frame, x + width - 1, y, BORDER.topRight, style);
  paintChar(frame, x, y + height - 1, BORDER.bottomLeft, style);
  paintChar(frame, x + width - 1, y + height - 1, BORDER.bottomRight, style);

  for (let col = x + 1; col < x + width - 1; col += 1) {
    paintChar(frame, col, y, BORDER.horizontal, style);
    paintChar(frame, col, y + height - 1, BORDER.horizontal, style);
  }

  for (let row = y + 1; row < y + height - 1; row += 1) {
    paintChar(frame, x, row, BORDER.vertical, style);
    paintChar(frame, x + width - 1, row, BORDER.vertical, style);
  }
}

function paintChar(
  frame: Frame,
  x: number,
  y: number,
  char: string,
  style: CellStyle
): void {
  setCell(frame, x, y, {
    char,
    style
  });
}

function shouldPaintBorder(border: boolean | number | undefined): boolean {
  if (typeof border === "number") {
    return border > 0;
  }

  return border === true;
}

function paintFocusedState(
  frame: Frame,
  node: LayoutNode,
  options: PaintOptions
): void {
  if (options.isFocused?.(node.mounted) !== true) {
    return;
  }

  if (
    node.mounted.kind === "element" &&
    readPaintStyle(node.mounted.props).focusStyle === "none"
  ) {
    return;
  }

  const { x, y, width, height } = node.rect;

  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      const cell = getCell(frame, col, row);

      if (cell) {
        setCell(frame, col, row, {
          char: cell.char,
          style: {
            ...cell.style,
            inverse: true
          }
        });
      }
    }
  }
}
