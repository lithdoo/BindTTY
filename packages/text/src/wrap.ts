import { segmentText } from "./segment.js";
import type { TextSegment } from "./types.js";

export function hardWrapLine(line: string, width: number): string[] {
  if (width <= 0 || line === "") {
    return line === "" ? [""] : [];
  }

  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const segment of segmentText(line)) {
    if (segment.width === 0) {
      current += segment.text;
      continue;
    }

    if (current !== "" && currentWidth + segment.width > width) {
      lines.push(current);
      current = "";
      currentWidth = 0;
    }

    if (segment.width > width) {
      if (current !== "") {
        lines.push(current);
        current = "";
        currentWidth = 0;
      }

      lines.push(segment.text);
      continue;
    }

    current += segment.text;
    currentWidth += segment.width;
  }

  if (current !== "" || lines.length === 0) {
    lines.push(current);
  }

  return lines;
}

type SegmentKind = "space" | "cjkOrWide" | "latinish" | "zero";

/**
 * Word-aware wrap: prefer breaks at whitespace, then at Latin↔CJK/wide
 * script boundaries, then between CJK/wide graphemes. Overlong Latin runs
 * fall back to hardWrapLine. Never splits a grapheme.
 */
export function wordWrapLine(line: string, width: number): string[] {
  if (width <= 0) {
    return [];
  }

  if (line === "") {
    return [""];
  }

  const segments = segmentText(line);
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  let lastContentKind: "cjkOrWide" | "latinish" | null = null;

  const flush = (): void => {
    const trimmed = trimTrailingSpaces(current);
    // Drop space-only soft-wrap remnants so leading spaces after a break
    // do not create blank visual lines (e.g. "hello  world").
    if (trimmed !== "") {
      lines.push(trimmed);
    }
    current = "";
    currentWidth = 0;
    lastContentKind = null;
  };

  let index = 0;
  while (index < segments.length) {
    const segment = segments[index]!;
    const kind = classifySegment(segment);

    if (kind === "zero") {
      current += segment.text;
      index += 1;
      continue;
    }

    if (kind === "space") {
      // After a soft wrap, collapse continuation spaces so "hello  world"
      // does not start the next visual line with indent. Preserve true
      // leading indent when nothing has been emitted yet ("  abc").
      if (current === "" && lines.length > 0) {
        index += 1;
        continue;
      }

      if (current !== "" && currentWidth + segment.width > width) {
        flush();
        // Soft wrap at whitespace: do not carry the breaking space to the next line.
        index += 1;
        continue;
      }

      if (current === "" && segment.width > width) {
        index += 1;
        continue;
      }

      if (currentWidth + segment.width > width) {
        flush();
        index += 1;
        continue;
      }

      current += segment.text;
      currentWidth += segment.width;
      index += 1;
      continue;
    }

    const run = takeRun(segments, index, kind);
    const runText = run.map((part) => part.text).join("");
    const runWidth = run.reduce((sum, part) => sum + part.width, 0);

    if (
      lastContentKind !== null &&
      lastContentKind !== kind &&
      currentWidth > 0 &&
      currentWidth + runWidth > width
    ) {
      flush();
    }

    if (kind === "latinish" && runWidth > width) {
      if (current !== "") {
        flush();
      }
      lines.push(...hardWrapLine(runText, width));
      index += run.length;
      continue;
    }

    if (kind === "cjkOrWide") {
      for (const part of run) {
        if (part.width === 0) {
          current += part.text;
          continue;
        }

        if (current !== "" && currentWidth + part.width > width) {
          flush();
        }

        if (part.width > width) {
          if (current !== "") {
            flush();
          }
          lines.push(part.text);
          lastContentKind = "cjkOrWide";
          continue;
        }

        current += part.text;
        currentWidth += part.width;
        lastContentKind = "cjkOrWide";
      }
      index += run.length;
      continue;
    }

    // latinish run that fits in `width` (possibly after a script-boundary flush)
    if (current !== "" && currentWidth + runWidth > width) {
      if (lastContentKind === null) {
        // Leading spaces: pack Latin graphemes into the remaining columns
        // instead of discarding the indent on flush.
        for (const part of run) {
          if (part.width === 0) {
            current += part.text;
            continue;
          }

          if (current !== "" && currentWidth + part.width > width) {
            flush();
          }

          if (part.width > width) {
            if (current !== "") {
              flush();
            }
            lines.push(...hardWrapLine(part.text, width));
            continue;
          }

          current += part.text;
          currentWidth += part.width;
          lastContentKind = "latinish";
        }
        index += run.length;
        continue;
      }

      flush();
    }

    if (runWidth > width) {
      if (current !== "") {
        flush();
      }
      lines.push(...hardWrapLine(runText, width));
      index += run.length;
      continue;
    }

    current += runText;
    currentWidth += runWidth;
    lastContentKind = "latinish";
    index += run.length;
  }

  if (current !== "" || lines.length === 0) {
    lines.push(trimTrailingSpaces(current));
  }

  return lines;
}

function classifySegment(segment: TextSegment): SegmentKind {
  if (segment.width === 0) {
    return /^\s+$/u.test(segment.text) ? "space" : "zero";
  }

  if (/^\s+$/u.test(segment.text)) {
    return "space";
  }

  if (segment.width === 2 || isCjkOrFullwidthText(segment.text)) {
    return "cjkOrWide";
  }

  return "latinish";
}

function isCjkOrFullwidthText(text: string): boolean {
  for (const codePoint of text) {
    const value = codePoint.codePointAt(0);
    if (value === undefined) {
      continue;
    }
    if (isCjkOrFullwidthCodePoint(value)) {
      return true;
    }
  }
  return false;
}

function isCjkOrFullwidthCodePoint(value: number): boolean {
  return (
    (value >= 0x1100 && value <= 0x11ff) || // Hangul Jamo
    (value >= 0x2e80 && value <= 0x9fff) || // CJK radicals .. CJK unified
    (value >= 0xac00 && value <= 0xd7af) || // Hangul syllables
    (value >= 0xf900 && value <= 0xfaff) || // CJK compatibility ideographs
    (value >= 0xfe10 && value <= 0xfe1f) || // vertical forms
    (value >= 0xfe30 && value <= 0xfe4f) || // CJK compatibility forms
    (value >= 0xff00 && value <= 0xffef) || // halfwidth/fullwidth forms
    (value >= 0x20000 && value <= 0x2fa1f) // CJK ext B ..
  );
}

function takeRun(
  segments: readonly TextSegment[],
  start: number,
  kind: "cjkOrWide" | "latinish"
): TextSegment[] {
  const run: TextSegment[] = [];

  for (let index = start; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const segmentKind = classifySegment(segment);
    if (segmentKind === "zero") {
      run.push(segment);
      continue;
    }
    if (segmentKind !== kind) {
      break;
    }
    run.push(segment);
  }

  return run;
}

function trimTrailingSpaces(value: string): string {
  return value.replace(/\s+$/g, "");
}
