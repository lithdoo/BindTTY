# Text Measurement 与 Yoga Layout 落地计划

本文档描述 BindTTY 下一阶段的 layout 升级计划。目标是在保留现有 `MountedNode -> LayoutNode -> renderer` 架构的前提下，新增 terminal text measurement / wrapping 基础设施，并引入 Yoga layout engine 替代当前简化的 `BasicLayoutEngine`。

本文档采用一个总计划、两个子计划的结构：

```text
总计划：Text Measurement 与 Yoga Layout
  ├─ 子计划 A：@bindtty/text
  │   ├─ plain text measurement
  │   ├─ text wrap / hard wrap
  │   ├─ truncate
  │   └─ shared text layout
  │
  ├─ 子计划 B：YogaLayoutEngine
  │   ├─ Yoga tree 构建
  │   ├─ flex layout
  │   ├─ text measure function
  │   └─ LayoutNode 输出兼容
  │
  └─ 集成推进
      ├─ BasicLayoutEngine 接入 @bindtty/text
      ├─ renderer 多行 text
      ├─ app 级 layoutEngine 注入
      ├─ ScrollView / contentSize
      ├─ flex props
      └─ 默认 engine 切换
```

相关文档：

- [VNODE.md](./VNODE.md) — Template / MountedNode 类型设计
- [RUNTIME.md](./RUNTIME.md) — Template → MountedNode、binding、dirty、scheduler
- [LAYOUT.md](./LAYOUT.md) — MountedNode → LayoutNode
- [RENDERER.md](./RENDERER.md) — LayoutNode → Frame → ANSI Patch
- [NODE_SETUP.md](./NODE_SETUP.md) — Element Ref / Layout Callback
- [M7_SCROLL_VIEWPORT.md](./M7_SCROLL_VIEWPORT.md) — ScrollView / List viewport 与 scroll 数据流

## 1. 背景问题

当前 `@bindtty/layout` 使用 `BasicLayoutEngine`。它已经支持第一阶段必要的元素：

```text
screen
box
vstack
hstack
text
spacer
fragment
show
for
overflow clip
scrollY clamp
```

但它仍然是简化布局模型：

```text
1. text 宽度使用 JavaScript string.length，不是真实 terminal cell width。
2. text 高度固定为 1，不支持多行布局。
3. renderer 只绘制 text 第一行。
4. hstack 只累加 child width，不支持 flex shrink / grow。
5. row flow 不支持 wrap。
6. box / vstack / hstack 不支持 gap、align、justify、min/max 等 flexbox 能力。
7. 当前 Frame 是一列一个 Cell，尚不能正确表达 wide char / grapheme cluster。
8. 当前 renderer 是 Frame/style 模型，不支持 text value 内嵌 ANSI escape。
```

这些限制会影响：

```text
help text
description
form validation message
log viewer
markdown-like content
chat / message bubble
wrapped list item
ScrollView contentSize
terminal command output
responsive TUI layout
```

因此下一阶段需要同时解决两类问题：

```text
1. terminal plain text measurement / wrapping
2. Yoga-based flex layout
```

这两件事强相关，但实现上应解耦：

```text
@bindtty/text
  被 @bindtty/layout 使用，用于 BasicLayoutEngine / Yoga text measure
  被 @bindtty/renderer-terminal 使用，用于多行 text paint

YogaLayoutEngine
  使用 @bindtty/text 测量 text leaf
  输出 LayoutNode
```

## 2. 总体目标

下一阶段的总体目标：

```text
MountedNode + viewport
  ↓ LayoutEngine
LayoutNode
  ↓ renderer-terminal
Frame
  ↓ diff
ANSI Patch
```

其中迁移期会同时存在：

```text
BasicLayoutEngine
YogaLayoutEngine
```

具体目标：

1. 新增 `@bindtty/text` 包，提供 plain text measurement / wrap / truncate 能力。
2. `BasicLayoutEngine` 先接入 `@bindtty/text`，让 `text.wrap` 的 layout height 正确。
3. `renderer-terminal` 使用同一个 `layoutText()` 绘制多行 text。
4. 新增 `createYogaLayoutEngine()`。
5. 用 Yoga 实现更完整的 flex layout。
6. 保持 `layoutRoot(root, { viewport, engine? })` 入口不变。
7. `createApp()` 过渡期支持 app 级 `layoutEngine?: LayoutEngine` 注入，便于 Yoga app / E2E 验证。
8. 保持 `LayoutNode` 输出结构尽量兼容。
9. 保持 `runtime` / `vnode` 不直接依赖 Yoga。
10. 保持 `renderer-terminal` 继续只消费 `LayoutNode`。
11. 保持 Element Ref 的 `api.onLayout` 语义不变。
12. 让 `ScrollView` 继续基于 `contentSize / scrollOffset` 工作。
13. 逐步替换 `BasicLayoutEngine`，而不是一次性推翻所有布局逻辑。

## 3. 非目标

本阶段不做：

1. 不引入 React DOM / Ink reconciler。
2. 不把 Yoga node 暴露到 public API。
3. 不把 Yoga node 挂到 `MountedElementNode` 类型上。
4. 不要求第一版 Yoga engine 增量复用 Yoga nodes。
5. 不实现完整 CSS。
6. 不实现所有百分比布局边界。
7. 不实现 absolute / static / z-index 等复杂定位。
8. 不完整处理 bidi。
9. 不支持 rich text nested style span。
10. 不改变 Frame / diff / ansi 基础模型。
11. 不改变 Element Ref 的生命周期模型。
12. MVP 不支持 text value 内嵌 ANSI escape。
13. MVP 不承诺 CJK / emoji / combining mark 完全正确渲染；这需要先定义 Frame 的 wide-cell / grapheme 表示。

## 4. 总体架构

### 4.1 包关系

新增包：

```text
packages/text
```

最终包关系：

```text
@bindtty/text
  不依赖 @bindtty/vnode
  不依赖 @bindtty/layout
  不依赖 @bindtty/renderer-terminal

@bindtty/vnode
  不依赖 @bindtty/text
  不依赖 yoga-layout

@bindtty/runtime
  不依赖 @bindtty/text
  不依赖 yoga-layout

@bindtty/layout
  import @bindtty/vnode
  import @bindtty/text
  import yoga-layout

@bindtty/renderer-terminal
  import @bindtty/layout
  import @bindtty/text

bindtty
  import runtime / layout / renderer / interaction
  可选接收 layoutEngine
```

