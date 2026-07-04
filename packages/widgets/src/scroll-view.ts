import { computed, createSignal } from "@bindtty/signal";
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
  stickToBottom?: BindingValue<boolean>;
  showScrollbar?: BindingValue<boolean>;
  onOffsetChange?: (nextOffset: number) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export function computeScrollbarThumb(
  appliedY: number,
  maxY: number,
  viewportHeight: number,
  contentHeight: number
): { start: number; size: number } {
  if (maxY <= 0 || viewportHeight <= 0 || contentHeight <= 0) {
    return { start: 0, size: 0 };
  }

  const thumbSize = Math.max(
    1,
    Math.round((viewportHeight * viewportHeight) / contentHeight)
  );
  const clampedSize = Math.min(thumbSize, viewportHeight);
  const start = Math.round(
    (appliedY / maxY) * Math.max(0, viewportHeight - clampedSize)
  );

  return { start, size: clampedSize };
}

export function renderScrollbarColumn(
  appliedY: number,
  maxY: number,
  viewportHeight: number,
  contentHeight: number
): string {
  if (maxY <= 0 || viewportHeight <= 0) {
    return "";
  }

  const { start, size } = computeScrollbarThumb(
    appliedY,
    maxY,
    viewportHeight,
    contentHeight
  );
  const lines: string[] = [];

  for (let row = 0; row < viewportHeight; row += 1) {
    lines.push(row >= start && row < start + size ? "█" : "│");
  }

  return lines.join("\n");
}

export function ScrollView(props: ScrollViewProps): Template {
  const scrollState: ScrollViewAppliedState = {
    hasLayout: false,
    appliedY: 0,
    maxY: 0,
    pageY: 1,
    viewportHeight: 1,
    contentHeight: 1,
    userDetached: false
  };
  const layoutTick = createSignal(0);
  const scrollbarText = createSignal("");
  const usesScrollbar = props.showScrollbar !== undefined;

  const scrollBox = elementTemplate(
    "box",
    omitUndefined({
      id: props.id,
      ref: createScrollViewRef(props, scrollState, layoutTick, scrollbarText),
      onKey: createScrollViewOnKey(props, scrollState),
      onFocusChange: props.onFocusChange,
      height: props.height,
      width: usesScrollbar ? undefined : props.width,
      flexGrow: usesScrollbar ? 1 : undefined,
      overflow: "clip",
      scrollX: 0,
      scrollY: props.offset ?? 0,
      border: usesScrollbar ? undefined : props.border,
      padding: usesScrollbar ? undefined : props.padding,
      background: usesScrollbar ? undefined : props.background,
      borderColor: usesScrollbar ? undefined : props.borderColor
    }),
    props.children
  );

  if (!usesScrollbar) {
    return scrollBox;
  }

  const scrollbarValue = computed(() => {
    if (!readBooleanBindingValue(props.showScrollbar, false)) {
      return "";
    }

    layoutTick.get();
    return scrollbarText.get();
  });

  return elementTemplate(
    "box",
    omitUndefined({
      width: props.width,
      border: props.border,
      padding: props.padding,
      background: props.background,
      borderColor: props.borderColor
    }),
    elementTemplate("hstack", {}, [
      scrollBox,
      elementTemplate(
        "box",
        {
          width: 1,
          height: props.height
        },
        elementTemplate("text", {
          value: scrollbarValue
        })
      )
    ])
  );
}

interface ScrollViewAppliedState {
  hasLayout: boolean;
  appliedY: number;
  maxY: number;
  pageY: number;
  viewportHeight: number;
  contentHeight: number;
  userDetached: boolean;
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
  props: ScrollViewProps,
  state: ScrollViewAppliedState,
  layoutTick: ReturnType<typeof createSignal<number>>,
  scrollbarText: ReturnType<typeof createSignal<string>>
): (api: MountedElementApi) => void {
  return (api) => {
    api.onLayout = (layout) => {
      const nextLayout = layout as ScrollViewLayoutState;
      const hadLayout = state.hasLayout;
      const previousMaxY = state.maxY;
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
      state.viewportHeight = Math.max(1, viewportHeight);
      state.contentHeight = Math.max(1, contentHeight);

      const sticky = readBooleanBindingValue(props.stickToBottom, false);
      const externalOffset = readNumberBindingValue(props.offset, 0);
      const maxYIncreased = state.maxY > previousMaxY;

      if (
        sticky &&
        hadLayout &&
        externalOffset < state.maxY &&
        !(maxYIncreased && externalOffset >= previousMaxY)
      ) {
        state.userDetached = true;
      }

      if (
        sticky &&
        !state.userDetached &&
        props.onOffsetChange &&
        state.appliedY < state.maxY
      ) {
        props.onOffsetChange(state.maxY);
      }

      layoutTick.set(layoutTick.get() + 1);
      scrollbarText.set(
        readBooleanBindingValue(props.showScrollbar, false) &&
          state.maxY > 0
          ? renderScrollbarColumn(
              state.appliedY,
              state.maxY,
              state.viewportHeight,
              state.contentHeight
            )
          : ""
      );
    };

    api.onUnmount = () => {
      state.hasLayout = false;
      state.appliedY = 0;
      state.maxY = 0;
      state.pageY = 1;
      state.viewportHeight = 1;
      state.contentHeight = 1;
      state.userDetached = false;
      scrollbarText.set("");
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
    const sticky = readBooleanBindingValue(props.stickToBottom, false);
    const fallbackOffset = readNumberBindingValue(props.offset, 0);
    const fallbackHeight = Math.max(1, readNumberBindingValue(props.height, 1));
    const offset = state.hasLayout ? state.appliedY : fallbackOffset;
    const maxY = state.hasLayout ? state.maxY : Number.MAX_SAFE_INTEGER;
    const pageY = state.hasLayout ? state.pageY : fallbackHeight;

    switch (event.name) {
      case "up": {
        if (sticky) {
          state.userDetached = true;
        }
        props.onOffsetChange?.(Math.max(0, offset - 1));
        return true;
      }
      case "down": {
        const next = Math.min(maxY, offset + 1);
        if (sticky && next >= maxY) {
          state.userDetached = false;
        }
        props.onOffsetChange?.(next);
        return true;
      }
      case "pageup": {
        if (sticky) {
          state.userDetached = true;
        }
        props.onOffsetChange?.(Math.max(0, offset - pageY));
        return true;
      }
      case "pagedown": {
        const next = Math.min(maxY, offset + pageY);
        if (sticky && next >= maxY) {
          state.userDetached = false;
        }
        props.onOffsetChange?.(next);
        return true;
      }
      case "home": {
        if (sticky) {
          state.userDetached = true;
        }
        props.onOffsetChange?.(0);
        return true;
      }
      case "end": {
        if (sticky) {
          state.userDetached = false;
        }
        props.onOffsetChange?.(maxY);
        return true;
      }
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

function readBooleanBindingValue(
  value: BindingValue<boolean> | undefined,
  fallback: boolean
): boolean {
  const nextValue = isReadableSignal<boolean>(value) ? value.get() : value;
  return typeof nextValue === "boolean" ? nextValue : fallback;
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
