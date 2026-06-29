import type {
  ComponentTemplate,
  ElementTemplate,
  ForTemplate,
  FragmentTemplate,
  FunctionComponent,
  IntrinsicElementTag,
  ShowTemplate,
  Template,
  TemplateChild,
  TemplateChildren,
  TemplateProps
} from "./types.js";
import { elementSchemas } from "./schema.js";

const EMPTY_TEMPLATE: Template = { kind: "empty" };

export function emptyTemplate(): Template {
  return EMPTY_TEMPLATE;
}

export function elementTemplate(
  tag: IntrinsicElementTag,
  props: TemplateProps = {},
  children: TemplateChildren = []
): ElementTemplate {
  const normalizedChildren = normalizeChildren(children);
  validateElementTemplate(tag, props, normalizedChildren);

  return {
    kind: "element",
    tag,
    props,
    children: normalizedChildren
  };
}

export function fragmentTemplate(children: TemplateChildren = []): FragmentTemplate {
  return {
    kind: "fragment",
    children: normalizeChildren(children)
  };
}

export function componentTemplate<P>(
  component: FunctionComponent<P>,
  props: P
): ComponentTemplate<P> {
  return {
    kind: "component",
    component,
    props
  };
}

export function showTemplate(input: {
  when: ShowTemplate["when"];
  children: TemplateChild;
  fallback?: TemplateChild;
}): ShowTemplate {
  return {
    kind: "show",
    when: input.when,
    children: normalizeSingleTemplate(input.children),
    ...(input.fallback === undefined
      ? {}
      : { fallback: normalizeSingleTemplate(input.fallback) })
  };
}

export function forTemplate<T>(input: {
  each: ForTemplate<T>["each"];
  key?: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => Template;
}): ForTemplate<T> {
  return {
    kind: "for",
    each: input.each,
    ...(input.key ? { key: input.key } : {}),
    renderItem: input.renderItem
  };
}

export function normalizeSingleTemplate(child: TemplateChild): Template {
  const children = normalizeChildren(child);

  if (children.length === 0) {
    return emptyTemplate();
  }

  if (children.length === 1) {
    return children[0]!;
  }

  return fragmentTemplate(children);
}

export function normalizeChildren(children: TemplateChildren): Template[] {
  const result: Template[] = [];
  collectTemplateChildren(children, result);
  return result;
}

export function isTemplate(value: unknown): value is Template {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }

  const kind = value.kind;
  return (
    kind === "empty" ||
    kind === "element" ||
    kind === "fragment" ||
    kind === "component" ||
    kind === "show" ||
    kind === "for"
  );
}

export function validateElementTemplate(
  tag: IntrinsicElementTag,
  props: TemplateProps,
  children: Template[]
): void {
  const schema = elementSchemas[tag];

  if (!schema.acceptsChildren && children.length > 0) {
    throw new TypeError(`<${tag}> does not accept children.`);
  }

  for (const propName of schema.requiredProps ?? []) {
    if (!(propName in props)) {
      throw new TypeError(`<${tag}> requires prop "${propName}".`);
    }
  }
}

function collectTemplateChildren(
  child: TemplateChildren,
  result: Template[]
): void {
  if (child === null || child === undefined || child === false) {
    return;
  }

  if (Array.isArray(child)) {
    for (const item of child) {
      collectTemplateChildren(item, result);
    }
    return;
  }

  if (isTemplate(child)) {
    if (child.kind !== "empty") {
      result.push(child);
    }
    return;
  }

  throw new TypeError(
    "Template children must be Template values. Use <text value={...} /> for text."
  );
}
