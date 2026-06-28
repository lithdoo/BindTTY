# @bindtty/vnode

View tree package for BindTTY.

定义声明层 `ViewTemplate` / `Template` 类型，以及 Template → MountedNode 的 mount、binding、dirty、dispose。

## 文档

- [doc/VNODE.md](../../doc/VNODE.md) — 包实现设计（Template + MountedNode）
- [doc/DESIGN.md](../../doc/DESIGN.md) — 视图树总体设计
- [doc/README.md](../../doc/README.md) — 文档索引

## 模块结构（目标）

~~~text
packages/vnode/src/
  template/       Template 类型、normalize、schema
  mounted/        mount、binding、dirty、dispose
  index.ts
~~~
