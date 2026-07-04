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
import {
  applyStickToEndOnLayout,
  createScrollAxisState,
  omitUndefined,
  readBooleanBindingValue,
  readNumberBindingValue,
  renderScrollbarColumn,
  resetScrollAxisState,
  type ScrollAxisAppliedState,
  type ScrollAxisStyleProps
} from "./scroll-axis-shared.js";

export type VScrollViewStyleProps = ScrollAxisStyleProps;

export interface VScrollViewProps extends VScrollViewStyleProps {
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

export {
  computeScrollbarThumb,
  renderScrollbarColumn
} from "./scroll-axis-shared.js";

export function VScrollView(props: VScrollViewProps): Template {
  const scrollState = createScrollAxisState();
  const layoutTick = createSignal(0);
  const scrollbarText = createSignal("");
  const usesScrollbar = props.showScrollbar !== undefined;

  const scrollBox = elementTemplate(
    "box",
    omitUndefined({
      id: props.id,
      ref: createVScrollViewRef(props, scrollState, layoutTick, scrollbarText),
      onKey: createVScrollViewOnKey(props, scrollState),
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

interface VScrollViewLayoutState {
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

function createVScrollViewRef(
  props: VScrollViewProps,
  state: ScrollAxisAppliedState,
  layoutTick: ReturnType<typeof createSignal<number>>,
  scrollbarText: ReturnType<typeof createSignal<string>>
): (api: MountedElementApi) => void {
  return (api) => {
    api.onLayout = (layout) => {
      const nextLayout = layout as VScrollViewLayoutState;
      const hadLayout = state.hasLayout;
      const previousMax = state.max;
      const viewportHeight =
        nextLayout.clip?.height ??
        nextLayout.contentRect.height ??
        nextLayout.rect.height;
      const contentHeight =
        nextLayout.contentSize?.height ??
        nextLayout.contentRect.height ??
        nextLayout.rect.height;

      state.hasLayout = true;
      state.applied = nextLayout.scrollOffset?.y ?? 0;
      state.max = Math.max(0, contentHeight - viewportHeight);
      state.page = Math.max(1, viewportHeight);
      state.viewportSize = Math.max(1, viewportHeight);
      state.contentSize = Math.max(1, contentHeight);

      applyStickToEndOnLayout(state, {
        sticky: readBooleanBindingValue(props.stickToBottom, false),
        hadLayout,
        externalOffset: readNumberBindingValue(props.offset, 0),
        previousMax,
        maxIncreased: state.max > previousMax,
        onOffsetChange: props.onOffsetChange
      });

      layoutTick.set(layoutTick.get() + 1);
      scrollbarText.set(
        readBooleanBindingValue(props.showScrollbar, false) && state.max > 0
          ? renderScrollbarColumn(
              state.applied,
              state.max,
              state.viewportSize,
              state.contentSize
            )
          : ""
      );
    };

    api.onUnmount = () => {
      resetScrollAxisState(state);
      scrollbarText.set("");
    };
  };
}

function createVScrollViewOnKey(
  props: VScrollViewProps,
  state: ScrollAxisAppliedState
): BindingValue<InteractionKeyBinding> {
  const handler = props.onOffsetChange
    ? createVScrollHandler(props, state)
    : false;
  const scrollOnArrow = props.scrollOnArrow;

  if (isReadableSignal<boolean>(scrollOnArrow)) {
    return computed(() => (scrollOnArrow.get() === false ? false : handler));
  }

  return scrollOnArrow === false ? false : handler;
}

function createVScrollHandler(
  props: VScrollViewProps,
  state: ScrollAxisAppliedState
): InteractionKeyHandler {
  return (event) => {
    const sticky = readBooleanBindingValue(props.stickToBottom, false);
    const fallbackOffset = readNumberBindingValue(props.offset, 0);
    const fallbackPage = Math.max(1, readNumberBindingValue(props.height, 1));
    const offset = state.hasLayout ? state.applied : fallbackOffset;
    const max = state.hasLayout ? state.max : Number.MAX_SAFE_INTEGER;
    const page = state.hasLayout ? state.page : fallbackPage;

    switch (event.name) {
      case "up": {
        if (sticky) {
          state.userDetached = true;
        }
        props.onOffsetChange?.(Math.max(0, offset - 1));
        return true;
      }
      case "down": {
        const next = Math.min(max, offset + 1);
        if (sticky && next >= max) {
          state.userDetached = false;
        }
        props.onOffsetChange?.(next);
        return true;
      }
      case "pageup": {
        if (sticky) {
          state.userDetached = true;
        }
        props.onOffsetChange?.(Math.max(0, offset - page));
        return true;
      }
      case "pagedown": {
        const next = Math.min(max, offset + page);
        if (sticky && next >= max) {
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
        props.onOffsetChange?.(max);
        return true;
      }
      default:
        return false;
    }
  };
}
