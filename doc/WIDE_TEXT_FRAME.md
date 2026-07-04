# Wide Text Frame 与 Grapheme 渲染落地计划

本文档描述 BindTTY 支持宽字符、grapheme cluster 和真实 terminal display width 的设计与落地计划。

本文档是 [YOGA_LAYOUT.md](./YOGA_LAYOUT.md) 的后续补充。`YOGA_LAYOUT.md` 中的 `@bindtty/text` 当前按 ASCII-first / plain text MVP 推进，暂不承诺 CJK、emoji、combining mark、grapheme cluster 的真实终端显示语义。本文档的目标是补齐这部分能力。

相关文档：

- [VNODE.md](./VNODE.md) — Template / MountedNode 类型设计
- [RUNTIME.md](./RUNTIME.md) — Template → MountedNode、binding、dirty、scheduler
- [LAYOUT.md](./LAYOUT.md) — MountedNode → LayoutNode
- [RENDERER.md](./RENDERER.md) — LayoutNode → Frame → ANSI Patch
- [YOGA_LAYOUT.md](./YOGA_LAYOUT.md) — Text Measurement 与 Yoga Layout
- [NODE_SETUP.md](./NODE_SETUP.md) — Element Ref / Layout Callback
- [M7_SCROLL_VIEWPORT.md](./M7_SCROLL_VIEWPORT.md) — ScrollView / List viewport 与 scroll 数据流

当前落地状态（2026-07-04）：

```text
阶段 1：已完成 @bindtty/text display width 基础。
阶段 2：已完成 wrap / truncate display-width 化。
阶段 3：已完成 Frame Cell width / placeholder。
阶段 4：已完成 renderer segment-based text write path。
阶段 5：已完成 diff / ANSI patch placeholder 支持。
阶段 6：已完成 layout / Yoga 回归。
阶段 7：已完成文档更新与 wide-text 示例。
```

## 1. 背景问题

当前 BindTTY 已经有：

```text
@bindtty/text
  layoutText()
  measureText()
  measureTextWidth()
  wrap / hard wrap / truncate

@bindtty/layout
  BasicLayoutEngine
  YogaLayoutEngine

@bindtty/renderer-terminal
  Frame
  Cell
  paintLayout()
  diffFrames()
  encodeAnsiPatch()

```

但当前文本链路仍然是 ASCII-first：

```text
measureTextWidth(text)
  当前等价于 text.length

renderer writeText
  当前按 JavaScript string index 写入 Cell

Frame Cell
  当前一列一个 { char, style }

```

这对 ASCII 是安全的：

```text
"A"      width 1
"abc"    width 3

```

但对真实 terminal text 不成立：

```text
"中"     JavaScript length 1，终端通常占 2 columns
"🙂"     JavaScript length 2，终端通常占 2 columns
"é"     JavaScript length 2，终端通常占 1 column

```

因此，宽字符支持不是单纯把 `measureTextWidth()` 改成 `string-width` 就能解决。它需要同时修改：

```text
text measurement
  ↓
text wrap / truncate / slice
  ↓
Frame cell representation
  ↓
renderer write path
  ↓
clip
  ↓
diff
  ↓
ANSI patch output

```

## 2. 参考：Ink 的实现方式

Ink 的方案可以作为主要参考，但不应照搬 React DOM / reconciler 层。

Ink 的关键思路：

```text
1. 使用 string-width / widest-line 测量 terminal display width。
2. 使用 wrap-ansi / cli-truncate / slice-ansi 处理 wrap、truncate、clip。
3. Text node 通过 Yoga measure function 参与 layout。
4. Output buffer 不是简单 char array，而是 StyledChar[][]。
5. 宽字符占多列时：
   - leading cell 存真实字符
   - trailing cell 存 value: "" 的 placeholder
6. 后续写入如果落在 placeholder 上，需要清理前一个 wide char。
7. 输出最终字符串时，placeholder 不作为普通字符输出。

```

BindTTY 应借鉴：

```text
string-width / widest-line
wrap-ansi / cli-truncate / slice-ansi
wide-char placeholder cell
overwrite cleanup
clip by display column

```

BindTTY 不应照搬：

```text
React reconciler
Ink DOM node
raw ANSI text as primary style model
@alcalzone/ansi-tokenize 作为 MVP 必需依赖

```

BindTTY 的 style model 是 `CellStyle`，不是 raw ANSI string。因此本阶段仍然保持：

```text
text value 是 plain text
style 通过 props / CellStyle 表达
不支持 text value 内嵌 ANSI escape

```

后续如要支持 ANSI text，应单独设计 rich text / styled spans。

## 3. 目标

本文档目标：

```text
Plain text string
  ↓ grapheme segmentation
TextSegment[]
  ↓ display width measurement
TextLayout
  ↓ renderer paint
Frame with wide-cell placeholders
  ↓ diff
FramePatch
  ↓ ANSI
terminal output

```

具体目标：

