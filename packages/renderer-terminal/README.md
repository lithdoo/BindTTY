# @bindtty/renderer-terminal

Terminal renderer package for BindTTY.

Renders `LayoutNode` trees into ANSI terminal output:

```
LayoutNode → Frame → cell diff → ANSI patch string
```

## Features

- `createTerminalRenderer()` — stateful renderer with previous frame cache
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
