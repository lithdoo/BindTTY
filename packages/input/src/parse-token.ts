import { keyEvent, pasteEvent, textEvent, unknownEvent, type InputEvent } from "./events.js";
import type { ReverseKeymap } from "./keymap.js";
import { flagsToTuple, readXtermModifierFlags } from "./modifiers.js";
import type { CsiToken, RawInputToken } from "./tokenizer.js";

export type PasteMode = "text" | "event";
export type EscapeFlushMode = "unknown" | "escape";

export interface ParseTokenOptions {
  reverse: ReverseKeymap;
  pasteMode: PasteMode;
  escapeFlushMode: EscapeFlushMode;
}

export function parseInputToken(token: RawInputToken, options: ParseTokenOptions): InputEvent[] {
  const fixed = options.reverse.bySequence.get(token.sequence);
  if (fixed) {
    return [fixed];
  }

  switch (token.type) {
    case "text":
      return [textEvent(token.value, token.sequence)];
    case "control":
      return parseControlToken(token.sequence);
    case "escape":
      return parseEscapeToken(token.sequence, options.escapeFlushMode);
    case "csi":
      return [parseCsiToken(token)];
    case "ss3":
      return [parseSs3Token(token.final, token.sequence)];
    case "paste":
      return options.pasteMode === "event"
        ? [pasteEvent(token.value, token.sequence)]
        : [...token.value].map((input) => textEvent(input));
    case "unknown":
      return [unknownEvent(token.sequence)];
  }
}

function parseControlToken(sequence: string): InputEvent[] {
  if (sequence === "\r" || sequence === "\n") {
    return [keyEvent("return", "\r", sequence)];
  }

  if (sequence === "\x7f" || sequence === "\b") {
    return [keyEvent("backspace", "", sequence)];
  }

  if (sequence === "\t") {
    return [keyEvent("tab", "", sequence)];
  }

  if (sequence === "\x03") {
    return [keyEvent("c", "c", sequence, true)];
  }

  const code = sequence.charCodeAt(0);
  if (code >= 1 && code <= 26) {
    const input = String.fromCharCode(code + 96);
    return [keyEvent(input, input, sequence, true)];
  }

  return [unknownEvent(sequence)];
}

function parseEscapeToken(sequence: string, mode: EscapeFlushMode): InputEvent[] {
  if (sequence === "\x1b") {
    return mode === "escape"
      ? [keyEvent("escape", "", sequence)]
      : [unknownEvent(sequence)];
  }

  const input = sequence.slice(1);
  if (input.length === 0) {
    return [unknownEvent(sequence)];
  }

  if (input === "\r" || input === "\n") {
    return [keyEvent("return", "\r", sequence, false, true)];
  }

  if (input === "\x7f" || input === "\b") {
    return [keyEvent("backspace", "", sequence, false, true)];
  }

  if (input === "\t") {
    return [keyEvent("tab", "", sequence, false, true)];
  }

  if (input >= " ") {
    return [
      {
        input,
        ctrl: false,
        meta: true,
        shift: input.toLocaleUpperCase() === input && input.toLocaleLowerCase() !== input,
        sequence
      }
    ];
  }

  return [unknownEvent(sequence)];
}

function parseCsiToken(token: CsiToken): InputEvent {
  if (token.final === "u") {
    return parseKittyOrFixterms(token) ?? unknownEvent(token.sequence);
  }

  if (token.final === "~") {
    return (
      parseModifyOtherKeys(token) ??
      parseCsiTildeModifiedEnter(token) ??
      parseCsiTildeNavigation(token) ??
      unknownEvent(token.sequence)
    );
  }

  return parseCsiLetterNavigation(token) ?? unknownEvent(token.sequence);
}