### 4.2 调用链

主调用链保持：

```text
runtime flush
  ↓
app layer read viewport
  ↓
layoutRoot(root, { viewport, engine })
  ↓
renderer.render(layoutTree, { viewport })
  ↓
stdout.write(patch)
  ↓
runtime.clearDirty()
  ↓
dispatchLayout(layoutTree)
```

其中：

```text
layoutRoot()
  迁移期可由 createApp 传入 layoutEngine
  最终默认切到 YogaLayoutEngine

renderer.render()
  继续消费 LayoutNode

dispatchLayout()
  继续触发 api.onLayout(layout)
```

### 4.3 文本测量共享原则

`@bindtty/text` 是 BasicLayoutEngine、YogaLayoutEngine 和 renderer 的共同依赖：

```text
BasicLayoutEngine measure text
  ↓
layoutText()

Yoga measure function
  ↓
layoutText()

renderer paintText()
  ↓
layoutText()
```

必须保证：

```text
layout 认为 text 占 N 行
  ==
renderer 实际绘制 text N 行
```

否则会出现 layout 高度与实际 paint 错位。

## 5. MVP 字符范围与兼容策略

### 5.1 MVP plain text only

MVP 的 text value 语义：

```text
text value 是 plain text。
样式通过 props / CellStyle 表达。
不支持内嵌 ANSI escape。
```

原因：

```text
renderer-terminal 当前是 Frame/style 模型。
ANSI escape 不是普通可见字符。
直接把 ANSI escape 写入 Cell 会破坏 Frame / diff / ANSI patch 模型。
```

后续如要支持 ANSI text，有两个方向：

```text
1. strip ANSI:
   只用于测量和纯文本输出，不保留样式。

2. parse ANSI into style spans:
   把 ANSI 解析为 rich text span，再映射到 CellStyle。
```

这两个方向都不属于本阶段 MVP。

### 5.2 MVP ASCII-first

MVP 优先支持：

```text
ASCII
newline
plain whitespace
wrap
hard wrap
truncate
```

CJK / emoji / combining mark 不作为 MVP 验收标准。

原因：

```text
当前 Frame 是一列一个 Cell。
Cell 只有 char + style。
normalizeChar() 会把 char 截成第一个 UTF-16 code unit。
这种结构无法正确表达 emoji surrogate pair、wide char、combining mark、grapheme cluster。
```

后续需要单独定义 wide-cell / grapheme 表示：

```text
方案 A：Cell.char 存 grapheme，Cell.width 表示占用列数。
方案 B：leading Cell 存 grapheme，continuation Cell 标记为 occupied。
方案 C：Frame 仍是一列一个 Cell，但 renderer 写入时展开 wide char 并占位。
```

该设计应独立成一节或单独文档，再进入 CJK / emoji hardening。

### 5.3 newline 兼容策略

当前实现对 text 是 legacy single-line：

```text
layout height = 1
renderer 只绘制第一个 newline 前的内容
```

为了保持兼容，`wrap` 未设置时继续使用 legacy single-line。

建议语义：

```ts
wrap?: undefined | "none" | "wrap" | "hard" | "truncate-end" | "truncate-middle" | "truncate-start";
```

规则：

```text
wrap = undefined:
  legacy single-line
  忽略第一个 newline 之后的内容
  保持当前默认行为

wrap = "none":
  不按宽度自动换行
  但保留显式 newline
  layout height 可以大于 1

wrap = "wrap":
  按宽度自动换行
  保留显式 newline

wrap = "hard":
  按 cell width 硬切
  保留显式 newline

wrap = "truncate-*":
  截断到指定 width
  MVP 可以只处理每个显式行
```

这样可以同时满足：

```text
默认 text 仍单行
显式 wrap prop 可以启用多行语义
```

---

# 子计划 A：@bindtty/text

## 6. 子计划 A 目标

`@bindtty/text` 的目标是提供 terminal plain text 基础设施：

```text
string
  ↓ measure / wrap / truncate
TextLayout
```

它回答：

```text
1. 一段 plain text 在当前 MVP 字符范围内占几列？
2. 一段 plain text 在指定宽度下会被拆成几行？
3. 每行实际要绘制的字符串是什么？
4. truncate 后每行是什么？
```

它不负责：

```text
1. layout tree
2. Yoga node
3. renderer frame
4. ANSI diff
5. signal / dirty
6. terminal write
7. rich text style span
8. ANSI escape parsing
9. wide-cell Frame 表示
```

## 7. 子计划 A 包结构

路径：

```text
packages/text
```

建议结构：

```text
packages/text/
  src/
    index.ts
    measure.ts
    wrap.ts
    truncate.ts
    width.ts
    lines.ts
  test/
    measure.test.ts
    wrap.test.ts
    truncate.test.ts
    layout.test.ts
  package.json
  tsconfig.json
```

## 8. 子计划 A API

### 8.1 TextWrapMode

```ts
export type TextWrapMode =
  | "legacy"
  | "none"
  | "wrap"
  | "hard"
  | "truncate-end"
  | "truncate-middle"
  | "truncate-start";
```

`legacy` 可以只作为内部模式，不一定暴露给 JSX 用户。

语义：

```text
legacy:
  当前兼容行为。
  只取第一行。
  不自动换行。
  height = 1 when text is non-empty。

none:
  不自动换行。
  保留原始 newline。
  超出 width 的部分由 renderer clip。

wrap:
  按 word wrap 生成多行。
  长 token 可硬切。
  保留 whitespace。
  保留显式 newline。

hard:
  不做 word wrap。
  只按 width 硬切。
  保留显式 newline。

truncate-end:
  每行截断到 width，省略号在末尾。

truncate-middle:
  每行截断到 width，省略号在中间。

truncate-start:
  每行截断到 width，省略号在开头。
```

### 8.2 TextMeasure

```ts
export interface TextMeasure {
  width: number;
  height: number;
}
```

### 8.3 TextLayoutOptions

```ts
export interface TextLayoutOptions {
  width?: number;
  wrap?: TextWrapMode;
}
```

### 8.4 TextLayout

```ts
export interface TextLayout {
  width: number;
  height: number;
  lines: string[];
}
```

### 8.5 Functions

```ts
export function measureText(text: string): TextMeasure;

export function measureTextWidth(text: string): number;

export function layoutText(
  text: string,
  options?: TextLayoutOptions
): TextLayout;
```

## 9. 子计划 A 行为规则