1. `@bindtty/text` 从 ASCII width 升级为 display-width-aware。
2. 支持 grapheme cluster 分割。
3. 支持 CJK 宽字符测量。
4. 支持 emoji 基本测量。
5. 支持 combining mark 不独立占列。
6. wrap / hard wrap / truncate 按 terminal display column 工作。
7. renderer 写入 text 时按 grapheme segment 写入，而不是按 JS string index。
8. Frame 能表达宽字符占多列。
9. diff 能正确处理宽字符新增、删除、覆盖。
10. ANSI patch 不输出 placeholder cell。
11. clip 不显示半个宽字符。
12. 保持 `LayoutNode` contract 不变。
13. 保持 Element Ref / `api.onLayout` 语义不变。
14. 保持 `text value` MVP 为 plain text，不支持内嵌 ANSI escape。

## 4. 非目标

本阶段不做：

```text
1. 不支持 text value 内嵌 ANSI escape。
2. 不引入 rich text span public API。
3. 不实现 bidi。
4. 不保证所有 terminal / font / emoji presentation 完全一致。
5. 不支持 zero-width joiner emoji sequence 的所有边界情况。
6. 不改变 LayoutNode 数据结构。
7. 不改变 YogaLayoutEngine 的 public API。
8. 不把 terminal-specific display width 暴露到 vnode 层。
9. 不让 @bindtty/vnode 依赖 string-width。
10. 不把 Ink DOM / reconciler 模型搬进 BindTTY。

```

## 5. 总体架构

新增或调整后的依赖关系：

```text
@bindtty/text
  depends on:
    string-width
    widest-line 或等价实现
    wrap-ansi 或自有 wrap
    cli-truncate 或自有 truncate
    slice-ansi 或 display-width slice util

@bindtty/layout
  imports @bindtty/text
  用 layoutText() 测量 text

@bindtty/renderer-terminal
  imports @bindtty/text
  用 segmentText() / layoutText() 写入 Frame

@bindtty/vnode
  不依赖 @bindtty/text implementation
  只暴露 text.wrap 类型

@bindtty/runtime
  不依赖 @bindtty/text

```

关键原则：

```text
layout 和 renderer 必须共享同一套 text layout 语义。
Frame 必须能表达 display column，不只是 JavaScript char。
diff 必须理解 wide-cell placeholder。
ANSI encoder 必须跳过 placeholder。

```

### 5.1 MVP 落地决策

为避免实现阶段出现分叉，本计划先固定以下决策：

```text
Node / module:
  继续使用当前 monorepo 的 ESM 输出。
  新依赖必须可在 Node 18 + TypeScript ESM 下直接 import。

display width oracle:
  @bindtty/text 引入 string-width。
  首选固定当前 Node 18 可用的 string-width 主版本。
  版本升级必须通过 CJK / emoji / combining mark 回归测试。

grapheme segmentation:
  优先使用 Intl.Segmenter("en", { granularity: "grapheme" })。
  如果运行环境没有 Intl.Segmenter，则 fallback 到 Array.from(text) 的 code point 分割。
  fallback 不承诺完整 combining mark / ZWJ 语义，只作为降级能力。

TextSegment width:
  MVP Frame 只支持 width 0 / 1 / 2。
  string-width 返回 < 0 时按 0 处理。
  string-width 返回 > 2 时 clamp 到 2。
  后续若要支持 width > 2，需要重新设计 placeholder 链和 diff range expansion。

ANSI escape:
  text value 仍按 plain text 处理。
  MVP 不把 ANSI escape 视为零宽控制序列。
  若需要 ANSI-aware text，另开 RichText / TextSpan 设计。
```

## 6. Terminology

### 6.1 Code unit

JavaScript string index 访问的是 UTF-16 code unit。

```ts
"🙂".length === 2

```

不能用 code unit 作为 terminal column。

### 6.2 Code point

Unicode scalar value。比 code unit 更接近字符，但仍不等于用户看到的字符。

### 6.3 Grapheme cluster

用户感知上的一个字符单元。

```text
"é" 可以是:
  "e" + combining acute accent

用户看到:
  一个 é

```

renderer 应尽量按 grapheme cluster 处理，而不是按 code unit。

### 6.4 Display width

一个 grapheme 在 terminal 中占多少 columns。

```text
"A"    width 1
"中"   width 2
"🙂"   width 2
"é"   width 1

```

### 6.5 Leading cell

宽字符的第一个 cell，保存实际 grapheme。

### 6.6 Placeholder cell

宽字符后续占用的 cell，不输出字符，只表示该 column 被前一个 wide grapheme 占用。

```text
"中" width 2

cell[x]     = leading cell: "中"
cell[x + 1] = placeholder cell: ""

```

## 7. @bindtty/text 设计

### 7.1 新增 TextSegment

```ts
export interface TextSegment {
  text: string;
  width: 0 | 1 | 2;
}

```

语义：

```text
text:
  一个 grapheme cluster

width:
  terminal display width

width = 0:
  理论上只用于不可见控制字符或被过滤后的 segment。
  MVP 可以不产生 width 0 segment。

```

### 7.2 新增 segmentText()

```ts
export function segmentText(text: string): TextSegment[];

```

示例：

```ts
segmentText("A中🙂é");

// roughly:
[
  { text: "A", width: 1 },
  { text: "中", width: 2 },
  { text: "🙂", width: 2 },
  { text: "é", width: 1 }
]

```

实现策略：

