import type { Cell, CellStyle, Frame } from "./types.js";

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

  frame.cells[getCellIndex(frame, x, y)] = cloneCell(cell);
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

  for (let offset = 0; offset < firstLine.length; offset += 1) {
    if (
      setCell(frame, x + offset, y, {
        char: firstLine[offset] ?? " ",
        style
      })
    ) {
      written += 1;
    }
  }

  return written;
}

export function frameToLines(frame: Frame): string[] {
  const lines: string[] = [];

  for (let y = 0; y < frame.height; y += 1) {
    let line = "";

    for (let x = 0; x < frame.width; x += 1) {
      line += getCell(frame, x, y)?.char ?? " ";
    }

    lines.push(line);
  }

  return lines;
}

function createBlankCell(): Cell {
  return {
    char: " ",
    style: {}
  };
}

function cloneCell(cell: Cell): Cell {
  return {
    char: normalizeChar(cell.char),
    style: cloneStyle(cell.style)
  };
}

function cloneStyle(style: CellStyle): CellStyle {
  return { ...style };
}

function normalizeChar(char: string): string {
  return char.length > 0 ? char[0] ?? " " : " ";
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
