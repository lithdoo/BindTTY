import assert from "node:assert/strict";
import test from "node:test";

import {
  layoutText,
  measureText,
  measureTextWidth,
  readTextWrapMode
} from "@bindtty/text";

test("measureTextWidth measures ASCII length", () => {
  assert.equal(measureTextWidth("BindTTY"), 7);
  assert.equal(measureTextWidth(""), 0);
});

test("measureText measures multiline ASCII by widest line", () => {
  assert.deepEqual(measureText(""), {
    width: 0,
    height: 0
  });
  assert.deepEqual(measureText("A\nLong"), {
    width: 4,
    height: 2
  });
});

test("layoutText keeps legacy first-line behavior by default", () => {
  assert.deepEqual(layoutText("abc\ndef"), {
    width: 3,
    height: 1,
    lines: ["abc"]
  });
  assert.deepEqual(layoutText(""), {
    width: 0,
    height: 0,
    lines: []
  });
});

test("layoutText wrap none preserves explicit newlines", () => {
  assert.deepEqual(layoutText("abc\ndef", { wrap: "none" }), {
    width: 3,
    height: 2,
    lines: ["abc", "def"]
  });
});

test("layoutText wrap mode wraps words and hard-cuts long tokens", () => {
  assert.deepEqual(layoutText("hello world", { width: 5, wrap: "wrap" }), {
    width: 5,
    height: 2,
    lines: ["hello", "world"]
  });
  assert.deepEqual(layoutText("abcdef", { width: 3, wrap: "wrap" }), {
    width: 3,
    height: 2,
    lines: ["abc", "def"]
  });
});

test("layoutText hard mode chunks by width", () => {
  assert.deepEqual(layoutText("abcdef", { width: 3, wrap: "hard" }), {
    width: 3,
    height: 2,
    lines: ["abc", "def"]
  });
});

test("layoutText supports truncate modes", () => {
  assert.deepEqual(layoutText("abcdef", { width: 4, wrap: "truncate-end" }), {
    width: 4,
    height: 1,
    lines: ["abc…"]
  });
  assert.deepEqual(layoutText("abcdef", { width: 4, wrap: "truncate-middle" }), {
    width: 4,
    height: 1,
    lines: ["ab…f"]
  });
  assert.deepEqual(layoutText("abcdef", { width: 4, wrap: "truncate-start" }), {
    width: 4,
    height: 1,
    lines: ["…def"]
  });
});

test("layoutText handles undefined zero and one widths", () => {
  assert.deepEqual(layoutText("a\nbc", { wrap: "wrap" }), {
    width: 2,
    height: 2,
    lines: ["a", "bc"]
  });
  assert.deepEqual(layoutText("abc", { width: 0, wrap: "wrap" }), {
    width: 0,
    height: 0,
    lines: []
  });
  assert.deepEqual(layoutText("abc", { width: 1, wrap: "hard" }), {
    width: 1,
    height: 3,
    lines: ["a", "b", "c"]
  });
});

test("layoutText cache returns stable results", () => {
  const first = layoutText("hello world", { width: 5, wrap: "wrap" });
  const second = layoutText("hello world", { width: 5, wrap: "wrap" });
  const wider = layoutText("hello world", { width: 20, wrap: "wrap" });

  assert.equal(first, second);
  assert.notDeepEqual(first, wider);
});

test("readTextWrapMode validates wrap modes", () => {
  assert.equal(readTextWrapMode(undefined), "legacy");
  assert.equal(readTextWrapMode("wrap"), "wrap");
  assert.throws(() => readTextWrapMode("bad"), /Unsupported text wrap mode/);
});