```text
优先:
  Intl.Segmenter("en", { granularity: "grapheme" })

fallback:
  按 Array.from(text) 分 code point

width:
  string-width(segment)
  clamp 到 0 / 1 / 2

```

注意：

```text
string-width 可能对某些 emoji sequence 返回 2。
对返回值 > 2 的 sequence，MVP 可 clamp 到 2。
后续如要支持 width > 2，需要扩大 Frame placeholder 模型。
segmentText() 必须过滤或保留控制字符的策略保持稳定：
  - 普通 newline 不在单行 segment 中处理，由 layoutText splitLines 处理。
  - 其他控制字符 MVP 可按 string-width 结果得到 width 0，renderer 不绘制。

```

### 7.3 measureTextWidth()

升级为：

```ts
export function measureTextWidth(text: string): number {
  return segmentText(text).reduce((width, segment) => width + segment.width, 0);
}

```

或直接使用 `string-width(text)`，但 wrap / slice 仍需要 segment-level 语义。

推荐：

```text
measureTextWidth(text)
  可以用 string-width(text)

layout / slice / truncate
  应使用 segmentText(text)

```

### 7.4 layoutText()

`layoutText()` 继续返回：

```ts
export interface TextLayout {
  width: number;
  height: number;
  lines: string[];
}

```

但内部必须按 display width 计算。

后续可增加可选调试字段：

```ts
export interface TextLayoutLine {
  text: string;
  width: number;
  segments: TextSegment[];
}

```

MVP 仍保持 public `lines: string[]`，避免影响 layout/renderer 边界。

### 7.5 sliceTextByWidth()

新增：

```ts
export function sliceTextByWidth(
  text: string,
  startColumn: number,
  endColumn: number
): string;

```

规则：

```text
startColumn / endColumn 使用 terminal display column。
如果 slice 会切到宽字符中间，则跳过该 grapheme。
不返回半个宽字符。

```

示例：

```text
text = "A中B"

columns:
  A   0..1
  中  1..3
  B   3..4

sliceTextByWidth(text, 0, 2)
  -> "A"
  因为 "中" 不能完整落入 0..2

sliceTextByWidth(text, 1, 3)
  -> "中"

sliceTextByWidth(text, 2, 4)
  -> "B"
  因为从 column 2 开始会切到 "中" 中间

```

### 7.6 truncate

truncate 也必须按 display width。

```ts
export function truncateEnd(text: string, width: number): string;
export function truncateMiddle(text: string, width: number): string;
export function truncateStart(text: string, width: number): string;

```

规则：

```text
输出 display width <= width
不切断 grapheme
ellipsis 按 display width 计算

```

### 7.7 wrap / hard wrap

wrap 必须按 display width。

```text
wrap:
  word wrap
  长 token 可 hard wrap
  不切断 grapheme

hard:
  只按 display width 切行
  不切断 grapheme

```

## 8. Frame / Cell 设计

### 8.1 当前问题

当前 Cell 大致是：

```ts
export interface Cell {
  char: string;
  style: CellStyle;
}

```

问题：

```text
1. char 只能表达一个普通列字符。
2. 无法表达一个 grapheme 占 2 columns。
3. 无法表达某个 cell 是 wide char 的 continuation。
4. diff 无法知道哪些 cell 是 placeholder。
5. ANSI encoder 可能错误输出 placeholder。
6. 覆盖 wide char 中间位置时无法清理前一个 leading cell。

```

### 8.2 推荐兼容型 Cell

为了降低迁移成本，保留 `char` 字段，但新增 `width`：

```ts
export interface Cell {
  char: string;
  style: CellStyle;
  width?: 0 | 1 | 2;
}

```

`width` 在 public 类型上保留可选，以兼容旧测试 helper 和手写 `FramePatch`；Frame 内部实际 cell 会在 `createFrame()` / `setCell()` / `diffFrames()` 路径归一为 `width: 0 | 1 | 2`。

语义：

```text
width = 1:
  普通 cell，char 是一个 display width 1 的 grapheme 或 " "

width = 2:
  wide char leading cell，char 是 display width 2 的 grapheme

width = 0:
  placeholder cell
  char 必须是 ""
  表示该 cell 被前一个 wide char 占用

```

示例：

```ts
// "A"
{ char: "A", width: 1, style }

// "中"
[
  { char: "中", width: 2, style },
  { char: "", width: 0, style }
]

// blank
{ char: " ", width: 1, style }

```

### 8.3 helper functions

新增：

```ts
export function createBlankCell(style?: CellStyle): Cell;

export function createTextCell(
  text: string,
  width: 1 | 2,
  style: CellStyle
): Cell;

export function createPlaceholderCell(style: CellStyle): Cell;

export function isPlaceholderCell(cell: Cell): boolean;

export function isWideLeadingCell(cell: Cell): boolean;

```

### 8.4 normalizeChar 改造

当前不应继续做：

```ts
char[0]

```

因为这会截断 emoji surrogate pair 和 grapheme。

新规则：

