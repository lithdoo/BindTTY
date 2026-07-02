import type { CellStyle } from "./types.js";

const kebabStyleAliases = new Map<string, string>([
  ["border-color", "borderColor"]
]);

export interface PaintStyle extends CellStyle {
  border?: boolean | number;
  borderColor?: string;
  focusStyle?: "inverse" | "none";
}

export function readPaintStyle(props: Record<string, unknown>): PaintStyle {
  const normalized = normalizePaintProps(props);
  const style: PaintStyle = {};
  const color = readString(normalized, "color");
  const foreground = readString(normalized, "foreground");

  if (color !== undefined && foreground !== undefined) {
    throw new Error("Duplicate paint prop: foreground / color");
  }

  if (color !== undefined) {
    style.foreground = color;
  }

  if (foreground !== undefined) {
    style.foreground = foreground;
  }

  setStringStyle(style, normalized, "background");
  setStringStyle(style, normalized, "borderColor");
  setBooleanStyle(style, normalized, "bold");
  setBooleanStyle(style, normalized, "dim");
  setBooleanStyle(style, normalized, "italic");
  setBooleanStyle(style, normalized, "underline");
  setBooleanStyle(style, normalized, "inverse");

  const focusStyle = normalized.focusStyle;
  if (focusStyle === "inverse" || focusStyle === "none") {
    style.focusStyle = focusStyle;
  }

  const border = normalized.border;
  if (typeof border === "boolean" || typeof border === "number") {
    style.border = border;
  }

  return style;
}

export function toCellStyle(style: PaintStyle): CellStyle {
  const cellStyle: CellStyle = {};

  setDefinedString(cellStyle, "foreground", style.foreground);
  setDefinedString(cellStyle, "background", style.background);
  setTrueBoolean(cellStyle, "bold", style.bold);
  setTrueBoolean(cellStyle, "dim", style.dim);
  setTrueBoolean(cellStyle, "italic", style.italic);
  setTrueBoolean(cellStyle, "underline", style.underline);
  setTrueBoolean(cellStyle, "inverse", style.inverse);

  return cellStyle;
}

export function toBorderCellStyle(style: PaintStyle): CellStyle {
  return {
    ...toCellStyle(style),
    ...(style.borderColor === undefined ? {} : { foreground: style.borderColor })
  };
}

function normalizePaintProps(props: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(props)) {
    const canonicalName = kebabStyleAliases.get(name) ?? name;

    if (canonicalName in normalized && canonicalName !== name) {
      throw new Error(`Duplicate paint prop: ${canonicalName} / ${name}`);
    }

    normalized[canonicalName] = value;
  }

  return normalized;
}

function readString(
  props: Record<string, unknown>,
  name: string
): string | undefined {
  const value = props[name];
  return typeof value === "string" ? value : undefined;
}

function setStringStyle<T extends keyof PaintStyle>(
  style: PaintStyle,
  props: Record<string, unknown>,
  name: T
): void {
  const value = readString(props, name);

  if (value !== undefined) {
    style[name] = value as PaintStyle[T];
  }
}

function setBooleanStyle<T extends keyof CellStyle>(
  style: CellStyle,
  props: Record<string, unknown>,
  name: T
): void {
  if (props[name] === true) {
    style[name] = true as CellStyle[T];
  }
}

function setDefinedString<T extends keyof CellStyle>(
  style: CellStyle,
  name: T,
  value: string | undefined
): void {
  if (value !== undefined) {
    style[name] = value as CellStyle[T];
  }
}

function setTrueBoolean<T extends keyof CellStyle>(
  style: CellStyle,
  name: T,
  value: boolean | undefined
): void {
  if (value === true) {
    style[name] = true as CellStyle[T];
  }
}
