# @bindtty/widgets

Reusable interactive widgets for BindTTY.

Currently exported widgets:

- `Button`
- `TextInput`
- `ScrollView`
- `List`

## 依赖

本包生产代码直接使用 `@bindtty/signal`（内部 `createSignal` / `computed`）。`@bindtty/signal` 为 **peer dependency**（同时保留在 `dependencies` 中）。

应用侧 signal 与组件内部 signal **必须**解析到同一 `@bindtty/signal` 实例。推荐从 `bindtty` 导入 `createSignal` / `computed`，见 [packages/bindtty/README.md](../bindtty/README.md) 的 Peer dependencies 与排障说明。

## 文档

- [doc/packages/WIDGETS.md](../../doc/packages/WIDGETS.md) — 包设计
- [doc/specs/TEXT_INPUT.md](../../doc/specs/TEXT_INPUT.md) — TextInput 规范
- [doc/specs/SCROLL_VIEWPORT.md](../../doc/specs/SCROLL_VIEWPORT.md) — ScrollView / List
