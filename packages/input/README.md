# @bindtty/input

Terminal keyboard input parsing primitives for BindTTY.

`@bindtty/input` converts raw terminal input chunks into stable `InputEvent` objects. It is intentionally independent from runtime, renderer, terminal lifecycle, interaction focus, and widgets.

## Responsibilities

- Decode `Buffer | string` stdin chunks.
- Preserve split UTF-8 characters across chunks.
- Tokenize text, control keys, CSI, SS3, bracketed paste, and unknown escape sequences.
- Parse common terminal keyboard protocols:
  - legacy CSI / SS3 navigation keys
  - Kitty / fixterms `CSI ... u`
  - xterm modifyOtherKeys
  - Win32 prefixed keys
- Keep unknown control sequences from leaking into text input values.

It does not enable raw mode, write terminal protocol setup sequences, or manage focus. Those belong to `@bindtty/terminal` and `@bindtty/interaction`.

## Public API

```ts
import { createInputParser, parseInputChunk } from "@bindtty/input";

const events = [...parseInputChunk("\x1b[13;5u")];
```

```ts
const parser = createInputParser();

parser.parse("\x1b[13;");
parser.hasPending(); // true

const events = parser.parse("5u");
parser.hasPending(); // false
```

## Event shape

```ts
export interface InputKeyEvent {
  input: string;
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence?: string;
}
```

Unknown escape/control sequences are emitted as:

```ts
{
  input: "",
  name: "unknown",
  ctrl: false,
  meta: false,
  shift: false,
  sequence: "\x1b[99;9~"
}
```

## Bracketed paste

Bracketed paste is recognized by the tokenizer. By default paste content is expanded into text events for compatibility with text widgets.

Use `pasteMode: "event"` to receive one paste event:

```ts
const events = [
  ...parseInputChunk("\x1b[200~hello\x1b[201~", {
    pasteMode: "event"
  })
];
```

## Design notes

The implementation follows an Ink-style split:

```text
raw chunk
  -> tokenizer
  -> RawInputToken
  -> token parser
  -> InputEvent
```

See [INK-STYLE-REFACTOR.md](./INK-STYLE-REFACTOR.md) for the detailed design and [PLAN.md](./PLAN.md) for the migration history.