```text
setCell 不负责把任意 string 切成 char。
setCell 只接受已经规范化过的 Cell。
setCell 必须拒绝不规范 Cell，而不是静默截断或静默改写。
setCell 不自动写 placeholder；写入 width=2 leading cell 时，x + width 必须落在 frame 内。
写入 text 的地方必须先 segmentText()。
frame.writeText() 当前也是 text 写入入口，必须同步改为 segment-based，或在阶段 4 标记为仅测试/内部 helper 并改用统一 writeTextLineClipped()。

```

`normalizeCell()` 只做：

```text
1. width = 0 时 char 必须为 ""，否则抛错。
2. width = 1/2 时 char 必须是单个 grapheme。
3. width = 1/2 时 grapheme display width 必须匹配 cell.width。
4. width = 2 时必须完整落在 frame 内，否则抛错。
5. width 缺省时按 1 处理，用于兼容旧 ASCII helper。
6. style shallow clone。

```

## 9. Renderer 写入算法

### 9.1 当前写入问题

当前写入逻辑类似：

```ts
for (let offset = 0; offset < text.length; offset += 1) {
  setCell(frame, x + offset, y, {
    char: text[offset],
    style
  });
}

```

这必须改成 segment-based：

```ts
for (const segment of segmentText(text)) {
  writeSegment(frame, x, y, segment, style, context);
  x += segment.width;
}

```

### 9.2 writeSegment()

```ts
function writeSegment(
  frame: Frame,
  x: number,
  y: number,
  segment: TextSegment,
  style: CellStyle,
  context: PaintContext
): void {
  if (segment.width <= 0) {
    return;
  }

  if (!canDrawWholeSegment(x, y, segment.width, context.clip)) {
    return;
  }

  clearCellsForWrite(frame, x, y, segment.width);

  setCell(frame, x, y, {
    char: segment.text,
    width: segment.width,
    style
  });

  for (let offset = 1; offset < segment.width; offset += 1) {
    setCell(frame, x + offset, y, {
      char: "",
      width: 0,
      style
    });
  }
}

```

### 9.3 canDrawWholeSegment()

规则：

```text
如果 grapheme 任意一列超出 clip，则整个 grapheme 不绘制。
不绘制半个 wide char。

```

```ts
function canDrawWholeSegment(
  x: number,
  y: number,
  width: number,
  clip: LayoutRect
): boolean {
  return (
    y >= clip.y &&
    y < clip.y + clip.height &&
    x >= clip.x &&
    x + width <= clip.x + clip.width
  );
}

```

这比 partial rendering 更保守，但简单稳定。

### 9.4 clearCellsForWrite()

写入任何 segment 前，必须清理目标区域内可能存在的旧 wide char。

```ts
function clearCellsForWrite(
  frame: Frame,
  x: number,
  y: number,
  width: number
): void {
  for (let col = x; col < x + width; col += 1) {
    clearWideCellAt(frame, col, y);
  }
}

```

### 9.5 clearWideCellAt()

```ts
function clearWideCellAt(frame: Frame, x: number, y: number): void {
  const cell = getCell(frame, x, y);

  if (!cell) {
    return;
  }

  if (cell.width === 2) {
    setBlank(frame, x, y);
    setBlank(frame, x + 1, y);
    return;
  }

  if (cell.width === 0) {
    const leadingX = findWideLeadingCell(frame, x, y);

    if (leadingX !== null) {
      setBlank(frame, leadingX, y);
      setBlank(frame, leadingX + 1, y);
    }

    return;
  }

  setBlank(frame, x, y);
}

```

MVP 支持 width 2，因此 `findWideLeadingCell()` 只需要检查 `x - 1`：

```ts
function findWideLeadingCell(frame: Frame, x: number, y: number): number | null {
  const previous = getCell(frame, x - 1, y);

  if (previous?.width === 2) {
    return x - 1;
  }

  return null;
}

```

如果未来支持 width > 2，再扩展向左扫描。

## 10. paintText 设计

`paintText()` 继续使用 `layoutText()` 得到 lines：

```ts
const textLayout = layoutText(text, {
  width: node.rect.width,
  wrap
});

const lines = textLayout.lines.slice(0, node.rect.height);

```

但每行写入不再使用 `.slice()` 或 JS index。

旧逻辑：

```ts
writeTextClipped(
  frame,
  x,
  y,
  line.slice(0, node.rect.width),
  style,
  context
);

```

新逻辑：

```ts
writeTextLineClipped(
  frame,
  x,
  y,
  line,
  node.rect.width,
  style,
  context
);

```

`writeTextLineClipped()` 内部：

```text
1. segmentText(line)
2. 按 display width 累计 column
3. 如果 segment 完整落入 node width + clip，则写入
4. 如果 segment 会超出 node width，则停止
5. 不写半个 segment

```

## 11. Clip 语义

### 11.1 基本规则

```text
clip 以 terminal columns 为单位。
wide char 必须完整落入 clip 才能绘制。
不绘制半个 wide char。

```

### 11.2 示例

```text
clip width = 1
text = "中"

结果:
  不绘制 "中"

```

```text
clip width = 2
text = "中"

结果:
  绘制 "中"
  x     leading
  x + 1 placeholder

```

```text
clip x = 1..3
text at x = 0: "A中B"

columns:
  A  0..1
  中 1..3
  B  3..4

结果:
  绘制 "中"

```

