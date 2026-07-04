---
layout: home
hero:
  name: BindTTY
  text: MVVM signal-driven TUI for TypeScript/TSX
  tagline: ViewModel binding, Yoga layout, terminal ANSI diff — not a React VDOM clone.
  actions:
    - theme: brand
      text: Architecture
      link: /architecture/DESIGN
    - theme: alt
      text: Full doc index
      link: /README
    - theme: alt
      text: GitHub
      link: https://github.com/lithdoo/BindTTY
features:
  - title: Signal-driven updates
    details: Signal changes invalidate bindings; layout and paint patch only what changed.
  - title: TSX-first
    details: Intrinsic elements, show/for control flow, and widgets compose into terminal UI.
  - title: Real terminal ready
    details: createApp + createNodeTerminal for raw mode, focus, and keyboard dispatch.
---

## Install

```bash
npm install bindtty @bindtty/widgets
```

Real terminal apps also need `@bindtty/terminal`:

```bash
npm install @bindtty/terminal
```

Use matching versions for `bindtty` and `@bindtty/widgets` (e.g. both `0.1.0-alpha.2`).

## tsconfig

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "bindtty"
  }
}
```

## Quick start

```tsx
import { computed, createApp, createSignal } from "bindtty";
import { Button } from "@bindtty/widgets";

const count = createSignal(0);
const label = computed(() => `Count: ${count.get()}`);

const app = createApp(
  <vstack>
    <text value={label} />
    <Button label="+" onPress={() => count.set(count.get() + 1)} />
  </vstack>,
  { stdout: process.stdout, fallbackViewport: { width: 80, height: 24 } }
);

app.start();
```

## Terminal mode

```tsx
import { createApp } from "bindtty";
import { createNodeTerminal } from "@bindtty/terminal";

const terminal = createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin,
  useAltScreen: true,
  rawMode: true
});

const app = createApp(view, { terminal });
app.start();
```

## Migration (alpha.1 → alpha.2)

`bindtty` no longer re-exports widgets. Import controls from `@bindtty/widgets`:

```tsx
// before
import { createApp, Button } from "bindtty";

// after
import { createApp } from "bindtty";
import { Button } from "@bindtty/widgets";
```

ScrollView was renamed to `VScrollView`; see [widgets/SCROLL](/widgets/SCROLL).

## Next steps

- [Architecture](/architecture/DESIGN) — four-layer view model
- [bindtty createApp](/packages/APP) — app lifecycle
- [Widgets overview](/widgets/README) — Button, TextInput, Select, scroll views
- [Full documentation index](/README)
