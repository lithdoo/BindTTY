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
  omitUndefined,
  readBooleanBindingValue,
  readNumberBindingValue
} from "../shared/binding.js";
import {
  applyStickToEndOnLayout,
  createScrollAxisState,
  renderScrollbarRow,
  resetScrollAxisState,
  type ScrollAxisAppliedState,
  type ScrollAxisStyleProps
} from "./axis-shared.js";

export type HScrollViewStyleProps = ScrollAxisStyleProps;

export interface HScrollViewProps extends HScrollViewStyleProps {
  id?: BindingValue<string | number>;
  offset?: BindingValue<number>;
  width: BindingValue<number>;
  height?: BindingValue<number>;
  children?: TemplateChildren;
  scrollOnArrow?: BindingValue<boolean>;
  stickToEnd?: BindingValue<boolean>;
  showScrollbar?: BindingValue<boolean>;
  onOffsetChange?: (nextOffset: number) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export { renderScrollbarRow } from "./axis-shared.js";

export function HScrollView(props: HScrollViewProps): Template {
  const scrollState = createScrollAxisState();
  const layoutTick = createSignal(0);
  const scrollbarText = createSignal("");
  const usesScrollbar = props.showScrollbar !== undefined;

  const scrollBox = elementTemplate(
    "box",
    omitUndefined({
      id: props.id,
      ref: createHScrollViewRef(props, scrollState, layoutTick, scrollbarText),
      onKey: createHScrollViewOnKey(props, scrollState),
      onFocusChange: props.onFocusChange,
      width: props.width,
      height: usesScrollbar ? undefined : props.height,
      flexGrow: usesScrollbar ? 1 : undefined,
      overflow: "clip",
      scrollX: props.offset ?? 0,
      scrollY: 0,
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
      height: props.height,
      border: props.border,
      padding: props.padding,
      background: props.background,
      borderColor: props.borderColor
    }),
    elementTemplate("vstack", {}, [
      scrollBox,
      elementTemplate(
        "box",
        {
          height: 1,
          width: props.width
        },
        elementTemplate("text", {
          value: scrollbarValue
        })
      )
    ])
  );
}

interface HScrollViewLayoutState {
  rect: {
    width: number;
  };
  contentRect: {
    width: number;
  };
  clip?: {
    width: number;
  };
  scrollOffset?: {
    x: number;
  };
  contentSize?: {
    width: number;
  };
}

function createHScrollViewRef(
  props: HScrollViewProps,
  state: ScrollAxisAppliedState,
  layoutTick: ReturnType<typeof createSignal<number>>,
  scrollbarText: ReturnType<typeof createSignal<string>>
): (api: MountedElementApi) => void {
  return (api) => {
    api.onLayout = (layout) => {
      const nextLayout = layout as HScrollViewLayoutState;
      const hadLayout = state.hasLayout;
      const previousMax = state.max;
      const viewportWidth =
        nextLayout.clip?.width ??
        nextLayout.contentRect.width ??
        nextLayout.rect.width;
      const contentWidth =
        nextLayout.contentSize?.width ??
        nextLayout.contentRect.width ??
        nextLayout.rect.width;

      state.hasLayout = true;
      state.applied = nextLayout.scrollOffset?.x ?? 0;
      state.max = Math.max(0, contentWidth - viewportWidth);
      state.page = Math.max(1, viewportWidth);
      state.viewportSize = Math.max(1, viewportWidth);
      state.contentSize = Math.max(1, contentWidth);

      applyStickToEndOnLayout(state, {
        sticky: readBooleanBindingValue(props.stickToEnd, false),
        hadLayout,
        externalOffset: readNumberBindingValue(props.offset, 0),
        previousMax,
        maxIncreased: state.max > previousMax,
        onOffsetChange: props.onOffsetChange
      });

      layoutTick.set(layoutTick.get() + 1);
      scrollbarText.set(
        readBooleanBindingValue(props.showScrollbar, false) && state.max > 0
          ? renderScrollbarRow(
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

function createHScrollViewOnKey(
  props: HScrollViewProps,
  state: ScrollAxisAppliedState
): BindingValue<InteractionKeyBinding> {
  const handler = props.onOffsetChange
    ? createHScrollHandler(props, state)
    : false;
  const scrollOnArrow = props.scrollOnArrow;

  if (isReadableSignal<boolean>(scrollOnArrow)) {
    return computed(() => (scrollOnArrow.get() === false ? false : handler));
  }

  return scrollOnArrow === false ? false : handler;
}

function createHScrollHandler(
  props: HScrollViewProps,
  state: ScrollAxisAppliedState
): InteractionKeyHandler {
  return (event) => {
    const sticky = readBooleanBindingValue(props.stickToEnd, false);
    const fallbackOffset = readNumberBindingValue(props.offset, 0);
    const fallbackPage = Math.max(1, readNumberBindingValue(props.width, 1));
    const offset = state.hasLayout ? state.applied : fallbackOffset;
    const max = state.hasLayout ? state.max : Number.MAX_SAFE_INTEGER;

    switch (event.name) {
      case "left": {
        if (sticky) {
          state.userDetached = true;
        }
        props.onOffsetChange?.(Math.max(0, offset - 1));
        return true;
      }
      case "right": {
        const next = Math.min(max, offset + 1);
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
