const ELLIPSIS = "…";

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

  return text.slice(0, width - 1) + ELLIPSIS;
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

  return ELLIPSIS + text.slice(text.length - (width - 1));
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

  const available = width - 1;
  const left = Math.ceil(available / 2);
  const right = Math.floor(available / 2);

  return text.slice(0, left) + ELLIPSIS + text.slice(text.length - right);
}

function fits(text: string, width: number): boolean {
  return text.length <= Math.max(0, width);
}
