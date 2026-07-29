import { readTextWrapMode } from "@bindtty/text";
import {
  elementMetadata,
  layoutPropMetadata,
  type MountedElementNode
} from "@bindtty/vnode";
import { toNonNegativeNumber } from "./measure.js";
export type LayoutOverflow = "visible" | "clip";

export type LayoutElementTag = MountedElementNode["tag"];

export const yogaSupportedPropsByTag = supportedPropsByTag("yoga");
export const basicSupportedPropsByTag = supportedPropsByTag("basic");

export const futureLayoutProps = new Set<string>(
  Object.entries(layoutPropMetadata)
    .filter(([, metadata]) => metadata.future !== false)
    .map(([name]) => name)
);

export const layoutPropAliases = new Map<string, string>(
  Object.values(layoutPropMetadata).flatMap((metadata) =>
    (metadata.aliases ?? []).map((alias) => [alias, metadata.canonical] as const)
  )
);

export const nonLayoutProps = new Set<string>(
  Object.values(elementMetadata).flatMap((element) =>
    Object.entries(element.props)
      .filter(([name, metadata]) =>
        name === metadata.canonical && metadata.backends === undefined
      )
      .map(([name]) => name)
  )
);

export const matrixLayoutProps = Object.freeze(
  Object.keys(layoutPropMetadata)
) as readonly (keyof typeof layoutPropMetadata)[];

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

function supportedPropsByTag(
  backend: "basic" | "yoga"
): Record<LayoutElementTag, ReadonlySet<string>> {
  return Object.fromEntries(
    Object.entries(elementMetadata).map(([tag, element]) => [
      tag,
      new Set(
        Object.entries(element.props)
          .filter(([name, metadata]) =>
            name === metadata.canonical &&
            metadata.backends?.includes(backend)
          )
          .map(([name]) => name)
      )
    ])
  ) as unknown as Record<LayoutElementTag, ReadonlySet<string>>;
}
