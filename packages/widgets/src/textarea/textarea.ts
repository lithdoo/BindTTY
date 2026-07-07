import { computed, createSignal } from "@bindtty/signal";
import {
  elementTemplate,
  type BindingValue,
  type MountedElementApi,
  type Template
} from "@bindtty/vnode";
import type {
  InteractionKeyBinding,
  InteractionKeyHandler,
  InteractionNodeFocusChangeEvent
} from "@bindtty/interaction";
import type { TerminalKeyEvent } from "@bindtty/terminal";
import {
  TEXTAREA_DEFAULT_MAX_ROWS,
  TEXTAREA_DEFAULT_MIN_ROWS,
  TEXTAREA_DEFAULT_SUBMIT_KEYS
} from "./constants.js";
import {
  deleteBackward,
  deleteForward,
  insertNewline,
  insertText,
  moveDocumentEnd,
  moveDocumentStart,
  moveEnd,
  moveHome,
  moveLeft,
  moveRight,
  moveVertical,
  pageScroll,
  withViewportRows,
  type TextareaEditState
} from "./edit.js";
import {
  buildTextareaLayout,
  clampScrollRow,
  findCursorVisualPosition,
  visualLineText,
  type TextareaLayout
} from "./layout.js";
import {
  renderTextareaViewport,
  type TextareaRenderLine
} from "./render.js";
import {
  omitUndefined,
  readBindingValue,
  readBooleanBindingValue,
  readNumberBindingValue,
  readStringBindingValue
} from "./binding.js";
import { createWidgetFocusable } from "../shared/focusable.js";

export interface TextareaStyleProps {
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  bold?: BindingValue<boolean>;
  dim?: BindingValue<boolean>;
}

