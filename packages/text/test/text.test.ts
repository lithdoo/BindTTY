import assert from "node:assert/strict";
import test from "node:test";

import {
  layoutText,
  measureText,
  measureTextWidth,
  readTextWrapMode,
  segmentText,
  sliceTextByWidth,
  wordWrapLine
} from "@bindtty/text";

test("measureTextWidth measures ASCII length", () => {
  assert.equal(measureTextWidth("BindTTY"), 7);
  assert.equal(measureTextWidth(""), 0);
});

test("measureTextWidth uses terminal display width", () => {
  assert.equal(measureTextWidth("中"), 2);
  assert.equal(measureTextWidth("🙂"), 2);
  assert.equal(measureTextWidth("e\u0301"), 1);
  assert.equal(measureTextWidth("A中🙂e\u0301"), 6);
});

test("segmentText returns grapheme display widths", () => {
  assert.deepEqual(segmentText("A中🙂e\u0301"), [
    { text: "A", width: 1 },
    { text: "中", width: 2 },
    { text: "🙂", width: 2 },
    { text: "e\u0301", width: 1 }
  ]);
});

test("sliceTextByWidth does not return partial wide graphemes", () => {
  assert.equal(sliceTextByWidth("A中B", 0, 2), "A");
  assert.equal(sliceTextByWidth("A中B", 1, 3), "中");
  assert.equal(sliceTextByWidth("A中B", 2, 4), "B");
  assert.equal(sliceTextByWidth("🙂A", 0, 1), "");
  assert.equal(sliceTextByWidth("🙂A", 0, 2), "🙂");
  assert.equal(sliceTextByWidth("e\u0301A", 0, 1), "e\u0301");
  assert.equal(sliceTextByWidth("e\u0301A", 1, 2), "A");
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
  assert.deepEqual(layoutText("中中中", { width: 4, wrap: "hard" }), {
    width: 4,
    height: 2,
    lines: ["中中", "中"]
  });
  assert.deepEqual(layoutText("A中B", { width: 3, wrap: "hard" }), {
    width: 3,
    height: 2,
    lines: ["A中", "B"]
  });
});

