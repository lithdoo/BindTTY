import { computed } from "@bindtty/signal";
import {
  elementTemplate,
  isReadableSignal,
  type BindingValue,
  type Template,
  type TemplateChildren
} from "@bindtty/vnode";
import type {
  InteractionKeyBinding,
  InteractionKeyHandler,
  InteractionNodeFocusChangeEvent
} from "@bindtty/interaction";

export interface ScrollViewStyleProps {
  background?: BindingValue<string>;
  borderColor?: BindingValue<string>;
  padding?: BindingValue<number>;
  border?: BindingValue<boolean | number>;
}

export interface ScrollViewProps extends ScrollViewStyleProps {
  id?: BindingValue<string | number>;
  offset?: BindingValue<number>;
  height: BindingValue<number>;
  width?: BindingValue<number>;
  children?: TemplateChildren;
  scrollOnArrow?: BindingValue<boolean>;
  onOffsetChange?: (nextOffset: number) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export function ScrollView(props: ScrollViewProps): Template {
  return elementTemplate(
    "box",
    omitUndefined({
      id: props.id,
      onKey: createScrollViewOnKey(props),
      onFocusChange: props.onFocusChange,
      height: props.height,
      width: props.width,
      overflow: "clip",
      scrollX: 0,
      scrollY: props.offset ?? 0,
      border: props.border,
      padding: props.padding,
      background: props.background,
      borderColor: props.borderColor
    }),
    props.children
  );
}

function createScrollViewOnKey(
  props: ScrollViewProps
): BindingValue<InteractionKeyBinding> {
  const handler = props.onOffsetChange ? createScrollHandler(props) : false;
  const scrollOnArrow = props.scrollOnArrow;

  if (isReadableSignal<boolean>(scrollOnArrow)) {
    return computed(() => (scrollOnArrow.get() === false ? false : handler));
  }

  return scrollOnArrow === false ? false : handler;
}

function createScrollHandler(props: ScrollViewProps): InteractionKeyHandler {
  return (event) => {
    const offset = readNumberBindingValue(props.offset, 0);
    const height = readNumberBindingValue(props.height, 0);

    switch (event.name) {
      case "up":
        props.onOffsetChange?.(offset - 1);
        return true;
      case "down":
        props.onOffsetChange?.(offset + 1);
        return true;
      case "pageup":
        props.onOffsetChange?.(offset - height);
        return true;
      case "pagedown":
        props.onOffsetChange?.(offset + height);
        return true;
      case "home":
        props.onOffsetChange?.(0);
        return true;
      case "end":
        props.onOffsetChange?.(Number.MAX_SAFE_INTEGER);
        return true;
      default:
        return false;
    }
  };
}

function readNumberBindingValue(
  value: BindingValue<number> | undefined,
  fallback: number
): number {
  const nextValue = isReadableSignal<number>(value) ? value.get() : value;
  return typeof nextValue === "number" && Number.isFinite(nextValue)
    ? nextValue
    : fallback;
}

function omitUndefined(
  props: Record<string, BindingValue<unknown> | undefined>
): Record<string, BindingValue<unknown>> {
  const result: Record<string, BindingValue<unknown>> = {};

  for (const [name, value] of Object.entries(props)) {
    if (value !== undefined) {
      result[name] = value;
    }
  }

  return result;
}
