# BindTTY

Monorepo workspace for BindTTY packages.

BindTTY 是一个面向 **MVVM + signal-driven TUI** 的 TypeScript/TSX 框架。

## 文档

设计文档与实现计划位于 [`doc/`](./doc/README.md)：

- [doc/README.md](./doc/README.md) — 文档索引与 7 包结构
- [doc/VNODE.md](./doc/VNODE.md) — @bindtty/vnode 包设计（Template + MountedNode）
- [doc/DESIGN.md](./doc/DESIGN.md) — 视图树总体设计
- [doc/TUI_IMPLEMENTATION_PLAN.md](./doc/TUI_IMPLEMENTATION_PLAN.md) — 实现计划与里程碑

## Packages

| 包 | 状态 |
| --- | --- |
| `@bindtty/signal` | 已实现 MVP |
| `@bindtty/vnode` | 设计中 |
| `bindtty` | 入口包 |
