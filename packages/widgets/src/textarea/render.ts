import { computed } from "@bindtty/signal";
import {
  elementTemplate,
  type BindingValue,
  type Template
} from "@bindtty/vnode";
import { omitUndefined, readBindingValue } from "./binding.js";

export type TextareaRenderLine =
  | {
      key: string;
      kind: "text";
      text: string;
    }
  | {
      key: string;
      kind: "cursor";
      before: string;
      cursor: string;
      after: string;
    };

export interface RenderTextareaViewportInput {
  rows: number;
  lines: BindingValue<readonly TextareaRenderLine[]>;
  /** When set, each visual row is constrained so a trailing caret space cannot grow flex width. */
  width?: BindingValue<number | null>;
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  bold?: BindingValue<boolean>;
  dim?: BindingValue<boolean>;
}

export function renderTextareaViewport(input: RenderTextareaViewportInput): Template {
  return elementTemplate(
    "vstack",
    {},
    Array.from({ length: Math.max(1, Math.floor(input.rows)) }, (_value, index) =>
      renderTextareaLineAt(input, index)
    )
  );
}

function readRowWidth(width: BindingValue<number | null> | undefined): number | undefined {
  if (width === undefined) {
    return undefined;
  }

  const value = readBindingValue(width);
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }

  return undefined;
}

function renderTextareaLineAt(
  input: RenderTextareaViewportInput,
  index: number
): Template {
  const rowMaxWidth = computed(() => readRowWidth(input.width));

  return elementTemplate(
    "hstack",
    omitUndefined({
      // Empty soft/hard wrap rows use value "". Yoga measures that text as
      // height 0, so rows must pin minHeight=1 or Enter/minRows gaps collapse
      // and the caret looks stuck while the outer box still grows.
      minHeight: 1,
      // hstack supports maxWidth (Yoga item), not box-only width/overflow.
      // Cap row intrinsic measure so a trailing caret space cannot grow flex.
      maxWidth: rowMaxWidth
    }),
    [
      elementTemplate(
        "text",
        omitUndefined({
          value: computed(() => readRenderLine(input.lines, index).before),
          color: input.color,
          bold: input.bold,
          dim: input.dim,
          wrap: "none"
        })
      ),
      elementTemplate(
        "text",
        omitUndefined({
          value: computed(() => readRenderLine(input.lines, index).cursor),
          // Match TextInput: inverse = fg from box background (default white),
          // bg from text color (default black) for a visible caret on dark TTYs.
          color: computed(() => readBindingValue(input.background) ?? "white"),
          background: computed(() => readBindingValue(input.color) ?? "black"),
          bold: input.bold,
          dim: input.dim,
          wrap: "none"
        })
      ),
      elementTemplate(
        "text",
        omitUndefined({
          value: computed(() => readRenderLine(input.lines, index).after),
          color: input.color,
          bold: input.bold,
          dim: input.dim,
          wrap: "none"
        })
      )
    ]
  );
}

function readRenderLine(
  lines: BindingValue<readonly TextareaRenderLine[]>,
  index: number
): { before: string; cursor: string; after: string } {
  const source = lines as readonly TextareaRenderLine[] | { get(): readonly TextareaRenderLine[] };
  const line = typeof source === "object" && source !== null && "get" in source
    ? source.get()[index]
    : source[index];

  if (!line) {
    return { before: "", cursor: "", after: "" };
  }

  if (line.kind === "text") {
    return { before: line.text, cursor: "", after: "" };
  }

  return {
    before: line.before,
    cursor: line.cursor,
    after: line.after
  };
}
