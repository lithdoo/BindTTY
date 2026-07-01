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

type InteractionFocusChangeReason =
  | "initial"
  | "next"
  | "previous"
  | "programmatic"
  | "clear"
  | "refresh";

interface InteractionNodeFocusChangeEvent {
  id: string;
  node: unknown;
  focused: boolean;
  reason: InteractionFocusChangeReason;
}

interface InteractionKeyEvent {
  input: string;
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence?: string;
}

interface InteractionKeyContext {
  node: unknown;
  isFocused: true;
}

type InteractionKeyHandler = (
  event: InteractionKeyEvent,
  context: InteractionKeyContext
) => boolean | void;
type InteractionKeyBinding = boolean | InteractionKeyHandler | null | undefined;

interface IntrinsicInteractionProps {
  id?: BindingValue<string | number>;
  onKey?: BindingValue<InteractionKeyBinding>;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

interface IntrinsicPaintProps {
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  bold?: BindingValue<boolean>;
}

interface IntrinsicBoxStyleProps {
  border?: BindingValue<boolean | number>;
  padding?: BindingValue<number>;
}

export function jsx(
  type: JsxType,
  rawProps: JsxProps | null,
  jsxKey?: unknown
): Template {
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
    if (jsxKey !== undefined && !("key" in props)) {
      props.key = jsxKey;
    }

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
    screen: IntrinsicInteractionProps & {
      children?: TemplateChildren;
    };

    box: IntrinsicInteractionProps & IntrinsicBoxStyleProps & IntrinsicPaintProps & {
      children?: TemplateChildren;
    };

    vstack: IntrinsicInteractionProps & {
      children?: TemplateChildren;
    };

    hstack: IntrinsicInteractionProps & {
      children?: TemplateChildren;
    };

    text: IntrinsicInteractionProps & IntrinsicPaintProps & {
      value: BindingValue<string | number>;
      children?: never;
    };

    button: IntrinsicInteractionProps & {
      value: BindingValue<string | number>;
      disabled?: BindingValue<boolean>;
      onPress?: () => void;
      children?: never;
    };

    input: IntrinsicInteractionProps & {
      value?: BindingValue<string>;
      placeholder?: BindingValue<string>;
      children?: never;
    };

    spacer: IntrinsicInteractionProps & {
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
