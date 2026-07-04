# BindTTY

BindTTY 是一个面向 **MVVM + signal-driven TUI** 的 TypeScript/TSX 框架。它不是 React VDOM 的复刻，而是以 ViewModel binding 为核心的终端 UI 声明系统。

## 主链路

~~~text
TSX
  ↓
ViewTemplate / Template
  ↓ mount
MountedNode
  ↓ layout
LayoutNode
  ↓ paint
Frame
  ↓ diff
ANSI Patch
~~~

更新模型：

~~~text
signal change
  ↓
binding update
  ↓
mounted node dirty
  ↓
layout / paint / frame patch
~~~

## Monorepo 包结构（MVP）

MVP 阶段收敛为 **11 个包**。text measurement 独立为 `@bindtty/text`，layout 默认使用 Yoga backend，renderer 已独立为 `@bindtty/renderer-terminal`，terminal lifecycle 独立为 `@bindtty/terminal`，键盘 focus 与 `onKey` 派发独立为 `@bindtty/interaction`，调度器先放在 `@bindtty/runtime`。

| 包 | 职责 |
| --- | --- |
| `@bindtty/signal` | 响应式内核：`createSignal`、`computed`、`effect` |
| `@bindtty/vnode` | 声明层：`ViewTemplate`、`BindingValue`、control node 类型 |
| `@bindtty/jsx-runtime` | TSX → `ViewTemplate` |
| `@bindtty/runtime` | `mount`、binding subscription、dirty、dispose、microtask 调度 |
| `@bindtty/text` | display-width-aware terminal text measurement / wrapping / truncation |
| `@bindtty/layout` | `MountedNode` → `LayoutNode`，默认 Yoga backend |
| `@bindtty/renderer-terminal` | `LayoutNode` → `Frame` → ANSI diff |
| `@bindtty/terminal` | Terminal lifecycle、viewport、resize、input event adapter |
| `@bindtty/interaction` | keyboard focus、onKey dispatch、focused state |
| `@bindtty/widgets` | 高层 interactive widget 与复合控件 |
| `bindtty` | 对用户暴露的统一入口 |

包内模块边界示例（当前实现）：

~~~text
packages/runtime/
  src/mount.ts
  src/binding.ts
  src/dirty.ts
  src/dispose.ts
  src/scheduler.ts
  src/root.ts

packages/layout/
  src/layout.ts
  src/measure.ts
  src/intrinsic.ts
  src/basic-engine.ts
  src/yoga-engine.ts

packages/renderer-terminal/
  src/frame.ts
  src/paint.ts
  src/style.ts      # PaintStyle、focusStyle
  src/diff.ts
  src/ansi.ts
  src/renderer.ts

packages/interaction/
  src/controller.ts  # focus list + key dispatch（focus 逻辑内联于此）
  src/keyboard.ts
  src/types.ts

packages/widgets/
  src/button.ts       # Button 组件 + 类型
  src/text-input.ts   # TextInput 组件 + 类型（拆分光标方案）
  src/scroll-view.ts  # ScrollView 裁剪与滚动窗口
  src/list.ts         # List 语法糖（ScrollView + for）
~~~

当前完成状态：

```text
@bindtty/signal:            createSignal、computed
@bindtty/vnode:             Template 类型、MountedNode 类型、normalize
@bindtty/jsx-runtime:       TSX → Template（jsx/jsxs/Fragment）
@bindtty/runtime:           mount、binding、dirty、dispose、show/for control、scheduler
@bindtty/text:              display-width-aware text measurement / wrapping / truncation
@bindtty/layout:            MountedNode → LayoutNode（默认 Yoga，含 clip/contentSize/scrollOffset）
@bindtty/renderer-terminal: LayoutNode → Frame → ANSI diff（含 focusStyle/clip/scrollOffset）
@bindtty/terminal:          TerminalHost（alt screen/cursor/raw mode/resize/keypress）
@bindtty/interaction:       keyboard focus、onKey dispatch、Tab/Shift+Tab traversal
@bindtty/widgets:           Button、TextInput、ScrollView、List
bindtty:                    createApp、createSignal/computed/effect、widgets re-export、JSX 转发
```

## 实现进度

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M1 | TSX → ViewTemplate | ✅ |
| M2 | mount + binding + dirty + scheduler | ✅ |
| M3 | layout + paint + ANSI diff（Cell Frame） | ✅ |
| M4 | `<show>` / `<for key>` | ✅ |
| M5 | terminal + interaction + Button | ✅ |
| M6 | TextInput 双向绑定 | ✅ |
| M7 | scroll / list / viewport | ✅ |

详见 [architecture/ROADMAP.md](./doc/architecture/ROADMAP.md) 与 [specs/SCROLL_VIEWPORT.md](./doc/specs/SCROLL_VIEWPORT.md)。

## 快速开始

```bash
npm install bindtty
```

真实终端另装 `@bindtty/terminal`。从源码开发：

```bash
npm install
npm run build
npm test
```

```ts
import { Button, computed, createApp, createSignal } from "bindtty";

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

tsconfig：`jsx: "react-jsx"`、`jsxImportSource: "bindtty"`。terminal 模式见 [APP.md](./doc/packages/APP.md)。完整公共 API 见 [packages/bindtty/README.md](./packages/bindtty/README.md)。

真实 PTY E2E（`node-pty`，`packages/e2e/real/`）见 [packages/e2e/README.md](./packages/e2e/README.md)：

```bash
npm run test:e2e:real:win
npm run test:e2e:real:wsl   # 需 WSL Ubuntu + Node.js
```

示例应用见 [examples/README.md](./examples/README.md)，其中 `@bindtty/example-yoga-dashboard` 展示 Yoga `gap` / `flexGrow` / `flexShrink` / `flexWrap` 与真实 runtime stats。

## 文档

完整索引见 **[doc/README.md](./doc/README.md)**（含 packages / specs / testing / archive 分类）。

开放改进项：[TODO.md](./TODO.md)（checklist）· [doc/architecture/NEXT_STEPS.md](./doc/architecture/NEXT_STEPS.md)（alpha 规划）

## 用户写法约定

文本内容通过 `value` prop 表达，不作为 children：

~~~tsx
<text value="Hello" />
<text value={vm.title} />
<text value={vm.countLabel} color={vm.color} />
~~~

绑定 signal，不要立即求值：

~~~tsx
<text value={vm.title} />
~~~

动态结构使用 control node：

~~~tsx
<show when={vm.loading} fallback={<text value="Ready" />}>
  <text value="Loading..." />
</show>

<for each={vm.items} key={(item) => item.id}>
  {(item) => <text value={item.title} />}
</for>
~~~

复杂派生值放在 ViewModel 的 `computed` 中，View 只声明绑定关系。
