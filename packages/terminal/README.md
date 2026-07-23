# @bindtty/terminal

Terminal lifecycle and input host package for BindTTY.

Responsibilities:

- stdout write / viewport / resize
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

`auto` probes Kitty support, enables only the protocol that was confirmed, and
falls back to legacy VT without leaking the probe response into widgets.
`enhancedKeyboard` is retained only for compatibility with the former eager
dual-enable behavior.

Windows applications can inject a `Win32InputProvider` to receive native
`KEY_EVENT_RECORD` data. This bypasses VT negotiation and preserves physical
F-keys and Ctrl+Enter as semantic key events.

See:

- [../../doc/packages/TERMINAL.md](../../doc/packages/TERMINAL.md)
- [../../doc/packages/INPUT.md](../../doc/packages/INPUT.md)
