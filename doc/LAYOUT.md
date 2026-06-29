# @bindtty/layout 落地设计

本文档描述 `@bindtty/layout` 的第一阶段设计。它承接 `@bindtty/runtime` 输出的 `MountedNode`，把运行时节点树转换成带位置和尺寸的 `LayoutNode` 树。

相关文档：

- [VNODE.md](./VNODE.md) — Template / MountedNode 类型设计
- [RUNTIME.md](./RUNTIME.md) — Template → MountedNode、binding、dirty、scheduler
- [DESIGN.md](./DESIGN.md) — 视图树总体设计
- [TUI_IMPLEMENTATION_PLAN.md](./TUI_IMPLEMENTATION_PLAN.md) — 实现计划与里程碑

## 1. 目标

layout 的目标是回答几何问题：

```text
MountedNode + viewport
  ↓ layout
LayoutNode
```

runtime 已经回答：

```text
界面有哪些节点
props 当前值是什么
哪些 MountedNode dirty 了
```

layout 负责回答：

```text
每个节点占多大
每个节点放在哪里
父子节点的布局关系是什么
```

第一版只生成 `LayoutNode`。它不负责：

```text
1. ANSI paint
2. frame diff
3. terminal write
4. keyboard input
5. focus manager
6. interactive widget behavior
```

这些能力后续可以继续放在 `@bindtty/layout` 的 paint / frame 模块中，也可以在复杂后拆出 renderer 包。第一版先让 layout 成为纯函数，便于测试和组合。

## 2. 包位置

路径：

```text
packages/layout
```

第一版建议模块：

```text
packages/layout/
  src/
    index.ts
    types.ts
    layout.ts
    engine.ts
    basic-engine.ts
    measure.ts
    intrinsic.ts
  test/
    layout.test.ts
  package.json
  tsconfig.json
```

后续 paint / ANSI 可以扩展为：

```text
src/frame.ts
src/paint.ts
src/ansi.ts
src/line-diff.ts
```

后续 Yoga backend 可以扩展为：

```text
src/yoga-engine.ts
```

## 3. 输入与输出

输入：

```ts
MountedNode | null
```

viewport：

```ts
export interface LayoutViewport {
  width: number;
  height: number;
}
```

输出：

```ts
LayoutNode | null
```

建议 API：

```ts
export interface LayoutOptions {
  viewport: LayoutViewport;
  engine?: LayoutEngine;
}

export function layoutRoot(
  root: MountedNode | null,
  options: LayoutOptions
): LayoutNode | null;
```

`layoutRoot()` 是稳定入口。第一版默认使用 `BasicLayoutEngine`，后续可以传入 `YogaLayoutEngine`，上层 runtime / renderer 不需要改变调用方式。

使用方式：

```ts
const runtime = createRuntimeRoot(view);

runtime.onFlush(({ root }) => {
  const layoutTree = layoutRoot(root, {
    viewport: {
      width: terminal.columns,
      height: terminal.rows
    }
  });

  renderer.render(layoutTree);
  runtime.clearDirty();
});
```

## 4. LayoutNode 类型

第一版 LayoutNode 保存几何结果和对应 mounted node：

```ts
export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutNode {
  mounted: MountedNode;
  rect: LayoutRect;
  contentRect: LayoutRect;
  children: LayoutNode[];
}
```

`mounted` 让后续 paint 能读取：

```text
tag
props
state
dirty
```

也让调试时能从 layout tree 反查 runtime node。

`contentRect` 表示 padding / border 之后可放置 children 的区域。即使第一版只实现基础盒模型，也应保留这个字段，避免未来接 Yoga / Flexbox 时推翻 LayoutNode 结构。

## 5. LayoutEngine 接口

layout 需要先抽离排版接口，再实现基础版本。这样第一版可以手写轻量布局，未来也可以接 Yoga。

核心接口：

```ts
export interface LayoutEngine {
  layout(root: MountedNode | null, options: LayoutEngineOptions): LayoutNode | null;
}

export interface LayoutEngineOptions {
  viewport: LayoutViewport;
}

export function createBasicLayoutEngine(): LayoutEngine;
```

