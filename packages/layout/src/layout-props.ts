import { readTextWrapMode } from "@bindtty/text";
import type { MountedElementNode } from "@bindtty/vnode";
import { toNonNegativeNumber } from "./measure.js";
export type LayoutOverflow = "visible" | "clip";

export type LayoutElementTag = MountedElementNode["tag"];

const yogaMinMaxSizeProps = [
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight"
] as const;

const yogaBoxEdgePaddingProps = [
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft"
] as const;

const yogaMarginProps = [
  "margin",
  "marginX",
  "marginY",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft"
] as const;

const yogaLayoutItemTags = [
  ...yogaMinMaxSizeProps,
  ...yogaMarginProps
] as const;

export const yogaSupportedPropsByTag: Record<LayoutElementTag, ReadonlySet<string>> = {
  screen: new Set([
    "gap",
    "flexWrap",
    "justifyContent",
    "alignItems",
    "flexGrow",
    "flexShrink"
  ]),
  vstack: new Set([
    "gap",
    "flexWrap",
    "justifyContent",
    "alignItems",
    "flexGrow",
    "flexShrink",
    ...yogaLayoutItemTags
  ]),
  hstack: new Set([
    "gap",
    "flexWrap",
    "justifyContent",
    "alignItems",
    "flexGrow",
    "flexShrink",
    ...yogaLayoutItemTags
  ]),
  box: new Set([
    "padding",
    "border",
    "height",
    "width",
    "overflow",
    "scrollX",
    "scrollY",
    "gap",
    "flexWrap",
    "justifyContent",
    "alignItems",
    "flexGrow",
    "flexShrink",
    ...yogaLayoutItemTags,
    ...yogaBoxEdgePaddingProps
  ]),
  text: new Set([
    "value",
    "wrap",
    "color",
    "bold",
    "flexGrow",
    "flexShrink",
    ...yogaLayoutItemTags
  ]),
  spacer: new Set(["size", "flexGrow", "flexShrink", ...yogaLayoutItemTags]),
  button: new Set(["value", "disabled", "flexGrow", "flexShrink"]),
  input: new Set(["value", "placeholder", "flexGrow", "flexShrink"])
};

export const nonLayoutElementTags = new Set<LayoutElementTag>(["button", "input"]);

export const basicSupportedPropsByTag: Record<LayoutElementTag, ReadonlySet<string>> = {
  screen: new Set(),
  vstack: new Set(),
  hstack: new Set(),
  box: new Set([
    "padding",
    "border",
    "height",
    "width",
    "overflow",
    "scrollX",
    "scrollY"
  ]),
  text: new Set(["value", "wrap", "color", "bold"]),
  spacer: new Set(["size"]),
  button: new Set(["value", "disabled"]),
  input: new Set(["value", "placeholder"])
};

export const futureLayoutProps = new Set<string>([
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginX",
  "marginY",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "gap",
  "flexDirection",
  "flexWrap",
  "justifyContent",
  "alignItems",
  "flexGrow",
  "flexShrink"
]);

export const layoutPropAliases = new Map<string, string>([
  ["padding-top", "paddingTop"],
  ["padding-right", "paddingRight"],
  ["padding-bottom", "paddingBottom"],
  ["padding-left", "paddingLeft"],
  ["padding-x", "paddingX"],
  ["padding-y", "paddingY"],
  ["margin-top", "marginTop"],
  ["margin-right", "marginRight"],
  ["margin-bottom", "marginBottom"],
  ["margin-left", "marginLeft"],
  ["margin-x", "marginX"],
  ["margin-y", "marginY"],
  ["flex-direction", "flexDirection"],
  ["flex-wrap", "flexWrap"],
  ["justify-content", "justifyContent"],
  ["align-items", "alignItems"],
  ["flex-grow", "flexGrow"],
  ["flex-shrink", "flexShrink"],
  ["min-width", "minWidth"],
  ["min-height", "minHeight"],
  ["max-width", "maxWidth"],
  ["max-height", "maxHeight"]
]);

export const nonLayoutProps = new Set<string>([
  "id",
  "focusStyle",
  "focusable",
  "onKeyCapture",
  "onKey",
  "onFocusChange"
]);

export const matrixLayoutProps = [
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "padding",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginX",
  "marginY",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "border",
  "overflow",
  "scrollX",
  "scrollY",
  "gap",
  "flexWrap",
  "justifyContent",
  "alignItems",
  "flexGrow",
  "flexShrink",
  "flexDirection"
] as const;

