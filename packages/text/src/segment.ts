import stringWidth from "string-width";
import type { TextSegment } from "./types.js";

interface SegmenterLike {
  segment(text: string): Iterable<{ segment: string }>;
}

interface SegmenterConstructorLike {
  new (locale: string, options: { granularity: "grapheme" }): SegmenterLike;
}

export function segmentText(text: string): TextSegment[] {
  if (text === "") {
    return [];
  }

  return splitGraphemes(text).map((segment) => ({
    text: segment,
    width: normalizeSegmentWidth(stringWidth(segment))
  }));
}

export function measureSegmentsWidth(segments: readonly TextSegment[]): number {
  return segments.reduce((width, segment) => width + segment.width, 0);
}

function splitGraphemes(text: string): string[] {
  const Segmenter = readSegmenter();

  if (Segmenter) {
    return Array.from(
      new Segmenter("en", { granularity: "grapheme" }).segment(text),
      (part) => part.segment
    );
  }

  return Array.from(text);
}

function readSegmenter(): SegmenterConstructorLike | null {
  const segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructorLike })
    .Segmenter;

  return typeof segmenter === "function" ? segmenter : null;
}

function normalizeSegmentWidth(width: number): 0 | 1 | 2 {
  if (!Number.isFinite(width) || width <= 0) {
    return 0;
  }

  if (width >= 2) {
    return 2;
  }

  return 1;
}
