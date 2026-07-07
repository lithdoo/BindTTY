import { computed } from "@bindtty/signal";
import {
  elementTemplate,
  type BindingValue,
  type Template
} from "@bindtty/vnode";
import { omitUndefined } from "./binding.js";

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

function renderTextareaLineAt(
  input: RenderTextareaViewportInput,
  index: number
): Template {
  return elementTemplate(
    "hstack",
    {},
    [
      elementTemplate(
        "text",
        omitUndefined({
          value: computed(() => readRenderLine(input.lines, index).before),
          color: input.color,
          bold: input.bold,
          dim: input.dim
        })
      ),
      elementTemplate(
        "text",
        omitUndefined({
          value: computed(() => readRenderLine(input.lines, index).cursor),
          color: input.background ?? "black",
          background: input.color ?? "white",
          bold: input.bold,
          dim: input.dim
        })
      ),
      elementTemplate(
        "text",
        omitUndefined({
          value: computed(() => readRenderLine(input.lines, index).after),
          color: input.color,
          bold: input.bold,
          dim: input.dim
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
