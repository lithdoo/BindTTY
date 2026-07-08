import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTextareaLayout,
  createTextareaEditState,
  findCursorVisualPosition,
  moveVertical,
  readEffectiveLayoutWidth
} from "@bindtty/widgets";

test("readEffectiveLayoutWidth distinguishes unknown null from floorable widths", () => {
  assert.equal(readEffectiveLayoutWidth(null), null);
  assert.equal(readEffectiveLayoutWidth(Number.NaN), null);
  assert.equal(readEffectiveLayoutWidth(0), 0);
  assert.equal(readEffectiveLayoutWidth(4.9), 4);
  assert.equal(readEffectiveLayoutWidth(10), 10);
});

test("buildTextareaLayout soft-wraps long ASCII lines when width is effective", () => {
  const layout = buildTextareaLayout("abcdefghij", 5);

  // Exact-fill last wrap row adds a trailing empty caret row.
  assert.equal(layout.visualLines.length, 3);
  assert.equal(layout.visualLines[0]?.width, 5);
  assert.equal(layout.visualLines[1]?.width, 5);
  assert.equal(layout.visualLines[2]?.width, 0);
});

test("buildTextareaLayout soft-wraps long CJK lines by display width", () => {
  const layout = buildTextareaLayout("中中中中中", 4);

  assert.equal(layout.visualLines.length, 3);
  assert.ok((layout.visualLines[0]?.width ?? 0) <= 4);
  assert.ok((layout.visualLines[1]?.width ?? 0) <= 4);
});

test("buildTextareaLayout keeps null and zero width as a single visual line", () => {
  const value = "abcdefghijklmnopqrstuvwxyz";

  assert.equal(buildTextareaLayout(value, null).visualLines.length, 1);
  assert.equal(buildTextareaLayout(value, 0).visualLines.length, 1);
  assert.ok(buildTextareaLayout(value, 4).visualLines.length > 1);
});

test("buildTextareaLayout does not split ZWJ emoji grapheme clusters across wrap rows", () => {
  const sequence = "👨‍👩‍👧";
  const layout = buildTextareaLayout(`aa${sequence}bb`, 4);

  assert.ok(layout.visualLines.length >= 2);
  for (const line of layout.visualLines) {
    const text = line.segments.map((segment) => segment.text).join("");
    assert.equal(text.includes("👨") && !text.includes(sequence), false);
  }
  assert.ok(
    layout.visualLines.some((line) =>
      line.segments.some((segment) => segment.text === sequence)
    )
  );
});

test("narrower wrap width increases visual line count and keeps cursor column in range", () => {
  const value = "abcdefghij";
  const wide = buildTextareaLayout(value, 10);
  const narrow = buildTextareaLayout(value, 4);
  const cursor = findCursorVisualPosition(narrow, {
    offset: value.length,
    preferredColumn: null
  });

  // width 10 exactly fills one wrap row + trailing caret row.
  assert.equal(wide.visualLines.length, 2);
  assert.ok(narrow.visualLines.length > wide.visualLines.length);
  assert.ok(cursor.column < 4);
  assert.equal(cursor.visualRow, narrow.visualLines.length - 1);
});

test("wrap off keeps a single visual line even with a small width", () => {
  const layout = buildTextareaLayout("abcdefghijklmnopqrstuvwxyz", 4, {
    wrap: "off"
  });

  assert.equal(layout.visualLines.length, 1);
  assert.equal(layout.visualLines[0]?.width, 26);
});

test("soft wrap places caret on a trailing empty row when the last visual line fills the width", () => {
  const layout = buildTextareaLayout("abcdefghij", 5);
  const last = layout.visualLines[layout.visualLines.length - 1];
  const caret = findCursorVisualPosition(layout, {
    offset: "abcdefghij".length,
    preferredColumn: null
  });

  assert.equal(layout.visualLines.length, 3);
  assert.equal(last?.width, 0);
  assert.equal(caret.visualRow, layout.visualLines.length - 1);
  assert.equal(caret.column, 0);
});

test("vertical navigation across hard breaks and soft wraps stays within visual lines", () => {
  const value = "aaaaa\nabcdefghij";
  const layout = buildTextareaLayout(value, 5);
  let state = createTextareaEditState(value);
  state = {
    ...state,
    viewportRows: 10,
    scrollRow: 0,
    cursor: { offset: value.length, preferredColumn: null }
  };

  // "aaaaa" + wrap("abcdefghij") = 1 + 2 + trailing caret = 4
  assert.equal(layout.visualLines.length, 4);
  state = moveVertical(state, layout, "up");
  state = moveVertical(state, layout, "down");
  assert.equal(layout.visualLines.length, 4);
  assert.equal(findCursorVisualPosition(layout, state.cursor).visualRow, 3);
});

test("consecutive Enter inserts empty lines and Down can reach them", () => {
  let state = createTextareaEditState("hello");
  let layout = buildTextareaLayout(state.value, 40);
  state = { ...state, viewportRows: 10 };

  // Simulate insertNewline three times (exported via edit path in runtime).
  for (let i = 0; i < 3; i += 1) {
    const offset = state.cursor.offset;
    state = {
      value: `${state.value.slice(0, offset)}\n${state.value.slice(offset)}`,
      cursor: { offset: offset + 1, preferredColumn: null },
      scrollRow: state.scrollRow,
      viewportRows: state.viewportRows
    };
    layout = buildTextareaLayout(state.value, 40);
  }

  assert.equal(state.value, "hello\n\n\n");
  assert.equal(layout.visualLines.length, 4);
  assert.equal(findCursorVisualPosition(layout, state.cursor).visualRow, 3);

  state = moveVertical(
    { ...state, cursor: { offset: 5, preferredColumn: null } },
    layout,
    "down"
  );
  assert.equal(findCursorVisualPosition(layout, state.cursor).visualRow, 1);
  state = moveVertical(state, layout, "down");
  assert.equal(findCursorVisualPosition(layout, state.cursor).visualRow, 2);
  state = moveVertical(state, layout, "down");
  assert.equal(findCursorVisualPosition(layout, state.cursor).visualRow, 3);
});
