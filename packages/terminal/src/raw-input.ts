import type { TerminalKeyEvent } from "./types.js";

export function* parseRawChunk(chunk: string): Generator<TerminalKeyEvent> {
  for (const char of chunk) {
    switch (char) {
      case "\r":
      case "\n":
        yield {
          input: "\r",
          name: "return",
          ctrl: false,
          meta: false,
          shift: false,
          sequence: char
        };
        break;
      case "\x7f":
      case "\b":
        yield {
          input: "",
          name: "backspace",
          ctrl: false,
          meta: false,
          shift: false,
          sequence: char
        };
        break;
      case "\x03":
        yield {
          input: "c",
          name: "c",
          ctrl: true,
          meta: false,
          shift: false,
          sequence: char
        };
        break;
      case "\t":
        yield {
          input: "",
          name: "tab",
          ctrl: false,
          meta: false,
          shift: false,
          sequence: char
        };
        break;
      case " ":
        yield {
          input: " ",
          ctrl: false,
          meta: false,
          shift: false,
          sequence: char
        };
        break;
      default:
        if (char >= " " && char !== "\x1b") {
          yield {
            input: char,
            ctrl: false,
            meta: false,
            shift: false,
            sequence: char
          };
        }
    }
  }
}
