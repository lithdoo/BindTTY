# @bindtty/layout 落地设计

本文档描述 `@bindtty/layout` 的第一阶段设计。它承接 `@bindtty/runtime` 输出的 `MountedNode`，把运行时节点树转换成带位置和尺寸的 `LayoutNode` 树。

相关文档：

- [VNODE.md](./VNODE.md) — Template / MountedNode 类型设计
- [RUNTIME.md](./RUNTIME.md) — Template → MountedNode、binding、dirty、scheduler
- [RENDERER.md](./RENDERER.md) — LayoutNode → Frame → ANSI Patch
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
5. interaction focus manager
6. interactive widget behavior
```

这些能力交给 `@bindtty/renderer-terminal` 或 `bindtty` createApp 层处理。layout 保持为纯函数，便于测试和组合。

当前落地进度：

```text
已完成:
  LayoutRect / LayoutNode / LayoutViewport / LayoutOptions
  LayoutEngine / LayoutEngineOptions
  layoutRoot()
  createBasicLayoutEngine()
  自定义 engine 替换测试
  text / vstack / hstack / box / spacer / screen layout
  fragment / show / for structure layout
  unsupported intrinsic button / input 抛错
  renderer-terminal 对接
  createApp 组合 runtime / layout / renderer / interaction
  focusStyle / onKey / onFocusChange 作为非 layout prop 忽略

注意：文档中 LayoutStyle 接口（含 width/height/minWidth/flexbox 等 40+ 字段）属于远期设计，
当前 MVP 未实现。实际 layout props 通过 basic-engine.ts 中的 supportedPropsByTag 和 BoxEdges 校验。
```

## 2. 包位置

路径：

```text
packages/layout
```

当前已落地模块：

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

当前 API：

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

`BasicLayoutEngine` 已实现 screen、box、vstack、hstack、text、spacer 及 fragment/show/for 结构的 measure / arrange。intrinsic `button` / `input` 会抛 `Unsupported layout element`。

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

  renderer.render(layoutTree, {
    viewport: {
      width: terminal.columns,
      height: terminal.rows
    }
  });
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

`mounted` 让后续 renderer 能读取：

```text
tag
props
state
dirty
```

也让调试时能从 layout tree 反查 runtime node。

`contentRect` 表示 padding / border 之后可放置 children 的区域。即使第一版只实现基础盒模型，也应保留这个字段，避免未来接 Yoga / Flexbox 时推翻 LayoutNode 结构。

## 5. 与 runtime / renderer / app 的接口 contract

layout 的职责是稳定输出 renderer 可以消费的几何树。它不 import runtime，也不 import renderer；组合由 `bindtty` 包的 `createApp()` 完成。

### 5.1 import 方向

```text
@bindtty/layout
  import @bindtty/vnode
  不 import @bindtty/runtime
  不 import @bindtty/renderer-terminal
  不读取 process.stdout

@bindtty/renderer-terminal
  import @bindtty/layout
  读取 LayoutNode / LayoutRect 类型
  不反向影响 layout

bindtty / app layer
  import @bindtty/runtime
  import @bindtty/layout
  import @bindtty/renderer-terminal
  负责读取 viewport、调用 layout、调用 renderer、写 stdout
```

### 5.2 调用链

MVP 的完整调用链：

```text
runtime flush
  ↓
app layer read viewport
  ↓
layoutRoot(root, { viewport })
  ↓
renderer.render(layoutTree, { viewport })
  ↓
stdout.write(patch)
  ↓