test("layoutText wrap modes preserve graphemes wider than the target width", () => {
  assert.deepEqual(layoutText("中", { width: 1, wrap: "hard" }), {
    width: 2,
    height: 1,
    lines: ["中"]
  });
  assert.deepEqual(layoutText("🙂", { width: 1, wrap: "wrap" }), {
    width: 2,
    height: 1,
    lines: ["🙂"]
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
  assert.deepEqual(layoutText("中中中", { width: 5, wrap: "truncate-end" }), {
    width: 5,
    height: 1,
    lines: ["中中…"]
  });
  assert.deepEqual(layoutText("🙂🙂🙂", { width: 3, wrap: "truncate-middle" }), {
    width: 1,
    height: 1,
    lines: ["…"]
  });
  assert.deepEqual(layoutText("中A", { width: 1, wrap: "truncate-end" }), {
    width: 1,
    height: 1,
    lines: ["…"]
  });
  assert.deepEqual(layoutText("中A", { width: 2, wrap: "truncate-end" }), {
    width: 1,
    height: 1,
    lines: ["…"]
  });
  assert.deepEqual(layoutText("A中B", { width: 3, wrap: "truncate-start" }), {
    width: 2,
    height: 1,
    lines: ["…B"]
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

test("layoutText word wrap mode wraps CJK tokens by display width", () => {
  assert.deepEqual(layoutText("你好 世界", { width: 4, wrap: "wrap" }), {
    width: 4,
    height: 2,
    lines: ["你好", "世界"]
  });
});

test("layoutText wrap keeps Latin whitespace breaks and hard-cuts long Latin tokens", () => {
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
  assert.deepEqual(layoutText("🙂", { width: 1, wrap: "wrap" }), {
    width: 2,
    height: 1,
    lines: ["🙂"]
  });
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
});

test("layoutText wrap soft-wraps CJK without whitespace", () => {
  assert.deepEqual(layoutText("你好世界你好", { width: 4, wrap: "wrap" }), {
    width: 4,
    height: 3,
    lines: ["你好", "世界", "你好"]
  });
  assert.deepEqual(layoutText("中中中", { width: 4, wrap: "wrap" }), {
    width: 4,
    height: 2,
    lines: ["中中", "中"]
  });
  assert.deepEqual(layoutText("中中中中", { width: 2, wrap: "wrap" }), {
    width: 2,
    height: 4,
    lines: ["中", "中", "中", "中"]
  });
  assert.deepEqual(layoutText("中中中", { width: 3, wrap: "wrap" }), {
    width: 2,
    height: 3,
    lines: ["中", "中", "中"]
  });
  assert.deepEqual(layoutText("中", { width: 1, wrap: "wrap" }), {
    width: 2,
    height: 1,
    lines: ["中"]
  });
  assert.deepEqual(layoutText("。！？", { width: 4, wrap: "wrap" }), {
    width: 4,
    height: 2,
    lines: ["。！", "？"]
  });
});

test("layoutText wrap prefers script boundaries for mixed Latin and CJK", () => {
  assert.deepEqual(layoutText("hello世界world", { width: 7, wrap: "wrap" }), {
    width: 5,
    height: 3,
    lines: ["hello", "世界", "world"]
  });
  assert.deepEqual(layoutText("hello世界world", { width: 5, wrap: "wrap" }), {
    width: 5,
    height: 3,
    lines: ["hello", "世界", "world"]
  });
  assert.deepEqual(layoutText("hello世界world", { width: 10, wrap: "wrap" }), {
    width: 9,
    height: 2,
    lines: ["hello世界", "world"]
  });
  assert.deepEqual(layoutText("A中B", { width: 3, wrap: "wrap" }), {
    width: 3,
    height: 2,
    lines: ["A中", "B"]
  });
  assert.deepEqual(layoutText("中A中", { width: 3, wrap: "wrap" }), {
    width: 3,
    height: 2,
    lines: ["中A", "中"]
  });
  assert.deepEqual(layoutText("hi 你好", { width: 4, wrap: "wrap" }), {
    width: 4,
    height: 2,
    lines: ["hi", "你好"]
  });
  assert.deepEqual(layoutText("你好hi世界", { width: 6, wrap: "wrap" }), {
    width: 6,
    height: 2,
    lines: ["你好hi", "世界"]
  });
});

test("layoutText wrap handles spaces, emoji, and multiline edges", () => {
  assert.deepEqual(layoutText("hello  world", { width: 5, wrap: "wrap" }), {
    width: 5,
    height: 2,
    lines: ["hello", "world"]
  });
  assert.deepEqual(layoutText("abc ", { width: 3, wrap: "wrap" }), {
    width: 3,
    height: 1,
    lines: ["abc"]
  });
  assert.deepEqual(layoutText("  abc", { width: 3, wrap: "wrap" }), {
    width: 3,
    height: 2,
    lines: ["  a", "bc"]
  });
  assert.deepEqual(layoutText("a b c", { width: 3, wrap: "wrap" }), {
    width: 3,
    height: 2,
    lines: ["a b", "c"]
  });
  assert.deepEqual(layoutText("🙂🙂🙂", { width: 4, wrap: "wrap" }), {
    width: 4,
    height: 2,
    lines: ["🙂🙂", "🙂"]
  });
  assert.deepEqual(layoutText("🙂🙂", { width: 2, wrap: "wrap" }), {
    width: 2,
    height: 2,
    lines: ["🙂", "🙂"]
  });
  assert.deepEqual(layoutText("a🙂b", { width: 3, wrap: "wrap" }), {
    width: 3,
    height: 2,
    lines: ["a🙂", "b"]
  });

  const zwj = "👨‍👩‍👧";
  assert.deepEqual(layoutText(zwj, { width: 1, wrap: "wrap" }), {
    width: 2,
    height: 1,
    lines: [zwj]
  });

  assert.deepEqual(layoutText("你好\n世界", { width: 2, wrap: "wrap" }), {
    width: 2,
    height: 4,
    lines: ["你", "好", "世", "界"]
  });
  assert.deepEqual(wordWrapLine("", 4), [""]);
  assert.deepEqual(wordWrapLine("   ", 2), [""]);
  assert.deepEqual(wordWrapLine("abcdef", 3), ["abc", "def"]);
});

test("layoutText wrap and hard agree on spaceless CJK but differ on spaced Latin", () => {
  assert.deepEqual(
    layoutText("中中中", { width: 4, wrap: "wrap" }).lines,
    layoutText("中中中", { width: 4, wrap: "hard" }).lines
  );
  assert.deepEqual(layoutText("hello world", { width: 5, wrap: "wrap" }).lines, [
    "hello",
    "world"
  ]);
  assert.deepEqual(layoutText("hello world", { width: 5, wrap: "hard" }).lines, [
    "hello",
    " worl",
    "d"
  ]);
});

test("measureText measures multiline CJK and emoji by display width", () => {
  assert.deepEqual(measureText("中\n🙂"), {
    width: 2,
    height: 2
  });
});

test("layoutText truncate modes handle pure CJK boundaries", () => {
  assert.deepEqual(layoutText("中中中", { width: 3, wrap: "truncate-start" }), {
    width: 3,
    height: 1,
    lines: ["…中"]
  });
  assert.deepEqual(layoutText("中中中", { width: 5, wrap: "truncate-middle" }), {
    width: 5,
    height: 1,
    lines: ["中…中"]
  });
  assert.deepEqual(layoutText("中中中中", { width: 5, wrap: "truncate-middle" }), {
    width: 5,
    height: 1,
    lines: ["中…中"]
  });
});

test("segmentText never reports display widths above 2", () => {
  for (const segment of segmentText("中🙂A")) {
    assert.ok(segment.width >= 0 && segment.width <= 2);
  }
});

test("segmentText falls back when Intl.Segmenter is unavailable", () => {
  const segmenter = (Intl as unknown as { Segmenter?: unknown }).Segmenter;

  try {
    Reflect.deleteProperty(Intl as object, "Segmenter");
    assert.deepEqual(segmentText("AB"), [
      { text: "A", width: 1 },
      { text: "B", width: 1 }
    ]);
  } finally {
    if (segmenter) {
      (Intl as unknown as { Segmenter?: unknown }).Segmenter = segmenter;
    }
  }
});

test("segmentText records ZWJ emoji sequences using string-width", () => {
  const sequence = "👨‍👩‍👧";
  const segments = segmentText(sequence);

  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.text, sequence);
  assert.equal(segments[0]?.width, 2);
});

test("layoutText wrap none preserves multiline CJK height", () => {
  assert.deepEqual(layoutText("中\n🙂", { wrap: "none" }), {
    width: 2,
    height: 2,
    lines: ["中", "🙂"]
  });
});

test("layoutText truncate modes handle emoji width boundaries", () => {
  assert.deepEqual(layoutText("🙂🙂", { width: 1, wrap: "truncate-end" }), {
    width: 1,
    height: 1,
    lines: ["…"]
  });
  assert.deepEqual(layoutText("🙂A", { width: 2, wrap: "truncate-end" }), {
    width: 1,
    height: 1,
    lines: ["…"]
  });
  assert.deepEqual(layoutText("AB🙂", { width: 3, wrap: "truncate-start" }), {
    width: 3,
    height: 1,
    lines: ["…🙂"]
  });
});
