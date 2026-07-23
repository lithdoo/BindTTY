import assert from "node:assert/strict";
import test from "node:test";

import { createInputTokenizer } from "@bindtty/input";

test("tokenizer emits text and control tokens", () => {
  const tokenizer = createInputTokenizer();

  assert.deepEqual(tokenizer.tokenize("a\r🙂"), [
    {
      type: "text",
      value: "a",
      sequence: "a"
    },
    {
      type: "control",
      sequence: "\r"
    },
    {
      type: "text",
      value: "🙂",
      sequence: "🙂"
    }
  ]);
});

test("tokenizer emits CSI and SS3 tokens", () => {
  const tokenizer = createInputTokenizer();

  assert.deepEqual(tokenizer.tokenize("\x1b[13;5:3u\x1bOB"), [
    {
      type: "csi",
      sequence: "\x1b[13;5:3u",
      payload: "13;5:3",
      final: "u"
    },
    {
      type: "ss3",
      sequence: "\x1bOB",
      final: "B"
    }
  ]);
});

test("tokenizer preserves split CSI tokens", () => {
  const tokenizer = createInputTokenizer();

  assert.deepEqual(tokenizer.tokenize("\x1b[13;"), []);
  assert.equal(tokenizer.hasPending(), true);
  assert.deepEqual(tokenizer.tokenize("5u"), [
    {
      type: "csi",
      sequence: "\x1b[13;5u",
      payload: "13;5",
      final: "u"
    }
  ]);
  assert.equal(tokenizer.hasPending(), false);
});

test("tokenizer preserves split UTF-8 buffer characters", () => {
  const tokenizer = createInputTokenizer();
  const buffer = Buffer.from("🙂");

  assert.deepEqual(tokenizer.tokenize(buffer.subarray(0, 2)), []);
  assert.equal(tokenizer.hasPending(), false);
  assert.deepEqual(tokenizer.tokenize(buffer.subarray(2)), [
    {
      type: "text",
      value: "🙂",
      sequence: "🙂"
    }
  ]);
});

test("tokenizer emits bracketed paste as one token", () => {
  const tokenizer = createInputTokenizer();

  assert.deepEqual(tokenizer.tokenize("\x1b[200~a\x1b[A b\x1b[201~"), [
    {
      type: "paste",
      value: "a\x1b[A b",
      sequence: "\x1b[200~a\x1b[A b\x1b[201~"
    }
  ]);
});

test("tokenizer preserves split bracketed paste", () => {
  const tokenizer = createInputTokenizer();

  assert.deepEqual(tokenizer.tokenize("\x1b[200~a"), []);
  assert.equal(tokenizer.hasPending(), true);
  assert.deepEqual(tokenizer.tokenize("b\x1b[201~"), [
    {
      type: "paste",
      value: "ab",
      sequence: "\x1b[200~ab\x1b[201~"
    }
  ]);
});

test("tokenizer flushes incomplete CSI as one unknown token", () => {
  const tokenizer = createInputTokenizer();

  assert.deepEqual(tokenizer.tokenize("\x1b["), []);
  assert.deepEqual(tokenizer.flush(), [
    {
      type: "unknown",
      sequence: "\x1b["
    }
  ]);
});
