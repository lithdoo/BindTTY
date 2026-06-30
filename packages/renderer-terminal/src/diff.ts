import type { Cell, CellStyle, Frame, FramePatch } from "./types.js";

export function diffFrames(previous: Frame | null, next: Frame): FramePatch {
  if (
    previous === null ||
    previous.width !== next.width ||
    previous.height !== next.height
  ) {
    return createFullFramePatch(next);
  }

  const changes: FramePatch["changes"] = [];

  for (let y = 0; y < next.height; y += 1) {
    for (let x = 0; x < next.width; x += 1) {
      const index = y * next.width + x;
      const previousCell = previous.cells[index];
      const nextCell = next.cells[index];

      if (nextCell && (!previousCell || !cellsEqual(previousCell, nextCell))) {
        changes.push({
          x,
          y,
          cell: cloneCell(nextCell)
        });
      }
    }
  }

  return {
    width: next.width,
    height: next.height,
    changes
  };
}

function createFullFramePatch(frame: Frame): FramePatch {
  const changes: FramePatch["changes"] = [];

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const cell = frame.cells[y * frame.width + x];

      if (cell) {
        changes.push({
          x,
          y,
          cell: cloneCell(cell)
        });
      }
    }
  }

  return {
    width: frame.width,
    height: frame.height,
    changes
  };
}

function cellsEqual(left: Cell, right: Cell): boolean {
  return left.char === right.char && stylesEqual(left.style, right.style);
}

function stylesEqual(left: CellStyle, right: CellStyle): boolean {
  return (
    left.foreground === right.foreground &&
    left.background === right.background &&
    normalizeBoolean(left.bold) === normalizeBoolean(right.bold) &&
    normalizeBoolean(left.dim) === normalizeBoolean(right.dim) &&
    normalizeBoolean(left.italic) === normalizeBoolean(right.italic) &&
    normalizeBoolean(left.underline) === normalizeBoolean(right.underline) &&
    normalizeBoolean(left.inverse) === normalizeBoolean(right.inverse)
  );
}

function normalizeBoolean(value: boolean | undefined): boolean {
  return value === true;
}

function cloneCell(cell: Cell): Cell {
  return {
    char: cell.char,
    style: { ...cell.style }
  };
}
