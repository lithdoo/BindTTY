import assert from "node:assert/strict";
import test from "node:test";

import {
  createInputParser,
  parseInputChunk,
  type InputEvent
} from "@bindtty/input";

test("parseInputChunk maps printable ASCII without name for text input", () => {
  const events = [...parseInputChunk("ab")];

  assert.deepEqual(events, [
    textEvent("a"),
    textEvent("b")
  ]);
  assert.ok(events[0] !== undefined && !("name" in events[0]));
});

test("parseInputChunk maps non-BMP printable characters as one input event", () => {
  assert.deepEqual([...parseInputChunk("中🙂")], [
    textEvent("中"),
    textEvent("🙂")
  ]);
});

test("parseInputChunk maps control keys", () => {
  assert.deepEqual([...parseInputChunk("\r\n\x7f\b\x03\t ")], [
    keyEvent("return", "\r", "\r"),
    keyEvent("return", "\r", "\n"),
    keyEvent("backspace", "", "\x7f"),
    keyEvent("backspace", "", "\b"),
    keyEvent("c", "c", "\x03", true),
    keyEvent("tab", "", "\t"),
    textEvent(" ")
  ]);
});

test("parseInputChunk maps CSI and SS3 navigation keys", () => {
  const events = [
    ...parseInputChunk("\x1b[B\x1b[A\x1b[C\x1b[D"),
    ...parseInputChunk("\x1b[5~\x1b[6~"),
    ...parseInputChunk("\x1b[H\x1b[F"),
    ...parseInputChunk("\x1bOB")
  ];

  assert.deepEqual(
    events.map((event) => event.name),
    [
      "down",
      "up",
      "right",
      "left",
      "pageup",
      "pagedown",
      "home",
      "end",
      "down"
    ]
  );
});

test("parseInputChunk maps modifier navigation keys", () => {
  assert.deepEqual([...parseInputChunk("\x1b[1;2A\x1b[1;3B\x1b[1;5C\x1b[1;6D")], [
    keyEvent("up", "", "\x1b[1;2A", false, false, true),
    keyEvent("down", "", "\x1b[1;3B", false, true, false),
    keyEvent("right", "", "\x1b[1;5C", true),
    keyEvent("left", "", "\x1b[1;6D", true, false, true)
  ]);
});

test("parseInputChunk maps common modified Enter sequences", () => {
  assert.deepEqual(
    [
      ...parseInputChunk("\x1b[13;5u"),
      ...parseInputChunk("\x1b[10;5u"),
      ...parseInputChunk("\x1b[13;5:3u"),
      ...parseInputChunk("\x1b[27;5;13~"),
      ...parseInputChunk("\x1b[13;5~"),
      ...parseInputChunk("\x1b[13;3u"),
      ...parseInputChunk("\x1b[13;2u")
    ],
    [
      keyEvent("return", "\r", "\x1b[13;5u", true),
      keyEvent("return", "\r", "\x1b[10;5u", true),
      keyEvent("return", "\r", "\x1b[13;5:3u", true),
      keyEvent("return", "\r", "\x1b[27;5;13~", true),
      keyEvent("return", "\r", "\x1b[13;5~", true),
      keyEvent("return", "\r", "\x1b[13;3u", false, true),
      keyEvent("return", "\r", "\x1b[13;2u", false, false, true)
    ]
  );
});

test("parseInputChunk maps modifier combinations for Kitty Enter", () => {
  assert.deepEqual([...parseInputChunk("\x1b[13;7u")], [
    keyEvent("return", "\r", "\x1b[13;7u", true, true)
  ]);
});

test("parseInputChunk maps modifyOtherKeys printable input", () => {
  assert.deepEqual([...parseInputChunk("\x1b[27;5;97~")], [
    {
      input: "a",
      ctrl: true,
      meta: false,
      shift: false,
      sequence: "\x1b[27;5;97~"
    }
  ]);
});

test("parseInputChunk applies custom dynamic keymap entries", () => {
  assert.deepEqual(
    [
      ...parseInputChunk("\x1b[999~", {
        keymap: {
          fixed: [],
          dynamic: [
            {
              starter: "\x1b[",
              enders: ["~"],
              parse(payload, sequence) {
                return payload === "999"
                  ? keyEvent("custom", "", sequence, true)
                  : null;
              }
            }
          ]
        }
      })
    ],
    [
      keyEvent("custom", "", "\x1b[999~", true)
    ]
  );
});