runtime.clearDirty()
```

示例：

```ts
runtime.onFlush(({ root }) => {
  const viewport = {
    width: terminal.columns,
    height: terminal.rows
  };

  const layoutTree = layoutRoot(root, { viewport });
  const patch = renderer.render(layoutTree, { viewport });

  terminal.write(patch);
  runtime.clearDirty();
});
```

layout 不主动读取终端宽高。`viewport` 由 app layer 读取并传入。

### 5.3 LayoutNode 给 renderer 的保证

`@bindtty/layout` 必须保证以下 contract：

```text
1. LayoutNode.rect 使用绝对坐标。
2. LayoutNode.contentRect 使用绝对坐标。
3. children 的 rect / contentRect 不需要 renderer 再相对父节点换算。
4. contentRect 永远落在自身 rect 的语义内部，width / height 不为负数。
5. 非 box 节点 contentRect = rect。
6. box 节点 contentRect 扣除 border / padding。
7. fragment / show / for 保留 LayoutNode，但 renderer 把它们当透明节点绘制。
8. text / box / spacer 的 rect 稳定，不因 renderer paint 改变。
9. layout 可以产生超出 parent / viewport 的 rect。
10. clipping / overflow 由 renderer 按 viewport 裁剪。
```

这意味着 renderer 可以直接按下面的方式工作：

```text
read node.mounted
read node.rect
read node.contentRect
paint children by child.rect
```

renderer 不需要知道 BasicLayoutEngine 的内部 measure / arrange 过程。

### 5.4 各 tag 的 rect contract

```text
screen:
  rect = viewport
  contentRect = rect

vstack:
  rect 包围 column flow 后的 children
  contentRect = rect

hstack:
  rect 包围 row flow 后的 children
  contentRect = rect

box:
  rect = border box
  contentRect = rect 扣除 border / padding

text:
  rect = 单行文本的 layout 区域
  contentRect = rect
  children = []

spacer:
  rect = 在父 flow 中占用的区域
  contentRect = rect
  children = []

fragment / show / for:
  rect 包围当前 visual children
  contentRect = rect
  自身不产生可绘制内容
```

### 5.5 暂不提供 helper API

MVP 暂不新增：

```ts
isLayoutElement(node)
getLayoutTag(node)
getLayoutProps(node)
```

renderer 可以直接读取：

```text
node.mounted
node.mounted.kind
node.mounted.tag
node.mounted.props
```

如果后续 renderer 里出现重复判断，再从 `@bindtty/layout` 或共享工具中抽 helper。第一版先不为了“可能会用”增加 API 面。

## 6. LayoutEngine 接口

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

## 7. 内建基础元素与控件边界

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

@bindtty/renderer-terminal
  定义 tag 的绘制语义

@bindtty/interaction
  定义 keyboard focus 与 onKey 派发

@bindtty/widgets
  定义高层控件语义，例如 button / input
```

## 8. 第一版支持范围

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

## 9. 盒模型与 Flexbox 预留

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

### 9.1 margin 策略

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

### 9.2 vstack / hstack 与 flexDirection

`vstack` / `hstack` 不应成为唯一布局原语。它们可以视为 `box` 的语法糖：

```text
vstack = box flexDirection="column"
hstack = box flexDirection="row"
```

第一版仍可以直接实现 `vstack` / `hstack` 分支，保证落地简单。未来 Yoga backend 可以把它们映射成 Yoga node 的 `flexDirection`。

### 9.3 layout prop 命名

BindTTY layout props 同时支持 camelCase 和 kebab-case。

推荐 TypeScript 用户使用 camelCase：

```tsx
<box paddingTop={1} flexDirection="row" />
```

同时支持 CSS / Yoga 直觉的 kebab-case：

```tsx
<box padding-top={1} flex-direction="row" />
```

归一化规则：

```text
1. layout props 进入 layout 前统一归一化为 camelCase。
2. kebab-case alias 转为 camelCase。
3. LayoutStyle 内部只保存 camelCase 字段。
4. camelCase 与 kebab-case 同时出现且指向同一字段时，抛错。
```

示例：

```ts
normalizeLayoutProps({
  "padding-top": 1,
  "flex-direction": "row"
});

// =>
{
  paddingTop: 1,
  flexDirection: "row"
}
```

冲突示例：

```tsx
<box paddingTop={1} padding-top={2} />
```

应抛错：

```text
Duplicate layout prop: paddingTop / padding-top
```

MVP 当前公开 props 很少：

```text
padding
border
size
value
```

其中 `padding` / `border` 本身没有 kebab-case 差异。kebab-case 支持主要面向后续 Yoga / Flexbox 字段：

```text
padding-top -> paddingTop
margin-bottom -> marginBottom
flex-direction -> flexDirection
justify-content -> justifyContent
align-items -> alignItems
```

