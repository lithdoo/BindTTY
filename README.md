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

MVP 阶段收敛为 **10 个包**。renderer 已独立为 `@bindtty/renderer-terminal`，terminal lifecycle 独立为 `@bindtty/terminal`，键盘 focus 与 `onKey` 派发独立为 `@bindtty/interaction`，调度器先放在 `@bindtty/runtime`。

| 包 | 职责 |
| --- | --- |
| `@bindtty/signal` | 响应式内核：`createSignal`、`computed`、`effect` |
| `@bindtty/vnode` | 声明层：`ViewTemplate`、`BindingValue`、control node 类型 |
| `@bindtty/jsx-runtime` | TSX → `ViewTemplate` |
| `@bindtty/runtime` | `mount`、binding subscription、dirty、dispose、microtask 调度 |
| `@bindtty/layout` | `MountedNode` → `LayoutNode` |
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
~~~

当前完成状态：

```text
@bindtty/signal:            createSignal、computed
@bindtty/vnode:             Template 类型、MountedNode 类型、normalize
@bindtty/jsx-runtime:       TSX → Template（jsx/jsxs/Fragment）
@bindtty/runtime:           mount、binding、dirty、dispose、show/for control、scheduler
@bindtty/layout:            MountedNode → LayoutNode（box/text/hstack/vstack/screen/spacer）
@bindtty/renderer-terminal: LayoutNode → Frame → ANSI diff（含 focusStyle）
@bindtty/terminal:          TerminalHost（alt screen/cursor/raw mode/resize/keypress）
@bindtty/interaction:       keyboard focus、onKey dispatch、Tab/Shift+Tab traversal
@bindtty/widgets:           Button（onPress）、TextInput（受控 value/onChange/光标拆分）
bindtty:                    createApp（stdout + terminal 双模式）、re-export Button/TextInput
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
| M7 | scroll / list / viewport | ❌ |

详见 [TUI_IMPLEMENTATION_PLAN.md](./doc/TUI_IMPLEMENTATION_PLAN.md)。

## 快速开始

```bash
npm install
npm run build
npm test
```

```ts
import { createSignal, computed } from "@bindtty/signal";
import { createApp } from "bindtty";

class CounterVM {
  count = createSignal(0);
  label = computed(() => `Count: ${this.count.get()}`);
}

function App({ vm }: { vm: CounterVM }) {
  return <text value={vm.label} />;
}

const app = createApp(<App vm={new CounterVM()} />, {
  stdout: process.stdout
});
app.start();
```

tsconfig 需设置 `jsx: "react-jsx"`、`jsxImportSource: "bindtty"`。真实终端使用 `createNodeTerminal` + `createApp(view, { terminal })`，见 [APP.md](./doc/APP.md)。

真实 PTY E2E（`node-pty`，`packages/e2e/real/`）见 [packages/e2e/README.md](./packages/e2e/README.md)：

```bash
npm run test:e2e:real:win
npm run test:e2e:real:wsl   # 需 WSL Ubuntu + Node.js
```

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [VNODE.md](./doc/VNODE.md) | @bindtty/vnode 包设计（Template + MountedNode） |
| [JSX_RUNTIME.md](./doc/JSX_RUNTIME.md) | @bindtty/jsx-runtime 落地设计（TSX → ViewTemplate） |
| [RUNTIME.md](./doc/RUNTIME.md) | @bindtty/runtime 落地设计（Template → MountedNode） |
| [LAYOUT.md](./doc/LAYOUT.md) | @bindtty/layout 落地设计（MountedNode → LayoutNode） |
| [RENDERER.md](./doc/RENDERER.md) | @bindtty/renderer-terminal 落地设计（LayoutNode → Frame → ANSI Patch） |
| [APP.md](./doc/APP.md) | bindtty createApp 落地设计（runtime + layout + renderer + terminal + interaction） |
| [TERMINAL.md](./doc/TERMINAL.md) | @bindtty/terminal 落地设计（terminal lifecycle + input + resize） |
| [INTERACTION.md](./doc/INTERACTION.md) | @bindtty/interaction 落地设计（keyboard focus + onKey dispatch） |
| [WIDGETS.md](./doc/WIDGETS.md) | @bindtty/widgets 落地设计（Button / TextInput 等高层控件） |
| [TEXT_INPUT.md](./doc/TEXT_INPUT.md) | TextInput 控件详细设计（拆分光标渲染方案） |
| [E2E_TESTING.md](./doc/E2E_TESTING.md) | E2E 测试计划（TSX → App → Terminal 闭环验证） |
| [DESIGN.md](./doc/DESIGN.md) | 视图树总体设计、四层结构、BindingValue、control node |
| [TUI_IMPLEMENTATION_PLAN.md](./doc/TUI_IMPLEMENTATION_PLAN.md) | 实现计划、里程碑、优先级 |
| [archive/](./doc/archive/) | 已合并前的原始分拆文档备份 |

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
