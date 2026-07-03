import type { TextMeasure } from "./types.js";
import { measureTextWidth } from "./width.js";

const measureCache = new Map<string, TextMeasure>();

export function measureText(text: string): TextMeasure {
  const cached = measureCache.get(text);

  if (cached) {
    return cached;
  }

  const lines = text.split("\n");
  const width = lines.reduce(
    (maxWidth, line) => Math.max(maxWidth, measureTextWidth(line)),
    0
  );
  const measure = {
    width,
    height: text === "" ? 0 : lines.length
  };

  measureCache.set(text, measure);
  return measure;
}
