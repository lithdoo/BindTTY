# Windows input fixtures

This directory contains traces captured from physical keyboard input. Do not
hand-author or synthesize fixture files.

Required matrix:

- `powershell-5.1-windows-terminal.jsonl`
- `powershell-7-windows-terminal.jsonl`
- `powershell-5.1-console-host.jsonl`
- `powershell-7-console-host.jsonl`

Each fixture must pass `validate-windows-input-fixture.mjs`. Paste payloads are
redacted by the terminal trace and fixtures must never contain passwords,
tokens, personal text, or unrelated command history.

The M7 release gate requires all four files:

```powershell
npm run validate:windows-matrix --workspace @bindtty/e2e
```

Release fixtures must use the automatically selected native Win32 backend.
F2, Enter variants, navigation, editing keys, ASCII/CJK/emoji, and the fixed
paste sample are mandatory observations. Extended or host-reserved function
keys may be explicitly skipped.
