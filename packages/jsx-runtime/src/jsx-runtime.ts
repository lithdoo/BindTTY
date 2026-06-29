import {
  componentTemplate,
  elementSchemas,
  elementTemplate,
  forTemplate,
  fragmentTemplate,
  showTemplate
} from "@bindtty/vnode";
import type {
  BindingValue,
  FunctionComponent,
  IntrinsicElementTag,
  Template,
  TemplateChildren
} from "@bindtty/vnode";
import type { ForProps, JsxProps, JsxType, ShowProps } from "./types.js";

export const Fragment = Symbol.for("bindtty.fragment");

export function jsx(type: JsxType, rawProps: JsxProps | null): Template {
  const props = normalizeProps(rawProps);

  if (type === Fragment) {
    return fragmentTemplate(props.children as TemplateChildren);
  }

  if (typeof type === "function") {
    return componentTemplate(type as FunctionComponent<Record<string, unknown>>, props);
  }

  if (type === "show") {
    return createShowTemplate(props);
  }

  if (type === "for") {
    return createForTemplate(props);
  }

  if (typeof type === "string") {
    return createElementTemplate(type, props);
  }

  throw new TypeError("Unsupported JSX type.");
}

export const jsxs = jsx;

function normalizeProps(rawProps: JsxProps | null): JsxProps {
  return rawProps ? { ...rawProps } : {};
}

function takeChildren(props: JsxProps): unknown {
  const children = props.children;
  delete props.children;
  return children;
}

function createElementTemplate(type: string, props: JsxProps): Template {
  if (!isIntrinsicElementTag(type)) {
    throw new TypeError(`Unknown intrinsic element <${type}>.`);
  }

  const children = takeChildren(props);
  return elementTemplate(type, props, children as TemplateChildren);
}

function createShowTemplate(props: JsxProps): Template {
  if (!("when" in props)) {
    throw new TypeError("<show> requires prop \"when\".");
  }

  const showProps = props as ShowProps;
  const children = takeChildren(showProps);

  return showTemplate({
    when: showProps.when,
    fallback: showProps.fallback,
    children: children as TemplateChildren
  });
}

function createForTemplate(props: JsxProps): Template {
  if (!("each" in props)) {
    throw new TypeError("<for> requires prop \"each\".");
  }

  const forProps = props as ForProps;
  const children = takeChildren(forProps);

  if (typeof children !== "function") {
    throw new TypeError("<for> children must be a render function.");
  }

  return forTemplate({
    each: forProps.each,
    key: forProps.key,
    renderItem: children as (item: unknown, index: number) => Template
  });
}

function isIntrinsicElementTag(type: string): type is IntrinsicElementTag {
  return type in elementSchemas;
}

export namespace JSX {
  export type Element = Template;

  export interface IntrinsicElements {
    screen: {
      children?: TemplateChildren;
    };

    box: {
      children?: TemplateChildren;
      border?: BindingValue<boolean>;
      padding?: BindingValue<number>;
    };

    vstack: {
      children?: TemplateChildren;
    };

    hstack: {
      children?: TemplateChildren;
    };

    text: {
      value: BindingValue<string | number>;
      color?: BindingValue<string>;
      bold?: BindingValue<boolean>;
      children?: never;
    };

    button: {
      value: BindingValue<string | number>;
      disabled?: BindingValue<boolean>;
      onPress?: () => void;
      children?: never;
    };

    input: {
      value?: BindingValue<string>;
      placeholder?: BindingValue<string>;
      children?: never;
    };

    spacer: {
      size?: BindingValue<number>;
      children?: never;
    };

    show: {
      when: BindingValue<boolean>;
      fallback?: Template;
      children?: TemplateChildren;
    };

    for: {
      each: BindingValue<readonly unknown[]>;
      key?: (item: unknown, index: number) => string | number;
      children: (item: unknown, index: number) => Template;
    };
  }
}