### 9.1 空字符串

```text
layoutText("", { wrap: "legacy" })
  -> { width: 0, height: 0, lines: [] }

layoutText("", { wrap: "none" })
  -> { width: 0, height: 0, lines: [] }
```

### 9.2 legacy single-line

```text
layoutText("abc
def", { wrap: "legacy" })
  -> lines: ["abc"]
  -> width: 3
  -> height: 1
```

这是默认兼容模式。

### 9.3 wrap="none"

```text
layoutText("abc
def", { wrap: "none" })
  -> lines: ["abc", "def"]
  -> width: 3
  -> height: 2
```

### 9.4 width 为空

```text
layoutText(text, { width: undefined, wrap: "wrap" })
  -> 不做 width-constrained wrap
  -> 只按显式 newline 分行
```

### 9.5 width <= 0

```text
layoutText(text, { width: 0 })
  -> { width: 0, height: 0, lines: [] }
```

### 9.6 wrap="wrap"

```text
layoutText("hello world", { width: 5, wrap: "wrap" })
  -> lines roughly:
     ["hello", "world"]
```

### 9.7 wrap="hard"

```text
layoutText("abcdef", { width: 3, wrap: "hard" })
  -> lines:
     ["abc", "def"]
```

### 9.8 truncate

```text
layoutText("abcdef", { width: 4, wrap: "truncate-end" })
  -> lines:
     ["abc…"] 或依赖 truncate util 的稳定输出
```

具体省略号行为由实现统一决定，但测试必须锁定。

## 10. 子计划 A 依赖选择

可参考 terminal 生态中的成熟依赖：

```text
string-width
widest-line
wrap-ansi
slice-ansi
cli-truncate
```

但 MVP 不应直接承诺 ANSI escape 或 wide char 完整支持。

策略：

```text
1. 优先选择兼容 Node 18 的版本。
2. 不盲目跟随最新 major。
3. 所有依赖版本写入 packages/text/package.json。
4. text 行为必须由测试锁定。
5. 后续依赖升级必须跑 text snapshot / unit tests。
6. ANSI escape 在 MVP 中作为不支持输入处理。
7. CJK / emoji / combining mark 作为后续 hardening。
```

## 11. 子计划 A 缓存

文本测量会在 layout 和 renderer 中频繁调用。

MVP 建议做简单缓存：

```ts
const measureCache = new Map<string, TextMeasure>();
const layoutCache = new Map<string, TextLayout>();
```

cache key：

```text
measureText:
  text + " " + mode

layoutText:
  text + " " + width + " " + wrap
```

暂不做 LRU。后续如遇长日志内存压力，再改成有限容量缓存。

## 12. 子计划 A 测试

### 12.1 MVP measure tests

```text
- empty string
- ascii
- multiline ascii
- widest line
- legacy first-line behavior
```

### 12.2 MVP layout tests

```text
- legacy single-line
- wrap none preserves explicit newline
- wrap word
- hard wrap
- truncate end
- truncate middle
- truncate start
- width undefined
- width 0
- width 1
- multiline + wrap
- whitespace preservation
```

### 12.3 不作为 MVP 验收的后续测试

```text
- CJK width
- emoji width
- combining mark
- grapheme cluster
- ANSI escape strip / parse
```

这些需要先完成 Frame wide-cell / grapheme 设计，或明确 text value ANSI 处理策略。

### 12.4 cache tests

```text
- cache hit 不改变结果
- 不同 width 产生不同 layout
- 不同 wrap mode 产生不同 layout
```

## 13. 子计划 A 验收标准

```text
- @bindtty/text 可独立 build。
- @bindtty/text 可独立 test。
- measureText() 能稳定返回 ASCII/plain-text width / height。
- layoutText() 能稳定返回 lines / width / height。
- legacy 默认行为可表达。
- Node 18 环境通过。
- BasicLayoutEngine、YogaLayoutEngine 和 renderer 可共同依赖该包。
```

---

# 子计划 B：YogaLayoutEngine

## 14. 子计划 B 目标

YogaLayoutEngine 的目标是用 Yoga 替代当前简化的 flow layout：

```text
MountedNode + viewport
  ↓ YogaLayoutEngine
LayoutNode
```

它负责：

```text
1. 构建临时 Yoga tree。
2. 把 BindTTY props 映射到 Yoga style。
3. 用 @bindtty/text 测量 text leaf。
4. 调用 Yoga calculateLayout。
5. 把 computed layout 转回 LayoutNode。
6. 保留 clip / contentSize / scrollOffset 等 BindTTY terminal-specific 字段。
```

它不负责：

```text
1. renderer paint。
2. ANSI diff。
3. signal / dirty。
4. user interaction。
5. Element Ref dispatch。
6. terminal write。
7. text value ANSI parsing。
8. wide-cell Frame 表示。
```

## 15. 子计划 B 包位置

文件：

```text
packages/layout/src/yoga-engine.ts
```

导出：

```ts
export function createYogaLayoutEngine(): LayoutEngine;
```

`layoutRoot()` 入口保持不变：

```ts
layoutRoot(root, {
  viewport,
  engine: createYogaLayoutEngine()
});
```

## 16. 子计划 B 与 BasicLayoutEngine 的关系

迁移期保留：

```text
createBasicLayoutEngine()
createYogaLayoutEngine()
```

原因：

```text
1. 便于对比测试。
2. Yoga 迁移期间可以逐步覆盖。
3. yoga-layout 若存在平台兼容问题，可以 fallback。
4. BasicLayoutEngine 可作为语义参考。
```

推荐状态变化：

```text
阶段内:
  BasicLayoutEngine 保留
  YogaLayoutEngine 新增

稳定后:
  layoutRoot 默认切到 YogaLayoutEngine
  BasicLayoutEngine 标记 legacy

后续:
  删除 BasicLayoutEngine 或仅保留测试用途
```

## 17. Yoga node 生命周期

MVP 不缓存 Yoga node。

每次 layout 临时构建：

```text
MountedNode tree
  ↓ build temporary Yoga tree
Yoga calculateLayout()
  ↓ read computed layout
LayoutNode tree
  ↓ free Yoga tree
```

伪代码：

```ts
export function createYogaLayoutEngine(): LayoutEngine {
  return {
    layout(root, options) {
      if (!root) {
        return null;
      }

      const yogaTree = buildYogaTree(root);

      try {
        yogaTree.yogaNode.calculateLayout(
          options.viewport.width,
          options.viewport.height,
          Yoga.DIRECTION_LTR
        );

        return readLayoutTree(yogaTree, options);
      } finally {
        yogaTree.yogaNode.freeRecursive();
      }
    }
  };
}
```