## 10. BasicLayoutEngine MVP 语义

`BasicLayoutEngine` 是默认 engine。它的目标是跑通 `MountedNode -> LayoutNode` 主链路，不实现完整 Flexbox。

### 10.1 Props 使用范围

MVP 只从 `MountedElementNode.props` 读取以下字段：

| tag | props used by BasicLayoutEngine |
| --- | --- |
| `screen` | none |
| `vstack` | none |
| `hstack` | none |
| `box` | `padding`, `border` |
| `text` | `value` |
| `spacer` | `size` |

`LayoutStyle` 是未来 Yoga / Flexbox 的内部归一化目标，不等于当前公开 props。

当前 vnode schema 中 `box` 只公开 `padding` 和 `border`。因此 MVP 不需要先修改 vnode schema 来加入 `margin` / `gap` / `alignItems` 等 future props。

实现时应先执行 layout prop 归一化：

```text
raw props
  ↓ normalize camelCase / kebab-case aliases
LayoutStyle
  ↓ BasicLayoutEngine reads supported fields
LayoutNode
```

如果未来某个 layout prop 已经进入 vnode props，但 `BasicLayoutEngine` 尚未支持，应明确抛错，而不是静默忽略。

### 10.2 Rect 与 contentRect

所有 `LayoutNode` 都有：

```text
rect
contentRect
```

非 box 节点：

```text
contentRect = rect
```

box 节点：

```text
borderSize = border ? 1 : 0
paddingTop = paddingRight = paddingBottom = paddingLeft = padding ?? 0

contentRect.x = rect.x + borderSize + paddingLeft
contentRect.y = rect.y + borderSize + paddingTop
contentRect.width = max(0, rect.width - borderSize*2 - paddingLeft - paddingRight)
contentRect.height = max(0, rect.height - borderSize*2 - paddingTop - paddingBottom)
```

MVP 只实现 `padding` 一个数字。`paddingX` / `paddingY` / 四边 padding 是 future style 预留，不进入当前 vnode schema。

### 10.3 Flow 规则

明确 flow 的节点：

```text
screen -> column
box -> column
vstack -> column
hstack -> row
```

structure node：

```text
fragment
show
for
```

不自带 flow。它们的 visual children 使用以下规则：

```text
1. 作为 root 时，fallback 为 column。
2. 非 root 时，递归向上查找第一个明确 flow 的父级。
3. 找到 hstack，则按 row。
4. 找到 screen / box / vstack，则按 column。
```

这让 control node 更接近 transparent layout 语义，同时仍保留自身 `LayoutNode`。

### 10.4 Viewport 与 overflow

MVP 不做 clipping。

规则：

```text
screen root:
  rect = viewport

non-screen root:
  rect = natural size

children:
  可以产生超出 parent / viewport 的 rect
```

overflow / clipping / scroll 后续交给 renderer 或更完整的 layout backend 处理。

### 10.5 Unsupported 策略

MVP 明确抛错：

```text
unsupported element tag:
  button
  input

unsupported style prop:
  未来进入 vnode props 但 BasicLayoutEngine 尚未支持的 layout prop

duplicate layout alias:
  camelCase 与 kebab-case 同时出现且指向同一 LayoutStyle 字段
```

当前 vnode schema 外的 future props 不会出现在 `MountedElementNode.props` 中，MVP 不需要额外处理。

## 11. 基础布局模型

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

## 12. Measure 规则

### 12.1 text

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

### 12.2 spacer

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

### 12.3 vstack

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

### 12.4 hstack

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

### 12.5 box

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

第一版 `box` children 使用 column flow，也就是按 `vstack` 方式排列。后续如果需要更强控制，再加入 direction / alignment。

### 12.6 screen

`screen` 占满 viewport：

```text
x = 0
y = 0
width = viewport.width
height = viewport.height
```

children 在 screen content 内布局。第一版 screen children 可以按 `vstack` 排列。

## 13. Structure Node 规则

`fragment`、`show`、`for` 不对应真实终端绘制，但应该保留 LayoutNode，便于调试和后续局部更新。

