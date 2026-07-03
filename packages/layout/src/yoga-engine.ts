import Yoga from "yoga-layout";
import { layoutText, readTextWrapMode } from "@bindtty/text";
import type { MountedElementNode, MountedNode } from "@bindtty/vnode";
import type { LayoutFlow } from "./intrinsic.js";
import { clampNonNegative, toNonNegativeNumber } from "./measure.js";
import type {
  LayoutEngine,
  LayoutEngineOptions,
  LayoutNode,
  LayoutRect,
  LayoutScrollOffset,
  LayoutSize
} from "./types.js";

type YogaNode = import("yoga-layout").Node;
type YogaMeasureMode = Parameters<import("yoga-layout").MeasureFunction>[1];

interface YogaAdapter {
  createNode(): YogaNode;
  calculateLayout(node: YogaNode, width: number | undefined, height: number | undefined): void;
  freeRecursive(node: YogaNode): void;
}

interface YogaLayoutEntry {
  mounted: MountedNode;
  yogaNode: YogaNode;
  children: YogaLayoutEntry[];
}

type LayoutOverflow = "visible" | "clip";

const supportedPropsByTag: Record<MountedElementNode["tag"], Set<string>> = {
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
    "flexShrink"
  ]),
  hstack: new Set([
    "gap",
    "flexWrap",
    "justifyContent",
    "alignItems",
    "flexGrow",
    "flexShrink"
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
    "flexShrink"
  ]),
  text: new Set(["value", "wrap", "color", "bold", "flexGrow", "flexShrink"]),
  spacer: new Set(["size", "flexGrow", "flexShrink"]),
  button: new Set(["value", "disabled", "flexGrow", "flexShrink"]),
  input: new Set(["value", "placeholder", "flexGrow", "flexShrink"])
};

