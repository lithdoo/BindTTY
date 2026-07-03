import { layoutText, type TextWrapMode } from "@bindtty/text";
import type { MountedElementNode, MountedNode } from "@bindtty/vnode";
import Yoga, {
  Align,
  Direction,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  Wrap,
  type Node as YogaNode
} from "yoga-layout";
import type { LayoutFlow } from "./intrinsic.js";
import { clampNonNegative, toNonNegativeNumber } from "./measure.js";
import type {
  LayoutEngine,
  LayoutEngineOptions,
  LayoutNode,
  LayoutRect,
  LayoutSize
} from "./types.js";

interface BoxEdges {
  border: number;
  padding: number;
}

interface YogaLayoutEntry {
  mounted: MountedNode;
  yogaNode: YogaNode;
  children: YogaLayoutEntry[];
  flow: LayoutFlow;
}

interface YogaBuildContext {
  viewport: LayoutEngineOptions["viewport"];
}

type LayoutOverflow = "visible" | "clip";

const supportedPropsByTag: Record<MountedElementNode["tag"], Set<string>> = {
  screen: new Set(),
  vstack: new Set([
    "gap",
    "flexGrow",
    "flexShrink",
    "alignItems",
    "justifyContent",
    "flexWrap"
  ]),
  hstack: new Set([
    "gap",
    "flexGrow",
    "flexShrink",
    "alignItems",
    "justifyContent",
    "flexWrap"
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
    "flexGrow",
    "flexShrink",
    "alignItems",
    "justifyContent",
    "flexWrap"
  ]),
  text: new Set(["value", "wrap", "color", "bold", "flexGrow", "flexShrink"]),
  spacer: new Set(["size", "flexGrow", "flexShrink"]),
  button: new Set(["value", "disabled"]),
  input: new Set(["value", "placeholder"])
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
  "justifyContent",
  "alignItems",
  "flexGrow",
  "flexShrink",
  "flexWrap"
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
  ["justify-content", "justifyContent"],
  ["align-items", "alignItems"],
  ["flex-grow", "flexGrow"],
  ["flex-shrink", "flexShrink"],
  ["flex-wrap", "flexWrap"],
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

export function createYogaLayoutEngine(): LayoutEngine {
  return {
    layout(root: MountedNode | null, options: LayoutEngineOptions): LayoutNode | null {
      if (!root) {
        return null;
      }

      const context = {
        viewport: options.viewport
      };
      const entry = buildYogaTree(root, "column", context);

      try {
        const isScreenRoot = root.kind === "element" && root.tag === "screen";
        entry.yogaNode.calculateLayout(
          isScreenRoot ? options.viewport.width : undefined,
          isScreenRoot ? options.viewport.height : undefined,
          Direction.LTR
        );

        return readLayoutTree(entry, 0, 0);
      } finally {
        entry.yogaNode.freeRecursive();
      }
    }
  };
}

function buildYogaTree(
  mounted: MountedNode,
  parentFlow: LayoutFlow,
  context: YogaBuildContext
): YogaLayoutEntry {
  switch (mounted.kind) {
    case "element":
      return buildElementYogaTree(mounted, parentFlow, context);
    case "fragment":
    case "show":
    case "for":
      return buildStructureYogaTree(mounted, parentFlow, context);
  }
}

function buildElementYogaTree(
  mounted: MountedElementNode,
  parentFlow: LayoutFlow,
  context: YogaBuildContext
): YogaLayoutEntry {
  validateElementProps(mounted);

  const yogaNode = Yoga.Node.create();
  const flow = getElementFlow(mounted, parentFlow);
  const entry: YogaLayoutEntry = {
    mounted,
    yogaNode,
    children: [],
    flow
  };

  applyElementStyle(entry, parentFlow, context);

  for (const child of mounted.children) {
    const childEntry = buildYogaTree(child, flow, context);
    yogaNode.insertChild(childEntry.yogaNode, yogaNode.getChildCount());
    entry.children.push(childEntry);
  }

  return entry;
}

function buildStructureYogaTree(
  mounted: MountedNode,
  parentFlow: LayoutFlow,
  context: YogaBuildContext
): YogaLayoutEntry {
  const yogaNode = Yoga.Node.create();
  yogaNode.setFlexDirection(
    parentFlow === "row" ? FlexDirection.Row : FlexDirection.Column
  );
  yogaNode.setAlignItems(Align.FlexStart);

  const entry: YogaLayoutEntry = {
    mounted,
    yogaNode,
    children: [],
    flow: parentFlow
  };

  for (const child of getStructureChildren(mounted)) {
    const childEntry = buildYogaTree(child, parentFlow, context);
    yogaNode.insertChild(childEntry.yogaNode, yogaNode.getChildCount());
    entry.children.push(childEntry);
  }

  return entry;
}

function applyElementStyle(
  entry: YogaLayoutEntry,
  parentFlow: LayoutFlow,
  context: YogaBuildContext
): void {
  const mounted = entry.mounted;

  if (mounted.kind !== "element") {
    return;
  }

  const yogaNode = entry.yogaNode;

  switch (mounted.tag) {
    case "screen":
      yogaNode.setFlexDirection(FlexDirection.Column);
      applyFlexContainerProps(yogaNode, mounted);
      return;
    case "vstack":
      yogaNode.setFlexDirection(FlexDirection.Column);
      applyFlexItemProps(yogaNode, mounted);
      applyFlexContainerProps(yogaNode, mounted);
      return;
    case "hstack":
      yogaNode.setFlexDirection(FlexDirection.Row);
      applyFlexItemProps(yogaNode, mounted);
      applyFlexContainerProps(yogaNode, mounted);
      return;
    case "box":
      applyBoxStyle(yogaNode, mounted);
      return;
    case "text":
      applyTextStyle(yogaNode, mounted);
      return;
    case "spacer":
      applySpacerStyle(yogaNode, mounted, parentFlow, context);
      return;
    case "button":
    case "input":
      throw new Error(`Unsupported layout element: ${mounted.tag}`);
  }
}

function applyBoxStyle(yogaNode: YogaNode, mounted: MountedElementNode): void {
  const edges = getBoxEdges(mounted);

  yogaNode.setFlexDirection(FlexDirection.Column);
  yogaNode.setPadding(Edge.All, edges.padding);
  yogaNode.setBorder(Edge.All, edges.border);
  yogaNode.setWidth(readOptionalSize(mounted.props.width));
  yogaNode.setHeight(readOptionalSize(mounted.props.height));
  applyFlexItemProps(yogaNode, mounted);
  applyFlexContainerProps(yogaNode, mounted);
}

function applyTextStyle(yogaNode: YogaNode, mounted: MountedElementNode): void {
  applyFlexItemProps(yogaNode, mounted);
  yogaNode.setMeasureFunc((width, widthMode) => {
    const wrap = readTextWrap(mounted.props.wrap);
    const layout = layoutText(String(mounted.props.value ?? ""), {
      width: wrap === "legacy" || widthMode === MeasureMode.Undefined
        ? undefined
        : width,
      wrap
    });

    return {
      width: layout.width,
      height: layout.height
    };
  });
}

function applySpacerStyle(
  yogaNode: YogaNode,
  mounted: MountedElementNode,
  parentFlow: LayoutFlow,
  context: YogaBuildContext
): void {
  const size = toNonNegativeNumber(mounted.props.size);
  applyFlexItemProps(yogaNode, mounted);

  if (parentFlow === "row") {
    yogaNode.setMeasureFunc((_width, _widthMode, height, heightMode) => ({
      width: size,
      height: heightMode === MeasureMode.Undefined
        ? context.viewport.height
        : height
    }));
    return;
  }

  yogaNode.setMeasureFunc((width, widthMode) => ({
    width: widthMode === MeasureMode.Undefined
      ? context.viewport.width
      : width,
    height: size
  }));
}

function applyFlexItemProps(yogaNode: YogaNode, mounted: MountedElementNode): void {
  if (hasOwn(mounted.props, "flexGrow")) {
    yogaNode.setFlexGrow(toNonNegativeNumber(mounted.props.flexGrow));
  }

  if (hasOwn(mounted.props, "flexShrink")) {
    yogaNode.setFlexShrink(toNonNegativeNumber(mounted.props.flexShrink));
  }
}

function applyFlexContainerProps(
  yogaNode: YogaNode,
  mounted: MountedElementNode
): void {
  yogaNode.setAlignItems(Align.FlexStart);

  if (hasOwn(mounted.props, "gap")) {
    yogaNode.setGap(Gutter.All, toNonNegativeNumber(mounted.props.gap));
  }

  if (hasOwn(mounted.props, "alignItems")) {
    yogaNode.setAlignItems(readAlignItems(mounted.props.alignItems));
  }

  if (hasOwn(mounted.props, "justifyContent")) {
    yogaNode.setJustifyContent(readJustifyContent(mounted.props.justifyContent));
  }

  if (hasOwn(mounted.props, "flexWrap")) {
    yogaNode.setFlexWrap(readFlexWrap(mounted.props.flexWrap));
  }
}

function readLayoutTree(
  entry: YogaLayoutEntry,
  parentX: number,
  parentY: number
): LayoutNode {
  const rect = {
    x: toLayoutNumber(parentX + entry.yogaNode.getComputedLeft()),
    y: toLayoutNumber(parentY + entry.yogaNode.getComputedTop()),
    width: toLayoutNumber(entry.yogaNode.getComputedWidth()),
    height: toLayoutNumber(entry.yogaNode.getComputedHeight())
  };
  const contentRect = getContentRect(entry, rect);
  const layout: LayoutNode = {
    mounted: entry.mounted,
    rect,
    contentRect,
    children: []
  };

  layout.children = entry.children.map((child) =>
    readLayoutTree(child, rect.x, rect.y)
  );

  applyTerminalLayoutFields(entry, layout);

  return layout;
}

function applyTerminalLayoutFields(
  entry: YogaLayoutEntry,
  layout: LayoutNode
): void {
  if (entry.mounted.kind !== "element" || entry.mounted.tag !== "box") {
    return;
  }

  const overflow = readOverflow(entry.mounted.props.overflow);
  const hasScrollX = hasOwn(entry.mounted.props, "scrollX");
  const hasScrollY = hasOwn(entry.mounted.props, "scrollY");

  if (overflow === "clip") {
    layout.clip = layout.contentRect;
  }

  if (overflow === "clip" || hasScrollX || hasScrollY) {
    layout.contentSize = measureContentSize(layout.children, layout.contentRect);
  }

  if (hasScrollX || hasScrollY) {
    const contentSize = layout.contentSize ?? {
      width: layout.contentRect.width,
      height: layout.contentRect.height
    };
    const maxX = clampNonNegative(contentSize.width - layout.contentRect.width);
    const maxY = clampNonNegative(contentSize.height - layout.contentRect.height);

    layout.scrollOffset = {
      x: clamp(readScrollOffset(entry.mounted.props.scrollX), 0, maxX),
      y: clamp(readScrollOffset(entry.mounted.props.scrollY), 0, maxY)
    };
  }
}

function getContentRect(entry: YogaLayoutEntry, rect: LayoutRect): LayoutRect {
  if (entry.mounted.kind !== "element" || entry.mounted.tag !== "box") {
    return rect;
  }

  const edges = getBoxEdges(entry.mounted);
  const inset = getBoxInset(edges);

  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width: clampNonNegative(rect.width - inset * 2),
    height: clampNonNegative(rect.height - inset * 2)
  };
}

