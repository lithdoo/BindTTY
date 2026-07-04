import { segmentText } from "./segment.js";

export function sliceTextByWidth(
  text: string,
  startColumn: number,
  endColumn: number
): string {
  const start = normalizeColumn(startColumn);
  const end = normalizeColumn(endColumn);

  if (end <= start || text === "") {
    return "";
  }

  let cursor = 0;
  let output = "";

  for (const segment of segmentText(text)) {
    const nextCursor = cursor + segment.width;

    if (
      segment.width > 0 &&
      cursor >= start &&
      nextCursor <= end
    ) {
      output += segment.text;
    }

    cursor = nextCursor;
  }

  return output;
}

function normalizeColumn(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}
