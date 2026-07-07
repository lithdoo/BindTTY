import {
  defaultFixedKeymap,
  buildReverseKeymap,
  type FixedKeymapEntry
} from "./keymap.js";
import {
  parseInputToken,
  type EscapeFlushMode,
  type PasteMode
} from "./parse-token.js";
import { createInputTokenizer } from "./tokenizer.js";
import type { InputEvent } from "./events.js";

export type {
  InputEvent,
  InputKeyEvent,
  InputPasteEvent,
  InputUnknownEvent
} from "./events.js";
export type { FixedKeymapEntry } from "./keymap.js";
export type {
  CsiToken,
  ControlToken,
  EscapeToken,
  InputTokenizer,
  PasteToken,
  RawInputToken,
  Ss3Token,
  TextToken,
  UnknownToken
} from "./tokenizer.js";
export { createInputTokenizer } from "./tokenizer.js";

export interface DynamicKeymapEntry {
  starter: string;
  enders: readonly string[];
  parse(payload: string, sequence: string): InputEvent | null;
}

export interface InputKeymap {
  fixed: readonly FixedKeymapEntry[];
  dynamic?: readonly DynamicKeymapEntry[];
}

export interface ParseInputChunkOptions {
  keymap?: InputKeymap;
  pasteMode?: PasteMode;
  escapeFlushMode?: EscapeFlushMode;
}

export interface InputParser {
  parse(chunk: Buffer | string): InputEvent[];
  flush(): InputEvent[];
  reset(): void;
  hasPending(): boolean;
}

export const defaultInputKeymap: InputKeymap = {
  fixed: defaultFixedKeymap,
  dynamic: []
};

export function parseInputChunk(
  chunk: Buffer | string,
  options: ParseInputChunkOptions = {}
): Iterable<InputEvent> {
  return createInputParser(options).parse(chunk);
}

export function createInputParser(options: ParseInputChunkOptions = {}): InputParser {
  const tokenizer = createInputTokenizer();
  const reverse = buildReverseKeymap(options.keymap?.fixed ?? defaultInputKeymap.fixed);
  const dynamic = options.keymap?.dynamic ?? defaultInputKeymap.dynamic ?? [];
  const pasteMode = options.pasteMode ?? "text";
  const escapeFlushMode = options.escapeFlushMode ?? "unknown";

  return {
    parse(chunk: Buffer | string): InputEvent[] {
      return tokenizer.tokenize(chunk).flatMap((token) =>
        parseInputToken(token, {
          reverse,
          dynamic,
          pasteMode,
          escapeFlushMode
        })
      );
    },
    flush(): InputEvent[] {
      return tokenizer.flush().flatMap((token) =>
        parseInputToken(token, {
          reverse,
          dynamic,
          pasteMode,
          escapeFlushMode
        })
      );
    },
    reset(): void {
      tokenizer.reset();
    },
    hasPending(): boolean {
      return tokenizer.hasPending();
    }
  };
}
