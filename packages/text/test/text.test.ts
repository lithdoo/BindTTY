import assert from "node:assert/strict";
import test from "node:test";

import {
  layoutText,
  measureText,
  measureTextWidth
} from "@bindtty/text";

test("measures empty and ascii text", () => {
  assert.deepEqual(measureText(""), {
    width: 0,
    height: 0
  });
  assert.deepEqual(measureText("hello"), {
    width: 5,
    height: 1
  });
  assert.equal(measureTextWidth("hello"), 5);
});

test("measures explicit multiline text by widest line", () => {
  assert.deepEqual(measureText("a\nabcd\nxy"), {
    width: 4,
    height: 3
  });
  assert.equal(measureTextWidth("a\nabcd\nxy"), 4);
});

test("uses legacy single-line layout by default", () => {
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

test("wrap none preserves explicit newlines without width wrapping", () => {
  assert.deepEqual(layoutText("abc\ndefg", { width: 2, wrap: "none" }), {
    width: 4,
    height: 2,
    lines: ["abc", "defg"]
  });
});

test("word wrap uses width constraints and explicit newlines", () => {
  assert.deepEqual(layoutText("hello world", { width: 5, wrap: "wrap" }), {
    width: 5,
    height: 2,
    lines: ["hello", "world"]
  });
  assert.deepEqual(layoutText("one two\nthree", { width: 5, wrap: "wrap" }), {
    width: 5,
    height: 3,
    lines: ["one", "two", "three"]
  });
});

test("word wrap hard-splits tokens longer than width", () => {
  assert.deepEqual(layoutText("abcdef", { width: 3, wrap: "wrap" }), {
    width: 3,
    height: 2,
    lines: ["abc", "def"]
  });
});

test("hard wrap splits lines at width", () => {
  assert.deepEqual(layoutText("abcdef", { width: 3, wrap: "hard" }), {
    width: 3,
    height: 2,
    lines: ["abc", "def"]
  });
});

test("truncate modes use ascii ellipsis", () => {
  assert.deepEqual(layoutText("abcdef", { width: 4, wrap: "truncate-end" }), {
    width: 4,
    height: 1,
    lines: ["a..."]
  });
  assert.deepEqual(layoutText("abcdef", { width: 4, wrap: "truncate-start" }), {
    width: 4,
    height: 1,
    lines: ["...f"]
  });
  assert.deepEqual(layoutText("abcdef", { width: 5, wrap: "truncate-middle" }), {
    width: 5,
    height: 1,
    lines: ["a...f"]
  });
});

test("width zero produces an empty layout", () => {
  assert.deepEqual(layoutText("abcdef", { width: 0, wrap: "wrap" }), {
    width: 0,
    height: 0,
    lines: []
  });
});

test("cache hits return stable results", () => {
  const first = layoutText("hello world", { width: 5, wrap: "wrap" });
  const second = layoutText("hello world", { width: 5, wrap: "wrap" });

  assert.deepEqual(second, first);
  assert.deepEqual(layoutText("hello world", { width: 6, wrap: "wrap" }), {
    width: 5,
    height: 2,
    lines: ["hello", "world"]
  });
});
