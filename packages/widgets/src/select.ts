import { computed, createSignal, type Signal } from "@bindtty/signal";
import {
  elementTemplate,
  forTemplate,
  isReadableSignal,
  type BindingValue,
  type Template
} from "@bindtty/vnode";
import {
  type InteractionKeyBinding,
  type InteractionKeyHandler,
  type InteractionNodeFocusChangeEvent
} from "@bindtty/interaction";
import { readNumberBindingValue } from "./scroll-axis-shared.js";

export interface SelectOption<T = string> {
  value: T;
  label: BindingValue<string | number>;
}

export interface SelectStyleProps {
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  bold?: BindingValue<boolean>;
  dim?: BindingValue<boolean>;
  padding?: BindingValue<number>;
}

export interface SelectProps<T = string> extends SelectStyleProps {
  id?: BindingValue<string | number>;
  label?: BindingValue<string | number>;
  options: BindingValue<readonly SelectOption<T>[]>;
  value: BindingValue<T>;
  disabled?: BindingValue<boolean>;
  height?: BindingValue<number>;
  onChange?: (nextValue: T) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export function Select<T = string>(props: SelectProps<T>): Template {
  const scrollOffset = createSignal(0);
  const viewportHeight = readViewportHeight(props.height);
  const optionRows = forTemplate({
    each: props.options,
    key: (option) => optionKey(option.value),
    renderItem: (option) => createOptionRow(props, option)
  });
  const listBox = elementTemplate(
    "box",
    omitUndefined({
      height: viewportHeight !== undefined ? props.height : undefined,
      overflow: viewportHeight !== undefined ? "clip" : undefined,
      scrollY: viewportHeight !== undefined ? scrollOffset : undefined
    }),
    elementTemplate("vstack", { gap: 0 }, optionRows)
  );
  const children: Template[] = [listBox];

  if (props.label !== undefined) {
    children.unshift(
      elementTemplate("text", {
        value: props.label
      })
    );
  }

  return elementTemplate(
    "box",
    omitUndefined({
      id: props.id,
      onKey: createSelectOnKey(props, scrollOffset),
      onFocusChange: props.onFocusChange,
      border: false,
      padding: props.padding ?? 0,
      background: props.background
    }),
    elementTemplate("vstack", { gap: 0 }, children)
  );
}

function createOptionRow<T>(
  props: SelectProps<T>,
  option: SelectOption<T>
): Template {
  return elementTemplate(
    "text",
    omitUndefined({
      value: createOptionText(props.value, option),
      color: props.color,
      bold: createSelectedBold(props.value, option, props.bold),
      dim: props.dim ?? createDisabledDim(props.disabled)
    })
  );
}

function createOptionText<T>(
  value: BindingValue<T>,
  option: SelectOption<T>
): BindingValue<string> {
  if (
    isReadableSignal<T>(value) ||
    isReadableSignal<string | number>(option.label)
  ) {
    return computed(() => formatOptionLine(readValue(value), option));
  }

  return formatOptionLine(readValue(value), option);
}

function formatOptionLine<T>(
  currentValue: T,
  option: SelectOption<T>
): string {
  const selected = currentValue === option.value;
  const marker = selected ? "> " : "  ";
  return `${marker}${readLabel(option.label)}`;
}

function createSelectedBold<T>(
  value: BindingValue<T>,
  option: SelectOption<T>,
  bold: BindingValue<boolean> | undefined
): BindingValue<boolean> | undefined {
  if (bold !== undefined) {
    return bold;
  }

  if (isReadableSignal<T>(value)) {
    return computed(() => readValue(value) === option.value);
  }

  return readValue(value) === option.value ? true : undefined;
}

function createSelectOnKey<T>(
  props: SelectProps<T>,
  scrollOffset: Signal<number>
): BindingValue<InteractionKeyBinding> {
  const disabled = props.disabled;
  const handler: InteractionKeyHandler = (event) => {
    const options = readOptions(props.options);

    if (options.length === 0) {
      return false;
    }

    const currentIndex = findSelectedIndex(options, readValue(props.value));
    const viewport = readViewportHeight(props.height);

    if (event.name === "down") {
      if (currentIndex >= options.length - 1) {
        return false;
      }

      const nextIndex = currentIndex + 1;
      props.onChange?.(options[nextIndex]!.value);
      updateScrollOffset(scrollOffset, nextIndex, options.length, viewport);
      return true;
    }

    if (event.name === "up") {
      if (currentIndex <= 0) {
        return false;
      }

      const nextIndex = currentIndex - 1;
      props.onChange?.(options[nextIndex]!.value);
      updateScrollOffset(scrollOffset, nextIndex, options.length, viewport);
      return true;
    }

    if (event.name === "home") {
      if (currentIndex === 0) {
        return false;
      }

      props.onChange?.(options[0]!.value);
      if (viewport !== undefined) {
        scrollOffset.set(0);
      }

      return true;
    }

    if (event.name === "end") {
      const lastIndex = options.length - 1;

      if (currentIndex === lastIndex) {
        return false;
      }

      props.onChange?.(options[lastIndex]!.value);

      if (viewport !== undefined) {
        scrollOffset.set(Math.max(0, options.length - viewport));
      }

      return true;
    }

    return false;
  };

  if (isReadableSignal<boolean>(disabled)) {
    return computed(() => (disabled.get() ? false : handler));
  }

  return disabled === true ? false : handler;
}

function updateScrollOffset(
  scrollOffset: Signal<number>,
  selectedIndex: number,
  optionCount: number,
  viewportHeight: number | undefined
): void {
  if (viewportHeight === undefined || viewportHeight <= 0) {
    return;
  }

  const maxOffset = Math.max(0, optionCount - viewportHeight);
  let next = scrollOffset.get();

  if (selectedIndex < next) {
    next = selectedIndex;
  } else if (selectedIndex >= next + viewportHeight) {
    next = selectedIndex - viewportHeight + 1;
  }

  scrollOffset.set(Math.min(next, maxOffset));
}

function readOptions<T>(
  options: BindingValue<readonly SelectOption<T>[]>
): readonly SelectOption<T>[] {
  const nextOptions = isReadableSignal<readonly SelectOption<T>[]>(options)
    ? options.get()
    : options;

  return nextOptions ?? [];
}

function readValue<T>(value: BindingValue<T>): T {
  if (isReadableSignal<T>(value)) {
    return value.get();
  }

  return value;
}

function readLabel(label: BindingValue<string | number>): string {
  const nextLabel = isReadableSignal<string | number>(label)
    ? label.get()
    : label;

  return String(nextLabel);
}

function findSelectedIndex<T>(
  options: readonly SelectOption<T>[],
  value: T
): number {
  const index = options.findIndex((option) => option.value === value);
  return index >= 0 ? index : 0;
}

function readViewportHeight(
  height: BindingValue<number> | undefined
): number | undefined {
  if (height === undefined) {
    return undefined;
  }

  const nextHeight = readNumberBindingValue(height, 0);
  return nextHeight > 0 ? nextHeight : undefined;
}

function optionKey<T>(value: T): string | number {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  return String(value);
}

function createDisabledDim(
  disabled: BindingValue<boolean> | undefined
): BindingValue<boolean> | undefined {
  if (isReadableSignal<boolean>(disabled)) {
    return computed(() => disabled.get());
  }

  return disabled === true ? true : undefined;
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