export type MatrixLayoutProp = (typeof matrixLayoutProps)[number];

export type LayoutPropMatrixStatus = "supported" | "future" | "na";

export interface BoxPaddingEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type BoxMarginEdges = BoxPaddingEdges;

export function resolvePadding(props: Record<string, unknown>): BoxPaddingEdges {
  const base = toNonNegativeNumber(readLayoutProp(props, "padding"));
  const paddingX = readLayoutProp(props, "paddingX");
  const paddingY = readLayoutProp(props, "paddingY");
  const axisX = paddingX !== undefined ? toNonNegativeNumber(paddingX) : base;
  const axisY = paddingY !== undefined ? toNonNegativeNumber(paddingY) : base;
  const top = readLayoutProp(props, "paddingTop");
  const right = readLayoutProp(props, "paddingRight");
  const bottom = readLayoutProp(props, "paddingBottom");
  const left = readLayoutProp(props, "paddingLeft");

  return {
    top: top !== undefined ? toNonNegativeNumber(top) : axisY,
    right: right !== undefined ? toNonNegativeNumber(right) : axisX,
    bottom: bottom !== undefined ? toNonNegativeNumber(bottom) : axisY,
    left: left !== undefined ? toNonNegativeNumber(left) : axisX
  };
}

export function resolveMargin(props: Record<string, unknown>): BoxMarginEdges {
  const base = toNonNegativeNumber(readLayoutProp(props, "margin"));
  const marginX = readLayoutProp(props, "marginX");
  const marginY = readLayoutProp(props, "marginY");
  const axisX = marginX !== undefined ? toNonNegativeNumber(marginX) : base;
  const axisY = marginY !== undefined ? toNonNegativeNumber(marginY) : base;
  const top = readLayoutProp(props, "marginTop");
  const right = readLayoutProp(props, "marginRight");
  const bottom = readLayoutProp(props, "marginBottom");
  const left = readLayoutProp(props, "marginLeft");

  return {
    top: top !== undefined ? toNonNegativeNumber(top) : axisY,
    right: right !== undefined ? toNonNegativeNumber(right) : axisX,
    bottom: bottom !== undefined ? toNonNegativeNumber(bottom) : axisY,
    left: left !== undefined ? toNonNegativeNumber(left) : axisX
  };
}

export function getLayoutPropMatrixStatus(
  tag: LayoutElementTag,
  prop: MatrixLayoutProp,
  engine: "yoga" | "basic" = "yoga"
): LayoutPropMatrixStatus {
  const supportedProps =
    engine === "yoga" ? yogaSupportedPropsByTag[tag] : basicSupportedPropsByTag[tag];

  if (supportedProps.has(prop)) {
    return "supported";
  }

  if (futureLayoutProps.has(prop)) {
    return "future";
  }

  return "na";
}

export function readLayoutProp(
  props: Record<string, unknown>,
  canonicalName: string
): unknown {
  if (hasOwn(props, canonicalName)) {
    return props[canonicalName];
  }

  for (const [alias, canonical] of layoutPropAliases) {
    if (canonical === canonicalName && hasOwn(props, alias)) {
      return props[alias];
    }
  }

  return undefined;
}

export function readOverflow(value: unknown): LayoutOverflow {
  if (value === null || value === undefined) {
    return "visible";
  }

  if (value === "visible" || value === "clip") {
    return value;
  }

  throw new Error(`Unsupported overflow value: ${String(value)}`);
}

export function validateElementProps(
  node: MountedElementNode,
  supportedProps: ReadonlySet<string>
): void {
  const seenCanonicalProps = new Map<string, string>();
  const canonicalProps: string[] = [];

  for (const propName of Object.keys(node.props)) {
    if (nonLayoutProps.has(propName)) {
      continue;
    }

    const canonicalName = layoutPropAliases.get(propName) ?? propName;
    const previousName = seenCanonicalProps.get(canonicalName);

    if (previousName && previousName !== propName) {
      throw new Error(`Duplicate layout prop: ${canonicalName} / ${propName}`);
    }

    seenCanonicalProps.set(canonicalName, propName);
    canonicalProps.push(canonicalName);
  }

  for (const canonicalName of canonicalProps) {
    if (
      !supportedProps.has(canonicalName) &&
      futureLayoutProps.has(canonicalName)
    ) {
      throw new Error(`Unsupported layout prop: ${canonicalName}`);
    }
  }

  if (node.tag === "box") {
    readOverflow(node.props.overflow);
  }

  if (node.tag === "text") {
    readTextWrapMode(node.props.wrap);
  }
}

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