后续如性能不足，再考虑：

```ts
WeakMap<MountedNode, Yoga.Node>
```

但这会引入 Yoga node dirty 同步、dispose 同步、structure update 同步，不适合作为 MVP。

## 18. Yoga Tree 内部结构

建议内部结构：

```ts
interface YogaLayoutEntry {
  mounted: MountedNode;
  yogaNode: Yoga.Node;
  children: YogaLayoutEntry[];
}
```

也可以拆成：

```ts
interface YogaElementEntry {
  mounted: MountedElementNode;
  yogaNode: Yoga.Node;
  children: YogaLayoutEntry[];
}

interface YogaStructureEntry {
  mounted: MountedNode;
  yogaNode: Yoga.Node;
  children: YogaLayoutEntry[];
}
```

MVP 重点是保持和 `MountedNode` 树一一对应，方便输出 `LayoutNode` 和调试。

## 19. MountedNode 映射规则

### 19.1 screen

```text
screen:
  width = viewport.width
  height = viewport.height
  flexDirection = column
```

### 19.2 vstack

```text
vstack:
  flexDirection = column
```

### 19.3 hstack

```text
hstack:
  flexDirection = row
```

后续支持：

```tsx
<hstack wrap="wrap" gap={1}>
  ...
</hstack>
```

映射：

```text
flexWrap = wrap
gap = 1
```

### 19.4 box

当前 `box` 默认是 column flow，Yoga 中保持：

```text
box:
  flexDirection = column
```

映射 props：

```text
width
height
padding
border
overflow
scrollX
scrollY
```

注意：

```text
Yoga 负责几何排布。
BindTTY 仍负责 terminal-specific clip / scrollOffset / contentSize。
```

### 19.5 text

`text` 是 leaf Yoga node，需要 measure function：

```ts
yogaNode.setMeasureFunc((width, widthMode, height, heightMode) => {
  const text = String(node.props.value ?? "");
  const wrap = readTextWrap(node.props.wrap);

  const layout = layoutText(text, {
    width: widthMode === Yoga.MEASURE_MODE_UNDEFINED ? undefined : width,
    wrap
  });

  return {
    width: layout.width,
    height: layout.height
  };
});
```

规则：

```text
1. wrap 未设置时使用 legacy single-line。
2. wrap="none" 时不自动换行，但保留显式 newline。
3. wrap="wrap" / "hard" / truncate 模式受 width 约束。
4. measure function 与 renderer 使用同一个 layoutText()。
5. text value / wrap 变化后，临时 Yoga tree 会重新构建，因此 MVP 不需要 markDirty。
```

### 19.6 spacer

当前 `spacer` 语义依赖父 flow：

```text
column flow:
  height = size
  width = available width

row flow:
  width = size
  height = available height
```

Yoga MVP 建议：

```text
在 column parent 中:
  setHeight(size)
  setAlignSelf(stretch)

在 row parent 中:
  setWidth(size)
  setAlignSelf(stretch)
```

这要求 build Yoga tree 时知道 parent flow。

### 19.7 fragment

MVP 使用 wrapper node：

```text
fragment:
  wrapper yoga node
  children 插入 wrapper
  flexDirection 继承 parent flow
```

风险：

```text
wrapper 可能影响 flex item 语义。
```

后续优化：

```text
flatten structure nodes into nearest element parent
```

### 19.8 show

```text
activeBranch 存在:
  layout activeBranch

activeBranch 不存在:
  zero-size wrapper
```

### 19.9 for

```text
items.map(item => item.node)
```

MVP 使用 wrapper node 保持树形一致。

## 20. LayoutNode 输出兼容

Yoga engine 仍输出：

```ts
export interface LayoutNode {
  mounted: MountedNode;
  rect: LayoutRect;
  contentRect: LayoutRect;
  clip?: LayoutRect;
  scrollOffset?: LayoutOffset;
  contentSize?: LayoutSize;
  children: LayoutNode[];
}
```

### 20.1 rect

从 Yoga computed layout 读取：

```text
x = parent origin + computedLeft
y = parent origin + computedTop
width = computedWidth
height = computedHeight
```

### 20.2 contentRect

普通节点：

```text
contentRect = rect
```

`box`：

```text
contentRect = rect - border - padding
```

即使 Yoga 已经处理 padding/border，`contentRect` 仍然需要保留，因为 renderer 和 scroll 逻辑依赖它。

### 20.3 clip

`overflow="clip"`：

```text
clip = contentRect
```

后续如支持 `overflowX` / `overflowY`，再拆分。

### 20.4 contentSize

scroll / clip container 不能直接使用 box 自身 computed size。

错误做法：

```text
contentSize = box computed size
```

正确方向：

```text
contentSize 基于 children union 或自然内容测量。
```

推荐 MVP 使用 children union：

```text
contentSize.width =
  max(child.rect.x + child.rect.width - contentRect.x)

contentSize.height =
  max(child.rect.y + child.rect.height - contentRect.y)
```

空 children：

```text
contentSize = { width: 0, height: 0 }
```

需要特别覆盖：

```text
1. wrapped text 撑高内容。
2. flexShrink 后 children rect 变化。
3. fixed height scroll container。
4. dynamic content shrink。
5. resize rewrap。
```

### 20.5 scrollOffset

对于有 `scrollX` / `scrollY` 的 box：

```text
maxX = max(0, contentSize.width - contentRect.width)
maxY = max(0, contentSize.height - contentRect.height)

scrollOffset.x = clamp(scrollX, 0, maxX)
scrollOffset.y = clamp(scrollY, 0, maxY)
```

这保持 `ScrollView` 和 `api.onLayout` 的 applied state 语义。

## 21. Yoga props roadmap

第一批 Yoga props 建议：

```text
gap
flexGrow
flexShrink
alignItems
justifyContent
flexWrap
```

后续扩展：

```text
minWidth
minHeight
maxWidth
maxHeight
paddingX
paddingY
paddingTop
paddingRight
paddingBottom
paddingLeft
margin
marginX
marginY
marginTop
marginRight
marginBottom
marginLeft
alignSelf
alignContent
flexBasis
```

`flexDirection` 暂时可不开放，因为已有：

```text
vstack = column
hstack = row
box = column
```

