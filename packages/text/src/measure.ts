import { splitExplicitLines } from "./lines.js";
import type { TextMeasure } from "./types.js";
import { measureLineWidth, measureTextWidth } from "./width.js";

const measureCache = new Map<string, TextMeasure>();

export function measureText(text: string): TextMeasure {
  const cached = measureCache.get(text);

  if (cached) {
    return cached;
  }

  const lines = splitExplicitLines(text);
  const measure = {
    width: measureTextWidth(text),
    height: lines.length
  };

  measureCache.set(text, measure);
  return measure;
}

export function measureLines(lines: string[]): TextMeasure {
  let width = 0;

  for (const line of lines) {
    width = Math.max(width, measureLineWidth(line));
  }

  return {
    width,
    height: lines.length
  };
}

export { measureTextWidth };
