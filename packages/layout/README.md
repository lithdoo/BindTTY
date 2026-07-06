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

`screen`、`box`、`vstack`、`hstack`、`text`、`spacer`，以及 `fragment` / `show` / `for` 结构节点。交互控件请使用 `@bindtty/widgets` 的组合实现。

高级 layout props 见 [doc/specs/LAYOUT_PROPS.md](../../doc/specs/LAYOUT_PROPS.md)（支持矩阵；运行 `npm run gen:layout-props` 同步文档）。默认 engine 为 `YogaLayoutEngine`。

## 文档

- [doc/specs/LAYOUT_PROPS.md](../../doc/specs/LAYOUT_PROPS.md) — layout prop 支持矩阵
- [doc/packages/LAYOUT.md](../../doc/packages/LAYOUT.md) — 包落地设计
- [doc/specs/YOGA_AND_TEXT.md](../../doc/specs/YOGA_AND_TEXT.md) — text + Yoga 摘要
- [doc/specs/SCROLL_VIEWPORT.md](../../doc/specs/SCROLL_VIEWPORT.md) — clip / scroll