后续如果要让 `box` 通用化，再开放 `flexDirection`。

## 22. 子计划 B 测试

### 22.1 Yoga engine 基础测试

```text
- null root returns null
- screen fills viewport
- vstack child y 正确
- hstack child x 正确
- box width / height
- box padding / border / contentRect
- text measure function
- spacer in column
- spacer in row
- fragment wrapper
- show active branch
- show fallback / null
- for items
```

### 22.2 Yoga engine scroll 测试

```text
- overflow clip 设置 clip
- contentSize 基于 children union
- scrollY clamp
- scrollX clamp
- scrollOffset applied value
- wrapped text 撑高 contentSize
- flexShrink 下 contentSize 正确
- fixed height scroll container
- dynamic content shrink 后 scroll clamp
- resize rewrap 后 scroll clamp
```

### 22.3 Yoga flex props 测试

```text
- gap row
- gap column
- flexGrow
- flexShrink
- justifyContent center
- justifyContent space-between
- alignItems center
- flexWrap wrap
- flexWrap with different child heights
```

## 23. 子计划 B 验收标准

```text
- createYogaLayoutEngine() 可独立导出。
- layoutRoot 可传入 Yoga engine。
- createApp 可在过渡期注入 Yoga engine。
- Yoga engine 输出 LayoutNode。
- 现有 basic layout 行为有对应 Yoga 测试。
- text wrap 通过 Yoga measure function 影响 layout height。
- scroll container 在 Yoga 下有正确 contentSize / scrollOffset。
- Node 18 环境通过。
- Yoga node 每轮 layout 后释放。
```

---

# 集成计划

## 24. VNode / JSX 变化

### 24.1 text.wrap

`text` 新增：

```ts
wrap?: BindingValue<Exclude<TextWrapMode, "legacy">>;
```

Schema：

```ts
text: {
  value: { required: true, dirty: "layout" },
  wrap: { dirty: "layout" },
  color: { dirty: "paint" },
  bold: { dirty: "paint" }
}
```

默认：

```text
wrap = undefined
```

默认语义：

```text
legacy single-line
```

用户显式写：

```tsx
<text value={description} wrap="wrap" />
```

或：

```tsx
<text value={contentWithNewlines} wrap="none" />
```

### 24.2 Yoga flex props

第一批：

```ts
gap?: BindingValue<number>;
flexGrow?: BindingValue<number>;
flexShrink?: BindingValue<number>;
alignItems?: BindingValue<"flex-start" | "center" | "flex-end" | "stretch">;
justifyContent?: BindingValue<
  | "flex-start"
  | "center"
  | "flex-end"
  | "space-between"
  | "space-around"
  | "space-evenly"
>;
flexWrap?: BindingValue<"nowrap" | "wrap" | "wrap-reverse">;
```

具体支持范围以 Yoga MVP 阶段为准。

## 25. BasicLayoutEngine 集成

阶段 2 必须接入 BasicLayoutEngine，而不是只改 renderer。

升级前：

```text
text width = String(value).length
text height = 1
```

升级后：

```ts
function measureTextElement(node, constraint): LayoutSize {
  const text = String(node.props.value ?? "");
  const wrap = readTextWrap(node.props.wrap);

  const layout = layoutText(text, {
    width: wrap === "legacy" ? undefined : constraint.width,
    wrap
  });

  return {
    width: layout.width,
    height: layout.height
  };
}
```

规则：

```text
1. wrap 未设置时使用 legacy。
2. wrap="none" 可以返回多行 height。
3. wrap="wrap" 根据 constraint.width 返回多行 height。
4. renderer 使用同一个 layoutText()。
```

## 26. Renderer 集成

`renderer-terminal` 的关键变化是 `paintText()`。

升级前：

```text
text.split("
", 1)[0]
slice(0, node.rect.width)
只画第一行
```

升级后：

```ts
function paintText(frame, node, mounted, context) {
  const value = mounted.props.value;
  const text = value === null || value === undefined ? "" : String(value);
  const wrap = readTextWrap(mounted.props.wrap);

  const textLayout = layoutText(text, {
    width: node.rect.width,
    wrap
  });

  const lines = textLayout.lines.slice(0, node.rect.height);

  for (let row = 0; row < lines.length; row += 1) {
    writeTextClipped(
      frame,
      node.rect.x + context.offsetX,
      node.rect.y + row + context.offsetY,
      lines[row],
      toCellStyle(readPaintStyle(mounted.props)),
      context
    );
  }
}
```

要求：

```text
1. renderer 与 BasicLayoutEngine / YogaLayoutEngine 使用同一个 layoutText()。
2. renderer 不重新决定 text height。
3. renderer 最多绘制 node.rect.height 行。
4. 每行仍经过 clip。
5. truncate/wrap 行为与 layout 保持一致。
6. MVP 不处理 wide char 占位。
7. MVP 不处理内嵌 ANSI escape。
```

## 27. App 级 layoutEngine 注入

为了在默认 engine 切换前跑完整 Yoga app / E2E，`createApp()` 需要支持 layout engine 注入。

建议 API：

```ts
export interface CreateAppBaseOptions {
  autoStart?: boolean;
  onLifecycleError?: RuntimeLifecycleErrorHandler;
  layoutEngine?: LayoutEngine;
}
```

`CreateAppStdoutOptions` / `CreateAppTerminalOptions` 继承该基础选项。

`createApp()` 内部：

```ts
const layoutTree = layoutRoot(runtime.root, {
  viewport,
  engine: options.layoutEngine
});
```

这样可以在测试中使用：

```ts
createApp(view, {
  terminal,
  layoutEngine: createYogaLayoutEngine()
});
```

作用：

```text
1. 默认 engine 未切换前，也能跑 Yoga app/e2e。
2. ScrollView 可以在真实 app render path 下验证。
3. 不需要临时改 layoutRoot 默认值。
```

该选项可以作为公开 API，也可以先标注为 experimental。

## 28. ScrollView 集成

Element Ref 的 `api.onLayout` 不需要改变。

Yoga engine 输出新的 `LayoutNode` 后，app 层继续：

```text
layoutRoot()
renderer.render()
runtime.clearDirty()
dispatchLayout(layoutTree)
```

`api.onLayout(layout)` 能拿到：

```text
rect
contentRect
clip
contentSize
scrollOffset
children
```

`ScrollView` 继续基于：

```text
layout.scrollOffset.y
layout.contentSize.height
layout.contentRect.height / clip.height
```

