import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTextareaLayout,
  findCursorVisualPosition,
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

  assert.equal(layout.visualLines.length, 2);
  assert.equal(layout.visualLines[0]?.width, 5);
  assert.equal(layout.visualLines[1]?.width, 5);
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

  assert.equal(wide.visualLines.length, 1);
  assert.ok(narrow.visualLines.length > wide.visualLines.length);
  assert.ok(cursor.column < 4);
});

test("wrap off keeps a single visual line even with a small width", () => {
  const layout = buildTextareaLayout("abcdefghijklmnopqrstuvwxyz", 4, {
    wrap: "off"
  });

  assert.equal(layout.visualLines.length, 1);
  assert.equal(layout.visualLines[0]?.width, 26);
});