const futureLayoutProps = new Set<string>([
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

const layoutPropAliases = new Map<string, string>([
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

const nonLayoutProps = new Set<string>([
  "id",
  "focusStyle",
  "onKey",
  "onFocusChange"
]);

const defaultYogaAdapter: YogaAdapter = {
  createNode() {
    return Yoga.Node.create();
  },
  calculateLayout(node, width, height) {
    node.calculateLayout(width, height, Yoga.DIRECTION_LTR);
  },
  freeRecursive(node) {
    node.freeRecursive();
  }
};

export function createYogaLayoutEngine(): LayoutEngine {
  return {
    layout(root: MountedNode | null, options: LayoutEngineOptions): LayoutNode | null {
      if (!root) {
        return null;
      }

      const entry = buildYogaTree(root, "column", options, defaultYogaAdapter);

      try {
        defaultYogaAdapter.calculateLayout(
          entry.yogaNode,
          getRootLayoutWidth(root, options),
          getRootLayoutHeight(root, options)
        );

        return readLayoutTree(entry, options);
      } finally {
        defaultYogaAdapter.freeRecursive(entry.yogaNode);
      }
    }
  };
}

function buildYogaTree(
  node: MountedNode,
  inheritedFlow: LayoutFlow,
  options: LayoutEngineOptions,
  adapter: YogaAdapter
): YogaLayoutEntry {
  const yogaNode = adapter.createNode();
  const entry: YogaLayoutEntry = {
    mounted: node,
    yogaNode,
    children: []
  };

  try {
    configureYogaNode(entry, inheritedFlow, options);

    const childFlow = getChildFlow(node, inheritedFlow);
    const children = getStructureChildren(node);

    for (const child of children) {
      const childEntry = buildYogaTree(child, childFlow, options, adapter);
      entry.children.push(childEntry);
      yogaNode.insertChild(childEntry.yogaNode, entry.children.length - 1);
    }

    return entry;
  } catch (error) {
    yogaNode.freeRecursive();
    throw error;
  }
}

function configureYogaNode(
  entry: YogaLayoutEntry,
  inheritedFlow: LayoutFlow,
  options: LayoutEngineOptions
): void {
  const { mounted: node, yogaNode } = entry;

  yogaNode.setBoxSizing(Yoga.BOX_SIZING_BORDER_BOX);

  switch (node.kind) {
    case "fragment":
    case "show":
    case "for":
      yogaNode.setFlexDirection(readYogaFlexDirection(inheritedFlow));
      return;
    case "element":
      configureYogaElement(node, yogaNode, inheritedFlow, options);
      return;
  }
}

function configureYogaElement(
  node: MountedElementNode,
  yogaNode: YogaNode,
  inheritedFlow: LayoutFlow,
  options: LayoutEngineOptions
): void {
  validateElementProps(node);
  applyYogaItemProps(node, yogaNode);

  switch (node.tag) {
    case "screen":
      yogaNode.setWidth(options.viewport.width);
      yogaNode.setHeight(options.viewport.height);
      yogaNode.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN);
      applyYogaContainerProps(node, yogaNode);
      return;
    case "vstack":
      yogaNode.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN);
      applyYogaContainerProps(node, yogaNode);
      return;
    case "hstack":
      yogaNode.setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
      applyYogaContainerProps(node, yogaNode);
      return;
    case "box":
      configureYogaBox(node, yogaNode);
      return;
    case "text":
      configureYogaText(node, yogaNode);
      return;
    case "spacer":
      configureYogaSpacer(node, yogaNode, inheritedFlow);
      return;
    case "button":
    case "input":
      throw new Error(`Unsupported layout element: ${node.tag}`);
  }
}

function configureYogaBox(node: MountedElementNode, yogaNode: YogaNode): void {
  const border = node.props.border ? 1 : 0;
  const padding = toNonNegativeNumber(node.props.padding);
  const width = readOptionalSize(node.props.width);
  const height = readOptionalSize(node.props.height);
  const overflow = readOverflow(node.props.overflow);

  yogaNode.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN);
  applyYogaContainerProps(node, yogaNode);

  if (width !== undefined) {
    yogaNode.setWidth(width);
  }

  if (height !== undefined) {
    yogaNode.setHeight(height);
  }

  if (border > 0) {
    yogaNode.setBorder(Yoga.EDGE_ALL, border);
  }

  if (padding > 0) {
    yogaNode.setPadding(Yoga.EDGE_ALL, padding);
  }

  if (overflow === "clip" || hasOwn(node.props, "scrollX") || hasOwn(node.props, "scrollY")) {
    yogaNode.setOverflow(Yoga.OVERFLOW_HIDDEN);
  }
}

function configureYogaText(node: MountedElementNode, yogaNode: YogaNode): void {
  const text = String(node.props.value ?? "");
  const wrap = readTextWrapMode(node.props.wrap);

  yogaNode.setMeasureFunc((width, widthMode, _height, _heightMode) => {
    const measured = layoutText(text, {
      width: getMeasureWidth(width, widthMode, wrap),
      wrap
    });

    return measured;
  });
}

function configureYogaSpacer(
  node: MountedElementNode,
  yogaNode: YogaNode,
  inheritedFlow: LayoutFlow
): void {
  const size = toNonNegativeNumber(node.props.size);

  if (inheritedFlow === "row") {
    yogaNode.setWidth(size);
  } else {
    yogaNode.setHeight(size);
  }
}

function readLayoutTree(
  entry: YogaLayoutEntry,
  options: LayoutEngineOptions
): LayoutNode {
  const rootRect = createRootRect(entry, options);

  return readLayoutEntry(entry, rootRect);
}

function readLayoutEntry(
  entry: YogaLayoutEntry,
  rect: LayoutRect
): LayoutNode {
  const contentRect = readContentRect(entry, rect);
  const children = entry.children.map((child) => {
    const childRect = readChildRect(child, rect);

    return readLayoutEntry(child, childRect);
  });
  const layout: LayoutNode = {
    mounted: entry.mounted,
    rect,
    contentRect,
    children
  };

  if (entry.mounted.kind === "element" && entry.mounted.tag === "box") {
    applyBoxMetadata(entry.mounted, layout);
  }

  return layout;
}

function createRootRect(
  entry: YogaLayoutEntry,
  options: LayoutEngineOptions
): LayoutRect {
  if (entry.mounted.kind === "element" && entry.mounted.tag === "screen") {
    return {
      x: 0,
      y: 0,
      width: options.viewport.width,
      height: options.viewport.height
    };
  }

  return {
    x: 0,
    y: 0,
    width: entry.yogaNode.getComputedWidth(),
    height: entry.yogaNode.getComputedHeight()
  };
}

function readChildRect(
  entry: YogaLayoutEntry,
  parentRect: LayoutRect
): LayoutRect {
  return {
    x: parentRect.x + entry.yogaNode.getComputedLeft(),
    y: parentRect.y + entry.yogaNode.getComputedTop(),
    width: entry.yogaNode.getComputedWidth(),
    height: entry.yogaNode.getComputedHeight()
  };
}

function readContentRect(entry: YogaLayoutEntry, rect: LayoutRect): LayoutRect {
  if (entry.mounted.kind !== "element" || entry.mounted.tag !== "box") {
    return rect;
  }

  const inset = getBoxInset(entry.mounted);

  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width: clampNonNegative(rect.width - inset * 2),
    height: clampNonNegative(rect.height - inset * 2)
  };
}

