import { segmentText } from "@bindtty/text";

export interface TextareaSegment {
  text: string;
  width: 0 | 1 | 2;
  startOffset: number;
  endOffset: number;
}

export interface LogicalLine {
  index: number;
  startOffset: number;
  endOffset: number;
  segments: TextareaSegment[];
  hardBreak: boolean;
}

export interface VisualLine {
  logicalLine: number;
  startOffset: number;
  endOffset: number;
  segments: TextareaSegment[];
  width: number;
}

export interface TextareaLayout {
  value: string;
  width: number | null;
  segments: TextareaSegment[];
  logicalLines: LogicalLine[];
  visualLines: VisualLine[];
  boundaries: number[];
}

export interface TextareaCursor {
  offset: number;
  preferredColumn: number | null;
}

export interface VisualPosition {
  visualRow: number;
  column: number;
}

export interface CursorPosition {
  offset: number;
  column: number;
}

export interface BuildTextareaLayoutOptions {
  wrap?: "soft" | "off";
}

export function buildTextareaLayout(
  value: string,
  width: number | null,
  options: BuildTextareaLayoutOptions = {}
): TextareaLayout {
  const normalizedWidth = readEffectiveLayoutWidth(width);
  const wrap = options.wrap ?? "soft";
  const logicalLines = buildLogicalLines(value);
  const segments = logicalLines.flatMap((line) => line.segments);
  const visualLines = logicalLines.flatMap((line) =>
    wrap === "off" ? [visualLineFromSegments(line, line.segments)] : wrapLogicalLine(line, normalizedWidth)
  );
  const boundaries = buildBoundaries(value, segments);

  return {
    value,
    width: normalizedWidth,
    segments,
    logicalLines,
    visualLines,
    boundaries
  };
}

export function findCursorVisualPosition(
  layout: TextareaLayout,
  cursor: TextareaCursor
): VisualPosition {
  const offset = clampCursorOffset(layout, cursor.offset);
  const visualRow = findVisualRowForOffset(layout, offset);
  const line = layout.visualLines[visualRow] ?? createEmptyVisualLine();
  return {
    visualRow,
    column: measureSegmentsUntil(line.segments, offset)
  };
}

export function visualPositionToCursor(
  layout: TextareaLayout,
  visualRow: number,
  column: number
): CursorPosition {
  return resolveNearestCursorBoundary(layout, visualRow, column);
}

export function resolveNearestCursorBoundary(
  layout: TextareaLayout,
  visualRow: number,
  column: number
): CursorPosition {
  const line = layout.visualLines[clamp(visualRow, 0, Math.max(0, layout.visualLines.length - 1))];
  if (!line || line.segments.length === 0) {
    return {
      offset: line?.startOffset ?? 0,
      column: 0
    };
  }

  const targetColumn = Math.max(0, Math.floor(column));
  let currentColumn = 0;

  for (const segment of line.segments) {
    const nextColumn = currentColumn + segment.width;
    if (targetColumn <= currentColumn) {
      return { offset: segment.startOffset, column: currentColumn };
    }
    if (targetColumn < nextColumn) {
      const beforeDistance = targetColumn - currentColumn;
      const afterDistance = nextColumn - targetColumn;
      return beforeDistance < afterDistance
        ? { offset: segment.startOffset, column: currentColumn }
        : { offset: segment.endOffset, column: nextColumn };
    }
    currentColumn = nextColumn;
  }

  return {
    offset: line.endOffset,
    column: line.width
  };
}

export function clampScrollRow(
  scrollRow: number,
  _cursorRow: number,
  viewportRows: number,
  totalRows: number
): number {
  const maxScroll = Math.max(0, totalRows - Math.max(1, viewportRows));
  return clamp(scrollRow, 0, maxScroll);
}

export function ensureCursorVisible(
  scrollRow: number,
  cursorRow: number,
  viewportRows: number,
  totalRows = Number.MAX_SAFE_INTEGER
): number {
  const viewport = Math.max(1, viewportRows);
  let nextScroll = scrollRow;

  if (cursorRow < nextScroll) {
    nextScroll = cursorRow;
  } else if (cursorRow >= nextScroll + viewport) {
    nextScroll = cursorRow - viewport + 1;
  }

  return clampScrollRow(nextScroll, cursorRow, viewport, totalRows);
}