function parseKittyOrFixterms(token: CsiToken): InputEvent | null {
  const match = token.payload.match(/^(\d+)(?:;([2-8]))?(?::([123]))?(?::.*)?$/);
  if (!match) {
    return null;
  }

  const codepoint = Number(match[1]);
  const modifier = match[2];
  if (!Number.isFinite(codepoint)) {
    return null;
  }

  const flags = readXtermModifierFlags(modifier);
  if (codepoint === 10 || codepoint === 13) {
    return keyEvent("return", "\r", token.sequence, ...flagsToTuple(flags));
  }

  if (codepoint === 9) {
    return keyEvent("tab", "", token.sequence, ...flagsToTuple(flags));
  }

  if (codepoint === 27) {
    return keyEvent("escape", "", token.sequence, ...flagsToTuple(flags));
  }

  if (codepoint === 127 || codepoint === 8) {
    return keyEvent("backspace", "", token.sequence, ...flagsToTuple(flags));
  }

  const input = String.fromCodePoint(codepoint);
  if (input >= " ") {
    return {
      input,
      ctrl: flags.ctrl,
      meta: flags.meta,
      shift: flags.shift,
      sequence: token.sequence
    };
  }

  return null;
}

function parseModifyOtherKeys(token: CsiToken): InputEvent | null {
  const match = token.payload.match(/^27;([2-8]);(\d+)$/);
  if (!match) {
    return null;
  }

  const flags = readXtermModifierFlags(match[1]);
  const codepoint = Number(match[2]);
  if (!Number.isFinite(codepoint)) {
    return null;
  }

  if (codepoint === 13 || codepoint === 10) {
    return keyEvent("return", "\r", token.sequence, ...flagsToTuple(flags));
  }

  if (codepoint === 9) {
    return keyEvent("tab", "", token.sequence, ...flagsToTuple(flags));
  }

  if (codepoint === 27) {
    return keyEvent("escape", "", token.sequence, ...flagsToTuple(flags));
  }

  if (codepoint === 127 || codepoint === 8) {
    return keyEvent("backspace", "", token.sequence, ...flagsToTuple(flags));
  }

  if (codepoint >= 32) {
    return {
      input: String.fromCodePoint(codepoint),
      ctrl: flags.ctrl,
      meta: flags.meta,
      shift: flags.shift,
      sequence: token.sequence
    };
  }

  return null;
}

function parseCsiTildeModifiedEnter(token: CsiToken): InputEvent | null {
  const match = token.payload.match(/^13;([2-8])$/);
  if (!match) {
    return null;
  }

  const flags = readXtermModifierFlags(match[1]);
  return keyEvent("return", "\r", token.sequence, ...flagsToTuple(flags));
}

function parseCsiTildeNavigation(token: CsiToken): InputEvent | null {
  const match = token.payload.match(/^([1-8])(?:;([2-8]))?$/);
  if (!match) {
    return null;
  }

  const name = readTildeNavigationName(match[1] ?? "");
  if (!name) {
    return null;
  }

  return keyEvent(name, "", token.sequence, ...flagsToTuple(readXtermModifierFlags(match[2])));
}

function parseCsiLetterNavigation(token: CsiToken): InputEvent | null {
  const name = readLetterNavigationName(token.final);
  if (!name) {
    return null;
  }

  const modifier = token.payload.match(/^1;([2-8])$/)?.[1];
  if (token.payload !== "" && !modifier) {
    return null;
  }

  return keyEvent(name, "", token.sequence, ...flagsToTuple(readXtermModifierFlags(modifier)));
}

function parseSs3Token(final: string, sequence: string): InputEvent {
  const name = readLetterNavigationName(final);
  return name ? keyEvent(name, "", sequence) : unknownEvent(sequence);
}

function readTildeNavigationName(code: string): string | null {
  switch (code) {
    case "1":
    case "7":
      return "home";
    case "2":
      return "insert";
    case "3":
      return "delete";
    case "4":
    case "8":
      return "end";
    case "5":
      return "pageup";
    case "6":
      return "pagedown";
    default:
      return null;
  }
}

function readLetterNavigationName(code: string): string | null {
  switch (code) {
    case "A":
      return "up";
    case "B":
      return "down";
    case "C":
      return "right";
    case "D":
      return "left";
    case "H":
      return "home";
    case "F":
      return "end";
    default:
      return null;
  }
}