```text
clip x = 2..4
text at x = 0: "A中B"

结果:
  不绘制 "中"
  绘制 "B"

```

## 12. Diff 设计

### 12.1 当前问题

当前 diff 如果只比较 `{ char, style }`，会把 placeholder 当普通 cell。这样会导致：

```text
1. placeholder 被错误输出。
2. 覆盖 wide char 的半边时产生残留。
3. clear wide char 时只清一列。

```

### 12.2 新 diff 原则

```text
1. Cell equality 必须比较 char、width、style。
2. placeholder cell 参与 dirty 判断，但不应作为可输出字符。
3. 如果 old 或 new 的某个 cell 属于 wide char 区域，diff 应覆盖整个 wide char 区域。
4. ANSI encoder 输出时跳过 placeholder。

```

### 12.3 affected range expansion

当某个 cell 变化时，需要扩大影响范围：

```ts
function markChangedCell(x: number, y: number): void {
  mark(x, y);

  const oldCell = previous.getCell(x, y);
  const newCell = next.getCell(x, y);

  markWideRange(previous, x, y, oldCell);
  markWideRange(next, x, y, newCell);
}

```

对于 width 2：

```text
leading cell changed:
  mark x and x + 1

placeholder changed:
  mark x - 1 and x

```

这样可以保证：

```text
旧 wide char 被清理完整。
新 wide char 被输出完整。

```

### 12.4 FramePatch 是否需要改变

MVP 可以保持现有 `CellChange`：

```ts
export interface CellChange {
  x: number;
  y: number;
  cell: Cell;
}

```

但 encoder 必须知道：

```text
cell.width = 0
  不输出字符

```

如果 patch 中包含 placeholder change，encoder 可以跳过它，因为 leading cell 的输出已经占据对应列。

但为了清理旧 wide char，diff 必须保证 blank cell 也被输出到旧 wide char 的 leading/trailing 范围。

### 12.5 dirty set 去重与排序

`diffFrames()` 建议先收集 dirty cell 坐标，再统一生成 patch：

```text
1. 遍历 previous / next 对应 cell。
2. cell 不相等时 markChangedCell(x, y)。
3. markChangedCell() 同时扩展 old/new wide range。
4. dirty 坐标用 Set 去重，key = `${y}:${x}`。
5. 越界坐标直接忽略。
6. 最终按 y 升序、x 升序生成 changes。
7. 每个 change.cell 从 next frame clone。
```

这样可以保证：

```text
patch 顺序稳定。
placeholder 不会重复进入 patch 多次。
旧 wide char 被普通字符、空格或另一个 wide char 覆盖时，相关列都被纳入 patch。
```

full frame patch：

```text
createFullFramePatch(next)
  可以包含 placeholder cell。
  ANSI encoder 会跳过 placeholder。
  frameToDebugLines() 可用于验证 placeholder 位置。
```

## 13. ANSI encoder 设计

### 13.1 输出规则

```text
width = 1:
  输出 char

width = 2:
  输出 char
  终端 cursor 自然前进 2 columns

width = 0:
  不输出 char
  不移动 cursor

```

### 13.2 patch 排序

如果 patch 内同时包含 wide leading cell 和 placeholder cell，encoder 应：

```text
1. 按 y, x 排序。
2. 遇到 width=2 leading cell，输出 char。
3. 下一个 placeholder cell 如果紧随其后，跳过。
4. 遇到 width=0 且没有对应 leading cell，也跳过。

```

### 13.3 清理旧 wide char

如果旧 frame 是：

```text
x     "中" width 2
x + 1 ""   width 0

```

新 frame 是：

```text
x     "A" width 1
x + 1 "B" width 1

```

diff 应产生两个 changed cells：

```text
x     "A"
x + 1 "B"

```

encoder 会输出 `A` 和 `B`，完整覆盖旧宽字符区域。

如果新 frame 是：

```text
x     " " width 1
x + 1 " " width 1

```

encoder 输出两个 spaces，完整清理旧宽字符。

## 14. frameToLines / 测试快照

`frameToLines()` 应跳过 placeholder cell 的 `char`：

```ts
function frameToLines(frame: Frame): string[] {
  ...
  line += cell.width === 0 ? "" : cell.char;
}

```

这会让：

```text
Frame:
  [ { char: "中", width: 2 }, { char: "", width: 0 } ]

frameToLines:
  "中"

```

注意：

```text
frameToLines() 返回的是显示字符串，不是固定 columns 字符串。
如果测试需要验证列数，应新增 frameToDebugLines()。

```

建议新增：

```ts
export function frameToDebugLines(frame: Frame): string[];

```

输出：

```text
"中·"

```

其中 `·` 表示 placeholder，便于测试。

## 15. Layout 与 Yoga 关系

`LayoutNode.rect.width` 仍然是 terminal columns。

宽字符支持后：

```text
layoutText("中").width === 2

```

因此：

```tsx
<text value="中" />

```

在 layout 中应该得到：

```text
width = 2
height = 1

```

Yoga measure function 不需要知道 Frame placeholder，只需要依赖 `layoutText()` 的 width/height。

也就是说：

