# @bindtty/vnode

View tree package for BindTTY.

定义声明层 `ViewTemplate` / `Template` 类型、`BindingValue`、element schema、normalize 工具，以及 `MountedNode` 类型。包保持为纯数据模型层；mount、binding、dirty 与 dispose 由 `@bindtty/runtime` 实现。

## BindingValue

`BindingValue<T>` 已收敛为：

~~~ts
type BindingValue<T> = T | ReadableSignal<T>;
~~~

View 层的 `bind(() => ...)` 可作为 scoped computed helper 存在，但它对外也应表现为 `ReadableSignal<T>`，生命周期由 runtime owner 管理。

## 文档

- [doc/VNODE.md](../../doc/packages/VNODE.md) — 包实现设计（Template + MountedNode）
- [doc/architecture/DESIGN.md](../../doc/architecture/DESIGN.md) — 视图树总体设计
- [doc/README.md](../../doc/README.md) — 文档索引

## 模块结构

~~~text
packages/vnode/src/
  template/       Template 类型、normalize、schema
  mounted/        MountedNode 类型
  index.ts
~~~
