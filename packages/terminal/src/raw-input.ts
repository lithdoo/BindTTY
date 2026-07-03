import type { TerminalKeyEvent } from "./types.js";

const CSI_TILDE_KEY_NAMES: Readonly<Record<string, string>> = {
  "1": "home",
  "2": "insert",
  "3": "delete",
  "4": "end",
  "5": "pageup",
  "6": "pagedown",
  "7": "home",
  "8": "end"
};

const SS3_KEY_NAMES: Readonly<Record<string, string>> = {
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  H: "home",
  F: "end"
};

const WIN32_PREFIXED_KEY_NAMES: Readonly<Record<string, string>> = {
  G: "home",
  H: "up",
  I: "pageup",
  K: "left",
  M: "right",
  O: "end",
  P: "down",
  Q: "pagedown"
};

export function* parseRawChunk(chunk: string): Generator<TerminalKeyEvent> {
  let index = 0;

  while (index < chunk.length) {
    const char = chunk[index];

    if (char === "\x00" || char === "\xe0") {
      const prefixed = parseWin32PrefixedSequence(chunk, index);
      if (prefixed) {
        yield prefixed.event;
        index = prefixed.nextIndex;
        continue;
      }

      index += 1;
      continue;
    }

    if (char === "\x1b") {
      const escape = parseEscapeSequence(chunk, index);
      if (escape) {
        yield escape.event;
        index = escape.nextIndex;
        continue;
      }

      index += 1;
      continue;
    }

    const event = parseSingleChar(char);
    if (event) {
      yield event;
    }

    index += 1;
  }
}

function parseSingleChar(char: string): TerminalKeyEvent | null {
  switch (char) {
    case "\r":
    case "\n":
      return navigationEvent("return", "\r", char);
    case "\x7f":
    case "\b":
      return navigationEvent("backspace", "", char);
    case "\x03":
      return {
        input: "c",
        name: "c",
        ctrl: true,
        meta: false,
        shift: false,
        sequence: char
      };
    case "\t":
      return navigationEvent("tab", "", char);
    case " ":
      return {
        input: " ",
        ctrl: false,
        meta: false,
        shift: false,
        sequence: char
      };
    default:
      if (char >= " ") {
        return {
          input: char,
          ctrl: false,
          meta: false,
          shift: false,
          sequence: char
        };
      }

      return null;
  }
}

function parseEscapeSequence(
  chunk: string,
  start: number
): { event: TerminalKeyEvent; nextIndex: number } | null {
  if (chunk[start] !== "\x1b") {
    return null;
  }

  const csi = parseCsiSequence(chunk, start);
  if (csi) {
    return csi;
  }

  const ss3 = parseSs3Sequence(chunk, start);
  if (ss3) {
    return ss3;
  }

  return null;
}

function parseCsiSequence(
  chunk: string,
  start: number
): { event: TerminalKeyEvent; nextIndex: number } | null {
  if (chunk[start + 1] !== "[") {
    return null;
  }

  const tildeMatch = chunk.slice(start).match(/^\x1b\[(\d+)~/);
  if (tildeMatch) {
    const name = CSI_TILDE_KEY_NAMES[tildeMatch[1] ?? ""];
    if (!name) {
      return null;
    }

    return {
      event: navigationEvent(name, "", tildeMatch[0]),
      nextIndex: start + tildeMatch[0].length
    };
  }

  const letter = chunk[start + 2];
  if (!letter) {
    return null;
  }

  const name = SS3_KEY_NAMES[letter];
  if (!name) {
    return null;
  }

  const sequence = chunk.slice(start, start + 3);
  return {
    event: navigationEvent(name, "", sequence),
    nextIndex: start + 3
  };
}

function parseWin32PrefixedSequence(
  chunk: string,
  start: number
): { event: TerminalKeyEvent; nextIndex: number } | null {
  const prefix = chunk[start];
  if (prefix !== "\x00" && prefix !== "\xe0") {
    return null;
  }

  const code = chunk[start + 1];
  if (!code) {
    return null;
  }

  const name = WIN32_PREFIXED_KEY_NAMES[code];
  if (!name) {
    return null;
  }

  const sequence = chunk.slice(start, start + 2);
  return {
    event: navigationEvent(name, "", sequence),
    nextIndex: start + 2
  };
}

function parseSs3Sequence(
  chunk: string,
  start: number
): { event: TerminalKeyEvent; nextIndex: number } | null {
  if (chunk[start + 1] !== "O") {
    return null;
  }

  const letter = chunk[start + 2];
  if (!letter) {
    return null;
  }

  const name = SS3_KEY_NAMES[letter];
  if (!name) {
    return null;
  }

  const sequence = chunk.slice(start, start + 3);
  return {
    event: navigationEvent(name, "", sequence),
    nextIndex: start + 3
  };
}

function navigationEvent(
  name: string,
  input: string,
  sequence: string
): TerminalKeyEvent {
  return {
    input,
    name,
    ctrl: false,
    meta: false,
    shift: false,
    sequence
  };
}