```text
@bindtty/text
  负责 display width

@bindtty/layout
  只消费 width/height

@bindtty/renderer-terminal
  负责把 display width 写入 Frame cells

```

## 16. ScrollView 关系

ScrollView 依赖 `LayoutNode.contentSize`、`scrollOffset`、`contentRect`。

宽字符支持后：

```text
contentSize.width
  应按 display columns 计算

contentSize.height
  应按 wrapped lines 计算

```

例如：

```tsx
<box width={4} overflow="clip">
  <text value="中中中" wrap="hard" />
</box>

```

期望：

```text
"中中" width 4
"中"   width 2

contentSize.height = 2

```

ScrollView 的垂直滚动逻辑不需要特殊处理宽字符，但 horizontal scroll / clip 需要依赖 renderer 的 whole-grapheme clipping。

## 17. ANSI escape 策略

本阶段仍然不支持：

```tsx
<text value="\x1b[31mred\x1b[0m" />

```

原因：

```text
BindTTY renderer 是 Frame/style 模型。
style 应通过 props / CellStyle 表达。
raw ANSI escape 不是普通字符。

```

MVP 处理策略：

```text
1. text value 被视为 plain text。
2. 如果用户传入 ANSI escape，它会按普通字符处理或被视为 unsupported。
3. 不承诺 ANSI escape 不计宽。

```

推荐后续单独设计：

```text
Rich Text / ANSI Span Support

```

可能方向：

```text
A. strip ANSI:
   只保留纯文本，不保留颜色

B. parse ANSI:
   解析成 TextSpan[]
   TextSpan = { text, style }
   renderer 写入时合并 span style 与 props style

```

## 18. 包与文件改动

### 18.1 @bindtty/text

依赖：

```text
packages/text/package.json
  dependencies:
    string-width: 固定 Node 18 可用主版本
```

修改：

```text
packages/text/src/types.ts
packages/text/src/width.ts
packages/text/src/measure.ts
packages/text/src/layout.ts
packages/text/src/wrap.ts
packages/text/src/truncate.ts
packages/text/src/index.ts

```

新增：

```text
packages/text/src/segment.ts
packages/text/src/slice.ts

```

建议导出：

```ts
export interface TextSegment {
  text: string;
  width: 0 | 1 | 2;
}

export function segmentText(text: string): TextSegment[];

export function sliceTextByWidth(
  text: string,
  startColumn: number,
  endColumn: number
): string;

```

### 18.2 @bindtty/renderer-terminal

修改：

```text
packages/renderer-terminal/src/types.ts
packages/renderer-terminal/src/frame.ts
packages/renderer-terminal/src/paint.ts
packages/renderer-terminal/src/diff.ts
packages/renderer-terminal/src/ansi.ts

```

新增可选：

```text
packages/renderer-terminal/src/wide-cell.ts

```

注意：

```text
packages/renderer-terminal/src/frame.ts 中现有 writeText() 必须同步改造。
如果阶段 4 决定不再保留 writeText() 作为 public helper，应在 index exports 和测试中移除或改名为内部 helper。
```

### 18.3 @bindtty/layout

通常不需要改 API。

需要确认：

```text
BasicLayoutEngine 使用 layoutText()
YogaLayoutEngine 使用 layoutText()
contentSize 使用 display-width-aware layout result

```

### 18.4 docs

新增：

```text
doc/WIDE_TEXT_FRAME.md

```

更新：

```text
doc/YOGA_LAYOUT.md
doc/RENDERER.md

```

## 19. 分阶段落地

## 阶段 1：Text display width 基础

目标：让 `@bindtty/text` 能按 display width 测量和切分文本。

任务：

- [x] 引入 `string-width`，并固定 Node 18 + ESM 可用版本。
- [x] 新增 `TextSegment`。
- [x] 新增 `segmentText()`。
- [x] `measureTextWidth()` 改为 display width。
- [x] `measureText()` 使用 display width。
- [x] 新增 `sliceTextByWidth()`。
- [x] 保持 text value plain text。
- [x] 不支持 ANSI escape。

验收：

- `measureTextWidth("A") === 1`
- `measureTextWidth("中") === 2`
- `measureTextWidth("🙂") === 2`
- `measureTextWidth("é") === 1`
- `segmentText("A中")` 返回 width 1 + width 2
- `segmentText()` 对 width > 2 的 grapheme clamp 到 2
- `segmentText()` 在没有 `Intl.Segmenter` 时仍能按 code point fallback
- `sliceTextByWidth()` 不返回半个宽字符

## 阶段 2：Wrap / truncate display-width 化

目标：让 wrap / hard wrap / truncate 按 display columns 工作。

任务：

- [x] `hardWrapLine()` 按 segment width 切行。
- [x] `wordWrapLine()` 按 display width 判断行宽。
- [x] `truncateEnd()` 按 display width 截断。
- [x] `truncateMiddle()` 按 display width 截断。
- [x] `truncateStart()` 按 display width 截断。
- [x] 所有操作不切断 grapheme。

验收：

- `"中中中"` width 4 hard wrap -> `["中中", "中"]`
- `"A中B"` width 3 hard wrap -> `["A中", "B"]`
- truncate 不产生半个 emoji
- truncate 输出 display width <= target width

