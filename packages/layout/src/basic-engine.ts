import { layoutText, readTextWrapMode } from "@bindtty/text";
import type { MountedElementNode, MountedNode } from "@bindtty/vnode";
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

interface LayoutConstraint {
  width: number;
  height: number;
  flow: LayoutFlow;
}

const supportedPropsByTag: Record<MountedElementNode["tag"], Set<string>> = {
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

type LayoutOverflow = "visible" | "clip";

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

export function createBasicLayoutEngine(): LayoutEngine {
  return {
    layout(root: MountedNode | null, options: LayoutEngineOptions): LayoutNode | null {
      if (!root) {
        return null;
      }

      const constraint: LayoutConstraint = {
        width: options.viewport.width,
        height: options.viewport.height,
        flow: "column"
      };

      const measured = measureNode(root, constraint);
      const rect = createRootRect(root, measured, options);

      return arrangeNode(root, rect, constraint);
    }
  };
}

function measureNode(node: MountedNode, constraint: LayoutConstraint): LayoutSize {
  switch (node.kind) {
    case "element":
      return measureElement(node, constraint);
    case "fragment":
    case "show":
    case "for":
      return measureFlowChildren(getStructureChildren(node), constraint.flow, constraint);
  }
}

function measureElement(
  node: MountedElementNode,
  constraint: LayoutConstraint
): LayoutSize {
  validateElementProps(node);

  switch (node.tag) {
    case "screen":
      return {
        width: constraint.width,
        height: constraint.height
      };
    case "text":
      return measureTextElement(node, constraint);
    case "spacer":
      return measureSpacer(node, constraint);
    case "vstack":
      return measureFlowChildren(node.children, "column", constraint);
    case "hstack":
      return measureFlowChildren(node.children, "row", constraint);
    case "box":
      return measureBox(node, constraint);
    case "button":
    case "input":
      throw new Error(`Unsupported layout element: ${node.tag}`);
  }
}

function measureTextElement(
  node: MountedElementNode,
  constraint: LayoutConstraint
): LayoutSize {
  const text = String(node.props.value ?? "");
  const wrap = readTextWrapMode(node.props.wrap);
  const layout = layoutText(text, {
    width: wrap === "legacy" ? undefined : constraint.width,
    wrap
  });

  return {
    width: layout.width,
    height: layout.height
  };
}

function measureSpacer(
  node: MountedElementNode,
  constraint: LayoutConstraint
): LayoutSize {
  const size = toNonNegativeNumber(node.props.size);

  if (constraint.flow === "row") {
    return {
      width: size,
      height: constraint.height
    };
  }

  return {
    width: constraint.width,
    height: size
  };
}

function measureBox(
  node: MountedElementNode,
  constraint: LayoutConstraint
): LayoutSize {
  const edges = getBoxEdges(node);
  const inset = getBoxInset(edges);
  const width = readOptionalSize(node.props.width);
  const height = readOptionalSize(node.props.height);
  const contentConstraint = {
    ...shrinkConstraint(constraint, edges),
    ...(width === undefined
      ? {}
      : { width: clampNonNegative(width - inset * 2) }),
    ...(height === undefined
      ? {}
      : { height: clampNonNegative(height - inset * 2) })
  };
  const childrenSize = measureFlowChildren(node.children, "column", contentConstraint);

  return {
    width: width ?? childrenSize.width + inset * 2,
    height: height ?? childrenSize.height + inset * 2
  };
}

function measureFlowChildren(
  children: MountedNode[],
  flow: LayoutFlow,
  constraint: LayoutConstraint
): LayoutSize {
  let width = 0;
  let height = 0;

  for (const child of children) {
    const childSize = measureNode(child, {
      ...constraint,
      flow
    });

    if (flow === "row") {
      width += childSize.width;
      height = Math.max(height, childSize.height);
    } else {
      width = Math.max(width, childSize.width);
      height += childSize.height;
    }
  }

  return { width, height };
}

function arrangeNode(
  node: MountedNode,
  rect: LayoutRect,
  constraint: LayoutConstraint
): LayoutNode {
  switch (node.kind) {
    case "element":
      return arrangeElement(node, rect, constraint);
    case "fragment":
    case "show":
    case "for":
      return arrangeStructureNode(node, rect, constraint);
  }
}

function arrangeStructureNode(
  node: MountedNode,
  rect: LayoutRect,
  constraint: LayoutConstraint
): LayoutNode {
  return {
    mounted: node,
    rect,
    contentRect: rect,
    children: arrangeFlowChildren(
      getStructureChildren(node),
      rect,
      constraint.flow,
      constraint
    )
  };
}

function arrangeElement(
  node: MountedElementNode,
  rect: LayoutRect,
  constraint: LayoutConstraint
): LayoutNode {
  validateElementProps(node);

  switch (node.tag) {
    case "screen":
      return arrangeFlowElement(node, rect, rect, "column", constraint);
    case "vstack":
      return arrangeFlowElement(node, rect, rect, "column", constraint);
    case "hstack":
      return arrangeFlowElement(node, rect, rect, "row", constraint);
    case "box":
      return arrangeBox(node, rect, constraint);
    case "text":
    case "spacer":
      return createLeafLayout(node, rect);
    case "button":
    case "input":
      throw new Error(`Unsupported layout element: ${node.tag}`);
  }
}

function arrangeBox(
  node: MountedElementNode,
  rect: LayoutRect,
  constraint: LayoutConstraint
): LayoutNode {
  const edges = getBoxEdges(node);
  const inset = getBoxInset(edges);
  const contentRect = {
    x: rect.x + inset,
    y: rect.y + inset,
    width: clampNonNegative(rect.width - inset * 2),
    height: clampNonNegative(rect.height - inset * 2)
  };
  const contentConstraint = {
    ...constraint,
    width: contentRect.width,
    height: contentRect.height
  };
  const layout = arrangeFlowElement(node, rect, contentRect, "column", contentConstraint);
  const overflow = readOverflow(node.props.overflow);
  const hasScrollX = hasOwn(node.props, "scrollX");
  const hasScrollY = hasOwn(node.props, "scrollY");

  if (overflow === "clip") {
    layout.clip = contentRect;
  }

  if (overflow === "clip" || hasScrollX || hasScrollY) {
    layout.contentSize = measureFlowChildren(node.children, "column", contentConstraint);
  }

  if (hasScrollX || hasScrollY) {
    const contentSize = layout.contentSize ?? {
      width: contentRect.width,
      height: contentRect.height
    };
    const maxY = clampNonNegative(contentSize.height - contentRect.height);

    layout.scrollOffset = {
      x: 0,
      y: clamp(readScrollOffset(node.props.scrollY), 0, maxY)
    };
  }

  return layout;
}

function arrangeFlowElement(
  node: MountedElementNode,
  rect: LayoutRect,
  contentRect: LayoutRect,
  flow: LayoutFlow,
  constraint: LayoutConstraint
): LayoutNode {
  return {
    mounted: node,
    rect,
    contentRect,
    children: arrangeFlowChildren(node.children, contentRect, flow, constraint)
  };
}

function arrangeFlowChildren(
  children: MountedNode[],
  contentRect: LayoutRect,
  flow: LayoutFlow,
  constraint: LayoutConstraint
): LayoutNode[] {
  const arrangedChildren: LayoutNode[] = [];
  let cursorX = contentRect.x;
  let cursorY = contentRect.y;

  for (const child of children) {
    const childConstraint = {
      width: contentRect.width,
      height: contentRect.height,
      flow
    };
    const childSize = measureNode(child, childConstraint);
    const childRect =
      flow === "row"
        ? {
            x: cursorX,
            y: contentRect.y,
            width: childSize.width,
            height: childSize.height
          }
        : {
            x: contentRect.x,
            y: cursorY,
            width: childSize.width,
            height: childSize.height
          };

    arrangedChildren.push(arrangeNode(child, childRect, childConstraint));

    if (flow === "row") {
      cursorX += childSize.width;
    } else {
      cursorY += childSize.height;
    }
  }

  return arrangedChildren;
}

function createLeafLayout(node: MountedElementNode, rect: LayoutRect): LayoutNode {
  return {
    mounted: node,
    rect,
    contentRect: rect,
    children: []
  };
}

function createRootRect(
  root: MountedNode,
  measured: LayoutSize,
  options: LayoutEngineOptions
): LayoutRect {
  if (root.kind === "element" && root.tag === "screen") {
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
    width: measured.width,
    height: measured.height
  };
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

function shrinkConstraint(
  constraint: LayoutConstraint,
  edges: BoxEdges
): LayoutConstraint {
  const inset = getBoxInset(edges) * 2;

  return {
    ...constraint,
    width: clampNonNegative(constraint.width - inset),
    height: clampNonNegative(constraint.height - inset)
  };
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