计算：

```text
appliedY
maxY
pageY
```

重点测试：

```text
wrapped text inside ScrollView
  ↓
contentSize.height 增大
  ↓
scrollOffset.y clamp
  ↓
api.onLayout 记录 appliedY
  ↓
keyboard event 使用 applied state
```

## 29. 文档更新范围

需要更新：

```text
doc/LAYOUT.md
doc/RENDERER.md
doc/M7_SCROLL_VIEWPORT.md
doc/NODE_SETUP.md
```

建议新增：

```text
doc/YOGA_LAYOUT.md
```

示例可以新增：

```text
examples/text-wrap
examples/yoga-layout
```

---

# 总计划分阶段推进

最后推进按一个总计划分阶段执行，而不是按两个子计划分别推进。这样可以保证每个阶段都有明确集成点和验收标准。

## 阶段 0：Frame wide-cell / ANSI 范围决策

目标：明确 MVP 字符范围，避免文本计划承诺超过当前 Frame 能力。

任务：

- [ ] 明确 MVP text value 是 plain text。
- [ ] 明确 MVP 不支持内嵌 ANSI escape。
- [ ] 明确 MVP 不承诺 CJK / emoji / combining mark 完全正确。
- [ ] 在文档中记录 wide-cell / grapheme 后续设计方向。
- [ ] 从 MVP 验收中移除 CJK / emoji / ANSI escape。
- [ ] 如需立即支持 CJK/emoji，则先设计 Frame wide-cell / grapheme 表示。

验收：

- [ ] 文档中 plain text / ANSI / wide char 范围清晰。
- [ ] 测试清单不再错误承诺当前 Frame 无法表达的行为。
- [ ] 后续 hardening 项明确。

## 阶段 1：新增 @bindtty/text

目标：建立可独立测试的 terminal plain text measurement / wrapping 基础设施。

任务：

- [ ] 新建 `packages/text`。
- [ ] 新增 `measureText()`。
- [ ] 新增 `measureTextWidth()`。
- [ ] 新增 `layoutText()`。
- [ ] 支持 `legacy`。
- [ ] 支持 `none`。
- [ ] 支持 `wrap`。
- [ ] 支持 `hard`。
- [ ] 支持 `truncate-end`。
- [ ] 支持 `truncate-middle`。
- [ ] 支持 `truncate-start`。
- [ ] 增加文本测量缓存。
- [ ] 选定 Node 18 兼容依赖版本。
- [ ] 导出完整类型。
- [ ] 增加 unit tests。

验收：

- [ ] `@bindtty/text` 可 build。
- [ ] `@bindtty/text` 可 test。
- [ ] ASCII width 正确。
- [ ] newline height 在非 legacy 模式正确。
- [ ] legacy 模式只取第一行。
- [ ] wrap 后 lines / width / height 一致。
- [ ] truncate 行为稳定。
- [ ] 空字符串返回 `{ width: 0, height: 0 }`。
- [ ] 不把 CJK / emoji / ANSI escape 作为 MVP 必过项。

## 阶段 2：text.wrap 接入 BasicLayoutEngine 与 renderer

目标：让现有 BasicLayoutEngine 与 renderer 同时支持 text layout，避免 layout height 与 paint 不一致。

任务：

- [ ] `@bindtty/vnode` 的 text schema 增加 `wrap`。
- [ ] `@bindtty/jsx-runtime` 的 text intrinsic type 增加 `wrap`。
- [ ] `BasicLayoutEngine` 的 text measure 使用 `layoutText()`。
- [ ] `BasicLayoutEngine` 在 wrap 未设置时保持 legacy height。
- [ ] `BasicLayoutEngine` 在 `wrap="none"` / `wrap="wrap"` 时返回多行 height。
- [ ] `renderer-terminal/paint.ts` import `layoutText()`。
- [ ] `paintText()` 支持多行绘制。
- [ ] 添加 renderer snapshot tests。
- [ ] 添加 text wrap 示例。

验收：

- [ ] `text` 默认仍 single-line。
- [ ] `text` 默认忽略第一个 newline 后内容。
- [ ] `text wrap="none"` 保留显式 newline 并产生多行 height。
- [ ] `text wrap="wrap"` 可以在 BasicLayoutEngine 下产生多行 height。
- [ ] renderer 可以绘制多行。
- [ ] layout height 与 renderer lines 一致。
- [ ] clip 与多行 text 协同正确。
- [ ] text 样式在多行中保持一致。
- [ ] focusStyle 对多行 text rect 生效。
- [ ] 现有 renderer 测试不回退。

## 阶段 3：app 级 layoutEngine 注入

目标：在默认 engine 切换前允许完整 app / E2E 使用 Yoga engine。

任务：

- [ ] `CreateAppOptions` 增加 `layoutEngine?: LayoutEngine`。
- [ ] `createApp()` 调用 `layoutRoot(runtime.root, { viewport, engine: options.layoutEngine })`。
- [ ] stdout mode 支持 layoutEngine。
- [ ] terminal mode 支持 layoutEngine。
- [ ] 增加 app 层测试。
- [ ] 文档标注该选项为 experimental 或正式 API。

验收：

- [ ] 不传 layoutEngine 时行为不变。
- [ ] 传入 custom layoutEngine 时 app 使用该 engine。
- [ ] 可用 `createYogaLayoutEngine()` 跑 app render path。
- [ ] 为 ScrollView under Yoga e2e 打通入口。

## 阶段 4：YogaLayoutEngine MVP

目标：实现可替代 BasicLayoutEngine 当前能力的 Yoga backend，但暂不默认启用。

任务：

- [ ] `@bindtty/layout` 增加 `yoga-layout` 依赖。
- [ ] 新增 `src/yoga-engine.ts`。
- [ ] 实现 `createYogaLayoutEngine()`。
- [ ] 支持 `screen`。
- [ ] 支持 `vstack`。
- [ ] 支持 `hstack`。
- [ ] 支持 `box`。
- [ ] 支持 `text` measure function。
- [ ] 支持 `spacer`。
- [ ] 支持 `fragment`。
- [ ] 支持 `show`。
- [ ] 支持 `for`。
- [ ] 输出现有 `LayoutNode`。
- [ ] 每次 layout 后 `freeRecursive()`。
- [ ] 保留 `createBasicLayoutEngine()`。

验收：

