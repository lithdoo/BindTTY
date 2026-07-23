import { StringDecoder } from "node:string_decoder";

export type RawInputToken =
  | TextToken
  | ControlToken
  | EscapeToken
  | CsiToken
  | Ss3Token
  | PasteToken
  | UnknownToken;

export interface TextToken {
  type: "text";
  value: string;
  sequence: string;
}

export interface ControlToken {
  type: "control";
  sequence: string;
}

export interface EscapeToken {
  type: "escape";
  sequence: string;
}

export interface CsiToken {
  type: "csi";
  sequence: string;
  payload: string;
  final: string;
}

export interface Ss3Token {
  type: "ss3";
  sequence: string;
  final: string;
}

export interface PasteToken {
  type: "paste";
  value: string;
  sequence: string;
}

export interface UnknownToken {
  type: "unknown";
  sequence: string;
}

export interface InputTokenizer {
  tokenize(chunk: Buffer | string): RawInputToken[];
  flush(): RawInputToken[];
  reset(): void;
  hasPending(): boolean;
}

const bracketedPasteStart = "\x1b[200~";
const bracketedPasteEnd = "\x1b[201~";
const maxControlSequenceLength = 4096;

export function createInputTokenizer(): InputTokenizer {
  let decoder = new StringDecoder("utf8");
  let pending = "";
  let paste = "";
  let pasteSequence = "";
  let inPaste = false;

  function tokenizeSource(source: string, final: boolean): { tokens: RawInputToken[]; pending: string } {
    const tokens: RawInputToken[] = [];
    let index = 0;

    while (index < source.length) {
      if (inPaste) {
        const endIndex = source.indexOf(bracketedPasteEnd, index);
        if (endIndex === -1) {
          paste += source.slice(index);
          pasteSequence += source.slice(index);
          return { tokens, pending: "" };
        }

        paste += source.slice(index, endIndex);
        pasteSequence += source.slice(index, endIndex + bracketedPasteEnd.length);
        tokens.push({
          type: "paste",
          value: paste,
          sequence: pasteSequence
        });
        paste = "";
        pasteSequence = "";
        inPaste = false;
        index = endIndex + bracketedPasteEnd.length;
        continue;
      }

      if (source.startsWith(bracketedPasteStart, index)) {
        inPaste = true;
        paste = "";
        pasteSequence = bracketedPasteStart;
        index += bracketedPasteStart.length;
        continue;
      }

      const char = readCodePoint(source, index);
      if (char === "\x1b") {
        const escape = readEscapeToken(source, index, final);
        if (escape === "pending") {
          return { tokens, pending: source.slice(index) };
        }
        tokens.push(escape.token);
        index = escape.nextIndex;
        continue;
      }

      if (char < " " || char === "\x7f" || char === "\x00" || char === "\xe0") {
        const prefixed = readWin32PrefixedControl(source, index, final);
        if (prefixed === "pending") {
          return { tokens, pending: source.slice(index) };
        }
        if (prefixed) {
          tokens.push(prefixed.token);
          index = prefixed.nextIndex;
          continue;
        }

        tokens.push({
          type: "control",
          sequence: char
        });
        index += char.length;
        continue;
      }

      tokens.push({
        type: "text",
        value: char,
        sequence: char
      });
      index += char.length;
    }

    return { tokens, pending: "" };
  }

  return {
    tokenize(chunk: Buffer | string): RawInputToken[] {
      const source = pending + decodeChunk(chunk, decoder);
      const parsed = tokenizeSource(source, false);
      pending = parsed.pending;
      return parsed.tokens;
    },
    flush(): RawInputToken[] {
      pending += decoder.end();
      decoder = new StringDecoder("utf8");

      const tokens: RawInputToken[] = [];
      if (pending !== "") {
        const parsed = tokenizeSource(pending, true);
        tokens.push(...parsed.tokens);
        pending = "";
      }

      if (inPaste) {
        tokens.push({
          type: "paste",
          value: paste,
          sequence: pasteSequence
        });
        paste = "";
        pasteSequence = "";
        inPaste = false;
      }

      return tokens;
    },
    reset(): void {
      decoder = new StringDecoder("utf8");
      pending = "";
      paste = "";
      pasteSequence = "";
      inPaste = false;
    },
    hasPending(): boolean {
      return pending !== "" || inPaste;
    }
  };
}

