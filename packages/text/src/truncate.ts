const ELLIPSIS = "...";

export function truncateLineEnd(line: string, width: number): string {
  if (line.length <= width) {
    return line;
  }

  if (width <= ELLIPSIS.length) {
    return ELLIPSIS.slice(0, width);
  }

  return `${line.slice(0, width - ELLIPSIS.length)}${ELLIPSIS}`;
}

export function truncateLineStart(line: string, width: number): string {
  if (line.length <= width) {
    return line;
  }

  if (width <= ELLIPSIS.length) {
    return ELLIPSIS.slice(0, width);
  }

  return `${ELLIPSIS}${line.slice(line.length - (width - ELLIPSIS.length))}`;
}

export function truncateLineMiddle(line: string, width: number): string {
  if (line.length <= width) {
    return line;
  }

  if (width <= ELLIPSIS.length) {
    return ELLIPSIS.slice(0, width);
  }

  const remaining = width - ELLIPSIS.length;
  const before = Math.ceil(remaining / 2);
  const after = Math.floor(remaining / 2);

  return `${line.slice(0, before)}${ELLIPSIS}${line.slice(line.length - after)}`;
}