## 阶段 3：Frame Cell 增加 width / placeholder

目标：Frame 能表达宽字符占多列。

任务：

- [x] `Cell` 增加 `width: 0 | 1 | 2`。
- [x] blank cell 使用 `char: " ", width: 1`。
- [x] placeholder cell 使用 `char: "", width: 0`。
- [x] wide leading cell 使用 `width: 2`。
- [x] `createBlankCell()` 更新。
- [x] `cloneCell()` 更新。
- [x] 移除或改造 `normalizeChar(char[0])`。
- [x] 新增 `isPlaceholderCell()`。
- [x] 新增 `isWideLeadingCell()`。
- [x] 更新 `frameToLines()`。
- [x] 新增 `frameToDebugLines()`。

验收：

- 创建空 Frame 时所有 cell 都是 width 1。
- `setCell()` 不截断 emoji surrogate pair。
- placeholder cell 不出现在 `frameToLines()` 字符串中。
- debug snapshot 能看出 placeholder。

## 阶段 4：Renderer text write path 改为 segment-based

目标：renderer 能正确写入宽字符。

任务：

- [x] `writeTextClipped()` 改为按 `segmentText()` 写。
- [x] 写入宽字符时创建 leading + placeholder。
- [x] 写入前清理目标区域已有 wide char。
- [x] 如果写入落在旧 placeholder 上，清理旧 leading cell。
- [x] 如果写入覆盖旧 leading cell，清理旧 placeholder。
- [x] clipping 时不绘制半个 segment。
- [x] `paintText()` 不再使用 `.slice(0, node.rect.width)`。
- [x] `frame.writeText()` 同步改为 segment-based。

验收：

- 写入 `"中"` 后 frame 有 leading + placeholder。
- 在 `"中"` 的第二列写 `"A"` 会先清理 `"中"`。
- 用 `"AB"` 覆盖 `"中"` 后 frame 正确。
- 用 `"中"` 覆盖 `"AB"` 后 frame 正确。
- clip width 1 不绘制 `"中"`。
- clip width 2 绘制完整 `"中"`。

## 阶段 5：Diff / ANSI patch 支持 placeholder

目标：diff 和 ANSI output 不输出 placeholder，也不会留下半个宽字符。

任务：

- [x] `cellEquals()` 比较 `char`、`width`、`style`。
- [x] diff 发现 wide-related cell 变化时扩大 dirty range。
- [x] dirty range 使用 Set 去重，并按 y/x 稳定排序。
- [x] 旧 frame 中 wide char 被覆盖时，patch 覆盖完整范围。
- [x] 新 frame 中 wide char 出现时，patch 输出 leading cell。
- [x] ANSI encoder 跳过 `width: 0` placeholder。
- [x] ANSI encoder 对 width 2 的 char 只输出一次。
- [x] 清理旧 wide char 时输出足够 spaces。

验收：

- `"中"` -> `"AB"` 输出能清理完整。
- `"AB"` -> `"中"` 输出不多写 placeholder。
- `"中"` -> `" "` 输出清理两列。
- placeholder 不被单独 ANSI 输出。
- repeated render unchanged 返回空 patch。

## 阶段 6：Layout / Yoga 回归

目标：确认 layout 与 renderer 对 display width 一致。

任务：

- [x] BasicLayoutEngine wrapped text 使用 display width。
- [x] YogaLayoutEngine text measure 使用 display width。
- [x] `contentSize.width` 使用 display columns。
- [x] wrapped text in ScrollView 高度正确。
- [x] resize rewrap 高度正确。

验收：

- `<text value="中" />` layout width 2。
- `<text value="中中中" wrap="hard" />` 在 width 4 下 height 2。
- Yoga measure 与 renderer paint 行数一致。
- ScrollView contentSize.height 正确。
- resize 后 rewrap 正确。

## 阶段 7：文档与示例

任务：

- [x] 更新 `doc/RENDERER.md` 的 Frame/Cell 说明。
- [x] 更新 `doc/YOGA_LAYOUT.md` 中 ASCII-first 的限制。
- [x] 新增 `doc/WIDE_TEXT_FRAME.md`。
- [x] 新增 CJK text 示例。
- [x] 新增 emoji text 示例。
- [x] 明确 ANSI escape 仍不属于 text value MVP。

## 20. 测试清单

### 20.1 @bindtty/text

- ASCII width。
- CJK width。
- emoji width。
- combining mark width。
- grapheme segmentation。
- width > 2 clamp 到 2。
- Intl.Segmenter fallback。
- newline height。
- wrap CJK。
- hard wrap CJK。
- truncate CJK。
- truncate emoji。
- slice by display width。
- 不返回半个 grapheme。

### 20.2 renderer-terminal/frame

- blank cell width 1。
- wide leading cell width 2。
- placeholder cell width 0。
- frameToLines 跳过 placeholder。
- frameToDebugLines 显示 placeholder。
- setCell 不截断 grapheme。
- writeText 不按 JS string index 截断 surrogate pair。

### 20.3 renderer-terminal/paint

