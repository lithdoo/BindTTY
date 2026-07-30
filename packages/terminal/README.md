# @bindtty/terminal

Terminal lifecycle and input host package for BindTTY.

Responsibilities:

- stdout write / viewport / resize
- automatic synchronized frame output on Windows TTYs
- alt screen and cursor lifecycle
- stdin raw mode lifecycle
- negotiated keyboard protocol setup / restore and capability reporting
- stdin input adapters

Raw keyboard protocol parsing lives in `@bindtty/input`. `RawStdinInput` holds a `createInputParser()` instance and dispatches parsed key events.

For applications that need modified keys such as Ctrl+Enter, prefer:

```ts
createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin,
  rawMode: true,
  keyboardProtocol: "auto"
});
```

`auto` is the default for raw VT input. It probes Kitty support using the Kitty
status query followed by primary device attributes, enables only a confirmed
protocol, and falls back to Windows VT or legacy VT without leaking terminal
responses into widgets. Readline reports readline capabilities and native
Win32 records bypass VT negotiation.

There is no portable positive query for modifyOtherKeys, so auto mode never
blindly enables it. Use `keyboardProtocol: "modify-other-keys"` only when the
embedding environment has explicitly confirmed support.
`enhancedKeyboard` is retained only for compatibility with the former eager
dual-enable behavior.

Terminal query responses share the same byte stream as keyboard input.
`createNodeTerminal()` routes expected Kitty keyboard, primary device
attributes, and xterm viewport responses through one `TerminalResponseRouter`
before sending the remaining bytes to keyboard parsing. Consumers implementing
custom transports can use `createTerminalResponseRouter()` directly and
reference-count the response kinds they currently expect.

On Windows, the optional `@bindtty/win32-input` package is discovered
automatically. When stdin is a console handle it reads native
`KEY_EVENT_RECORD` data, bypasses VT negotiation, and preserves physical
F-keys, Ctrl+Enter, repeat counts, and Unicode as semantic events. No
application wiring is required. Explicit `win32InputProvider` injection remains
available for tests and custom hosts.

Active terminal queries do not replace this backend with raw stdin. Potential
response records beginning with Escape are buffered through the shared response
router; physical function-key records continue through their virtual-key
mapping, and unmatched candidates replay as their original Win32 records.

If the optional addon is absent, cannot be built, or stdin is redirected,
terminal safely continues through the raw VT and readline fallback chain.

On Windows TTY stdout, public `TerminalHost.write()` calls are wrapped in
DEC 2026 synchronized-output boundaries by default. Supporting hosts present
each frame atomically during resize; older hosts ignore the private mode.
Redirected output is left untouched, and `synchronizedOutput: false` disables
the behavior explicitly. Terminal lifecycle sequences are never frame-wrapped.

Backend selection belongs to `@bindtty/terminal`. With the default
`inputBackend: "auto"` policy, Windows prefers an available native provider,
otherwise uses raw input for a capable TTY, and falls back to readline for a
non-TTY. Applications do not inspect PowerShell, Windows Terminal, or Console
Host. `inputBackend: "readline" | "raw" | "win32"` is available only as an
explicit diagnostic or compatibility override.

The raw backend waits up to `escapeAmbiguityTimeoutMs` (default `30`) for bytes
following `ESC`, so a standalone Escape key and an Alt/control sequence remain
distinguishable. The value must be a finite non-negative number. Pending timers
are cleared when input detaches.

Bracketed paste from the raw backend is dispatched through `TerminalHost.onKey`
as one semantic `{ kind: "paste", text }` event. The lower-level
`@bindtty/input` parser keeps its compatible default text-event mode; callers
that want atomic paste there can select `pasteMode: "event"`. TerminalHost does
not expose a legacy paste expansion option.

One paste retains at most `maxPasteCodeUnits` decoded UTF-16 code units
(default `1_048_576`). Overflow emits one `unknown` event and discards input
through the matching paste terminator so later keyboard input can resume.

Set `BINDTTY_INPUT_TRACE=1` to write an optional JSONL diagnostic trace.
`BINDTTY_INPUT_TRACE_FILE` selects the destination. The trace records a safe
environment snapshot, backend selection reason, capabilities, raw input or
Win32 records, and the final dispatched event. Bracketed paste content is
redacted.

See:

- [../../doc/packages/TERMINAL.md](../../doc/packages/TERMINAL.md)
- [../../doc/packages/INPUT.md](../../doc/packages/INPUT.md)
