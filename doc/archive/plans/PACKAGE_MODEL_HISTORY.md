# Monorepo 包模型演进（历史）

> **类型**：archive / plan  
> **状态**：superseded  
> **最后核对**：2026-07  
> **现行模型**：根 [README.md](../../../README.md) · [ROADMAP.md](../../architecture/ROADMAP.md) §Monorepo 包结构

本文档保存早期 **7 包** 与过渡 **10 包** 规划，仅供追溯。当前正式模型为 **11 个可发布包** + 私有 `packages/e2e`。

---

## 1. 早期 7 包模型（MVP 初稿）

MVP 阶段最初计划使用 **7 个包**：

```text
packages/
  signal/          @bindtty/signal
  vnode/           @bindtty/vnode
  jsx-runtime/     @bindtty/jsx-runtime
  runtime/         @bindtty/runtime
  layout/          @bindtty/layout
  widgets/         @bindtty/widgets
  bindtty/         bindtty（总入口）
```

合并原则（当时）：

- **layout + render**：MVP 不单独拆 `@bindtty/renderer-terminal`，paint / frame / ANSI diff 放在 `@bindtty/layout` 内，按文件分模块。
- **widgets + input**：MVP 不单独拆 `@bindtty/input`，focus / keyboard / interactive element 放在 `@bindtty/widgets` 内。
- **scheduler**：MVP 不单独拆包，microtask flush 放在 `@bindtty/runtime` 内。

---

## 2. 过渡 10 包模型

实现推进后，layout / renderer、terminal、interaction 从 layout / widgets 中拆出，形成 **10 包** 过渡模型（尚未独立 `@bindtty/text`）：

```text
@bindtty/signal
@bindtty/vnode
@bindtty/jsx-runtime
@bindtty/runtime
@bindtty/layout
@bindtty/renderer-terminal
@bindtty/terminal
@bindtty/interaction
@bindtty/widgets
bindtty
```

边界调整要点：

```text
@bindtty/layout:
  只负责 MountedNode -> LayoutNode 的几何计算。

@bindtty/renderer-terminal:
  只负责 LayoutNode -> Frame -> ANSI patch。

@bindtty/terminal:
  只负责 terminal lifecycle、viewport、resize、keypress adapter。

@bindtty/interaction:
  负责 keyboard focus、onKey dispatch、focused state。

@bindtty/widgets:
  负责 Button / TextInput / Select 等高层控件语义。
```

因此早期计划中「widgets 承载 focus / keyboard」应理解为：

```text
focus / keyboard dispatch:  @bindtty/interaction
Widget 业务语义:              @bindtty/widgets 或用户组件
```

---

## 3. 现行 11 包模型（2026-07）

在 10 包基础上，terminal text measurement 独立为 `@bindtty/text`（display-width / grapheme / wrapping / truncation），形成当前正式模型：

```text
@bindtty/signal
@bindtty/vnode
@bindtty/jsx-runtime
@bindtty/runtime
@bindtty/text              ← 自 10 包模型新增
@bindtty/layout
@bindtty/renderer-terminal
@bindtty/terminal
@bindtty/interaction
@bindtty/widgets
bindtty
```

私有 workspace：`packages/e2e`（mock + real PTY 测试，不发布）。

---

## 4. 为何不再在 ROADMAP 中并列叙述

7 包 / 10 包表述与现行 11 包事实并存时，新读者容易误判当前架构。历史模型保留于本 archive 文档；活跃路线图只描述现行结构。
