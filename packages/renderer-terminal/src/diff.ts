import type { Cell, CellStyle, Frame, FramePatch } from "./types.js";

export function diffFrames(previous: Frame | null, next: Frame): FramePatch {
  if (
    previous === null ||
    previous.width !== next.width ||
    previous.height !== next.height
  ) {
    return createFullFramePatch(next);
  }

  const dirtyCells = new Set<string>();

  for (let y = 0; y < next.height; y += 1) {
    for (let x = 0; x < next.width; x += 1) {
      const index = y * next.width + x;
      const previousCell = previous.cells[index];
      const nextCell = next.cells[index];

      if (nextCell && (!previousCell || !cellsEqual(previousCell, nextCell))) {
        markChangedCell(dirtyCells, previous, next, x, y);
      }
    }
  }
  const dirtyCoordinates = Array.from(dirtyCells)
    .map(parseCellKey)
    .sort((left, right) => left.y - right.y || left.x - right.x);

  if (!hasVisibleChange(dirtyCoordinates, previous, next)) {
    return {
      width: next.width,
      height: next.height,
      changes: []
    };
  }

  const changes = dirtyCoordinates
    .flatMap(({ x, y }) => {
      const cell = next.cells[y * next.width + x];

      return cell
        ? [{
            x,
            y,
            cell: cloneCell(cell)
          }]
        : [];
    });

  return {
    width: next.width,
    height: next.height,
    changes
  };
}

function hasVisibleChange(
  coordinates: Array<{ x: number; y: number }>,
  previous: Frame,
  next: Frame
): boolean {
  return coordinates.some(({ x, y }) => {
    const index = y * next.width + x;
    const nextCell = next.cells[index];
    const previousCell = previous.cells[index];

    return (
      nextCell !== undefined &&
      normalizeWidth(nextCell) !== 0 &&
      (!previousCell || !cellsEqual(previousCell, nextCell))
    );
  });
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

function markChangedCell(
  dirtyCells: Set<string>,
  previous: Frame,
  next: Frame,
  x: number,
  y: number
): void {
  mark(dirtyCells, next, x, y);
  markWideRange(dirtyCells, previous, x, y);
  markWideRange(dirtyCells, next, x, y);
}

function markWideRange(
  dirtyCells: Set<string>,
  frame: Frame,
  x: number,
  y: number
): void {
  const cell = frame.cells[y * frame.width + x];

  if (!cell) {
    return;
  }

  if (cell.width === 2) {
    mark(dirtyCells, frame, x, y);
    mark(dirtyCells, frame, x + 1, y);
    return;
  }

  if (cell.width === 0) {
    mark(dirtyCells, frame, x - 1, y);
    mark(dirtyCells, frame, x, y);
  }
}

function mark(dirtyCells: Set<string>, frame: Frame, x: number, y: number): void {
  if (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < frame.width &&
    y < frame.height
  ) {
    dirtyCells.add(`${y}:${x}`);
  }
}

function parseCellKey(key: string): { x: number; y: number } {
  const [y, x] = key.split(":").map(Number);

  return {
    x: x ?? 0,
    y: y ?? 0
  };
}

function cellsEqual(left: Cell, right: Cell): boolean {
  return (
    left.char === right.char &&
    normalizeWidth(left) === normalizeWidth(right) &&
    stylesEqual(left.style, right.style)
  );
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
    style: { ...cell.style },
    width: normalizeWidth(cell)
  };
}

function normalizeWidth(cell: Cell): 0 | 1 | 2 {
  return cell.width === 0 || cell.width === 1 || cell.width === 2
    ? cell.width
    : 1;
}
