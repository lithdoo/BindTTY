import { computed, createSignal } from "@bindtty/signal";
import {
  elementTemplate,
  isReadableSignal,
  type BindingValue,
  type Template
} from "@bindtty/vnode";
import {
  isEnterKey,
  isTextInputKey,
  type InteractionKeyBinding,
  type InteractionKeyHandler,
  type InteractionNodeFocusChangeEvent
} from "@bindtty/interaction";

export interface TextInputStyleProps {
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  borderColor?: BindingValue<string>;
  bold?: BindingValue<boolean>;
  dim?: BindingValue<boolean>;
  padding?: BindingValue<number>;
  border?: BindingValue<boolean | number>;
}

export interface TextInputProps extends TextInputStyleProps {
  id?: BindingValue<string | number>;
  value: BindingValue<string>;
  placeholder?: BindingValue<string>;
  disabled?: BindingValue<boolean>;
  onChange?: (nextValue: string) => void;
  onSubmit?: (value: string) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export function TextInput(props: TextInputProps): Template {
  const cursor = createSignal(0);
  const focused = createSignal(false);
  const rawValue = computed(() => readStringBindingValue(props.value));
  const disabled = computed(() => readBindingValue(props.disabled) === true);
  const placeholderVisible = computed(
    () => rawValue.get().length === 0 && !focused.get()
  );
  const clampedCursor = computed(() =>
    Math.min(cursor.get(), rawValue.get().length)
  );
  const beforeCursor = computed(() => {
    if (!focused.get()) {
      return placeholderVisible.get()
        ? readBindingValue(props.placeholder) ?? ""
        : rawValue.get();
    }

    return rawValue.get().slice(0, clampedCursor.get());
  });
  const cursorChar = computed(() => {
    if (!focused.get() || disabled.get()) {
      return "";
    }

    const raw = rawValue.get();
    const position = clampedCursor.get();
    return position < raw.length ? raw[position] ?? " " : " ";
  });
  const afterCursor = computed(() => {
    if (!focused.get()) {
      return "";
    }

    return rawValue.get().slice(clampedCursor.get() + 1);
  });
  const beforeDim = props.dim ?? computed(() => disabled.get() || placeholderVisible.get());
  const disabledDim = props.dim ?? computed(() => disabled.get());

  return elementTemplate(
    "box",
    omitUndefined({
      id: props.id,
      onKey: createTextInputOnKey(props, cursor),
      onFocusChange: createFocusChangeHandler(props, focused, cursor),
      focusStyle: "none",
      border: props.border ?? true,
      padding: props.padding ?? 1,
      background: props.background,
      borderColor: props.borderColor
    }),
    elementTemplate(
      "hstack",
      {},
      [
        elementTemplate(
          "text",
          omitUndefined({
            value: beforeCursor,
            color: props.color,
            bold: props.bold,
            dim: beforeDim
          })
        ),
        elementTemplate(
          "text",
          omitUndefined({
            value: cursorChar,
            color: computed(() => readBindingValue(props.background) ?? "white"),
            background: computed(() => readBindingValue(props.color) ?? "black"),
            bold: props.bold,
            dim: disabledDim
          })
        ),
        elementTemplate(
          "text",
          omitUndefined({
            value: afterCursor,
            color: props.color,
            bold: props.bold,
            dim: disabledDim
          })
        )
      ]
    )
  );
}

function createTextInputOnKey(
  props: TextInputProps,
  cursor: ReturnType<typeof createSignal<number>>
): BindingValue<InteractionKeyBinding> {
  const handler: InteractionKeyHandler = (event) => {
    const value = readStringBindingValue(props.value);
    const position = clamp(cursor.get(), 0, value.length);

    if (isTextInputKey(event)) {
      const nextValue =
        value.slice(0, position) + event.input + value.slice(position);
      cursor.set(position + event.input.length);
      props.onChange?.(nextValue);
      return true;
    }

    if (event.name === "backspace") {
      if (position > 0) {
        const nextValue = value.slice(0, position - 1) + value.slice(position);
        cursor.set(position - 1);
        props.onChange?.(nextValue);
      }

      return true;
    }

    if (event.name === "delete") {
      if (position < value.length) {
        const nextValue = value.slice(0, position) + value.slice(position + 1);
        props.onChange?.(nextValue);
      }

      return true;
    }

    if (event.name === "left") {
      cursor.set(Math.max(0, position - 1));
      return true;
    }

    if (event.name === "right") {
      cursor.set(Math.min(value.length, position + 1));
      return true;
    }

    if (event.name === "home") {
      cursor.set(0);
      return true;
    }

    if (event.name === "end") {
      cursor.set(value.length);
      return true;
    }

    if (isEnterKey(event)) {
      props.onSubmit?.(value);
      return true;
    }

    return false;
  };

  const disabled = props.disabled;
  if (isReadableSignal<boolean>(disabled)) {
    return computed(() => (disabled.get() ? false : handler));
  }

  return props.disabled === true ? false : handler;
}

function createFocusChangeHandler(
  props: TextInputProps,
  focused: ReturnType<typeof createSignal<boolean>>,
  cursor: ReturnType<typeof createSignal<number>>
): (event: InteractionNodeFocusChangeEvent) => void {
  return (event) => {
    focused.set(event.focused);
    if (!event.focused) {
      cursor.set(0);
    }

    props.onFocusChange?.(event);
  };
}

function readBindingValue<T>(value: BindingValue<T> | undefined): T | undefined {
  return isReadableSignal<T>(value) ? value.get() : value;
}

function readStringBindingValue(value: BindingValue<string>): string {
  return isReadableSignal<string>(value) ? value.get() : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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