它们作为 structure node，本身不决定排版方向。BasicLayoutEngine 使用以下 flow 继承规则：

```text
1. fragment / show / for 作为 root 时，fallback 为 column flow。
2. fragment / show / for 不是 root 时，递归向上查找第一个明确 flow 的父级。
3. 明确 flow 父级包括 screen / box / vstack / hstack。
4. screen / box / vstack 提供 column flow。
5. hstack 提供 row flow。
6. structure node 的 visual children 按继承到的 flow 参与排版。
```

这意味着：

```tsx
<vstack>
  <for each={items}>{(item) => <text value={item.title} />}</for>
</vstack>
```

`for` items 按 column 排列。

而：

```tsx
<hstack>
  <for each={tabs}>{(tab) => <text value={tab.label} />}</for>
</hstack>
```

`for` items 按 row 排列。

这个规则比“for 永远 column”更贴近未来 Yoga / Flexbox：control node 保留结构身份，但排版方向由最近的实体 layout 父级决定。

### 13.1 fragment

规则：

```text
layout children
fragment rect = children union rect
fragment children 按继承到的 flow 排列
```

fragment 自身保留 LayoutNode，但它的 visual children 使用最近明确 flow 父级的方向。作为 root 时使用 column flow。

### 13.2 show

规则：

```text
只 layout activeBranch
show rect = activeBranch rect
无 activeBranch 时 rect = 0x0
activeBranch 按继承到的 flow 排列
```

`show` 自身保留 LayoutNode：

```text
show LayoutNode
  children: activeBranch layout node, 或 []
```

### 13.3 for

规则：

```text
layout node.items[*].node
for rect = item layout nodes union rect
items 按继承到的 flow 排列
```

第一版 `for` 自身保留 LayoutNode：

```text
for LayoutNode
  children: item layout nodes
```

`for` 不自带方向。作为 root 时使用 column flow；否则递归向上继承最近明确 flow 父级的方向。

## 14. Unsupported Tag 策略

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

## 15. Dirty 与重新 layout

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
partial render
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
render dirty:
  不重新 measure，只让 renderer repaint rect

layout dirty:
  从最近 layout boundary 重新 measure / arrange

structure dirty:
  重新构建相关 layout subtree
```

但这不进入 layout MVP。

## 16. 测试计划

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

13. BasicLayoutEngine MVP:
   只读取 MVP props
   camelCase / kebab-case alias 归一化为 camelCase
   duplicate alias 抛错
   非 box contentRect = rect
   box contentRect 扣除 border / padding
   structure node 继承最近明确 flow
   root structure node fallback column
   不裁剪 overflow

14. renderer contract:
   rect / contentRect 使用绝对坐标
   children rect 不需要相对父节点换算
   fragment / show / for 保留 LayoutNode 且绘制透明
   layout 不裁剪 viewport，renderer 负责裁剪
```

## 17. 验收标准

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
13. BasicLayoutEngine 只读取 MVP props。
14. camelCase / kebab-case layout prop alias 有归一化和冲突测试。
15. contentRect / flow / viewport / unsupported 策略有测试覆盖。
16. renderer contract 有文档和测试覆盖。
17. npm test passes。
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

下一阶段由 `@bindtty/renderer-terminal` 实现 paint / frame / ANSI diff。

## M7 当前实现：Clip / Scroll Metadata

M7 已在 `BasicLayoutEngine` 中补齐滚动窗口所需的最小 layout props：

```text
box:
  height / width        fixed number size
  overflow="clip"      输出 LayoutNode.clip
  scrollX / scrollY    输出 LayoutNode.scrollOffset
```

`LayoutNode` 当前额外包含：

```ts
clip?: LayoutRect;
scrollOffset?: { x: number; y: number };
contentSize?: { width: number; height: number };
```

规则：

1. `height` / `width` 第一版只支持固定数值。
2. `overflow="clip"` 使用 `contentRect` 作为 clip。
3. children 仍按自然尺寸排列，可以超出 parent。
4. `scrollY` 在 layout 阶段按 `contentSize.height - clip.height` clamp。
5. renderer 负责真正裁剪与应用 scroll offset。
