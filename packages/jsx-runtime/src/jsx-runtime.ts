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
  MountedElementRefHandler,
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
type PublicTextWrapMode =
  | "none"
  | "wrap"
  | "hard"
  | "truncate-end"
  | "truncate-middle"
  | "truncate-start";

interface IntrinsicInteractionProps {
  id?: BindingValue<string | number>;
  ref?: MountedElementRefHandler | null | undefined;
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
  height?: BindingValue<number>;
  width?: BindingValue<number>;
  overflow?: BindingValue<"visible" | "clip">;
  scrollX?: BindingValue<number>;
  scrollY?: BindingValue<number>;
}

interface IntrinsicFlexItemProps {
  flexGrow?: BindingValue<number>;
  flexShrink?: BindingValue<number>;
}

interface IntrinsicFlexContainerProps {
  gap?: BindingValue<number>;
  alignItems?: BindingValue<"flex-start" | "center" | "flex-end" | "stretch">;
  justifyContent?: BindingValue<
    | "flex-start"
    | "center"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly"
  >;
  flexWrap?: BindingValue<"nowrap" | "wrap" | "wrap-reverse">;
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

    box: IntrinsicInteractionProps & IntrinsicBoxStyleProps & IntrinsicPaintProps & IntrinsicFlexItemProps & IntrinsicFlexContainerProps & {
      children?: TemplateChildren;
    };

    vstack: IntrinsicInteractionProps & IntrinsicFlexItemProps & IntrinsicFlexContainerProps & {
      children?: TemplateChildren;
    };

    hstack: IntrinsicInteractionProps & IntrinsicFlexItemProps & IntrinsicFlexContainerProps & {
      children?: TemplateChildren;
    };

    text: IntrinsicInteractionProps & IntrinsicPaintProps & IntrinsicFlexItemProps & {
      value: BindingValue<string | number>;
      wrap?: BindingValue<PublicTextWrapMode>;
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

    spacer: IntrinsicInteractionProps & IntrinsicFlexItemProps & {
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
