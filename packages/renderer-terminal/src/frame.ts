import type { Cell, CellStyle, Frame } from "./types.js";
import { segmentText } from "@bindtty/text";

export function createFrame(width: number, height: number): Frame {
  const normalizedWidth = toNonNegativeInteger(width);
  const normalizedHeight = toNonNegativeInteger(height);
  const cellCount = normalizedWidth * normalizedHeight;
  const cells: Cell[] = [];

  for (let index = 0; index < cellCount; index += 1) {
    cells.push(createBlankCell());
  }

  return {
    width: normalizedWidth,
    height: normalizedHeight,
    cells
  };
}

export function getCell(frame: Frame, x: number, y: number): Cell | undefined {
  if (!isInsideFrame(frame, x, y)) {
    return undefined;
  }

  return frame.cells[getCellIndex(frame, x, y)];
}

export function setCell(frame: Frame, x: number, y: number, cell: Cell): boolean {
  if (!isInsideFrame(frame, x, y)) {
    return false;
  }

  const clonedCell = cloneCell(cell);
  const width = clonedCell.width ?? 1;

  if (width > 1 && x + width > frame.width) {
    throw new Error("Invalid wide cell: cell width exceeds frame bounds");
  }

  frame.cells[getCellIndex(frame, x, y)] = clonedCell;
  return true;
}

export function writeText(
  frame: Frame,
  x: number,
  y: number,
  text: string,
  style: CellStyle = {}
): number {
  const firstLine = text.split("\n", 1)[0] ?? "";
  let written = 0;
  let cursorX = x;

  for (const segment of segmentText(firstLine)) {
    if (segment.width <= 0) {
      continue;
    }

    if (canDrawWholeSegment(frame, cursorX, y, segment.width)) {
      clearCellsForWrite(frame, cursorX, y, segment.width);
      setCell(frame, cursorX, y, {
        char: segment.text,
        style,
        width: segment.width
      });

      for (let offset = 1; offset < segment.width; offset += 1) {
        setCell(frame, cursorX + offset, y, createPlaceholderCell(style));
      }

      written += segment.width;
    }

    cursorX += segment.width;
  }

  return written;
}

export function frameToLines(frame: Frame): string[] {
  const lines: string[] = [];

  for (let y = 0; y < frame.height; y += 1) {
    let line = "";

    for (let x = 0; x < frame.width; x += 1) {
      const cell = getCell(frame, x, y);
      line += cell?.width === 0 ? "" : cell?.char ?? " ";
    }

    lines.push(line);
  }

  return lines;
}

export function frameToDebugLines(frame: Frame): string[] {
  const lines: string[] = [];

  for (let y = 0; y < frame.height; y += 1) {
    let line = "";

    for (let x = 0; x < frame.width; x += 1) {
      const cell = getCell(frame, x, y);
      line += cell?.width === 0 ? "·" : cell?.char ?? " ";
    }

    lines.push(line);
  }

  return lines;
}

export function createBlankCell(style: CellStyle = {}): Cell {
  return {
    char: " ",
    style: cloneStyle(style),
    width: 1
  };
}

export function createTextCell(
  text: string,
  width: 1 | 2,
  style: CellStyle = {}
): Cell {
  assertValidCell(text, width);

  return {
    char: text,
    style: cloneStyle(style),
    width
  };
}

export function createPlaceholderCell(style: CellStyle = {}): Cell {
  return {
    char: "",
    style: cloneStyle(style),
    width: 0
  };
}

export function isPlaceholderCell(cell: Cell): boolean {
  return cell.width === 0;
}

export function isWideLeadingCell(cell: Cell): boolean {
  return cell.width === 2;
}

function cloneCell(cell: Cell): Cell {
  const width = normalizeWidth(cell);
  const char = width === 0 ? cell.char : normalizeChar(cell.char);

  assertValidCell(char, width);

  return {
    char: width === 0 ? "" : char,
    style: cloneStyle(cell.style),
    width
  };
}

function cloneStyle(style: CellStyle): CellStyle {
  return { ...style };
}

function normalizeChar(char: string): string {
  return char.length > 0 ? char : " ";
}

function normalizeWidth(cell: Cell): 0 | 1 | 2 {
  if (cell.width === 0 || cell.width === 1 || cell.width === 2) {
    return cell.width;
  }

  return 1;
}

function assertValidCell(char: string, width: 0 | 1 | 2): void {
  if (width === 0) {
    if (char !== "") {
      throw new Error("Invalid placeholder cell: char must be empty");
    }

    return;
  }

  const segments = segmentText(char);

  if (segments.length !== 1) {
    throw new Error("Invalid text cell: char must be a single grapheme");
  }

  const [segment] = segments;

  if (!segment || segment.width !== width) {
    throw new Error(
      `Invalid text cell: char display width ${segment?.width ?? 0} does not match cell width ${width}`
    );
  }
}

function canDrawWholeSegment(
  frame: Frame,
  x: number,
  y: number,
  width: number
): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    y >= 0 &&
    y < frame.height &&
    x >= 0 &&
    x + width <= frame.width
  );
}

function clearCellsForWrite(
  frame: Frame,
  x: number,
  y: number,
  width: number
): void {
  for (let col = x; col < x + width; col += 1) {
    clearWideCellAt(frame, col, y);
  }
}

function clearWideCellAt(frame: Frame, x: number, y: number): void {
  const cell = getCell(frame, x, y);

  if (!cell) {
    return;
  }

  if (cell.width === 2) {
    setCell(frame, x, y, createBlankCell());
    setCell(frame, x + 1, y, createBlankCell());
    return;
  }

  if (cell.width === 0) {
    const leadingX = findWideLeadingCell(frame, x, y);

    if (leadingX !== null) {
      setCell(frame, leadingX, y, createBlankCell());
      setCell(frame, leadingX + 1, y, createBlankCell());
    }
  }
}

function findWideLeadingCell(frame: Frame, x: number, y: number): number | null {
  const previous = getCell(frame, x - 1, y);

  return previous?.width === 2 ? x - 1 : null;
}

function getCellIndex(frame: Frame, x: number, y: number): number {
  return y * frame.width + x;
}

function isInsideFrame(frame: Frame, x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < frame.width &&
    y < frame.height
  );
}

function toNonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
