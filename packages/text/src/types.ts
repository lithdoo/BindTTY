export type TextWrapMode =
  | "legacy"
  | "none"
  | "wrap"
  | "hard"
  | "truncate-end"
  | "truncate-middle"
  | "truncate-start";

export type PublicTextWrapMode = Exclude<TextWrapMode, "legacy">;

export interface TextMeasure {
  width: number;
  height: number;
}

export interface TextLayoutOptions {
  width?: number;
  wrap?: TextWrapMode | PublicTextWrapMode | null | undefined;
}

export interface TextLayout {
  width: number;
  height: number;
  lines: string[];
}

export const TEXT_WRAP_MODES = [
  "legacy",
  "none",
  "wrap",
  "hard",
  "truncate-end",
  "truncate-middle",
  "truncate-start"
] as const satisfies readonly TextWrapMode[];