function applyBoxMetadata(node: MountedElementNode, layout: LayoutNode): void {
  const overflow = readOverflow(node.props.overflow);
  const hasScrollX = hasOwn(node.props, "scrollX");
  const hasScrollY = hasOwn(node.props, "scrollY");

  if (overflow === "clip") {
    layout.clip = layout.contentRect;
  }

  if (overflow === "clip" || hasScrollX || hasScrollY) {
    layout.contentSize = readContentSize(layout);
  }

  if (hasScrollX || hasScrollY) {
    const contentSize = layout.contentSize ?? {
      width: layout.contentRect.width,
      height: layout.contentRect.height
    };

    layout.scrollOffset = {
      x: clamp(readScrollOffset(node.props.scrollX), 0, clampNonNegative(contentSize.width - layout.contentRect.width)),
      y: clamp(readScrollOffset(node.props.scrollY), 0, clampNonNegative(contentSize.height - layout.contentRect.height))
    };
  }
}

function readContentSize(layout: LayoutNode): LayoutSize {
  let width = layout.contentRect.width;
  let height = layout.contentRect.height;

  for (const child of layout.children) {
    width = Math.max(width, child.rect.x + child.rect.width - layout.contentRect.x);
    height = Math.max(height, child.rect.y + child.rect.height - layout.contentRect.y);
  }

  return {
    width: clampNonNegative(width),
    height: clampNonNegative(height)
  };
}

function getChildFlow(node: MountedNode, inheritedFlow: LayoutFlow): LayoutFlow {
  if (node.kind !== "element") {
    return inheritedFlow;
  }

  if (node.tag === "hstack") {
    return "row";
  }

  if (node.tag === "screen" || node.tag === "vstack" || node.tag === "box") {
    return "column";
  }

  return inheritedFlow;
}

function getStructureChildren(node: MountedNode): MountedNode[] {
  switch (node.kind) {
    case "fragment":
      return node.children;
    case "show":
      return node.activeBranch ? [node.activeBranch] : [];
    case "for":
      return node.items.map((item) => item.node);
    case "element":
      return node.children;
  }
}

