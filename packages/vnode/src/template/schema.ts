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
  ref: {},
  focusStyle: { dirty: "paint" },
  onKey: { dirty: "paint" },
  onFocusChange: { dirty: "paint" }
};

const commonYogaItemProps: Record<string, PropSchema> = {
  flexGrow: { dirty: "layout" },
  "flex-grow": { dirty: "layout" },
  flexShrink: { dirty: "layout" },
  "flex-shrink": { dirty: "layout" }
};

const commonYogaContainerProps: Record<string, PropSchema> = {
  gap: { dirty: "layout" },
  flexWrap: { dirty: "layout" },
  "flex-wrap": { dirty: "layout" },
  alignItems: { dirty: "layout" },
  "align-items": { dirty: "layout" },
  justifyContent: { dirty: "layout" },
  "justify-content": { dirty: "layout" }
};

export const elementSchemas: Record<IntrinsicElementTag, ElementSchema> = {
  screen: {
    acceptsChildren: true,
    props: {
      ...commonElementProps,
      ...commonYogaItemProps,
      ...commonYogaContainerProps
    }
  },
  box: {
    acceptsChildren: true,
    props: {
      ...commonElementProps,
      ...commonYogaItemProps,
      ...commonYogaContainerProps,
      border: { dirty: "paint" },
      padding: { dirty: "layout" },
      height: { dirty: "layout" },
      width: { dirty: "layout" },
      overflow: { dirty: "layout" },
      scrollX: { dirty: "layout" },
      scrollY: { dirty: "layout" }
    }
  },
  vstack: {
    acceptsChildren: true,
    props: {
      ...commonElementProps,
      ...commonYogaItemProps,
      ...commonYogaContainerProps
    }
  },
  hstack: {
    acceptsChildren: true,
    props: {
      ...commonElementProps,
      ...commonYogaItemProps,
      ...commonYogaContainerProps
    }
  },
  text: {
    acceptsChildren: false,
    requiredProps: ["value"],
    props: {
      ...commonElementProps,
      ...commonYogaItemProps,
      value: { required: true, dirty: "layout" },
      wrap: { dirty: "layout" },
      color: { dirty: "paint" },
      bold: { dirty: "paint" }
    }
  },
  button: {
    acceptsChildren: false,
    requiredProps: ["value"],
    props: {
      ...commonElementProps,
      ...commonYogaItemProps,
      value: { required: true, dirty: "layout" },
      disabled: { dirty: "paint" }
    }
  },
  input: {
    acceptsChildren: false,
    props: {
      ...commonElementProps,
      ...commonYogaItemProps,
      value: { dirty: "paint" },
      placeholder: { dirty: "paint" }
    }
  },
  spacer: {
    acceptsChildren: false,
    props: {
      ...commonElementProps,
      ...commonYogaItemProps,
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
