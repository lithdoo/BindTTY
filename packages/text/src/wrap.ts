import { measureTextWidth } from "./width.js";
import { segmentText } from "./segment.js";

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

export function wordWrapLine(line: string, width: number): string[] {
  if (width <= 0) {
    return [];
  }

  if (line === "") {
    return [""];
  }

  const tokens = line.match(/\S+\s*/g) ?? [line];
  const lines: string[] = [];
  let current = "";

  for (const token of tokens) {
    if (measureTextWidth(token.trimEnd()) > width) {
      if (current !== "") {
        lines.push(trimTrailingSpaces(current));
        current = "";
      }

      lines.push(...hardWrapLine(token.trimEnd(), width));
      const trailingSpaces = token.match(/\s+$/)?.[0] ?? "";
      current = trailingSpaces.length > 0 ? trailingSpaces : "";
      continue;
    }

    if (
      current !== "" &&
      measureTextWidth(current + token.trimEnd()) > width
    ) {
      lines.push(trimTrailingSpaces(current));
      current = token;
      continue;
    }

    current += token;
  }

  if (current !== "" || lines.length === 0) {
    lines.push(trimTrailingSpaces(current));
  }

  return lines;
}

function trimTrailingSpaces(value: string): string {
  return value.replace(/\s+$/g, "");
}
