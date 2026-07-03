import { measureLineWidth } from "./width.js";

export function hardWrapLine(line: string, width: number): string[] {
  if (line === "") {
    return [""];
  }

  const chunks: string[] = [];

  for (let offset = 0; offset < line.length; offset += width) {
    chunks.push(line.slice(offset, offset + width));
  }

  return chunks;
}

export function wordWrapLine(line: string, width: number): string[] {
  if (line === "") {
    return [""];
  }

  const tokens = line.match(/\s+|\S+/g) ?? [];
  const lines: string[] = [];
  let current = "";

  for (const token of tokens) {
    const tokenWidth = measureLineWidth(token);
    const currentWidth = measureLineWidth(current);
    const isWhitespace = /^\s+$/.test(token);

    if (isWhitespace && current === "") {
      continue;
    }

    if (isWhitespace && currentWidth + tokenWidth > width) {
      lines.push(current.trimEnd());
      current = "";
      continue;
    }

    if (!isWhitespace && tokenWidth > width) {
      if (current !== "") {
        lines.push(current.trimEnd());
        current = "";
      }

      lines.push(...hardWrapLine(token, width));
      continue;
    }

    if (currentWidth + tokenWidth <= width) {
      current += token;
      continue;
    }

    if (current !== "") {
      lines.push(current.trimEnd());
    }
    current = token;
  }

  if (current !== "") {
    lines.push(current.trimEnd());
  }

  return lines.length > 0 ? lines : [""];
}
