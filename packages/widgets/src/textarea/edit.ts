import {
  buildTextareaLayout,
  clampCursorOffset,
  clampScrollRow,
  ensureCursorVisible,
  findCursorVisualPosition,
  findLogicalLineForOffset,
  visualPositionToCursor,
  type TextareaCursor,
  type TextareaLayout
} from "./layout.js";

export interface TextareaEditState {
  value: string;
  cursor: TextareaCursor;
  scrollRow: number;
  viewportRows: number;
}

export function createTextareaEditState(value = ""): TextareaEditState {
  return {
    value,
    cursor: {
      offset: value.length,
      preferredColumn: null
    },
    scrollRow: 0,
    viewportRows: 1
  };
}

export function insertText(state: TextareaEditState, text: string, layout: TextareaLayout): TextareaEditState {
  if (text === "") {
    return state;
  }

  const offset = clampCursorOffset(layout, state.cursor.offset);
  const value = state.value.slice(0, offset) + text + state.value.slice(offset);
  const nextOffset = offset + text.length;
  return normalizeAfterEdit({
    ...state,
    value,
    cursor: {
      offset: nextOffset,
      preferredColumn: null
    }
  }, layout.width);
}

export function insertNewline(state: TextareaEditState, layout: TextareaLayout): TextareaEditState {
  return insertText(state, "\n", layout);
}

export function deleteBackward(state: TextareaEditState, layout: TextareaLayout): TextareaEditState {
  const offset = clampCursorOffset(layout, state.cursor.offset);
  const boundaryIndex = layout.boundaries.indexOf(offset);
  const previous = boundaryIndex > 0 ? layout.boundaries[boundaryIndex - 1] : offset;
  if (previous === offset) {
    return state;
  }

  return normalizeAfterEdit({
    ...state,
    value: state.value.slice(0, previous) + state.value.slice(offset),
    cursor: {
      offset: previous,
      preferredColumn: null
    }
  }, layout.width);
}

export function deleteForward(state: TextareaEditState, layout: TextareaLayout): TextareaEditState {
  const offset = clampCursorOffset(layout, state.cursor.offset);
  const boundaryIndex = layout.boundaries.indexOf(offset);
  const next = boundaryIndex >= 0 && boundaryIndex < layout.boundaries.length - 1
    ? layout.boundaries[boundaryIndex + 1]
    : offset;
  if (next === offset) {
    return state;
  }

  return normalizeAfterEdit({
    ...state,
    value: state.value.slice(0, offset) + state.value.slice(next),
    cursor: {
      offset,
      preferredColumn: null
    }
  }, layout.width);
}

export function moveLeft(state: TextareaEditState, layout: TextareaLayout): TextareaEditState {
  const offset = clampCursorOffset(layout, state.cursor.offset);
  const boundaryIndex = layout.boundaries.indexOf(offset);
  const nextOffset = boundaryIndex > 0 ? layout.boundaries[boundaryIndex - 1] : offset;
  return withCursorVisible({
    ...state,
    cursor: {
      offset: nextOffset,
      preferredColumn: null
    }
  }, layout);
}

export function moveRight(state: TextareaEditState, layout: TextareaLayout): TextareaEditState {
  const offset = clampCursorOffset(layout, state.cursor.offset);
  const boundaryIndex = layout.boundaries.indexOf(offset);
  const nextOffset = boundaryIndex >= 0 && boundaryIndex < layout.boundaries.length - 1
    ? layout.boundaries[boundaryIndex + 1]
    : offset;
  return withCursorVisible({
    ...state,
    cursor: {
      offset: nextOffset,
      preferredColumn: null
    }
  }, layout);
}

export function moveHome(state: TextareaEditState, layout: TextareaLayout): TextareaEditState {
  const line = findLogicalLineForOffset(layout, state.cursor.offset);
  return withCursorVisible({
    ...state,
    cursor: {
      offset: line.startOffset,
      preferredColumn: null
    }
  }, layout);
}