function measureContentSize(
  children: LayoutNode[],
  contentRect: LayoutRect
): LayoutSize {
  let width = 0;
  let height = 0;

  for (const child of children) {
    width = Math.max(width, child.rect.x + child.rect.width - contentRect.x);
    height = Math.max(height, child.rect.y + child.rect.height - contentRect.y);
  }

  return {
    width: clampNonNegative(width),
    height: clampNonNegative(height)
  };
}

function getElementFlow(
  node: MountedElementNode,
  parentFlow: LayoutFlow
): LayoutFlow {
  switch (node.tag) {
    case "hstack":
      return "row";
    case "screen":
    case "vstack":
    case "box":
      return "column";
    case "text":
    case "spacer":
    case "button":
    case "input":
      return parentFlow;
  }
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
    readTextWrap(node.props.wrap);
  }
}

function getBoxEdges(node: MountedElementNode): BoxEdges {
  return {
    border: node.props.border ? 1 : 0,
    padding: toNonNegativeNumber(node.props.padding)
  };
}

function getBoxInset(edges: BoxEdges): number {
  return edges.border + edges.padding;
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

function readTextWrap(value: unknown): TextWrapMode {
  if (value === null || value === undefined) {
    return "legacy";
  }

  if (
    value === "none" ||
    value === "wrap" ||
    value === "hard" ||
    value === "truncate-end" ||
    value === "truncate-middle" ||
    value === "truncate-start"
  ) {
    return value;
  }

  throw new Error(`Unsupported text wrap value: ${String(value)}`);
}

function readAlignItems(value: unknown): Align {
  switch (value) {
    case "flex-start":
      return Align.FlexStart;
    case "center":
      return Align.Center;
    case "flex-end":
      return Align.FlexEnd;
    case "stretch":
      return Align.Stretch;
    default:
      throw new Error(`Unsupported alignItems value: ${String(value)}`);
  }
}

function readJustifyContent(value: unknown): Justify {
  switch (value) {
    case "flex-start":
      return Justify.FlexStart;
    case "center":
      return Justify.Center;
    case "flex-end":
      return Justify.FlexEnd;
    case "space-between":
      return Justify.SpaceBetween;
    case "space-around":
      return Justify.SpaceAround;
    case "space-evenly":
      return Justify.SpaceEvenly;
    default:
      throw new Error(`Unsupported justifyContent value: ${String(value)}`);
  }
}

function readFlexWrap(value: unknown): Wrap {
  switch (value) {
    case "nowrap":
      return Wrap.NoWrap;
    case "wrap":
      return Wrap.Wrap;
    case "wrap-reverse":
      return Wrap.WrapReverse;
    default:
      throw new Error(`Unsupported flexWrap value: ${String(value)}`);
  }
}

function hasOwn(props: Record<string, unknown>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(props, name);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toLayoutNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
