import type { LayoutNode, LayoutRect, LayoutViewport } from "@bindtty/layout";
import { layoutText, readTextWrapMode } from "@bindtty/text";
import type { MountedElementNode } from "@bindtty/vnode";
import { createFrame, getCell, setCell } from "./frame.js";
import { readPaintStyle, toBorderCellStyle, toCellStyle } from "./style.js";
import type { CellStyle, Frame } from "./types.js";

export interface PaintOptions {
  viewport: LayoutViewport;
  isFocused?: (mounted: LayoutNode["mounted"]) => boolean;
}

interface PaintContext {
  clip: LayoutRect;
  offsetX: number;
  offsetY: number;
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
    paintNode(frame, root, options, {
      clip: {
        x: 0,
        y: 0,
        width: options.viewport.width,
        height: options.viewport.height
      },
      offsetX: 0,
      offsetY: 0
    });
  }

  return frame;
}

function paintNode(
  frame: Frame,
  node: LayoutNode,
  options: PaintOptions,
  context: PaintContext
): void {
  const mounted = node.mounted;
  const childContext = createChildContext(node, context);

  if (mounted.kind !== "element") {
    paintChildren(frame, node, options, childContext);
    return;
  }

  switch (mounted.tag) {
    case "screen":
    case "vstack":
    case "hstack":
      paintChildren(frame, node, options, childContext);
      paintFocusedState(frame, node, options, context);
      return;
    case "box":
      paintBox(frame, node, mounted, context);
      paintChildren(frame, node, options, childContext);
      paintFocusedState(frame, node, options, context);
      return;
    case "text":
      paintText(frame, node, mounted, context);
      paintFocusedState(frame, node, options, context);
      return;
    case "spacer":
      paintFocusedState(frame, node, options, context);
      return;
    case "button":
    case "input":
      throw new Error(`Unsupported paint element: ${mounted.tag}`);
  }
}

function paintChildren(
  frame: Frame,
  node: LayoutNode,
  options: PaintOptions,
  context: PaintContext
): void {
  for (const child of node.children) {
    paintNode(frame, child, options, context);
  }
}

function paintText(
  frame: Frame,
  node: LayoutNode,
  mounted: MountedElementNode,
  context: PaintContext
): void {
  if (node.rect.width <= 0 || node.rect.height <= 0) {
    return;
  }

  const value = mounted.props.value;
  const text = value === null || value === undefined ? "" : String(value);
  const wrap = readTextWrapMode(mounted.props.wrap);
  const textLayout = layoutText(text, {
    width: node.rect.width,
    wrap
  });
  const lines = textLayout.lines.slice(0, node.rect.height);
  const style = toCellStyle(readPaintStyle(mounted.props));

  for (let row = 0; row < lines.length; row += 1) {
    writeTextClipped(
      frame,
      node.rect.x + context.offsetX,
      node.rect.y + row + context.offsetY,
      (lines[row] ?? "").slice(0, node.rect.width),
      style,
      context
    );
  }
}

function paintBox(
  frame: Frame,
  node: LayoutNode,
  mounted: MountedElementNode,
  context: PaintContext
): void {
  const style = readPaintStyle(mounted.props);

  if (style.background !== undefined) {
    fillRect(
      frame,
      offsetRect(node.rect, context),
      {
        background: style.background
      },
      context
    );
  }

  if (shouldPaintBorder(style.border)) {
    paintBorder(
      frame,
      offsetRect(node.rect, context),
      toBorderCellStyle(style),
      context
    );
  }
}

function fillRect(
  frame: Frame,
  rect: LayoutNode["rect"],
  style: CellStyle,
  context: PaintContext
): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      setCellClipped(frame, x, y, {
        char: " ",
        style
      }, context);
    }
  }
}

function paintBorder(
  frame: Frame,
  rect: LayoutRect,
  style: CellStyle,
  context: PaintContext
): void {
  const { x, y, width, height } = rect;

  if (width <= 0 || height <= 0) {
    return;
  }

  if (width === 1) {
    for (let row = y; row < y + height; row += 1) {
      paintChar(frame, x, row, BORDER.vertical, style, context);
    }
    return;
  }

  if (height === 1) {
    for (let col = x; col < x + width; col += 1) {
      paintChar(frame, col, y, BORDER.horizontal, style, context);
    }
    return;
  }

  paintChar(frame, x, y, BORDER.topLeft, style, context);
  paintChar(frame, x + width - 1, y, BORDER.topRight, style, context);
  paintChar(frame, x, y + height - 1, BORDER.bottomLeft, style, context);
  paintChar(frame, x + width - 1, y + height - 1, BORDER.bottomRight, style, context);

  for (let col = x + 1; col < x + width - 1; col += 1) {
    paintChar(frame, col, y, BORDER.horizontal, style, context);
    paintChar(frame, col, y + height - 1, BORDER.horizontal, style, context);
  }

  for (let row = y + 1; row < y + height - 1; row += 1) {
    paintChar(frame, x, row, BORDER.vertical, style, context);
    paintChar(frame, x + width - 1, row, BORDER.vertical, style, context);
  }
}

function paintChar(
  frame: Frame,
  x: number,
  y: number,
  char: string,
  style: CellStyle,
  context: PaintContext
): void {
  setCellClipped(frame, x, y, {
    char,
    style
  }, context);
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
  options: PaintOptions,
  context: PaintContext
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

  const { x, y, width, height } = offsetRect(node.rect, context);

  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      if (!isInsideRect(context.clip, col, row)) {
        continue;
      }

      const cell = getCell(frame, col, row);

      if (cell) {
        setCellClipped(frame, col, row, {
          char: cell.char,
          style: {
            ...cell.style,
            inverse: true
          }
        }, context);
      }
    }
  }
}

function writeTextClipped(
  frame: Frame,
  x: number,
  y: number,
  text: string,
  style: CellStyle,
  context: PaintContext
): number {
  let written = 0;

  for (let offset = 0; offset < text.length; offset += 1) {
    if (
      setCellClipped(frame, x + offset, y, {
        char: text[offset] ?? " ",
        style
      }, context)
    ) {
      written += 1;
    }
  }

  return written;
}

function setCellClipped(
  frame: Frame,
  x: number,
  y: number,
  cell: Parameters<typeof setCell>[3],
  context: PaintContext
): boolean {
  if (!isInsideRect(context.clip, x, y)) {
    return false;
  }

  return setCell(frame, x, y, cell);
}

function createChildContext(
  node: LayoutNode,
  context: PaintContext
): PaintContext {
  const nodeClip = node.clip ? offsetRect(node.clip, context) : context.clip;
  const clip = intersectRects(context.clip, nodeClip);

  return {
    clip,
    offsetX: context.offsetX - (node.scrollOffset?.x ?? 0),
    offsetY: context.offsetY - (node.scrollOffset?.y ?? 0)
  };
}

function offsetRect(rect: LayoutRect, context: PaintContext): LayoutRect {
  return {
    x: rect.x + context.offsetX,
    y: rect.y + context.offsetY,
    width: rect.width,
    height: rect.height
  };
}

function intersectRects(first: LayoutRect, second: LayoutRect): LayoutRect {
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y)
  };
}

function isInsideRect(rect: LayoutRect, x: number, y: number): boolean {
  return (
    x >= rect.x &&
    y >= rect.y &&
    x < rect.x + rect.width &&
    y < rect.y + rect.height
  );
}