test("parseInputChunk consumes unknown CSI sequences without leaking text input", () => {
  assert.deepEqual([...parseInputChunk("a\x1b[99;9~\x1b[99;9:1ub")], [
    textEvent("a"),
    keyEvent("unknown", "", "\x1b[99;9~"),
    keyEvent("unknown", "", "\x1b[99;9:1u"),
    textEvent("b")
  ]);
});

test("parseInputChunk treats bracketed paste content as text by default", () => {
  assert.deepEqual([...parseInputChunk("\x1b[200~a\x1b[A b\x1b[201~")], [
    textEvent("a"),
    textEvent("\x1b"),
    textEvent("["),
    textEvent("A"),
    textEvent(" "),
    textEvent("b")
  ]);
});

test("parseInputChunk keeps pasted emoji as one text event", () => {
  assert.deepEqual([...parseInputChunk("\x1b[200~🙂\x1b[201~")], [
    textEvent("🙂")
  ]);
});

test("parseInputChunk keeps pasted ZWJ emoji sequences as one text event", () => {
  const sequence = "👨‍👩‍👧";
  assert.deepEqual([...parseInputChunk(`\x1b[200~${sequence}\x1b[201~`)], [
    textEvent(sequence)
  ]);
});

test("parseInputChunk splits pasted graphemes for mixed text", () => {
  assert.deepEqual([...parseInputChunk("\x1b[200~A中🙂\x1b[201~")], [
    textEvent("A"),
    textEvent("中"),
    textEvent("🙂")
  ]);
});

test("parseInputChunk can emit bracketed paste as one event", () => {
  assert.deepEqual(
    [...parseInputChunk("\x1b[200~hello\x1b[201~", { pasteMode: "event" })],
    [
      {
        input: "hello",
        name: "paste",
        ctrl: false,
        meta: false,
        shift: false,
        sequence: "\x1b[200~hello\x1b[201~"
      }
    ]
  );
});

test("createInputParser preserves split escape sequences", () => {
  const parser = createInputParser();

  assert.deepEqual(parser.parse("\x1b["), []);
  assert.deepEqual(parser.parse("13;5"), []);
  assert.deepEqual(parser.parse("u"), [
    keyEvent("return", "\r", "\x1b[13;5u", true)
  ]);
});

test("createInputParser exposes pending state", () => {
  const parser = createInputParser();

  assert.equal(parser.hasPending(), false);
  assert.deepEqual(parser.parse("\x1b["), []);
  assert.equal(parser.hasPending(), true);
  assert.deepEqual(parser.parse("A"), [
    keyEvent("up", "", "\x1b[A")
  ]);
  assert.equal(parser.hasPending(), false);
});

test("createInputParser preserves split fixed sequences", () => {
  const parser = createInputParser();

  assert.deepEqual(parser.parse("\x1b"), []);
  assert.deepEqual(parser.parse("[A"), [
    keyEvent("up", "", "\x1b[A")
  ]);
});

test("createInputParser preserves split UTF-8 buffer characters", () => {
  const parser = createInputParser();
  const buffer = Buffer.from("🙂");

  assert.deepEqual(parser.parse(buffer.subarray(0, 2)), []);
  assert.deepEqual(parser.parse(buffer.subarray(2)), [
    textEvent("🙂")
  ]);
});

test("createInputParser flushes incomplete control sequences as unknown", () => {
  const parser = createInputParser();

  assert.deepEqual(parser.parse("\x1b["), []);
  assert.deepEqual(parser.flush(), [
    keyEvent("unknown", "", "\x1b"),
    textEvent("[")
  ]);
});

test("createInputParser reset clears partial state", () => {
  const parser = createInputParser();

  assert.deepEqual(parser.parse("\x1b["), []);
  parser.reset();
  assert.deepEqual(parser.parse("A"), [
    textEvent("A")
  ]);
});

function textEvent(input: string): InputEvent {
  return {
    input,
    ctrl: false,
    meta: false,
    shift: false,
    sequence: input
  };
}

function keyEvent(
  name: string,
  input: string,
  sequence: string,
  ctrl = false,
  meta = false,
  shift = false
): InputEvent {
  return {
    input,
    name,
    ctrl,
    meta,
    shift,
    sequence
  };
}
