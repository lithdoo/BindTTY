# @bindtty/layout

Layout tree generation for BindTTY mounted nodes.

将 `MountedNode` 树转换为带绝对坐标的 `LayoutNode` 树，供 `@bindtty/renderer-terminal` 绘制。

## API

```ts
import { layoutRoot, createBasicLayoutEngine } from "@bindtty/layout";

const layoutTree = layoutRoot(runtime.root, {
  viewport: { width: 80, height: 24 }
});
```

## 已支持的 intrinsic 布局

`screen`、`box`、`vstack`、`hstack`、`text`、`spacer`，以及 `fragment` / `show` / `for` 结构节点。

intrinsic `button` / `input` 在 schema 有定义，但 layout 会抛 `Unsupported layout element`；交互控件请使用 `@bindtty/widgets` 的组合实现。

高级 layout props（width、height、gap、flex 等）尚未实现。

## 文档

- [doc/LAYOUT.md](../../doc/LAYOUT.md) — 落地设计
