# BindTTY 文档

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

MVP 阶段收敛为 **7 个包**。渲染先合并在 `@bindtty/layout`，输入先合并在 `@bindtty/widgets`，调度器先放在 `@bindtty/runtime`。

| 包 | 职责 |
| --- | --- |
| `@bindtty/signal` | 响应式内核：`createSignal`、`computed`、`effect` |
| `@bindtty/vnode` | 声明层：`ViewTemplate`、`BindingValue`、control node 类型 |
| `@bindtty/jsx-runtime` | TSX → `ViewTemplate` |
| `@bindtty/runtime` | `mount`、binding subscription、dirty、dispose、`createApp`、microtask 调度 |
| `@bindtty/layout` | `MountedNode` → `LayoutNode` → `Frame` → ANSI diff |
| `@bindtty/widgets` | ElementDefinition、focus、keyboard、interactive widget |
| `bindtty` | 对用户暴露的统一入口 |

包内模块边界示例：

~~~text
packages/runtime/
  src/app.ts
  src/mount.ts
  src/binding.ts
  src/dirty.ts
  src/dispose.ts
  src/scheduler.ts

packages/layout/
  src/layout-node.ts
  src/layout.ts
  src/measure-text.ts
  src/frame.ts
  src/paint.ts
  src/ansi.ts
  src/line-diff.ts

packages/widgets/
  src/elements/
    text.ts
    box.ts
    button.ts
    input.ts
  src/focus.ts
  src/keyboard.ts
  src/registry.ts
~~~

后续若 terminal paint、ANSI diff 或 focus/input 系统明显变复杂，可再拆出 `@bindtty/renderer-terminal`、`@bindtty/input`。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [VNODE.md](./VNODE.md) | @bindtty/vnode 包设计（Template + MountedNode） |
| [JSX_RUNTIME.md](./JSX_RUNTIME.md) | @bindtty/jsx-runtime 落地设计（TSX → ViewTemplate） |
| [RUNTIME.md](./RUNTIME.md) | @bindtty/runtime 落地设计（Template → MountedNode） |
| [DESIGN.md](./DESIGN.md) | 视图树总体设计、四层结构、BindingValue、control node |
| [TUI_IMPLEMENTATION_PLAN.md](./TUI_IMPLEMENTATION_PLAN.md) | 实现计划、里程碑、优先级 |
| [archive/](./archive/) | 已合并前的原始分拆文档备份 |

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