function readEscapeToken(
  source: string,
  index: number,
  final: boolean
): { token: RawInputToken; nextIndex: number } | "pending" {
  if (index + 1 >= source.length) {
    return final ? {
      token: { type: "escape", sequence: "\x1b" },
      nextIndex: index + 1
    } : "pending";
  }

  const next = source[index + 1];
  if (next === "[") {
    const csi = readCsiToken(source, index, final);
    if (csi === "pending") {
      return "pending";
    }
    return csi;
  }

  if (next === "O") {
    const ss3 = readSs3Token(source, index, final);
    if (ss3 === "pending") {
      return "pending";
    }
    return ss3;
  }

  const metaChar = readCodePoint(source, index + 1);
  if (metaChar.length > 0) {
    return {
      token: {
        type: "escape",
        sequence: source.slice(index, index + 1 + metaChar.length)
      },
      nextIndex: index + 1 + metaChar.length
    };
  }

  return final ? {
    token: { type: "escape", sequence: "\x1b" },
    nextIndex: index + 1
  } : "pending";
}

function readCsiToken(
  source: string,
  index: number,
  final: boolean
): { token: RawInputToken; nextIndex: number } | "pending" {
  let cursor = index + 2;

  while (cursor < source.length) {
    if (cursor - index >= maxControlSequenceLength) {
      return {
        token: {
          type: "unknown",
          sequence: source.slice(index, cursor)
        },
        nextIndex: cursor
      };
    }

    const char = source[cursor] ?? "";
    const code = char.charCodeAt(0);

    if (isCsiFinalByte(code)) {
      const sequence = source.slice(index, cursor + 1);
      return {
        token: {
          type: "csi",
          sequence,
          payload: source.slice(index + 2, cursor),
          final: char
        },
        nextIndex: cursor + 1
      };
    }

    if (!isCsiParameterByte(code) && !isCsiIntermediateByte(code)) {
      return {
        token: {
          type: "unknown",
          sequence: source.slice(index, cursor + 1)
        },
        nextIndex: cursor + 1
      };
    }

    cursor += 1;
  }

  if (!final) {
    return "pending";
  }

  return {
    token: {
      type: "unknown",
      sequence: source.slice(index)
    },
    nextIndex: source.length
  };
}

function readSs3Token(
  source: string,
  index: number,
  final: boolean
): { token: RawInputToken; nextIndex: number } | "pending" {
  if (index + 2 >= source.length) {
    return final ? {
      token: {
        type: "unknown",
        sequence: source.slice(index)
      },
      nextIndex: source.length
    } : "pending";
  }

  const finalChar = source[index + 2] ?? "";
  return {
    token: {
      type: "ss3",
      sequence: source.slice(index, index + 3),
      final: finalChar
    },
    nextIndex: index + 3
  };
}

function readWin32PrefixedControl(
  source: string,
  index: number,
  final: boolean
): { token: ControlToken; nextIndex: number } | "pending" | null {
  const prefix = source[index];
  if (prefix !== "\x00" && prefix !== "\xe0") {
    return null;
  }

  if (index + 1 >= source.length) {
    return final ? null : "pending";
  }

  return {
    token: {
      type: "control",
      sequence: source.slice(index, index + 2)
    },
    nextIndex: index + 2
  };
}

function isCsiParameterByte(code: number): boolean {
  return code >= 0x30 && code <= 0x3f;
}

function isCsiIntermediateByte(code: number): boolean {
  return code >= 0x20 && code <= 0x2f;
}

function isCsiFinalByte(code: number): boolean {
  return code >= 0x40 && code <= 0x7e;
}

function readCodePoint(value: string, index: number): string {
  return String.fromCodePoint(value.codePointAt(index) ?? 0);
}

function decodeChunk(chunk: Buffer | string, decoder: StringDecoder): string {
  return typeof chunk === "string" ? chunk : decoder.write(chunk);
}
