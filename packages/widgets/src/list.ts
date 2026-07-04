import {
  forTemplate,
  type BindingValue,
  type Template
} from "@bindtty/vnode";
import {
  VScrollView,
  type VScrollViewStyleProps
} from "./v-scroll-view.js";

export interface ListProps<T = unknown> extends VScrollViewStyleProps {
  id?: BindingValue<string | number>;
  items: BindingValue<readonly T[]>;
  getKey?: (item: T, index: number) => string | number;
  render: (item: T, index: number) => Template;
  offset?: BindingValue<number>;
  height: BindingValue<number>;
  width?: BindingValue<number>;
  scrollOnArrow?: BindingValue<boolean>;
  stickToBottom?: BindingValue<boolean>;
  showScrollbar?: BindingValue<boolean>;
  onOffsetChange?: (nextOffset: number) => void;
}

export function List<T = unknown>(props: ListProps<T>): Template {
  return VScrollView({
    id: props.id,
    offset: props.offset,
    height: props.height,
    width: props.width,
    scrollOnArrow: props.scrollOnArrow,
    stickToBottom: props.stickToBottom,
    showScrollbar: props.showScrollbar,
    onOffsetChange: props.onOffsetChange,
    background: props.background,
    borderColor: props.borderColor,
    padding: props.padding,
    border: props.border,
    children: forTemplate({
      each: props.items,
      key: props.getKey,
      renderItem: props.render
    })
  });
}
