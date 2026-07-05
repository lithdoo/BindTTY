import { computed, createSignal } from "@bindtty/signal";
import { segmentText, type TextSegment } from "@bindtty/text";
import {
  elementTemplate,
  isReadableSignal,
  type BindingValue,
  type MountedElementApi,
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
  focusable?: BindingValue<boolean>;
  onChange?: (nextValue: string) => void;
  onSubmit?: (value: string) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export function TextInput(props: TextInputProps): Template {
  const cursor = createSignal(0);
  const focused = createSignal(false);
  const contentWidth = createSignal<number | null>(null);
  const rawValue = computed(() => readStringBindingValue(props.value));
  const segments = computed(() => segmentText(rawValue.get()));
  const disabled = computed(() => readBindingValue(props.disabled) === true);
  const placeholderVisible = computed(
    () => rawValue.get().length === 0 && !focused.get()
  );
  const clampedCursor = computed(() =>
    Math.min(cursor.get(), segments.get().length)
  );
  const scrollColumn = computed(() =>
    focused.get()
      ? computeTextInputScrollColumn({
          segments: segments.get(),
          cursorIndex: clampedCursor.get(),
          width: contentWidth.get()
        })
      : 0
  );
  const beforeCursor = computed(() => {
    if (!focused.get()) {
      return placeholderVisible.get()
        ? readBindingValue(props.placeholder) ?? ""
        : rawValue.get();
    }

    return joinSegments(segments.get().slice(0, clampedCursor.get()));
  });
  const cursorChar = computed(() => {
    if (!focused.get() || disabled.get()) {
      return "";
    }

    const currentSegments = segments.get();
    const position = clampedCursor.get();
    return position < currentSegments.length
      ? currentSegments[position]?.text ?? " "
      : " ";
  });
  const afterCursor = computed(() => {
    if (!focused.get()) {
      return "";
    }

    return joinSegments(segments.get().slice(clampedCursor.get() + 1));
  });
  const beforeDim = props.dim ?? computed(() => disabled.get() || placeholderVisible.get());
  const disabledDim = props.dim ?? computed(() => disabled.get());

  return elementTemplate(
    "box",
    omitUndefined({
      id: props.id,
      ref: createTextInputRef(contentWidth),
      focusable: props.focusable ?? true,
      onKey: createTextInputOnKey(props, cursor),
      onFocusChange: createFocusChangeHandler(props, focused, cursor),
      focusStyle: "none",
      overflow: "clip",
      scrollX: scrollColumn,
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

interface TextInputLayoutState {
  contentRect?: {
    width?: number;
  };
}

interface TextInputWindowInput {
  segments: TextSegment[];
  cursorIndex: number;
  width: number | null;
}

function createTextInputRef(
  contentWidth: ReturnType<typeof createSignal<number | null>>
): (api: MountedElementApi) => void {
  return (api) => {
    api.onLayout = (layout) => {
      const width = (layout as TextInputLayoutState).contentRect?.width;
      contentWidth.set(
        typeof width === "number" && Number.isFinite(width)
          ? Math.max(0, Math.floor(width))
          : null
      );
    };

    api.onUnmount = () => {
      contentWidth.set(null);
    };
  };
}

function computeTextInputScrollColumn(input: TextInputWindowInput): number {
  if (input.width === null) {
    return 0;
  }

  const cursorIndex = clamp(input.cursorIndex, 0, input.segments.length);
  const cursorSegment = input.segments[cursorIndex];
  const cursorWidth = Math.max(1, cursorSegment?.width ?? 1);
  const width = Math.max(0, Math.floor(input.width));

  if (width <= 0) {
    return 0;
  }

  const positions = createSegmentPositions(input.segments);
  const cursorStart =
    cursorIndex < positions.length
      ? positions[cursorIndex]?.start ?? 0
      : measureSegmentsWidth(input.segments);
  const cursorEnd = cursorStart + cursorWidth;

  if (cursorWidth > width) {
    return cursorStart;
  }

  return Math.max(0, cursorEnd - width);
}

function createSegmentPositions(
  segments: TextSegment[]
): Array<{ start: number; end: number }> {
  const positions: Array<{ start: number; end: number }> = [];
  let column = 0;

  for (const segment of segments) {
    const start = column;
    column += segment.width;
    positions.push({
      start,
      end: column
    });
  }

  return positions;
}

function createTextInputOnKey(
  props: TextInputProps,
  cursor: ReturnType<typeof createSignal<number>>
): BindingValue<InteractionKeyBinding> {
  const handler: InteractionKeyHandler = (event) => {
    const value = readStringBindingValue(props.value);
    const segments = segmentText(value);
    const position = clamp(cursor.get(), 0, segments.length);

    if (isTextInputKey(event)) {
      const inputSegments = segmentText(event.input);
      const nextValue =
        joinSegments(segments.slice(0, position)) +
        event.input +
        joinSegments(segments.slice(position));
      cursor.set(position + inputSegments.length);
      props.onChange?.(nextValue);
      return true;
    }

    if (event.name === "backspace") {
      if (position > 0) {
        const nextValue =
          joinSegments(segments.slice(0, position - 1)) +
          joinSegments(segments.slice(position));
        cursor.set(position - 1);
        props.onChange?.(nextValue);
      }

      return true;
    }

    if (event.name === "delete") {
      if (position < segments.length) {
        const nextValue =
          joinSegments(segments.slice(0, position)) +
          joinSegments(segments.slice(position + 1));
        props.onChange?.(nextValue);
      }

      return true;
    }

    if (event.name === "left") {
      cursor.set(Math.max(0, position - 1));
      return true;
    }

    if (event.name === "right") {
      cursor.set(Math.min(segments.length, position + 1));
      return true;
    }

    if (event.name === "home") {
      cursor.set(0);
      return true;
    }

    if (event.name === "end") {
      cursor.set(segments.length);
      return true;
    }

    if (isEnterKey(event)) {
      if (props.onSubmit) {
        props.onSubmit(value);
        return true;
      }

      return false;
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

function joinSegments(segments: TextSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

function measureSegmentsWidth(segments: TextSegment[]): number {
  return segments.reduce((width, segment) => width + segment.width, 0);
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
