import { measureSegmentsWidth, segmentText } from "./segment.js";

const ELLIPSIS = "…";
const ELLIPSIS_WIDTH = measureTextWidthBySegments(ELLIPSIS);

export function truncateEnd(text: string, width: number): string {
  if (fits(text, width)) {
    return text;
  }

  if (width <= 0) {
    return "";
  }

  if (width === 1) {
    return ELLIPSIS;
  }

  return takeStartByWidth(text, width - ELLIPSIS_WIDTH) + ELLIPSIS;
}

export function truncateStart(text: string, width: number): string {
  if (fits(text, width)) {
    return text;
  }

  if (width <= 0) {
    return "";
  }

  if (width === 1) {
    return ELLIPSIS;
  }

  return ELLIPSIS + takeEndByWidth(text, width - ELLIPSIS_WIDTH);
}

export function truncateMiddle(text: string, width: number): string {
  if (fits(text, width)) {
    return text;
  }

  if (width <= 0) {
    return "";
  }

  if (width === 1) {
    return ELLIPSIS;
  }

  const available = width - ELLIPSIS_WIDTH;
  const left = Math.ceil(available / 2);
  const right = Math.floor(available / 2);

  return takeStartByWidth(text, left) + ELLIPSIS + takeEndByWidth(text, right);
}

function fits(text: string, width: number): boolean {
  return measureTextWidthBySegments(text) <= Math.max(0, width);
}

function takeStartByWidth(text: string, width: number): string {
  let output = "";
  let currentWidth = 0;

  for (const segment of segmentText(text)) {
    if (segment.width === 0) {
      output += segment.text;
      continue;
    }

    if (currentWidth + segment.width > width) {
      break;
    }

    output += segment.text;
    currentWidth += segment.width;
  }

  return output;
}

function takeEndByWidth(text: string, width: number): string {
  const segments = segmentText(text);
  const output: string[] = [];
  let currentWidth = 0;

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];

    if (!segment) {
      continue;
    }

    if (segment.width === 0) {
      output.unshift(segment.text);
      continue;
    }

    if (currentWidth + segment.width > width) {
      break;
    }

    output.unshift(segment.text);
    currentWidth += segment.width;
  }

  return output.join("");
}

function measureTextWidthBySegments(text: string): number {
  return measureSegmentsWidth(segmentText(text));
}