export interface TextareaProps extends TextareaStyleProps {
  id?: BindingValue<string | number>;
  value: BindingValue<string>;
  placeholder?: BindingValue<string>;
  disabled?: BindingValue<boolean>;
  focusable?: BindingValue<boolean>;
  minRows?: BindingValue<number>;
  maxRows?: BindingValue<number>;
  width?: BindingValue<number>;
  height?: BindingValue<number>;
  wrap?: BindingValue<"soft" | "off">;
  submitKeys?: BindingValue<readonly TextareaSubmitKey[]>;
  resetCursorToken?: BindingValue<string | number>;
  onChange?: (nextValue: string) => void;
  onSubmit?: (value: string) => void;
  onViewportRowsChange?: (rows: number) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export type TextareaSubmitKey = "ctrl-enter" | "meta-enter";

interface TextareaLayoutState {
  contentRect?: {
    width?: number;
  };
}

export function Textarea(props: TextareaProps): Template {
  const focused = createSignal(false);
  const contentWidth = createSignal<number | null>(null);
  const state = createSignal<TextareaEditState>({
    value: readStringBindingValue(props.value),
    cursor: {
      offset: readStringBindingValue(props.value).length,
      preferredColumn: null
    },
    scrollRow: 0,
    viewportRows: readMinRows(props)
  });
  const lastResetToken = createSignal(readBindingValue(props.resetCursorToken));
  const layout = computed(() =>
    buildTextareaLayout(readStringBindingValue(props.value), contentWidth.get(), {
      wrap: readBindingValue(props.wrap) ?? "soft"
    })
  );
  const viewportRows = computed(() => readViewportRows(props, layout.get()));

  viewportRows.subscribe((rows) => {
    props.onViewportRowsChange?.(rows);
  });

  const renderLines = computed(() => {
    const disabled = readBooleanBindingValue(props.disabled, false);
    const previewState = previewResetToken(
      syncStateToProps(state.get(), props, layout.get()),
      props,
      lastResetToken
    );
    const renderState = disabled
      ? withScrollableViewportRows(previewState, layout.get(), viewportRows.get())
      : withViewportRows(previewState, layout.get(), viewportRows.get());

    return buildRenderLines({
      layout: layout.get(),
      cursor: renderState.cursor,
      scrollRow: renderState.scrollRow,
      viewportRows: viewportRows.get(),
      focused: focused.get(),
      disabled,
      placeholder: readBindingValue(props.placeholder)
    });
  });

  return elementTemplate(
    "box",
    omitUndefined({
      id: props.id,
      ref: createTextareaRef(contentWidth),
      onKey: createTextareaOnKey(props, state, layout, viewportRows, lastResetToken),
      onFocusChange: createFocusChangeHandler(props, focused),
      focusable: createWidgetFocusable(props.focusable, undefined),
      focusStyle: "none",
      overflow: "clip",
      flexGrow: props.width === undefined ? 1 : undefined,
      width: props.width,
      height: props.height ?? viewportRows,
      background: props.background
    }),
    renderTextareaViewport({
      rows: readRenderRows(props),
      lines: renderLines,
      color: props.color,
      background: props.background,
      bold: props.bold,
      dim: props.dim
    })
  );
}

interface BuildRenderLinesInput {
  layout: TextareaLayout;
  cursor: TextareaEditState["cursor"];
  scrollRow: number;
  viewportRows: number;
  focused: boolean;
  disabled: boolean;
  placeholder?: string;
}

function buildRenderLines(input: BuildRenderLinesInput): readonly TextareaRenderLine[] {
  const viewportRows = Math.max(1, Math.floor(input.viewportRows));
  const visualLines = input.layout.visualLines;
  const start = Math.min(
    Math.max(0, input.scrollRow),
    Math.max(0, visualLines.length - viewportRows)
  );
  const end = start + viewportRows;
  const cursorPosition = findCursorVisualPosition(input.layout, input.cursor);
  const lines: TextareaRenderLine[] = [];

  for (let row = start; row < end; row += 1) {
    const line = visualLines[row];
    const key = `line:${row}`;

    if (!line) {
      lines.push({
        key,
        kind: "text",
        text: ""
      });
      continue;
    }

    if (!input.focused || input.disabled || row !== cursorPosition.visualRow) {
      const text = visualLineText(line);
      lines.push({
        key,
        kind: "text",
        text: shouldShowPlaceholder(input, row, text) ? input.placeholder ?? "" : text
      });
      continue;
    }

    lines.push(renderCursorLine(key, line, input.cursor.offset));
  }

  return lines;
}

function shouldShowPlaceholder(
  input: BuildRenderLinesInput,
  row: number,
  text: string
): boolean {
  return (
    row === 0 &&
    text === "" &&
    input.layout.value.length === 0 &&
    !input.focused &&
    (input.placeholder ?? "") !== ""
  );
}

function renderCursorLine(
  key: string,
  line: TextareaLayout["visualLines"][number],
  offset: number
): TextareaRenderLine {
  const before: string[] = [];
  const after: string[] = [];
  let cursor = " ";
  let found = false;

  for (const segment of line.segments) {
    if (!found && offset <= segment.startOffset) {
      cursor = segment.text;
      found = true;
      continue;
    }

    if (found) {
      after.push(segment.text);
    } else {
      before.push(segment.text);
    }
  }

  return {
    key,
    kind: "cursor",
    before: before.join(""),
    cursor,
    after: after.join("")
  };
}

function createTextareaRef(
  contentWidth: ReturnType<typeof createSignal<number | null>>
): (api: MountedElementApi) => void {
  return (api) => {
    api.onLayout = (layout) => {
      const width = (layout as TextareaLayoutState).contentRect?.width;
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

function createTextareaOnKey(
  props: TextareaProps,
  state: ReturnType<typeof createSignal<TextareaEditState>>,
  layout: ReturnType<typeof computed<TextareaLayout>>,
  viewportRows: ReturnType<typeof computed<number>>,
  lastResetToken: ReturnType<typeof createSignal<string | number | undefined>>
): BindingValue<InteractionKeyBinding> {
  const handler: InteractionKeyHandler = (event) => {
    const currentLayout = layout.get();
    const syncedState = syncResetToken(
      syncStateToProps(state.get(), props, currentLayout),
      props,
      lastResetToken
    );

    if (readBooleanBindingValue(props.disabled, false)) {
      const currentState = withScrollableViewportRows(
        syncedState,
        currentLayout,
        viewportRows.get()
      );
      return handleDisabledNavigation(event, currentState, currentLayout, state);
    }

    const currentState = withViewportRows(syncedState, currentLayout, viewportRows.get());

    if (event.name === "tab") {
      return false;
    }

    if (isSubmitKey(event, readSubmitKeys(props))) {
      props.onSubmit?.(readStringBindingValue(props.value));
      return true;
    }

    const nextState = reduceKey(event, currentState, currentLayout);
    if (nextState) {
      state.set(nextState);
      if (nextState.value !== currentState.value) {
        props.onChange?.(nextState.value);
      }
      return true;
    }

    if (isTextareaTextInput(event)) {
      const edited = insertText(currentState, event.input, currentLayout);
      state.set(edited);
      props.onChange?.(edited.value);
      return true;
    }

    return false;
  };

  return handler;
}

function reduceKey(
  event: TerminalKeyEvent,
  state: TextareaEditState,
  layout: TextareaLayout
): TextareaEditState | null {
  switch (event.name) {
    case "return":
    case "enter":
      return insertNewline(state, layout);
    case "backspace":
      return deleteBackward(state, layout);
    case "delete":
      return deleteForward(state, layout);
    case "left":
      return moveLeft(state, layout);
    case "right":
      return moveRight(state, layout);
    case "up":
      return moveVertical(state, layout, "up");
    case "down":
      return moveVertical(state, layout, "down");
    case "home":
      return event.ctrl ? moveDocumentStart(state, layout) : moveHome(state, layout);
    case "end":
      return event.ctrl ? moveDocumentEnd(state, layout) : moveEnd(state, layout);
    case "pageup":
      return pageScroll(state, layout, "pageup");
    case "pagedown":
      return pageScroll(state, layout, "pagedown");
    default:
      return null;
  }
}

function handleDisabledNavigation(
  event: TerminalKeyEvent,
  currentState: TextareaEditState,
  layout: TextareaLayout,
  state: ReturnType<typeof createSignal<TextareaEditState>>
): boolean {
  switch (event.name) {
    case "up":
      state.set({
        ...currentState,
        scrollRow: Math.max(0, currentState.scrollRow - 1)
      });
      return true;
    case "down":
      state.set({
        ...currentState,
        scrollRow: Math.min(
          Math.max(0, layout.visualLines.length - currentState.viewportRows),
          currentState.scrollRow + 1
        )
      });
      return true;
    case "pageup":
      state.set(pageScroll(currentState, layout, "pageup", false));
      return true;
    case "pagedown":
      state.set(pageScroll(currentState, layout, "pagedown", false));
      return true;
    case "home":
      state.set({
        ...currentState,
        scrollRow: 0
      });
      return true;
    case "end":
      state.set({
        ...currentState,
        scrollRow: Math.max(0, layout.visualLines.length - currentState.viewportRows)
      });
      return true;
    default:
      return false;
  }
}

function createFocusChangeHandler(
  props: TextareaProps,
  focused: ReturnType<typeof createSignal<boolean>>
): (event: InteractionNodeFocusChangeEvent) => void {
  return (event) => {
    focused.set(event.focused);
    props.onFocusChange?.(event);
  };
}

function syncStateToProps(
  state: TextareaEditState,
  props: TextareaProps,
  layout: TextareaLayout
): TextareaEditState {
  const value = readStringBindingValue(props.value);
  if (state.value === value) {
    return state;
  }

  return {
    ...state,
    value,
    cursor: {
      offset: Math.min(state.cursor.offset, value.length),
      preferredColumn: null
    },
    scrollRow: Math.min(
      state.scrollRow,
      Math.max(0, layout.visualLines.length - state.viewportRows)
    )
  };
}

function syncResetToken(
  state: TextareaEditState,
  props: TextareaProps,
  lastResetToken: ReturnType<typeof createSignal<string | number | undefined>>
): TextareaEditState {
  const token = readBindingValue(props.resetCursorToken);
  if (token === lastResetToken.get()) {
    return state;
  }
  lastResetToken.set(token);
  return {
    ...state,
    cursor: {
      offset: state.value.length,
      preferredColumn: null
    }
  };
}

function previewResetToken(
  state: TextareaEditState,
  props: TextareaProps,
  lastResetToken: ReturnType<typeof createSignal<string | number | undefined>>
): TextareaEditState {
  const token = readBindingValue(props.resetCursorToken);
  if (token === lastResetToken.get()) {
    return state;
  }

  return {
    ...state,
    cursor: {
      offset: state.value.length,
      preferredColumn: null
    }
  };
}

function withScrollableViewportRows(
  state: TextareaEditState,
  layout: TextareaLayout,
  viewportRows: number
): TextareaEditState {
  const rows = Math.max(1, Math.floor(viewportRows));
  return {
    ...state,
    viewportRows: rows,
    scrollRow: clampScrollRow(state.scrollRow, 0, rows, layout.visualLines.length)
  };
}

function readViewportRows(props: TextareaProps, layout: TextareaLayout): number {
  const explicitHeight = readBindingValue(props.height);
  if (typeof explicitHeight === "number" && Number.isFinite(explicitHeight)) {
    return Math.max(1, Math.floor(explicitHeight));
  }

  const minRows = readMinRows(props);
  const maxRows = Math.max(minRows, readNumberBindingValue(props.maxRows, TEXTAREA_DEFAULT_MAX_ROWS));
  return Math.min(Math.max(layout.visualLines.length, minRows), maxRows);
}

function readRenderRows(props: TextareaProps): number {
  const explicitHeight = readBindingValue(props.height);
  if (typeof explicitHeight === "number" && Number.isFinite(explicitHeight)) {
    return Math.max(1, Math.floor(explicitHeight));
  }

  const minRows = readMinRows(props);
  return Math.max(
    minRows,
    readNumberBindingValue(props.maxRows, TEXTAREA_DEFAULT_MAX_ROWS)
  );
}

function readMinRows(props: TextareaProps): number {
  return Math.max(1, readNumberBindingValue(props.minRows, TEXTAREA_DEFAULT_MIN_ROWS));
}

function readSubmitKeys(props: TextareaProps): readonly TextareaSubmitKey[] {
  return readBindingValue(props.submitKeys) ?? TEXTAREA_DEFAULT_SUBMIT_KEYS;
}

function isSubmitKey(event: TerminalKeyEvent, submitKeys: readonly TextareaSubmitKey[]): boolean {
  if (!(event.name === "return" || event.name === "enter")) {
    return false;
  }

  return (
    (event.ctrl && submitKeys.includes("ctrl-enter")) ||
    (event.meta && submitKeys.includes("meta-enter"))
  );
}

function isTextareaTextInput(event: TerminalKeyEvent): boolean {
  return (
    event.input !== "" &&
    !event.ctrl &&
    !event.meta &&
    event.name !== "return" &&
    event.name !== "enter" &&
    event.name !== "tab" &&
    event.name !== "backspace" &&
    event.name !== "delete"
  );
}
