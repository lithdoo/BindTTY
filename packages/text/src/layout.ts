import { measureTextWidth } from "./width.js";
import {
  TEXT_WRAP_MODES,
  type TextLayout,
  type TextLayoutOptions,
  type TextWrapMode
} from "./types.js";
import {
  truncateEnd,
  truncateMiddle,
  truncateStart
} from "./truncate.js";
import { hardWrapLine, wordWrapLine } from "./wrap.js";

const layoutCache = new Map<string, TextLayout>();

export function layoutText(
  text: string,
  options: TextLayoutOptions = {}
): TextLayout {
  const wrap = normalizeWrapMode(options.wrap);
  const width = normalizeWidth(options.width);
  const cacheKey = `${text}\0${width ?? "auto"}\0${wrap}`;
  const cached = layoutCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const lines = createLines(text, wrap, width);
  const layout = {
    width: lines.reduce(
      (maxWidth, line) => Math.max(maxWidth, measureTextWidth(line)),
      0
    ),
    height: lines.length,
    lines
  };

  layoutCache.set(cacheKey, layout);
  return layout;
}

export function normalizeWrapMode(
  wrap: TextLayoutOptions["wrap"]
): TextWrapMode {
  if (wrap === null || wrap === undefined) {
    return "legacy";
  }

  if (isTextWrapMode(wrap)) {
    return wrap;
  }

  throw new Error(`Unsupported text wrap mode: ${String(wrap)}`);
}

export function readTextWrapMode(wrap: unknown): TextWrapMode {
  if (wrap === null || wrap === undefined) {
    return "legacy";
  }

  if (isTextWrapMode(wrap)) {
    return wrap;
  }

  throw new Error(`Unsupported text wrap mode: ${String(wrap)}`);
}

function isTextWrapMode(value: unknown): value is TextWrapMode {
  return (
    typeof value === "string" &&
    (TEXT_WRAP_MODES as readonly string[]).includes(value)
  );
}

function normalizeWidth(width: number | undefined): number | undefined {
  if (width === undefined || !Number.isFinite(width)) {
    return undefined;
  }

  return Math.max(0, Math.floor(width));
}

function createLines(
  text: string,
  wrap: TextWrapMode,
  width: number | undefined
): string[] {
  if (text === "" || width === 0) {
    return [];
  }

  switch (wrap) {
    case "legacy":
      return firstLine(text);
    case "none":
      return splitLines(text);
    case "wrap":
      return wrapLines(text, width, wordWrapLine);
    case "hard":
      return wrapLines(text, width, hardWrapLine);
    case "truncate-end":
      return truncateLines(text, width, truncateEnd);
    case "truncate-middle":
      return truncateLines(text, width, truncateMiddle);
    case "truncate-start":
      return truncateLines(text, width, truncateStart);
  }
}

function firstLine(text: string): string[] {
  const line = text.split("\n", 1)[0] ?? "";
  return line === "" ? [] : [line];
}

function splitLines(text: string): string[] {
  return text.split("\n");
}

function wrapLines(
  text: string,
  width: number | undefined,
  wrapLine: (line: string, width: number) => string[]
): string[] {
  if (width === undefined) {
    return splitLines(text);
  }

  return splitLines(text).flatMap((line) => wrapLine(line, width));
}

function truncateLines(
  text: string,
  width: number | undefined,
  truncate: (line: string, width: number) => string
): string[] {
  const lines = splitLines(text);

  if (width === undefined) {
    return lines;
  }

  return lines.map((line) => truncate(line, width));
}