默认入口：

```ts
const defaultEngine = createBasicLayoutEngine();

export function layoutRoot(root, options) {
  return (options.engine ?? defaultEngine).layout(root, {
    viewport: options.viewport
  });
}
```

未来 Yoga backend：

```ts
export function createYogaLayoutEngine(): LayoutEngine;
```

整体边界：

```text
layoutRoot
  stable public API

LayoutEngine
  internal/backend API

BasicLayoutEngine
  MVP 手写排版

YogaLayoutEngine
  future Flexbox backend
```

为什么先抽接口：

```text
1. 现在可以快速实现基础布局。
2. 后续切到 Yoga 不影响 runtime / renderer。
3. 测试可以复用同一组 layout contract。
4. BasicLayoutEngine 可以长期作为无原生依赖 fallback。
```

## 6. 内建基础元素与控件边界

实现 layout 前，不需要先实现完整内建控件行为。

不需要先做：

```text
Text widget
Box widget
Button widget
Input widget
ANSI paint
keyboard behavior
focus state
```

但 layout 必须先定义一组内建元素的几何语义：

```text
text    如何测量宽高
box     padding / border 如何影响 content rect
vstack  如何垂直排列 children
hstack  如何水平排列 children
spacer  如何占位
screen  是否占满 viewport
```

因此第一版实现的是 layout schema，不是完整 widget 系统。

分层关系：

```text
@bindtty/vnode
  定义 tag 和 props 合法性

@bindtty/runtime
  维护 MountedNode、binding、dirty、dispose、scheduler

@bindtty/layout
  定义 tag 的几何语义

paint / renderer
  定义 tag 的绘制语义

@bindtty/widgets
  定义交互行为、focus、keyboard
```

## 7. 第一版支持范围

第一版支持：

```text
MountedNode:
  element
  fragment
  show
  for

Element tag:
  screen
  vstack
  hstack
  box
  text
  spacer
```

第一版暂不支持：

```text
1. button / input 的交互语义
2. flex grow / shrink
3. percentage size
4. absolute position
5. alignment
6. overflow clipping
7. text wrapping
8. unicode display width 精确测量
9. scroll
```

`button` / `input` 可以后续在 widget 和 paint 设计明确后加入。第一版不建议把它们伪装成完整控件，避免误导 API 语义。

## 8. 盒模型与 Flexbox 预留

BindTTY 长期希望支持 Yoga / Flexbox，因此 layout props 的设计应尽量贴近 Yoga 能力。但 MVP 不需要一次实现完整 Flexbox。

第一版实际实现：

```text
content
padding
border
width / height 可后置
```

第一版不实现：

```text
margin
gap
flexGrow / flexShrink
alignItems
justifyContent
percentage size
```

但类型和文档应给这些能力留位置：

```ts
export interface LayoutStyle {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;

  padding?: number;
  paddingX?: number;
  paddingY?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;

  margin?: number;
  marginX?: number;
  marginY?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;

  border?: boolean | number;
  gap?: number;

  flexDirection?: "row" | "column";
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between";
  flexGrow?: number;
  flexShrink?: number;
}
```

MVP 的 `BasicLayoutEngine` 只读取其中一部分：

```text
padding
paddingX / paddingY / paddingTop / paddingRight / paddingBottom / paddingLeft
border
```

其他字段可以先保留在类型设计里，但不从 vnode props 暴露，或者暴露后明确标记为 future unsupported。实现时遇到尚未支持的布局字段，应选择抛错或忽略；第一版建议抛错，避免用户误以为 Flexbox 已完整生效。

### 8.1 margin 策略

MVP 不实现 margin。

原因：

```text
1. margin 影响父容器排布，不属于节点自身可绘制区域。
2. margin 会影响 dirty repaint / rect invalidation。
3. TUI 中可以先用 spacer 表达外部间距。
4. BasicLayoutEngine 不应过早复制完整 CSS box model。
```

推荐 MVP 写法：

```tsx
<vstack>
  <text value="A" />
  <spacer size={1} />
  <text value="B" />
</vstack>
```