- [ ] `layoutRoot(root, { engine: createYogaLayoutEngine() })` 可用。
- [ ] `createApp(view, { layoutEngine: createYogaLayoutEngine() })` 可用。
- [ ] screen rect 等于 viewport。
- [ ] vstack column 排布正确。
- [ ] hstack row 排布正确。
- [ ] box padding / border / contentRect 正确。
- [ ] text wrap 后 height 正确。
- [ ] spacer 行为与当前语义兼容。
- [ ] show / for 动态结构 layout 正确。
- [ ] Yoga node 不泄漏。
- [ ] Basic engine 仍可使用。

## 阶段 5：Yoga 下的 ScrollView / contentSize / scrollOffset

目标：让 Yoga engine 下 scroll container 与 Element Ref applied layout state 稳定工作。

任务：

- [ ] Yoga engine 计算 `clip`。
- [ ] Yoga engine 基于 children union 或自然内容测量计算 `contentSize`。
- [ ] Yoga engine 不能直接使用 container computed size 作为 scroll contentSize。
- [ ] Yoga engine 计算 `scrollOffset`。
- [ ] 保持 `scrollY` clamp。
- [ ] 保持 `scrollX` clamp。
- [ ] `ScrollView` 在 Yoga engine 下继续使用 `api.onLayout`。
- [ ] 增加 wrapped text inside ScrollView 测试。
- [ ] 增加 flexShrink + scroll container 测试。
- [ ] 增加 fixed height scroll container 测试。
- [ ] 增加 dynamic content shrink / expand 测试。
- [ ] 增加 resize rewrap 测试。

验收：

- [ ] 长 wrapped text 可以撑高 `contentSize.height`。
- [ ] `End` 滚动到 `maxY`。
- [ ] 内容缩短后 appliedY 被 clamp。
- [ ] `api.onLayout` 拿到正确 `scrollOffset`。
- [ ] 不反写用户 signal。
- [ ] PageUp / PageDown 使用实际 viewport height。
- [ ] List 动态数据变更后滚动状态正确。
- [ ] fixed height scroll container 下 contentSize 与 rect.height 区分正确。
- [ ] resize 导致 rewrap 后 contentSize 更新正确。

## 阶段 6：打开第一批 Yoga flex props

目标：开始利用 Yoga 能力，而不只是替代 BasicLayoutEngine。

任务：

- [ ] schema 增加 `gap`。
- [ ] schema 增加 `flexGrow`。
- [ ] schema 增加 `flexShrink`。
- [ ] schema 增加 `alignItems`。
- [ ] schema 增加 `justifyContent`。
- [ ] schema 增加 `flexWrap`。
- [ ] JSX 类型同步。
- [ ] Yoga engine 映射这些 props。
- [ ] layout validator 更新 supported props。
- [ ] 更新文档示例。

验收：

- [ ] hstack gap 正确。
- [ ] vstack gap 正确。
- [ ] hstack flexWrap 可以换行。
- [ ] flexGrow 分配剩余空间。
- [ ] flexShrink 在空间不足时收缩。
- [ ] alignItems 基本行为正确。
- [ ] justifyContent 基本行为正确。
- [ ] 未支持 prop 仍给出明确错误。

## 阶段 7：默认 engine 切换

目标：让 `layoutRoot()` 默认使用 Yoga engine。

前置条件：

- [ ] Yoga engine 覆盖现有 Basic engine 的核心行为。
- [ ] ScrollView / List e2e 通过。
- [ ] renderer snapshot 通过。
- [ ] examples 全部通过。
- [ ] Node 18 环境通过。
- [ ] real PTY e2e 通过。

任务：

- [ ] `layoutRoot()` 默认 engine 从 Basic 切到 Yoga。
- [ ] `createBasicLayoutEngine()` 保留导出。
- [ ] 文档标注 Basic 为 legacy。
- [ ] 更新 [LAYOUT.md](./LAYOUT.md)。
- [ ] 更新 [RENDERER.md](./RENDERER.md)。
- [ ] 更新 [M7_SCROLL_VIEWPORT.md](./M7_SCROLL_VIEWPORT.md)。
- [ ] 新增 Yoga layout 示例。
- [ ] 新增 text wrap 示例。
- [ ] 更新 changelog / README。

验收：

- [ ] 默认 app 使用 Yoga。
- [ ] 用户无需显式传 engine。
- [ ] 现有示例表现不回退。
- [ ] Basic engine 仍可通过显式 engine 使用。
- [ ] 文档与代码一致。

## 阶段 8：BasicLayoutEngine 退场评估

目标：决定 BasicLayoutEngine 的长期状态。

选项：

```text
1. 保留为 legacy fallback。
2. 移到 test helper。
3. 完全删除。
```

判断标准：

```text
1. Yoga engine 是否覆盖所有现有能力。
2. yoga-layout 在 Node 18 / 目标平台是否稳定。
3. 是否仍需要 basic engine 做对照测试。
4. Basic engine 的维护成本是否高于价值。
```

推荐：

```text
短期保留。
中期标记 legacy。
长期视 Yoga 稳定性决定删除。
```

---

## 30. 总测试清单

### 30.1 @bindtty/text MVP

- [ ] 空字符串。
- [ ] 单行 ASCII。
- [ ] 多行 ASCII。
- [ ] legacy first-line。
- [ ] wrap none preserves newline。
- [ ] wrap word。
- [ ] hard wrap 长 token。
- [ ] truncate end。
- [ ] truncate middle。
- [ ] truncate start。
- [ ] width = 0。
- [ ] width = 1。
- [ ] cache 不改变返回值。

### 30.2 @bindtty/text 后续 hardening

- [ ] CJK 字符宽度。
- [ ] emoji 宽度。
- [ ] combining mark。
- [ ] grapheme cluster。
- [ ] ANSI escape strip。
- [ ] ANSI escape parse into style spans。

这些不属于 MVP 必过项。

### 30.3 BasicLayoutEngine integration

- [ ] text 默认 single-line。
- [ ] text wrap none 多行 height。
- [ ] text wrap wrap 多行 height。
- [ ] Basic layout height 与 renderer lines 一致。
- [ ] vstack 中多行 text 推开后续节点。
- [ ] box contentSize 受 wrapped text height 影响。

### 30.4 layout / Yoga engine

