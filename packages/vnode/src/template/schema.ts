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

const commonElementProps: Record<string, PropSchema> = {
  id: { dirty: "paint" },
  focusStyle: { dirty: "paint" },
  onKey: { dirty: "paint" },
  onFocusChange: { dirty: "paint" }
};

export const elementSchemas: Record<IntrinsicElementTag, ElementSchema> = {
  screen: {
    acceptsChildren: true,
    props: {
      ...commonElementProps
    }
  },
  box: {
    acceptsChildren: true,
    props: {
      ...commonElementProps,
      border: { dirty: "paint" },
      padding: { dirty: "layout" }
    }
  },
  vstack: {
    acceptsChildren: true,
    props: {
      ...commonElementProps
    }
  },
  hstack: {
    acceptsChildren: true,
    props: {
      ...commonElementProps
    }
  },
  text: {
    acceptsChildren: false,
    requiredProps: ["value"],
    props: {
      ...commonElementProps,
      value: { required: true, dirty: "layout" },
      color: { dirty: "paint" },
      bold: { dirty: "paint" }
    }
  },
  button: {
    acceptsChildren: false,
    requiredProps: ["value"],
    props: {
      ...commonElementProps,
      value: { required: true, dirty: "layout" },
      disabled: { dirty: "paint" }
    }
  },
  input: {
    acceptsChildren: false,
    props: {
      ...commonElementProps,
      value: { dirty: "paint" },
      placeholder: { dirty: "paint" }
    }
  },
  spacer: {
    acceptsChildren: false,
    props: {
      ...commonElementProps,
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
