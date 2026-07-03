export function measureTextWidth(text: string): number {
  let width = 0;
  let currentWidth = 0;

  for (const char of text) {
    if (char === "\n") {
      width = Math.max(width, currentWidth);
      currentWidth = 0;
      continue;
    }

    currentWidth += measureCharWidth(char);
  }

  return Math.max(width, currentWidth);
}

export function measureLineWidth(line: string): number {
  let width = 0;

  for (const char of line) {
    width += measureCharWidth(char);
  }

  return width;
}

// MVP is ASCII-first. Non-ASCII is treated as one cell until Frame supports
// grapheme/wide-cell representation.
function measureCharWidth(_char: string): number {
  return 1;
}