export function clampCursorOffset(layout: TextareaLayout, offset: number): number {
  if (layout.boundaries.includes(offset)) {
    return offset;
  }

  let nearest = layout.boundaries[0] ?? 0;
  let nearestDistance = Math.abs(offset - nearest);

  for (const boundary of layout.boundaries) {
    const distance = Math.abs(offset - boundary);
    if (distance < nearestDistance) {
      nearest = boundary;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function findLogicalLineForOffset(layout: TextareaLayout, offset: number): LogicalLine {
  const normalized = clampCursorOffset(layout, offset);
  return layout.logicalLines.find((line) =>
    normalized >= line.startOffset && normalized <= line.endOffset
  ) ?? layout.logicalLines[layout.logicalLines.length - 1] ?? {
    index: 0,
    startOffset: 0,
    endOffset: 0,
    segments: [],
    hardBreak: false
  };
}

export function findVisualRowForOffset(layout: TextareaLayout, offset: number): number {
  const normalized = clampCursorOffset(layout, offset);
  const row = layout.visualLines.findIndex((line, index) => {
    const isLast = index === layout.visualLines.length - 1;
    return normalized >= line.startOffset && (normalized < line.endOffset || normalized === line.endOffset || isLast);
  });

  return row >= 0 ? row : Math.max(0, layout.visualLines.length - 1);
}

export function measureLineColumnToOffset(layout: TextareaLayout, line: LogicalLine, offset: number): number {
  const lineSegments = line.segments;
  return measureSegmentsUntil(lineSegments, clamp(offset, line.startOffset, line.endOffset));
}

export function visualLineText(line: VisualLine): string {
  return line.segments.map((segment) => segment.text).join("");
}

function buildLogicalLines(value: string): LogicalLine[] {
  const lines: LogicalLine[] = [];
  let offset = 0;
  const rawLines = value.split("\n");

  for (let index = 0; index < rawLines.length; index += 1) {
    const text = rawLines[index] ?? "";
    const startOffset = offset;
    const segments = segmentText(text).map((segment) => {
      const start = offset;
      offset += segment.text.length;
      return {
        text: segment.text,
        width: segment.width,
        startOffset: start,
        endOffset: offset
      };
    });
    const endOffset = offset;
    const hardBreak = index < rawLines.length - 1;
    lines.push({
      index,
      startOffset,
      endOffset,
      segments,
      hardBreak
    });
    if (hardBreak) {
      offset += 1;
    }
  }

  if (lines.length === 0) {
    lines.push({
      index: 0,
      startOffset: 0,
      endOffset: 0,
      segments: [],
      hardBreak: false
    });
  }

  return lines;
}

function wrapLogicalLine(line: LogicalLine, width: number | null): VisualLine[] {
  if (line.segments.length === 0) {
    return [visualLineFromSegments(line, [])];
  }

  if (width === null || width <= 0) {
    return [visualLineFromSegments(line, line.segments)];
  }

  const lines: TextareaSegment[][] = [];
  let current: TextareaSegment[] = [];
  let currentWidth = 0;

  for (const segment of line.segments) {
    if (segment.width > 0 && current.length > 0 && currentWidth + segment.width > width) {
      lines.push(current);
      current = [];
      currentWidth = 0;
    }

    current.push(segment);
    currentWidth += segment.width;
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines.map((segments) => visualLineFromSegments(line, segments));
}

function visualLineFromSegments(line: LogicalLine, segments: TextareaSegment[]): VisualLine {
  return {
    logicalLine: line.index,
    startOffset: segments[0]?.startOffset ?? line.startOffset,
    endOffset: segments[segments.length - 1]?.endOffset ?? line.startOffset,
    segments,
    width: segments.reduce((sum, segment) => sum + segment.width, 0)
  };
}

function buildBoundaries(value: string, segments: TextareaSegment[]): number[] {
  const boundaries = new Set<number>([0, value.length]);

  for (const segment of segments) {
    boundaries.add(segment.startOffset);
    boundaries.add(segment.endOffset);
  }

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\n") {
      boundaries.add(index);
      boundaries.add(index + 1);
    }
  }

  return [...boundaries].sort((left, right) => left - right);
}

function measureSegmentsUntil(segments: TextareaSegment[], offset: number): number {
  let width = 0;

  for (const segment of segments) {
    if (offset <= segment.startOffset) {
      return width;
    }
    if (offset >= segment.endOffset) {
      width += segment.width;
      continue;
    }
    return width;
  }

  return width;
}

/**
 * Soft-wrap width from layout.
 * - `null`: width unknown (before first onLayout); do not wrap.
 * - `0`: invalid/zero content width; do not wrap, but later positive layout must correct it.
 * - `>= 1`: effective wrap width.
 */
export function readEffectiveLayoutWidth(width: number | null): number | null {
  return normalizeWidth(width);
}

function normalizeWidth(width: number | null): number | null {
  if (width === null || !Number.isFinite(width)) {
    return null;
  }
  return Math.max(0, Math.floor(width));
}

function createEmptyVisualLine(): VisualLine {
  return {
    logicalLine: 0,
    startOffset: 0,
    endOffset: 0,
    segments: [],
    width: 0
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}
