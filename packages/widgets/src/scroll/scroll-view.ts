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
  applyAxisLayoutState,
  applyStickToEndOnLayout,
  createScrollAxisState,
  readScrollbarAxisFlags,
  renderScrollbarColumn,
  renderScrollbarRow,
  resetScrollAxisState,
  type ScrollAxisAppliedState,
  type ScrollAxisLayoutSlice,
  type ScrollAxisStyleProps,
  type ScrollbarAxisFlags,
  type ResolvedScrollbarAxisFlags
} from "./axis-shared.js";

export type { ScrollbarAxisFlags } from "./axis-shared.js";

export type ScrollViewStyleProps = ScrollAxisStyleProps;

export type ScrollViewShowScrollbar = boolean | ScrollbarAxisFlags;

export interface ScrollViewProps extends ScrollViewStyleProps {
  id?: BindingValue<string | number>;
  offsetX?: BindingValue<number>;
  offsetY?: BindingValue<number>;
  width: BindingValue<number>;
  height: BindingValue<number>;
  children?: TemplateChildren;
  focusable?: BindingValue<boolean>;
  scrollOnArrow?: BindingValue<boolean>;
  stickToBottom?: BindingValue<boolean>;
  stickToEnd?: BindingValue<boolean>;
  showScrollbar?: BindingValue<ScrollViewShowScrollbar>;
  onOffsetXChange?: (nextOffset: number) => void;
  onOffsetYChange?: (nextOffset: number) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export function ScrollView(props: ScrollViewProps): Template {
  const stateX = createScrollAxisState();
  const stateY = createScrollAxisState();
  const layoutTick = createSignal(0);
  const scrollbarColumnText = createSignal("");
  const scrollbarRowText = createSignal("");
  const verticalBarWidth = createSignal(0);
  const horizontalBarHeight = createSignal(0);
  const showCorner = createSignal(false);
  const usesScrollbar = props.showScrollbar !== undefined;

  const scrollBox = elementTemplate(
    "box",
    omitUndefined({
      id: props.id,
      ref: createScrollViewRef(
        props,
        stateX,
        stateY,
        layoutTick,
        scrollbarColumnText,
        scrollbarRowText,
        verticalBarWidth,
        horizontalBarHeight,
        showCorner
      ),
      focusable: props.focusable ?? true,
      onKey: createScrollViewOnKey(props, stateX, stateY),
      onFocusChange: props.onFocusChange,
      width: usesScrollbar ? undefined : props.width,
      height: usesScrollbar ? undefined : props.height,
      flexGrow: usesScrollbar ? 1 : undefined,
      overflow: "clip",
      scrollX: props.offsetX ?? 0,
      scrollY: props.offsetY ?? 0,
      border: usesScrollbar ? undefined : props.border,
      padding: usesScrollbar ? undefined : props.padding,
      background: usesScrollbar ? undefined : props.background,
      borderColor: usesScrollbar ? undefined : props.borderColor,
      focusStyle: props.focusStyle
    }),
    props.children
  );

  if (!usesScrollbar) {
    return scrollBox;
  }

  const outerStyleProps = omitUndefined({
    width: props.width,
    height: props.height,
    border: props.border,
    padding: props.padding,
    background: props.background,
    borderColor: props.borderColor
  });

  const scrollbarFlags = computed(() =>
    readScrollbarAxisFlags(props.showScrollbar, {
      vertical: false,
      horizontal: false
    })
  );

  const verticalScrollbarValue = computed(() => {
    if (!scrollbarFlags.get().vertical) {
      return "";
    }

    layoutTick.get();
    return scrollbarColumnText.get();
  });

  const horizontalScrollbarValue = computed(() => {
    if (!scrollbarFlags.get().horizontal) {
      return "";
    }

    layoutTick.get();
    return scrollbarRowText.get();
  });

  const verticalBarWidthBinding = computed(() => {
    layoutTick.get();
    return verticalBarWidth.get();
  });

  const horizontalBarHeightBinding = computed(() => {
    layoutTick.get();
    return horizontalBarHeight.get();
  });

  const cornerVisible = computed(() => {
    layoutTick.get();
    return showCorner.get();
  });

  return elementTemplate(
    "box",
    outerStyleProps,
    elementTemplate("vstack", {}, [
      elementTemplate("hstack", {}, [
        scrollBox,
        elementTemplate(
          "box",
          omitUndefined({
            width: verticalBarWidthBinding
          }),
          elementTemplate("text", {
            value: verticalScrollbarValue
          })
        )
      ]),
      elementTemplate(
        "box",
        omitUndefined({
          height: horizontalBarHeightBinding
        }),
        elementTemplate("hstack", {}, [
          elementTemplate(
            "box",
            { flexGrow: 1 },
            elementTemplate("text", {
              value: horizontalScrollbarValue
            })
          ),
          elementTemplate(
            "box",
            omitUndefined({
              width: cornerVisible,
              height: horizontalBarHeightBinding
            })
          )
        ])
      )
    ])
  );
}

function createScrollViewRef(
  props: ScrollViewProps,
  stateX: ScrollAxisAppliedState,
  stateY: ScrollAxisAppliedState,
  layoutTick: ReturnType<typeof createSignal<number>>,
  scrollbarColumnText: ReturnType<typeof createSignal<string>>,
  scrollbarRowText: ReturnType<typeof createSignal<string>>,
  verticalBarWidth: ReturnType<typeof createSignal<number>>,
  horizontalBarHeight: ReturnType<typeof createSignal<number>>,
  showCorner: ReturnType<typeof createSignal<boolean>>
): (api: MountedElementApi) => void {
  return (api) => {
    api.onLayout = (layout) => {
      const nextLayout = layout as ScrollAxisLayoutSlice;
      const hadLayoutY = stateY.hasLayout;
      const hadLayoutX = stateX.hasLayout;
      const previousMaxY = stateY.max;
      const previousMaxX = stateX.max;

      applyAxisLayoutState(stateY, nextLayout, "y");
      applyAxisLayoutState(stateX, nextLayout, "x");

      applyStickToEndOnLayout(stateY, {
        sticky: readBooleanBindingValue(props.stickToBottom, false),
        hadLayout: hadLayoutY,
        externalOffset: readNumberBindingValue(props.offsetY, 0),
        previousMax: previousMaxY,
        maxIncreased: stateY.max > previousMaxY,
        onOffsetChange: props.onOffsetYChange
      });

      applyStickToEndOnLayout(stateX, {
        sticky: readBooleanBindingValue(props.stickToEnd, false),
        hadLayout: hadLayoutX,
        externalOffset: readNumberBindingValue(props.offsetX, 0),
        previousMax: previousMaxX,
        maxIncreased: stateX.max > previousMaxX,
        onOffsetChange: props.onOffsetXChange
      });

      const flags = readScrollbarAxisFlags(props.showScrollbar, {
        vertical: false,
        horizontal: false
      });
      updateScrollbarChrome(
        flags,
        stateX,
        stateY,
        scrollbarColumnText,
        scrollbarRowText,
        verticalBarWidth,
        horizontalBarHeight,
        showCorner
      );

      layoutTick.set(layoutTick.get() + 1);
    };

    api.onUnmount = () => {
      resetScrollAxisState(stateX);
      resetScrollAxisState(stateY);
      scrollbarColumnText.set("");
      scrollbarRowText.set("");
      verticalBarWidth.set(0);
      horizontalBarHeight.set(0);
      showCorner.set(false);
    };
  };
}

function updateScrollbarChrome(
  flags: ResolvedScrollbarAxisFlags,
  stateX: ScrollAxisAppliedState,
  stateY: ScrollAxisAppliedState,
  scrollbarColumnText: ReturnType<typeof createSignal<string>>,
  scrollbarRowText: ReturnType<typeof createSignal<string>>,
  verticalBarWidth: ReturnType<typeof createSignal<number>>,
  horizontalBarHeight: ReturnType<typeof createSignal<number>>,
  showCorner: ReturnType<typeof createSignal<boolean>>
): void {
  const showVertical = flags.vertical && stateY.max > 0;
  const showHorizontal = flags.horizontal && stateX.max > 0;

  verticalBarWidth.set(showVertical ? 1 : 0);
  horizontalBarHeight.set(showHorizontal ? 1 : 0);
  showCorner.set(showVertical && showHorizontal);

  scrollbarColumnText.set(
    showVertical
      ? renderScrollbarColumn(
          stateY.applied,
          stateY.max,
          stateY.viewportSize,
          stateY.contentSize
        )
      : ""
  );

  scrollbarRowText.set(
    showHorizontal
      ? renderScrollbarRow(
          stateX.applied,
          stateX.max,
          stateX.viewportSize,
          stateX.contentSize
        )
      : ""
  );
}

function createScrollViewOnKey(
  props: ScrollViewProps,
  stateX: ScrollAxisAppliedState,
  stateY: ScrollAxisAppliedState
): BindingValue<InteractionKeyBinding> {
  const handler =
    props.onOffsetXChange || props.onOffsetYChange
      ? createScrollViewHandler(props, stateX, stateY)
      : false;
  const scrollOnArrow = props.scrollOnArrow;

  if (isReadableSignal<boolean>(scrollOnArrow)) {
    return computed(() => (scrollOnArrow.get() === false ? false : handler));
  }

  return scrollOnArrow === false ? false : handler;
}

function createScrollViewHandler(
  props: ScrollViewProps,
  stateX: ScrollAxisAppliedState,
  stateY: ScrollAxisAppliedState
): InteractionKeyHandler {
  return (event) => {
    const stickyY = readBooleanBindingValue(props.stickToBottom, false);
    const stickyX = readBooleanBindingValue(props.stickToEnd, false);
    const fallbackOffsetY = readNumberBindingValue(props.offsetY, 0);
    const fallbackOffsetX = readNumberBindingValue(props.offsetX, 0);
    const fallbackPageY = Math.max(1, readNumberBindingValue(props.height, 1));
    const offsetY = stateY.hasLayout ? stateY.applied : fallbackOffsetY;
    const offsetX = stateX.hasLayout ? stateX.applied : fallbackOffsetX;
    const maxY = stateY.hasLayout ? stateY.max : Number.MAX_SAFE_INTEGER;
    const maxX = stateX.hasLayout ? stateX.max : Number.MAX_SAFE_INTEGER;
    const pageY = stateY.hasLayout ? stateY.page : fallbackPageY;

    switch (event.name) {
      case "up": {
        if (stickyY) {
          stateY.userDetached = true;
        }
        props.onOffsetYChange?.(Math.max(0, offsetY - 1));
        return props.onOffsetYChange !== undefined;
      }
      case "down": {
        const next = Math.min(maxY, offsetY + 1);
        if (stickyY && next >= maxY) {
          stateY.userDetached = false;
        }
        props.onOffsetYChange?.(next);
        return props.onOffsetYChange !== undefined;
      }
      case "left": {
        if (stickyX) {
          stateX.userDetached = true;
        }
        props.onOffsetXChange?.(Math.max(0, offsetX - 1));
        return props.onOffsetXChange !== undefined;
      }
      case "right": {
        const next = Math.min(maxX, offsetX + 1);
        if (stickyX && next >= maxX) {
          stateX.userDetached = false;
        }
        props.onOffsetXChange?.(next);
        return props.onOffsetXChange !== undefined;
      }
      case "pageup": {
        if (stickyY) {
          stateY.userDetached = true;
        }
        props.onOffsetYChange?.(Math.max(0, offsetY - pageY));
        return props.onOffsetYChange !== undefined;
      }
      case "pagedown": {
        const next = Math.min(maxY, offsetY + pageY);
        if (stickyY && next >= maxY) {
          stateY.userDetached = false;
        }
        props.onOffsetYChange?.(next);
        return props.onOffsetYChange !== undefined;
      }
      case "home": {
        if (stickyY) {
          stateY.userDetached = true;
        }
        if (stickyX) {
          stateX.userDetached = true;
        }
        props.onOffsetXChange?.(0);
        props.onOffsetYChange?.(0);
        return (
          props.onOffsetXChange !== undefined ||
          props.onOffsetYChange !== undefined
        );
      }
      case "end": {
        if (stickyY) {
          stateY.userDetached = false;
        }
        if (stickyX) {
          stateX.userDetached = false;
        }
        props.onOffsetXChange?.(maxX);
        props.onOffsetYChange?.(maxY);
        return (
          props.onOffsetXChange !== undefined ||
          props.onOffsetYChange !== undefined
        );
      }
      default:
        return false;
    }
  };
}
