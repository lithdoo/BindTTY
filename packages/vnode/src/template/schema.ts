import type { IntrinsicElementTag } from "./types.js";

export type DirtyKind = "structure" | "layout" | "paint";

export interface PropSchema {
  required?: boolean;
  dirty?: DirtyKind;
}

export interface ElementSchema {
  acceptsChildren: boolean;
  requiredProps?: string[];
  props?: Record<string, PropSchema>;
}

export const elementSchemas: Record<IntrinsicElementTag, ElementSchema> = {
  screen: {
    acceptsChildren: true
  },
  box: {
    acceptsChildren: true,
    props: {
      border: { dirty: "paint" },
      padding: { dirty: "layout" }
    }
  },
  vstack: {
    acceptsChildren: true
  },
  hstack: {
    acceptsChildren: true
  },
  text: {
    acceptsChildren: false,
    requiredProps: ["value"],
    props: {
      value: { required: true, dirty: "layout" },
      color: { dirty: "paint" },
      bold: { dirty: "paint" }
    }
  },
  button: {
    acceptsChildren: false,
    requiredProps: ["value"],
    props: {
      value: { required: true, dirty: "layout" },
      disabled: { dirty: "paint" }
    }
  },
  input: {
    acceptsChildren: false,
    props: {
      value: { dirty: "paint" },
      placeholder: { dirty: "paint" }
    }
  },
  spacer: {
    acceptsChildren: false,
    props: {
      size: { dirty: "layout" }
    }
  }
};

export function getElementSchema(tag: IntrinsicElementTag): ElementSchema {
  return elementSchemas[tag];
}

export function getPropDirtyKind(
  tag: IntrinsicElementTag,
  propName: string
): DirtyKind {
  return elementSchemas[tag].props?.[propName]?.dirty ?? "paint";
}
