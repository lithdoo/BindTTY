export type TextWrapMode =
  | "legacy"
  | "none"
  | "wrap"
  | "hard"
  | "truncate-end"
  | "truncate-middle"
  | "truncate-start";

export interface TextMeasure {
  width: number;
  height: number;
}

export interface TextLayoutOptions {
  width?: number;
  wrap?: TextWrapMode;
}

export interface TextLayout {
  width: number;
  height: number;
  lines: string[];
}