- [ ] screen fills viewport。
- [ ] text without wrap keeps legacy single-line semantics。
- [ ] text wrap changes height。
- [ ] vstack child y 正确。
- [ ] hstack child x 正确。
- [ ] box border / padding contentRect 正确。
- [ ] overflow clip 设置 clip。
- [ ] scrollY clamp 正确。
- [ ] contentSize 基于 children union。
- [ ] fragment / show / for 结构正确。
- [ ] unsupported element 抛错或按计划处理。
- [ ] flexWrap 正确换行。
- [ ] gap 正确。
- [ ] alignItems 正确。
- [ ] justifyContent 正确。

### 30.5 renderer-terminal

- [ ] 多行 ASCII text snapshot。
- [ ] truncate text snapshot。
- [ ] styled multi-line text。
- [ ] clipped multi-line text。
- [ ] focused multi-line text。
- [ ] diff patch 不产生多余写入。
- [ ] 不把 ANSI escape 当成 supported input。

### 30.6 widgets / app

- [ ] createApp layoutEngine 注入。
- [ ] ScrollView wrapped text。
- [ ] ScrollView End / PageDown。
- [ ] List item wrapped subtitle。
- [ ] resize 后 text rewrap。
- [ ] `api.onLayout` 收到 rewrap 后的新 height。
- [ ] `onLayout` 中 set signal 进入下一轮 flush。
- [ ] real PTY 下渲染正常。

## 31. 风险与约束

### 31.1 Node 18 兼容

BindTTY 当前要求 Node `>=18`。需要确认：

```text
yoga-layout
string-width
widest-line
wrap-ansi
slice-ansi
cli-truncate
```

所选版本均支持 Node 18。

如果某些最新版本要求更高 Node 版本，优先选择兼容版本，而不是立即提高 BindTTY engine 要求。

### 31.2 Yoga ESM / WASM / native 包兼容

`yoga-layout` 可能带来 ESM、WASM 或平台相关差异。

缓解策略：

```text
1. 单独封装 yoga-engine.ts。
2. 保留 BasicLayoutEngine fallback。
3. CI 覆盖 Node 18。
4. 不让 vnode/runtime 直接依赖 Yoga。
```

### 31.3 Text layout 与 renderer 不一致

如果 layout 和 renderer 使用不同 wrap 算法，会产生错位。

缓解策略：

```text
BasicLayoutEngine、YogaLayoutEngine 和 renderer 都必须使用 @bindtty/text 的 layoutText()
```

### 31.4 Frame 无法表达 wide char

当前 Cell 模型无法正确表达 wide char / grapheme。

缓解策略：

```text
1. MVP 限定 plain ASCII-first。
2. CJK / emoji 降级为后续 hardening。
3. 单独设计 Frame wide-cell / grapheme 表示。
```

### 31.5 ANSI escape 不应进入 plain text value

当前 renderer 是 style model，不是 raw ANSI text model。

缓解策略：

```text
1. MVP 明确 text value 不支持内嵌 ANSI escape。
2. 样式通过 props / CellStyle 表达。
3. 后续如支持 ANSI，必须 strip 或 parse 成 style spans。
```

### 31.6 Fragment wrapper 影响 flex 语义

MVP 使用 wrapper node 可能导致 fragment 成为一个 flex item。

缓解策略：

```text
1. 先写测试暴露行为。
2. 如影响明显，第二阶段改为 flatten structure nodes。
```

### 31.7 Scroll contentSize 计算

Yoga computed height 不等于 scroll content height。

缓解策略：

```text
对 scroll container 单独基于 children union 或自然内容测量计算 contentSize。
```

### 31.8 性能

每次 layout 临时创建 Yoga tree 会有成本。

缓解策略：

```text
1. MVP 优先正确性。
2. 后续用 WeakMap 缓存 YogaNode。
3. 只在 layout dirty 时重新计算。
```

### 31.9 默认 text wrap 行为

默认保持 legacy single-line，但用户可能期待自动换行。

缓解策略：

```text
1. 文档明确默认行为。
2. 示例推荐长文本使用 wrap="wrap"。
3. 后续 major version 再考虑默认 wrap。
```

## 32. 推荐 PR 拆分

```text
PR 1: document scope alignment
  - plain text only
  - wide char / ANSI 降级
  - legacy newline/default 策略
  - app layoutEngine 注入计划

PR 2: packages/text
  - measureText
  - measureTextWidth
  - layoutText
  - legacy/wrap/truncate modes
  - Node 18 compatible deps
  - unit tests

PR 3: text.wrap + BasicLayoutEngine + renderer multi-line paint
  - vnode schema
  - JSX types
  - BasicLayoutEngine text measure
  - paintText
  - renderer snapshots

PR 4: createApp layoutEngine option
  - CreateAppOptions
  - layoutRoot engine passthrough
  - app tests

PR 5: createYogaLayoutEngine MVP
  - yoga-layout dependency
  - screen/vstack/hstack/box/text/spacer/show/for/fragment
  - LayoutNode output
  - freeRecursive

PR 6: ScrollView/contentSize under Yoga
  - clip/contentSize/scrollOffset
  - wrapped text inside ScrollView
  - fixed height scroll container
  - resize rewrap
  - api.onLayout validation

PR 7: Flex props
  - gap
  - flexWrap
  - flexGrow/flexShrink
  - alignItems
  - justifyContent

PR 8: default engine switch
  - layoutRoot 默认切 Yoga
  - BasicLayoutEngine legacy
  - docs/examples/e2e
```

## 33. 推荐结论

本阶段应采用：

```text
一个总计划
两个子计划
按总计划分阶段推进
```

具体执行顺序：

```text
0. 先明确 Frame wide-cell / ANSI 范围，MVP 收窄为 plain ASCII-first。
1. 做 @bindtty/text。
2. 接入 BasicLayoutEngine 与 renderer，而不是只改 renderer。
3. 增加 createApp layoutEngine 注入。
4. 实现 YogaLayoutEngine MVP。
5. 验证 Yoga 下 ScrollView / contentSize。
6. 开放 flex props。
7. 最后切默认 engine。
```

这样可以保证：

```text
@bindtty/text 可独立落地
BasicLayoutEngine 与 renderer 的多行语义一致
Yoga engine 可复用同一套 text measurement
createApp 可在默认切换前完整验证 Yoga
ScrollView 可验证新的 contentSize / scrollOffset
最终默认 engine 切换风险可控
```

不要把 text measurement、renderer multi-line、Yoga engine、flex props、ScrollView 验证全部混在一个大 PR 中。每个阶段都应有明确验收标准，并保持 `LayoutNode` 作为 layout 与 renderer 之间的稳定 contract。