未来接 Yoga 后可以支持：

```tsx
<text value="A" marginBottom={1} />
<text value="B" />
```

因此结论是：

```text
MVP:
  不实现 margin
  用 spacer 表达外间距

Future Yoga:
  支持 margin / marginX / marginY / marginTop / marginRight / marginBottom / marginLeft
```

### 8.2 vstack / hstack 与 flexDirection

`vstack` / `hstack` 不应成为唯一布局原语。它们可以视为 `box` 的语法糖：

```text
vstack = box flexDirection="column"
hstack = box flexDirection="row"
```

第一版仍可以直接实现 `vstack` / `hstack` 分支，保证落地简单。未来 Yoga backend 可以把它们映射成 Yoga node 的 `flexDirection`。

## 9. 基础布局模型

layout 可以拆成两个阶段：

```text
measure
  计算自然尺寸

arrange
  写入 x / y / width / height
```

伪代码：

```ts
function layoutRoot(root, options) {
  if (!root) {
    return null;
  }

  const constraint = {
    maxWidth: options.viewport.width,
    maxHeight: options.viewport.height
  };

  const size = measureNode(root, constraint);

  return arrangeNode(root, {
    x: 0,
    y: 0,
    width: Math.min(size.width, options.viewport.width),
    height: Math.min(size.height, options.viewport.height)
  });
}
```

第一版可以先实现完整布局结果，不做局部增量 layout。`RuntimeFlushRecord.dirtyNodes` 先作为后续优化入口保留。

## 10. Measure 规则

### 10.1 text

```tsx
<text value="Hello" />
```

规则：

```text
width = String(value).length
height = 1
children = []
```

第一版使用字符串长度。后续再引入 display width 测量处理宽字符、emoji、ANSI escape 等。

### 10.2 spacer

```tsx
<spacer size={1} />
```

`spacer` 的最终方向依赖父容器：

```text
vstack 内:
  width = available width
  height = size

hstack 内:
  width = size
  height = available height
```

如果无法知道父方向，第一版可以退化为：

```text
width = size
height = size
```

为了让 `spacer` 在 TUI 里更自然，建议在 arrange container children 时根据父方向解释。

### 10.3 vstack

```tsx
<vstack>
  <text value="A" />
  <text value="B" />
</vstack>
```

自然尺寸：

```text
width = max(child.width)
height = sum(child.height)
```

排列规则：

```text
child.x = parent.content.x
child.y = cursorY
cursorY += child.height
```

### 10.4 hstack

```tsx
<hstack>
  <text value="A" />
  <text value="B" />
</hstack>
```

自然尺寸：

```text
width = sum(child.width)
height = max(child.height)
```

排列规则：

```text
child.x = cursorX
child.y = parent.content.y
cursorX += child.width
```

### 10.5 box

```tsx
<box padding={1} border>
  <text value="Hello" />
</box>
```

第一版 `box` 支持：

```text
padding?: number
paddingX?: number
paddingY?: number
paddingTop?: number
paddingRight?: number
paddingBottom?: number
paddingLeft?: number
border?: boolean
```

自然尺寸：

```text
width = child.width + paddingLeftRight + borderLeftRight
height = child.height + paddingTopBottom + borderTopBottom
```

content rect：

```text
content.x = box.x + border + padding
content.y = box.y + border + padding
content.width = box.width - border*2 - padding*2
content.height = box.height - border*2 - padding*2
```

第一版可以把 box children 当成 fragment-like vertical flow，也就是按 `vstack` 方式排列。后续如果需要更强控制，再加入 direction / alignment。

### 10.6 screen

`screen` 占满 viewport：

```text
x = 0
y = 0
width = viewport.width
height = viewport.height
```

children 在 screen content 内布局。第一版 screen children 可以按 `vstack` 排列。

## 11. Structure Node 规则

`fragment`、`show`、`for` 不对应真实终端绘制，但应该保留 LayoutNode，便于调试和后续局部更新。

### 11.1 fragment

规则：

```text
layout children
fragment rect = children union rect
```

父容器遇到 fragment 时，有两种选择：

