# BindTTY migration notes

## Unreleased

### Raw bracketed paste is atomic

`TerminalHost.onKey()` now receives one semantic paste event for a bracketed
paste:

```ts
terminal.onKey((event) => {
  if (event.kind === "paste") {
    console.log(event.text);
  }
});
```

Previously, the raw backend expanded paste content into multiple text events.
Applications that consume TerminalHost events should handle `kind: "paste"`
alongside `kind: "text"`.

The lower-level `@bindtty/input` API remains source-compatible:

- `createInputParser()` keeps expanding paste to text events by default.
- `createInputParser({ pasteMode: "event" })` opts into one paste event.

TerminalHost intentionally does not provide a compatibility switch that
re-expands paste. Expansion belongs at a consumer boundary when explicitly
required; TextInput and Textarea consume paste atomically.
