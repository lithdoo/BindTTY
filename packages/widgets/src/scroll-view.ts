import { computed } from "@bindtty/signal";
import {
  elementTemplate,
  isReadableSignal,
  type BindingValue,
  type MountedElementApi,
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
  const scrollState: ScrollViewAppliedState = {
    hasLayout: false,
    appliedY: 0,
    maxY: 0,
    pageY: 1
  };

  return elementTemplate(
    "box",
    omitUndefined({
      id: props.id,
      ref: createScrollViewRef(scrollState),
      onKey: createScrollViewOnKey(props, scrollState),
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

interface ScrollViewAppliedState {
  hasLayout: boolean;
  appliedY: number;
  maxY: number;
  pageY: number;
}

interface ScrollViewLayoutState {
  rect: {
    height: number;
  };
  contentRect: {
    height: number;
  };
  clip?: {
    height: number;
  };
  scrollOffset?: {
    y: number;
  };
  contentSize?: {
    height: number;
  };
}

function createScrollViewRef(
  state: ScrollViewAppliedState
): (api: MountedElementApi) => void {
  return (api) => {
    api.onLayout = (layout) => {
      const nextLayout = layout as ScrollViewLayoutState;
      const viewportHeight =
        nextLayout.clip?.height ??
        nextLayout.contentRect.height ??
        nextLayout.rect.height;
      const contentHeight =
        nextLayout.contentSize?.height ??
        nextLayout.contentRect.height ??
        nextLayout.rect.height;

      state.hasLayout = true;
      state.appliedY = nextLayout.scrollOffset?.y ?? 0;
      state.maxY = Math.max(0, contentHeight - viewportHeight);
      state.pageY = Math.max(1, viewportHeight);
    };

    api.onUnmount = () => {
      state.hasLayout = false;
      state.appliedY = 0;
      state.maxY = 0;
      state.pageY = 1;
    };
  };
}

function createScrollViewOnKey(
  props: ScrollViewProps,
  state: ScrollViewAppliedState
): BindingValue<InteractionKeyBinding> {
  const handler = props.onOffsetChange ? createScrollHandler(props, state) : false;
  const scrollOnArrow = props.scrollOnArrow;

  if (isReadableSignal<boolean>(scrollOnArrow)) {
    return computed(() => (scrollOnArrow.get() === false ? false : handler));
  }

  return scrollOnArrow === false ? false : handler;
}

function createScrollHandler(
  props: ScrollViewProps,
  state: ScrollViewAppliedState
): InteractionKeyHandler {
  return (event) => {
    const fallbackOffset = readNumberBindingValue(props.offset, 0);
    const fallbackHeight = Math.max(1, readNumberBindingValue(props.height, 1));
    const offset = state.hasLayout ? state.appliedY : fallbackOffset;
    const maxY = state.hasLayout ? state.maxY : Number.MAX_SAFE_INTEGER;
    const pageY = state.hasLayout ? state.pageY : fallbackHeight;

    switch (event.name) {
      case "up":
        props.onOffsetChange?.(Math.max(0, offset - 1));
        return true;
      case "down":
        props.onOffsetChange?.(Math.min(maxY, offset + 1));
        return true;
      case "pageup":
        props.onOffsetChange?.(Math.max(0, offset - pageY));
        return true;
      case "pagedown":
        props.onOffsetChange?.(Math.min(maxY, offset + pageY));
        return true;
      case "home":
        props.onOffsetChange?.(0);
        return true;
      case "end":
        props.onOffsetChange?.(maxY);
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
