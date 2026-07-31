# @bindtty/renderer-terminal

Terminal renderer package for BindTTY.

Renders `LayoutNode` trees into ANSI terminal output:

```
LayoutNode → Frame → cell diff → ANSI patch string
```

## Features

- `createTerminalRenderer()` — stateful renderer with previous frame cache
- `createTerminalRenderer({ strategy: "sequential" })` — full-row repaint for
  fragile legacy hosts that cannot reliably handle absolute cursor addressing
- `renderer.render(layoutTree, options)` — paint → diff → ANSI
- `renderer.reset()` — clear previous frame (for resize/clear screen)
- Default focused inverse style with `focusStyle: "none"` opt-out
- Cell-level diff for minimal ANSI output
- Wide-cell frame model for CJK, common emoji, and combining marks
- Placeholder cells for wide grapheme continuation columns

## Usage

```ts
import { createTerminalRenderer } from "@bindtty/renderer-terminal";

const renderer = createTerminalRenderer();
const ansi = renderer.render(layoutTree, {
  viewport: { width: 80, height: 24 },
  isFocused: (mounted) => interaction.isFocused(mounted)
});
stdout.write(ansi);
```

The default `"diff"` strategy emits ANSI patches with cursor addressing.
`"sequential"` clears the frame and writes rows from the home position without
absolute row/column moves; `bindtty` selects it automatically when a
`TerminalHost` reports `outputCapabilities.absoluteCursorAddressing === false`.