```text
方案 A：把 fragment 当一个整体 child
方案 B：把 fragment visual children flatten 到父容器 flow
```

第一版建议使用方案 A，模型更简单。后续如果用户期望 fragment 不影响 flow，可以再引入 flatten 规则。

### 11.2 show

规则：

```text
只 layout activeBranch
show rect = activeBranch rect
无 activeBranch 时 rect = 0x0
```

`show` 自身保留 LayoutNode：

```text
show LayoutNode
  children: activeBranch layout node, 或 []
```

### 11.3 for

规则：

```text
layout node.items[*].node
for rect = item layout nodes union rect
```

第一版 `for` 自身保留 LayoutNode：

```text
for LayoutNode
  children: item layout nodes
```

父容器先把 `for` 当一个整体 child。后续如果需要 `<for>` 在 `vstack` 中自然展开为多行，可以设计 control node flatten 策略。

## 12. Unsupported Tag 策略

layout 遇到暂不支持的 element tag 时，建议直接抛错：

```text
Unsupported layout element: button
Unsupported layout element: input
```

原因：

```text
1. button / input 的尺寸和交互语义还没定。
2. 静默退化成 text-like 容易误导用户。
3. 早期抛错能推动把控件语义设计清楚。
```

如果后续需要快速 demo，可以临时提供 compatibility 模式，但不作为默认行为。

## 13. Dirty 与重新 layout

第一版 layout 是纯函数全量计算：

```text
RuntimeFlushRecord.root
  ↓
layoutRoot(root, viewport)
```

暂不做：

```text
dirty subtree incremental layout
layout cache
rect invalidation
partial paint
```

原因是当前最重要的是让链路跑通：

```text
signal change
  ↓
runtime dirty flush
  ↓
layoutRoot
  ↓
LayoutNode
```

后续可以使用 `RuntimeFlushRecord.dirtyNodes` 优化：

```text
paint dirty:
  不重新 measure，只 repaint rect

layout dirty:
  从最近 layout boundary 重新 measure / arrange

structure dirty:
  重新构建相关 layout subtree
```

但这不进入 layout MVP。

## 14. 测试计划

第一版测试覆盖：

```text
1. null root:
   layoutRoot(null) -> null

2. text:
   value -> width / height

3. vstack:
   children y 递增
   width = max child width
   height = sum child height

4. hstack:
   children x 递增
   width = sum child width
   height = max child height

5. box:
   padding / border 影响自身尺寸
   child 放入 content rect

6. screen:
   占满 viewport

7. fragment:
   保留 LayoutNode
   rect 包围 children

8. show:
   只 layout activeBranch
   activeBranch null -> 0x0

9. for:
   layout 当前 items
   items 更新后重新 layout 反映新结构

10. unsupported tag:
   button / input 抛错

11. runtime integration:
   RuntimeRoot flush 后可调用 layoutRoot(root, viewport)

12. engine abstraction:
   layoutRoot 默认使用 BasicLayoutEngine
   options.engine 可以替换 backend
   custom engine 收到 root 和 viewport
```

## 15. 验收标准

`@bindtty/layout` 第一版完成后应满足：

```text
1. 新增 packages/layout。
2. 导出 LayoutNode / LayoutRect / LayoutOptions / LayoutEngine。
3. 导出 layoutRoot(root, options)。
4. 默认使用 BasicLayoutEngine。
5. 支持自定义 engine 替换。
6. 支持 screen / vstack / hstack / box / text / spacer。
7. 支持 fragment / show / for structure nodes。
8. unsupported element tag 明确抛错。
9. layout 是纯函数，不依赖 terminal IO。
10. runtime flush 后可以重新 layout。
11. 盒模型实现 padding / border / content。
12. 文档预留 Yoga / Flexbox / margin / gap / alignment 方向。
13. npm test passes。
```

到这里主链路会推进到：

```text
TSX
  ↓
@bindtty/jsx-runtime
  ↓
Template
  ↓
@bindtty/runtime
  ↓
MountedNode
  ↓
@bindtty/layout
  ↓
LayoutNode
```

下一阶段再实现 paint / frame / ANSI diff。
