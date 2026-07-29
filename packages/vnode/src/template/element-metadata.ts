import type { IntrinsicElementTag } from "./types.js";

export type ElementDirtyKind = "structure" | "layout" | "paint";
export type ElementPropCategory =
  | "identity"
  | "interaction"
  | "layout"
  | "paint"
  | "content";
export type LayoutBackendName = "basic" | "yoga";

export interface ElementPropMetadata {
  readonly canonical: string;
  readonly aliases?: readonly string[];
  readonly required?: boolean;
  readonly dirty: ElementDirtyKind;
  readonly category: ElementPropCategory;
  readonly backends?: readonly LayoutBackendName[];
  readonly future?: boolean;
}

export interface ElementMetadata {
  readonly acceptsChildren: boolean;
  readonly props: Readonly<Record<string, ElementPropMetadata>>;
}

const both = ["basic", "yoga"] as const;
const yoga = ["yoga"] as const;

const prop = (
  canonical: string,
  metadata: Omit<ElementPropMetadata, "canonical">
): ElementPropMetadata => ({ canonical, ...metadata });

export const layoutPropMetadata = {
  width: prop("width", { dirty: "layout", category: "layout", backends: both }),
  height: prop("height", { dirty: "layout", category: "layout", backends: both }),
  minWidth: prop("minWidth", { aliases: ["min-width"], dirty: "layout", category: "layout", backends: yoga }),
  minHeight: prop("minHeight", { aliases: ["min-height"], dirty: "layout", category: "layout", backends: yoga }),
  maxWidth: prop("maxWidth", { aliases: ["max-width"], dirty: "layout", category: "layout", backends: yoga }),
  maxHeight: prop("maxHeight", { aliases: ["max-height"], dirty: "layout", category: "layout", backends: yoga }),
  padding: prop("padding", { dirty: "layout", category: "layout", backends: both, future: false }),
  paddingX: prop("paddingX", { aliases: ["padding-x"], dirty: "layout", category: "layout", backends: yoga }),
  paddingY: prop("paddingY", { aliases: ["padding-y"], dirty: "layout", category: "layout", backends: yoga }),
  paddingTop: prop("paddingTop", { aliases: ["padding-top"], dirty: "layout", category: "layout", backends: yoga }),
  paddingRight: prop("paddingRight", { aliases: ["padding-right"], dirty: "layout", category: "layout", backends: yoga }),
  paddingBottom: prop("paddingBottom", { aliases: ["padding-bottom"], dirty: "layout", category: "layout", backends: yoga }),
  paddingLeft: prop("paddingLeft", { aliases: ["padding-left"], dirty: "layout", category: "layout", backends: yoga }),
  margin: prop("margin", { dirty: "layout", category: "layout", backends: yoga }),
  marginX: prop("marginX", { aliases: ["margin-x"], dirty: "layout", category: "layout", backends: yoga }),
  marginY: prop("marginY", { aliases: ["margin-y"], dirty: "layout", category: "layout", backends: yoga }),
  marginTop: prop("marginTop", { aliases: ["margin-top"], dirty: "layout", category: "layout", backends: yoga }),
  marginRight: prop("marginRight", { aliases: ["margin-right"], dirty: "layout", category: "layout", backends: yoga }),
  marginBottom: prop("marginBottom", { aliases: ["margin-bottom"], dirty: "layout", category: "layout", backends: yoga }),
  marginLeft: prop("marginLeft", { aliases: ["margin-left"], dirty: "layout", category: "layout", backends: yoga }),
  border: prop("border", { dirty: "layout", category: "layout", backends: both, future: false }),
  overflow: prop("overflow", { dirty: "layout", category: "layout", backends: both, future: false }),
  scrollX: prop("scrollX", { dirty: "layout", category: "layout", backends: both, future: false }),
  scrollY: prop("scrollY", { dirty: "layout", category: "layout", backends: both, future: false }),
  gap: prop("gap", { dirty: "layout", category: "layout", backends: yoga }),
  flexWrap: prop("flexWrap", { aliases: ["flex-wrap"], dirty: "layout", category: "layout", backends: yoga }),
  justifyContent: prop("justifyContent", { aliases: ["justify-content"], dirty: "layout", category: "layout", backends: yoga }),
  alignItems: prop("alignItems", { aliases: ["align-items"], dirty: "layout", category: "layout", backends: yoga }),
  flexGrow: prop("flexGrow", { aliases: ["flex-grow"], dirty: "layout", category: "layout", backends: yoga }),
  flexShrink: prop("flexShrink", { aliases: ["flex-shrink"], dirty: "layout", category: "layout", backends: yoga }),
  flexDirection: prop("flexDirection", { aliases: ["flex-direction"], dirty: "layout", category: "layout", future: true })
} as const satisfies Record<string, ElementPropMetadata>;