- paint `"中"`。
- paint `"A中B"`。
- paint emoji。
- paint combining mark。
- clip wide char left boundary。
- clip wide char right boundary。
- overwrite leading cell。
- overwrite placeholder cell。
- focusStyle 覆盖 wide char 两列。
- background fill 不破坏 placeholder。

### 20.4 renderer-terminal/diff

- ASCII -> CJK。
- CJK -> ASCII。
- CJK -> blank。
- CJK -> CJK。
- placeholder 不单独输出。
- dirty range 去重且按 y/x 稳定排序。
- full frame patch 可以包含 placeholder，但 ANSI 输出跳过 placeholder。
- unchanged frame returns empty patch。
- partially overwritten wide char 被清理完整。

### 20.4.1 renderer-terminal/ansi

- width 1 输出 char。
- width 2 只输出 leading char。
- width 0 placeholder 不输出且不移动 cursor。
- wide leading + placeholder 连续出现在 patch 时，只输出一次 char。
- 清理旧 wide char 时输出足够空格覆盖两列。

### 20.5 layout

- BasicLayoutEngine text CJK width。
- YogaLayoutEngine text CJK width。
- wrapped CJK text height。
- wrapped emoji text height。
- ScrollView contentSize with CJK text。
- resize rewrap with CJK text。

### 20.6 app/e2e

- terminal mode renders CJK。
- terminal mode renders emoji。
- ScrollView scrolls wrapped CJK text。
- focus inverse covers wide char cells。
- repeated render does not emit dirty patch。
- resize full repaint handles wide char.

## 21. 风险与约束

### 21.1 Terminal / font 差异

不同 terminal / font 对 emoji width 可能不同。

策略：

```text
使用 string-width 作为 BindTTY 的标准 width oracle。
不保证所有 terminal 字体完全一致。
测试以 string-width 结果为准。

```

### 21.2 Emoji sequence

复杂 emoji sequence 可能涉及 ZWJ。

策略：

```text
MVP 支持常见 emoji。
复杂 ZWJ sequence 作为后续 hardening。

```

### 21.3 placeholder patch 复杂度

placeholder cell 影响 diff/patch。

策略：

```text
先实现简单正确的 dirty range expansion。
必要时牺牲一点 patch 最小化。
优先保证输出正确。

```

### 21.4 ANSI text

Ink 支持 ANSI-aware tokenize/slice，但 BindTTY 当前不是 raw ANSI text model。

策略：

```text
本阶段不支持 text value 内嵌 ANSI。
后续通过 TextSpan / RichText 单独设计。

```

### 21.5 Backward compatibility

`Cell` 类型新增 `width` 字段会影响测试和内部工具。

策略：

```text
createBlankCell() 提供默认 width。
测试 helper 统一更新。
对外尽量不暴露 Frame 细节为稳定 public API。

```

## 22. 推荐 PR 拆分

```text
PR 1: @bindtty/text display-width segments
  - add segmentText()
  - add TextSegment
  - use string-width
  - add sliceTextByWidth()
  - tests for CJK / emoji / combining

PR 2: wrap/truncate by display width
  - hard wrap by segment width
  - word wrap by segment width
  - truncate by segment width
  - tests

PR 3: Frame wide-cell model
  - Cell.width
  - placeholder cells
  - frame helpers
  - frameToLines / frameToDebugLines
  - tests

PR 4: renderer segment write path
  - writeTextClipped by segment
  - wide char placeholders
  - overwrite cleanup
  - whole-grapheme clipping
  - paint tests

PR 5: diff / ansi patch
  - diff wide range expansion
  - skip placeholder in ANSI encoder
  - clear old wide char fully
  - patch tests

PR 6: layout / Yoga / ScrollView regression
  - BasicLayoutEngine display width
  - YogaLayoutEngine display width
  - ScrollView CJK / emoji tests
  - app/e2e tests

PR 7: docs and examples
  - doc/WIDE_TEXT_FRAME.md
  - update RENDERER.md
  - update YOGA_LAYOUT.md
  - examples/wide-text

```

## 23. 推荐结论

BindTTY 支持宽字符时，不能只改 text measurement。

正确路线是：

```text
1. @bindtty/text 支持 grapheme + display width。
2. wrap / truncate / slice 按 display columns 工作。
3. Frame Cell 支持 width 与 placeholder。
4. renderer 按 segment 写入，不按 JS string index 写入。
5. clip 不显示半个宽字符。
6. diff 扩大 wide-char dirty range。
7. ANSI encoder 跳过 placeholder。
8. layout / renderer 共用同一套 display-width 语义。

```

Ink 的实现最值得借鉴的是：

```text
string-width / widest-line 做 display width
wrap-ansi / cli-truncate / slice-ansi 做 terminal text 操作
Output buffer 中用 value: "" placeholder 表示 wide char 的后续列
覆盖 placeholder 时清理前一个 wide char leading cell

```

BindTTY 应借鉴这些底层策略，但保持自己的架构：

```text
MountedNode
  ↓ LayoutNode
  ↓ Frame
  ↓ FramePatch
  ↓ ANSI Patch

```

本阶段完成后，`@bindtty/text` 才能从 ASCII-first 升级为 display-width-first，renderer 才能稳定支持 CJK、emoji、combining mark 和 grapheme cluster。