export function moveEnd(state: TextareaEditState, layout: TextareaLayout): TextareaEditState {
  const line = findLogicalLineForOffset(layout, state.cursor.offset);
  return withCursorVisible({
    ...state,
    cursor: {
      offset: line.endOffset,
      preferredColumn: null
    }
  }, layout);
}

export function moveDocumentStart(state: TextareaEditState, layout: TextareaLayout): TextareaEditState {
  return withCursorVisible({
    ...state,
    cursor: {
      offset: 0,
      preferredColumn: null
    }
  }, layout);
}

export function moveDocumentEnd(state: TextareaEditState, layout: TextareaLayout): TextareaEditState {
  return withCursorVisible({
    ...state,
    cursor: {
      offset: state.value.length,
      preferredColumn: null
    }
  }, layout);
}

export function moveVertical(
  state: TextareaEditState,
  layout: TextareaLayout,
  direction: "up" | "down"
): TextareaEditState {
  const position = findCursorVisualPosition(layout, state.cursor);
  const targetRow = direction === "up" ? position.visualRow - 1 : position.visualRow + 1;
  if (targetRow < 0 || targetRow >= layout.visualLines.length) {
    return state;
  }

  const preferredColumn = state.cursor.preferredColumn ?? position.column;
  const target = visualPositionToCursor(layout, targetRow, preferredColumn);
  return withCursorVisible({
    ...state,
    cursor: {
      offset: target.offset,
      preferredColumn
    }
  }, layout);
}

export function pageScroll(
  state: TextareaEditState,
  layout: TextareaLayout,
  direction: "pageup" | "pagedown",
  moveCursor = true
): TextareaEditState {
  const delta = direction === "pageup" ? -state.viewportRows : state.viewportRows;
  const scrollRow = clampScrollRow(
    state.scrollRow + delta,
    findCursorVisualPosition(layout, state.cursor).visualRow,
    state.viewportRows,
    layout.visualLines.length
  );

  if (!moveCursor) {
    return {
      ...state,
      scrollRow
    };
  }

  const position = findCursorVisualPosition(layout, state.cursor);
  const preferredColumn = state.cursor.preferredColumn ?? position.column;
  const targetRow = Math.min(
    Math.max(scrollRow, position.visualRow + delta),
    Math.min(layout.visualLines.length - 1, scrollRow + state.viewportRows - 1)
  );
  const target = visualPositionToCursor(layout, targetRow, preferredColumn);

  return {
    ...state,
    scrollRow,
    cursor: {
      offset: target.offset,
      preferredColumn
    }
  };
}

export function withViewportRows(
  state: TextareaEditState,
  layout: TextareaLayout,
  viewportRows: number
): TextareaEditState {
  const rows = Math.max(1, Math.floor(viewportRows));
  const cursorRow = findCursorVisualPosition(layout, state.cursor).visualRow;
  return {
    ...state,
    viewportRows: rows,
    scrollRow: ensureCursorVisible(state.scrollRow, cursorRow, rows, layout.visualLines.length)
  };
}

function normalizeAfterEdit(state: TextareaEditState, width: number | null): TextareaEditState {
  const layout = buildTextareaLayout(state.value, width);
  const offset = clampCursorOffset(layout, state.cursor.offset);
  return withCursorVisible({
    ...state,
    cursor: {
      offset,
      preferredColumn: null
    }
  }, layout);
}

function withCursorVisible(state: TextareaEditState, layout: TextareaLayout): TextareaEditState {
  const cursorRow = findCursorVisualPosition(layout, state.cursor).visualRow;
  return {
    ...state,
    cursor: {
      ...state.cursor,
      offset: clampCursorOffset(layout, state.cursor.offset)
    },
    scrollRow: ensureCursorVisible(
      state.scrollRow,
      cursorRow,
      state.viewportRows,
      layout.visualLines.length
    )
  };
}
