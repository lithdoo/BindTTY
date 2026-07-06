import Yoga from "yoga-layout";
import { layoutText, readTextWrapMode } from "@bindtty/text";
import type { MountedElementNode, MountedNode } from "@bindtty/vnode";
import type { LayoutFlow } from "./intrinsic.js";
import {
  readLayoutProp,
  readOverflow,
  resolveMargin,
  resolvePadding,
  validateElementProps,
  yogaSupportedPropsByTag
} from "./layout-props.js";
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
  validateElementProps(node, yogaSupportedPropsByTag[node.tag]);
  applyYogaItemProps(node, yogaNode);
  applyYogaSizeProps(node, yogaNode);
  applyYogaMarginProps(node, yogaNode);

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
  }
}

function configureYogaBox(node: MountedElementNode, yogaNode: YogaNode): void {
  const border = node.props.border ? 1 : 0;
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

  applyYogaBoxPadding(node, yogaNode);

  if (overflow === "clip" || hasOwn(node.props, "scrollX") || hasOwn(node.props, "scrollY")) {
    yogaNode.setOverflow(Yoga.OVERFLOW_HIDDEN);
  }
}

function applyYogaBoxPadding(node: MountedElementNode, yogaNode: YogaNode): void {
  const padding = resolvePadding(node.props);

  if (padding.top > 0) {
    yogaNode.setPadding(Yoga.EDGE_TOP, padding.top);
  }

  if (padding.right > 0) {
    yogaNode.setPadding(Yoga.EDGE_RIGHT, padding.right);
  }

  if (padding.bottom > 0) {
    yogaNode.setPadding(Yoga.EDGE_BOTTOM, padding.bottom);
  }

  if (padding.left > 0) {
    yogaNode.setPadding(Yoga.EDGE_LEFT, padding.left);
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

  const borderSize = entry.mounted.props.border ? 1 : 0;
  const padding = resolvePadding(entry.mounted.props);

  return {
    x: rect.x + borderSize + padding.left,
    y: rect.y + borderSize + padding.top,
    width: clampNonNegative(rect.width - borderSize * 2 - padding.left - padding.right),
    height: clampNonNegative(rect.height - borderSize * 2 - padding.top - padding.bottom)
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
    const margin =
      child.mounted.kind === "element"
        ? resolveMargin(child.mounted.props)
        : { top: 0, right: 0, bottom: 0, left: 0 };

    width = Math.max(
      width,
      child.rect.x + child.rect.width + margin.right - layout.contentRect.x
    );
    height = Math.max(
      height,
      child.rect.y + child.rect.height + margin.bottom - layout.contentRect.y
    );
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

function applyYogaSizeProps(node: MountedElementNode, yogaNode: YogaNode): void {
  const minWidth = readOptionalSize(readLayoutProp(node.props, "minWidth"));
  const minHeight = readOptionalSize(readLayoutProp(node.props, "minHeight"));
  const maxWidth = readOptionalSize(readLayoutProp(node.props, "maxWidth"));
  const maxHeight = readOptionalSize(readLayoutProp(node.props, "maxHeight"));

  if (minWidth !== undefined) {
    yogaNode.setMinWidth(minWidth);
  }

  if (minHeight !== undefined) {
    yogaNode.setMinHeight(minHeight);
  }

  if (maxWidth !== undefined) {
    yogaNode.setMaxWidth(maxWidth);
  }

  if (maxHeight !== undefined) {
    yogaNode.setMaxHeight(maxHeight);
  }
}

function applyYogaMarginProps(node: MountedElementNode, yogaNode: YogaNode): void {
  const margin = resolveMargin(node.props);

  if (margin.top > 0) {
    yogaNode.setMargin(Yoga.EDGE_TOP, margin.top);
  }

  if (margin.right > 0) {
    yogaNode.setMargin(Yoga.EDGE_RIGHT, margin.right);
  }

  if (margin.bottom > 0) {
    yogaNode.setMargin(Yoga.EDGE_BOTTOM, margin.bottom);
  }

  if (margin.left > 0) {
    yogaNode.setMargin(Yoga.EDGE_LEFT, margin.left);
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

function readOptionalSize(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return toNonNegativeNumber(value);
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
