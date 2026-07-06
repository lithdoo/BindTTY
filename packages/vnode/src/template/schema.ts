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
  focusable: { dirty: "paint" },
  onKeyCapture: { dirty: "paint" },
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

const commonYogaSizeProps: Record<string, PropSchema> = {
  minWidth: { dirty: "layout" },
  "min-width": { dirty: "layout" },
  minHeight: { dirty: "layout" },
  "min-height": { dirty: "layout" },
  maxWidth: { dirty: "layout" },
  "max-width": { dirty: "layout" },
  maxHeight: { dirty: "layout" },
  "max-height": { dirty: "layout" }
};

const commonYogaMarginProps: Record<string, PropSchema> = {
  margin: { dirty: "layout" },
  marginX: { dirty: "layout" },
  "margin-x": { dirty: "layout" },
  marginY: { dirty: "layout" },
  "margin-y": { dirty: "layout" },
  marginTop: { dirty: "layout" },
  "margin-top": { dirty: "layout" },
  marginRight: { dirty: "layout" },
  "margin-right": { dirty: "layout" },
  marginBottom: { dirty: "layout" },
  "margin-bottom": { dirty: "layout" },
  marginLeft: { dirty: "layout" },
  "margin-left": { dirty: "layout" }
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
      ...commonYogaSizeProps,
      ...commonYogaMarginProps,
      border: { dirty: "paint" },
      padding: { dirty: "layout" },
      paddingX: { dirty: "layout" },
      "padding-x": { dirty: "layout" },
      paddingY: { dirty: "layout" },
      "padding-y": { dirty: "layout" },
      paddingTop: { dirty: "layout" },
      "padding-top": { dirty: "layout" },
      paddingRight: { dirty: "layout" },
      "padding-right": { dirty: "layout" },
      paddingBottom: { dirty: "layout" },
      "padding-bottom": { dirty: "layout" },
      paddingLeft: { dirty: "layout" },
      "padding-left": { dirty: "layout" },
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
      ...commonYogaContainerProps,
      ...commonYogaSizeProps,
      ...commonYogaMarginProps
    }
  },
  hstack: {
    acceptsChildren: true,
    props: {
      ...commonElementProps,
      ...commonYogaItemProps,
      ...commonYogaContainerProps,
      ...commonYogaSizeProps,
      ...commonYogaMarginProps
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
      ...commonYogaSizeProps,
      ...commonYogaMarginProps,
      color: { dirty: "paint" },
      bold: { dirty: "paint" }
    }
  },
  spacer: {
    acceptsChildren: false,
    props: {
      ...commonElementProps,
      ...commonYogaItemProps,
      size: { dirty: "layout" },
      ...commonYogaSizeProps,
      ...commonYogaMarginProps
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