const interactionProps = {
  id: prop("id", { dirty: "structure", category: "identity" }),
  ref: prop("ref", { dirty: "paint", category: "identity" }),
  focusStyle: prop("focusStyle", { dirty: "paint", category: "paint" }),
  focusable: prop("focusable", { dirty: "structure", category: "interaction" }),
  onKeyCapture: prop("onKeyCapture", { dirty: "structure", category: "interaction" }),
  onKey: prop("onKey", { dirty: "structure", category: "interaction" }),
  onFocusChange: prop("onFocusChange", { dirty: "structure", category: "interaction" })
};

const yogaItem = pickLayout("flexGrow", "flexShrink");
const yogaContainer = pickLayout("gap", "flexWrap", "alignItems", "justifyContent");
const yogaSize = pickLayout("minWidth", "minHeight", "maxWidth", "maxHeight");
const yogaMargin = pickLayout("margin", "marginX", "marginY", "marginTop", "marginRight", "marginBottom", "marginLeft");

export const elementMetadata: Record<IntrinsicElementTag, ElementMetadata> = {
  screen: element(true, interactionProps, yogaItem, yogaContainer),
  box: element(
    true,
    interactionProps,
    yogaItem,
    yogaContainer,
    yogaSize,
    yogaMargin,
    pickLayout("border", "padding", "paddingX", "paddingY", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "height", "width", "overflow", "scrollX", "scrollY")
  ),
  vstack: element(true, interactionProps, yogaItem, yogaContainer, yogaSize, yogaMargin),
  hstack: element(true, interactionProps, yogaItem, yogaContainer, yogaSize, yogaMargin),
  text: element(
    false,
    interactionProps,
    yogaItem,
    yogaSize,
    yogaMargin,
    {
      value: prop("value", { required: true, dirty: "layout", category: "content", backends: both }),
      wrap: prop("wrap", { dirty: "layout", category: "content", backends: both }),
      color: prop("color", { dirty: "paint", category: "paint", backends: both }),
      bold: prop("bold", { dirty: "paint", category: "paint", backends: both })
    }
  ),
  spacer: element(
    false,
    interactionProps,
    yogaItem,
    yogaSize,
    yogaMargin,
    { size: prop("size", { dirty: "layout", category: "content", backends: both }) }
  )
};

function element(
  acceptsChildren: boolean,
  ...groups: Array<Record<string, ElementPropMetadata>>
): ElementMetadata {
  const canonical: Record<string, ElementPropMetadata> = Object.assign(
    {},
    ...groups
  );
  const props: Record<string, ElementPropMetadata> = { ...canonical };
  for (const metadata of Object.values(canonical)) {
    for (const alias of metadata.aliases ?? []) {
      props[alias] = metadata;
    }
  }
  return { acceptsChildren, props };
}

function pickLayout<K extends keyof typeof layoutPropMetadata>(
  ...names: K[]
): Record<K, ElementPropMetadata> {
  return Object.fromEntries(names.map((name) => [name, layoutPropMetadata[name]])) as Record<K, ElementPropMetadata>;
}
