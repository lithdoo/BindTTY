import assert from "node:assert/strict";
import test from "node:test";

import {
  createInputParser,
  keyboardCapabilitiesForProtocol,
  parseInputChunk,
  toSemanticInputEvent,
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

test("parseInputChunk maps F1-F12 from SS3, CSI tilde, Win32, and Kitty", () => {
  assert.deepEqual(
    [
      ...parseInputChunk("\x1bOP\x1bOQ\x1bOR\x1bOS"),
      ...parseInputChunk(
        "\x1b[11~\x1b[12~\x1b[13~\x1b[14~\x1b[15~\x1b[17~\x1b[18~\x1b[19~\x1b[20~\x1b[21~\x1b[23~\x1b[24~"
      ),
      ...parseInputChunk("\x00;"),
      ...parseInputChunk("\x1b[15;2~\x1b[11;5~"),
      ...parseInputChunk("\x1b[1;2P"),
      ...parseInputChunk("\x1b[57364;5u\x1b[57375u")
    ].map((event) => ({
      name: event.name,
      ctrl: event.ctrl,
      meta: event.meta,
      shift: event.shift,
      input: event.input
    })),
    [
      { name: "f1", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f2", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f3", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f4", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f1", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f2", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f3", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f4", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f5", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f6", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f7", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f8", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f9", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f10", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f11", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f12", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f1", ctrl: false, meta: false, shift: false, input: "" },
      { name: "f5", ctrl: false, meta: false, shift: true, input: "" },
      { name: "f1", ctrl: true, meta: false, shift: false, input: "" },
      { name: "f1", ctrl: false, meta: false, shift: true, input: "" },
      { name: "f1", ctrl: true, meta: false, shift: false, input: "" },
      { name: "f12", ctrl: false, meta: false, shift: false, input: "" }
    ]
  );

  // Bare 13~ is F3; 13;mod~ and Kitty 13;mod u remain modified Enter.
  assert.deepEqual([...parseInputChunk("\x1b[13~")], [
    keyEvent("f3", "", "\x1b[13~")
  ]);
  assert.deepEqual([...parseInputChunk("\x1b[13;5~")], [
    keyEvent("return", "\r", "\x1b[13;5~", true)
  ]);
  assert.deepEqual([...parseInputChunk("\x1b[13;5u")], [
    keyEvent("return", "\r", "\x1b[13;5u", true)
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
    keyEvent("unknown", "", "\x1b[")
  ]);
});

test("createInputParser flushes incomplete SS3 atomically without leaking suffix text", () => {
  const parser = createInputParser();

  assert.deepEqual(parser.parse("\x1bO"), []);
  assert.deepEqual(parser.flush(), [
    keyEvent("unknown", "", "\x1bO")
  ]);
});

test("createInputParser bounds oversized CSI sequences and keeps following text", () => {
  const parser = createInputParser();
  const oversized = `\x1b[${"1".repeat(4094)}Z`;
  const events = parser.parse(`${oversized}ok`);

  assert.equal(events[0]?.name, "unknown");
  assert.equal(events[0]?.sequence?.length, 4096);
  assert.deepEqual(events.slice(1), [
    textEvent("Z"),
    textEvent("o"),
    textEvent("k")
  ]);
});

test("semantic input bridge distinguishes text keys paste and unknown events", () => {
  assert.deepEqual(toSemanticInputEvent(textEvent("B"), "windows-vt"), {
    kind: "text",
    text: "B",
    protocol: "windows-vt",
    sequence: "B"
  });
  assert.deepEqual(
    toSemanticInputEvent(keyEvent("f2", "", "\x1bOQ"), "windows-vt"),
    {
      kind: "key",
      key: "f2",
      ctrl: false,
      meta: false,
      shift: false,
      repeat: 1,
      protocol: "windows-vt",
      sequence: "\x1bOQ"
    }
  );
  assert.deepEqual(
    toSemanticInputEvent({
      input: "hello",
      name: "paste",
      ctrl: false,
      meta: false,
      shift: false,
      sequence: "\x1b[200~hello\x1b[201~"
    }),
    {
      kind: "paste",
      text: "hello",
      protocol: "legacy-vt",
      sequence: "\x1b[200~hello\x1b[201~"
    }
  );
  assert.equal(
    toSemanticInputEvent(keyEvent("unknown", "", "\x1b[999~")).kind,
    "unknown"
  );
});

test("keyboard capabilities do not promise modified Enter for legacy VT", () => {
  assert.equal(keyboardCapabilitiesForProtocol("legacy-vt").modifiedEnter, false);
  assert.equal(keyboardCapabilitiesForProtocol("windows-vt").modifiedEnter, false);
  assert.equal(keyboardCapabilitiesForProtocol("kitty").modifiedEnter, true);
  assert.equal(keyboardCapabilitiesForProtocol("win32").leftRightModifiers, true);
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