function validateElementProps(node: MountedElementNode): void {
  const supportedProps = supportedPropsByTag[node.tag];
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

function getMeasureWidth(
  width: number,
  widthMode: YogaMeasureMode,
  wrap: ReturnType<typeof readTextWrapMode>
): number | undefined {
  if (wrap === "legacy" || widthMode === Yoga.MEASURE_MODE_UNDEFINED) {
    return undefined;
  }

  return width;
}

function readYogaFlexDirection(flow: LayoutFlow): number {
  return flow === "row" ? Yoga.FLEX_DIRECTION_ROW : Yoga.FLEX_DIRECTION_COLUMN;
}

function getRootLayoutWidth(
  root: MountedNode,
  options: LayoutEngineOptions
): number | undefined {
  return root.kind === "element" && root.tag === "screen"
    ? options.viewport.width
    : undefined;
}

function getRootLayoutHeight(
  root: MountedNode,
  options: LayoutEngineOptions
): number | undefined {
  return root.kind === "element" && root.tag === "screen"
    ? options.viewport.height
    : undefined;
}

function applyYogaItemProps(node: MountedElementNode, yogaNode: YogaNode): void {
  const flexGrow = readOptionalSize(readLayoutProp(node.props, "flexGrow"));
  const flexShrink = readOptionalSize(readLayoutProp(node.props, "flexShrink"));

  if (flexGrow !== undefined) {
    yogaNode.setFlexGrow(flexGrow);
  }

  if (flexShrink !== undefined) {
    yogaNode.setFlexShrink(flexShrink);
  }
}

function applyYogaContainerProps(
  node: MountedElementNode,
  yogaNode: YogaNode
): void {
  const gap = readOptionalSize(readLayoutProp(node.props, "gap"));
  const flexWrap = readLayoutProp(node.props, "flexWrap");
  const alignItems = readLayoutProp(node.props, "alignItems");
  const justifyContent = readLayoutProp(node.props, "justifyContent");

  if (gap !== undefined) {
    yogaNode.setGap(Yoga.GUTTER_ALL, gap);
  }

  if (flexWrap !== undefined) {
    yogaNode.setFlexWrap(readYogaFlexWrap(flexWrap));
  }

  if (alignItems !== undefined) {
    yogaNode.setAlignItems(readYogaAlignItems(alignItems));
  }

  if (justifyContent !== undefined) {
    yogaNode.setJustifyContent(readYogaJustifyContent(justifyContent));
  }
}

function readYogaFlexWrap(value: unknown): number {
  switch (value) {
    case "nowrap":
      return Yoga.WRAP_NO_WRAP;
    case "wrap":
      return Yoga.WRAP_WRAP;
    case "wrap-reverse":
      return Yoga.WRAP_WRAP_REVERSE;
    default:
      throw new Error(`Unsupported flexWrap value: ${String(value)}`);
  }
}

function readYogaAlignItems(value: unknown): number {
  switch (value) {
    case "stretch":
      return Yoga.ALIGN_STRETCH;
    case "flex-start":
      return Yoga.ALIGN_FLEX_START;
    case "center":
      return Yoga.ALIGN_CENTER;
    case "flex-end":
      return Yoga.ALIGN_FLEX_END;
    case "baseline":
      return Yoga.ALIGN_BASELINE;
    default:
      throw new Error(`Unsupported alignItems value: ${String(value)}`);
  }
}

function readYogaJustifyContent(value: unknown): number {
  switch (value) {
    case "flex-start":
      return Yoga.JUSTIFY_FLEX_START;
    case "center":
      return Yoga.JUSTIFY_CENTER;
    case "flex-end":
      return Yoga.JUSTIFY_FLEX_END;
    case "space-between":
      return Yoga.JUSTIFY_SPACE_BETWEEN;
    case "space-around":
      return Yoga.JUSTIFY_SPACE_AROUND;
    case "space-evenly":
      return Yoga.JUSTIFY_SPACE_EVENLY;
    default:
      throw new Error(`Unsupported justifyContent value: ${String(value)}`);
  }
}

function readLayoutProp(
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

function getBoxInset(node: MountedElementNode): number {
  return (node.props.border ? 1 : 0) + toNonNegativeNumber(node.props.padding);
}

function readOptionalSize(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return toNonNegativeNumber(value);
}

function readOverflow(value: unknown): LayoutOverflow {
  if (value === null || value === undefined) {
    return "visible";
  }

  if (value === "visible" || value === "clip") {
    return value;
  }

  throw new Error(`Unsupported overflow value: ${String(value)}`);
}

function readScrollOffset(value: unknown): number {
  return Math.floor(toNonNegativeNumber(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
