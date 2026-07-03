import { firstExplicitLine, splitExplicitLines } from "./lines.js";
import { measureLines } from "./measure.js";
import {
  truncateLineEnd,
  truncateLineMiddle,
  truncateLineStart
} from "./truncate.js";
import type { TextLayout, TextLayoutOptions, TextWrapMode } from "./types.js";
import { hardWrapLine, wordWrapLine } from "./wrap.js";

const layoutCache = new Map<string, TextLayout>();

export function layoutText(
  text: string,
  options: TextLayoutOptions = {}
): TextLayout {
  const wrap = options.wrap ?? "legacy";
  const width = normalizeWidth(options.width);
  const cacheKey = `${text}\0${width ?? ""}\0${wrap}`;
  const cached = layoutCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const lines = layoutTextLines(text, wrap, width);
  const measure = measureLines(lines);
  const layout = {
    width: measure.width,
    height: measure.height,
    lines
  };

  layoutCache.set(cacheKey, layout);
  return layout;
}

function layoutTextLines(
  text: string,
  wrap: TextWrapMode,
  width: number | undefined
): string[] {
  if (width !== undefined && width <= 0) {
    return [];
  }

  if (wrap === "legacy") {
    const firstLine = firstExplicitLine(text);
    return firstLine === "" ? [] : [firstLine];
  }

  const explicitLines = splitExplicitLines(text);

  if (width === undefined || wrap === "none") {
    return explicitLines;
  }

  const lines: string[] = [];

  for (const line of explicitLines) {
    lines.push(...layoutLine(line, wrap, width));
  }

  return lines;
}

function layoutLine(line: string, wrap: TextWrapMode, width: number): string[] {
  switch (wrap) {
    case "wrap":
      return wordWrapLine(line, width);
    case "hard":
      return hardWrapLine(line, width);
    case "truncate-end":
      return [truncateLineEnd(line, width)];
    case "truncate-middle":
      return [truncateLineMiddle(line, width)];
    case "truncate-start":
      return [truncateLineStart(line, width)];
    case "legacy":
    case "none":
      return [line];
  }
}

function normalizeWidth(width: number | undefined): number | undefined {
  if (width === undefined || !Number.isFinite(width)) {
    return undefined;
  }

  return Math.max(0, Math.floor(width));
}
