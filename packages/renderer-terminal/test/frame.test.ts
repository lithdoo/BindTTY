import assert from "node:assert/strict";
import test from "node:test";

import {
  createFrame,
  frameToLines,
  getCell,
  setCell,
  writeText
} from "@bindtty/renderer-terminal";

test("createFrame fills cells with blank spaces", () => {
  const frame = createFrame(3, 2);

  assert.equal(frame.width, 3);
  assert.equal(frame.height, 2);
  assert.equal(frame.cells.length, 6);
  assert.deepEqual(frameToLines(frame), ["   ", "   "]);
  assert.deepEqual(getCell(frame, 0, 0), {
    char: " ",
    style: {},
    width: 1
  });
});

test("createFrame clamps invalid and non-positive sizes to empty frames", () => {
  assert.deepEqual(createFrame(-1, 2), {
    width: 0,
    height: 2,
    cells: []
  });
  assert.deepEqual(createFrame(Number.NaN, 2), {
    width: 0,
    height: 2,
    cells: []
  });
  assert.deepEqual(createFrame(2.8, 1.9), {
    width: 2,
    height: 1,
    cells: [
      { char: " ", style: {}, width: 1 },
      { char: " ", style: {}, width: 1 }
    ]
  });
});

test("getCell and setCell clip out-of-bounds coordinates", () => {
  const frame = createFrame(2, 1);

  assert.equal(getCell(frame, -1, 0), undefined);
  assert.equal(getCell(frame, 2, 0), undefined);
  assert.equal(setCell(frame, -1, 0, { char: "X", style: {} }), false);
  assert.equal(setCell(frame, 2, 0, { char: "X", style: {} }), false);
  assert.deepEqual(frameToLines(frame), ["  "]);
});

test("setCell writes a cloned normalized cell without slicing graphemes", () => {
  const frame = createFrame(2, 1);
  const style = { foreground: "red", bold: true };
  const cell = { char: "🙂", style, width: 2 as const };

  assert.equal(setCell(frame, 0, 0, cell), true);
  style.foreground = "blue";

  assert.deepEqual(getCell(frame, 0, 0), {
    char: "🙂",
    style: {
      foreground: "red",
      bold: true
    },
    width: 2
  });
  assert.deepEqual(frameToLines(frame), ["🙂 "]);
});

test("setCell rejects cells whose char does not match their width", () => {
  const frame = createFrame(2, 1);

  assert.throws(
    () => setCell(frame, 0, 0, { char: "XYZ", style: {} }),
    /char must be a single grapheme/
  );
  assert.throws(
    () => setCell(frame, 0, 0, { char: "中", style: {}, width: 1 }),
    /does not match cell width/
  );
  assert.throws(
    () => setCell(frame, 0, 0, { char: "A", style: {}, width: 2 }),
    /does not match cell width/
  );
  assert.throws(
    () => setCell(frame, 0, 0, { char: "A", style: {}, width: 0 }),
    /placeholder cell/
  );
  assert.throws(
    () => setCell(frame, 1, 0, { char: "中", style: {}, width: 2 }),
    /exceeds frame bounds/
  );
});

test("writeText writes a single line and clips horizontally", () => {
  const frame = createFrame(4, 2);

  assert.equal(writeText(frame, 1, 0, "Hello"), 3);
  assert.equal(writeText(frame, -2, 1, "ABC"), 1);

  assert.deepEqual(frameToLines(frame), [" Hel", "C   "]);
});

test("writeText ignores text after the first newline", () => {
  const frame = createFrame(8, 1);

  assert.equal(writeText(frame, 0, 0, "Bind\nTTY"), 4);

  assert.deepEqual(frameToLines(frame), ["Bind    "]);
});

test("writeText applies cloned style to written cells", () => {
  const frame = createFrame(2, 1);
  const style = { foreground: "green", underline: true };

  writeText(frame, 0, 0, "OK", style);
  style.foreground = "red";

  assert.deepEqual(getCell(frame, 0, 0)?.style, {
    foreground: "green",
    underline: true
  });
  assert.deepEqual(getCell(frame, 1, 0)?.style, {
    foreground: "green",
    underline: true
  });
});

test("writeText writes wide graphemes with placeholder cells", () => {
  const frame = createFrame(4, 1);

  assert.equal(writeText(frame, 0, 0, "A中"), 3);

  assert.deepEqual(frameToLines(frame), ["A中 "]);
  assert.deepEqual(getCell(frame, 1, 0), {
    char: "中",
    style: {},
    width: 2
  });
  assert.deepEqual(getCell(frame, 2, 0), {
    char: "",
    style: {},
    width: 0
  });
});

test("writeText preserves emoji surrogate pairs", () => {
  const frame = createFrame(3, 1);

  assert.equal(writeText(frame, 0, 0, "🙂"), 2);

  assert.deepEqual(frameToLines(frame), ["🙂 "]);
  assert.equal(getCell(frame, 0, 0)?.char, "🙂");
  assert.equal(getCell(frame, 1, 0)?.width, 0);
});

test("writeText clears an old wide character when writing into its placeholder", () => {
  const frame = createFrame(3, 1);

  writeText(frame, 0, 0, "中");
  writeText(frame, 1, 0, "A");

  assert.deepEqual(frameToLines(frame), [" A "]);
  assert.deepEqual(getCell(frame, 0, 0), {
    char: " ",
    style: {},
    width: 1
  });
  assert.deepEqual(getCell(frame, 1, 0), {
    char: "A",
    style: {},
    width: 1
  });
});
