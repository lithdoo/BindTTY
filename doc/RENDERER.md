# @bindtty/renderer-terminal 落地设计

本文档描述 `@bindtty/renderer-terminal` 的第一阶段设计。它承接 `@bindtty/layout` 输出的 `LayoutNode`，把布局树转换成终端可写入的 ANSI patch。

相关文档：

- [VNODE.md](./VNODE.md) — Template / MountedNode 类型设计
- [RUNTIME.md](./RUNTIME.md) — Template → MountedNode、binding、dirty、scheduler
- [LAYOUT.md](./LAYOUT.md) — MountedNode → LayoutNode
- [INTERACTION.md](./INTERACTION.md) — keyboard focus 与 `isFocused` 查询
- [DESIGN.md](./DESIGN.md) — 视图树总体设计
- [TUI_IMPLEMENTATION_PLAN.md](./TUI_IMPLEMENTATION_PLAN.md) — 实现计划与里程碑

## 1. 目标

renderer 的目标是回答终端输出问题：

```text
LayoutNode + previous Frame
  ↓ render
ANSI Patch
```

runtime 已经回答：

```text
界面有哪些节点
props 当前值是什么
哪些 MountedNode dirty 了
```

layout 已经回答：

```text
每个节点占多大
每个节点放在哪里
父子节点的布局关系是什么
```

renderer 负责回答：

```text
每个格子显示什么字符
每个格子使用什么样式
和上一帧相比哪些格子变了
应该向 terminal 写入哪些 ANSI 序列
```

第一版 renderer 只处理纯输出。它不负责：

```text
1. layout 计算
2. signal / binding / dirty subscription
3. keyboard input
4. interaction focus manager
5. interactive widget behavior
6. terminal raw mode 生命周期
7. scrollback / alternate screen 策略
```

这些能力分别由 runtime、layout、`@bindtty/interaction`、`@bindtty/widgets`、`bindtty` createApp 层处理。

当前包边界已经建立：

```text
packages/renderer-terminal
```

## 2. 包位置

路径：

```text
packages/renderer-terminal
```

当前包结构（完整实现）：

```text
packages/renderer-terminal/
  src/
    index.ts
    frame.ts
    paint.ts
    style.ts
    diff.ts
    ansi.ts
    renderer.ts
    types.ts
  test/
  package.json
  tsconfig.json
  README.md
```

早期计划中的最小包骨架仅含 `index.ts`，已扩展为上述模块。

模块职责：

```text
types.ts
  对外类型：Frame、Cell、Style、RenderOptions、TerminalRenderer

frame.ts
  创建空帧、写入 cell、裁剪坐标、序列化测试快照

paint.ts
  LayoutNode → Frame

diff.ts
  previous Frame + next Frame → FramePatch

ansi.ts
  FramePatch → ANSI string

renderer.ts
  持有 previous Frame，提供 render() / reset()
```

## 3. 输入与输出

输入：

```ts
LayoutNode | null
```

viewport：

```ts
export interface RenderViewport {
  width: number;
  height: number;
}
```

输出：

```ts
string
```

建议 API：

```ts
export interface RenderOptions {
  viewport: RenderViewport;
  isFocused?: (mounted: MountedNode) => boolean;
}

export interface TerminalRenderer {
  render(root: LayoutNode | null, options: RenderOptions): string;
  reset(): void;
}

export function createTerminalRenderer(): TerminalRenderer;
```

使用方式：

```ts
const runtime = createRuntimeRoot(view);
const renderer = createTerminalRenderer();
const interaction = createInteractionController();

runtime.onFlush(({ root }) => {
  const layoutTree = layoutRoot(root, {
    viewport: {
      width: terminal.columns,
      height: terminal.rows
    }
  });

  const patch = renderer.render(layoutTree, {
    viewport: {
      width: terminal.columns,
      height: terminal.rows
    },
    isFocused: (mounted) => interaction.isFocused(mounted)
  });

  terminal.write(patch);
  runtime.clearDirty();
});
```

`isFocused` 是可选项。未传入时 renderer 按全部未 focused 处理。

MVP 默认 focused 输出策略：

```text
focused mounted element
  -> 对该 LayoutNode rect 内 cell 叠加 inverse: true
  -> 保留已有 foreground / background / bold / underline 等样式
  -> focus 变化会导致 Frame style diff，进而产生 ANSI patch
```

该默认策略必须允许按节点关闭，供 TextInput 等复杂控件自行绘制 focused 样式：

```ts
// focusStyle 已实现，类型内联在 PaintStyle 中（非独立导出）
export interface PaintStyle {
  focusStyle?: "inverse" | "none";
  // ... 其他 paint 字段
}
```

注意：`focusStyle` 在 vnode schema 中作为 `commonElementProps` 共享，layout 忽略它，renderer 通过 `readPaintStyle()` 解析。TextInput 通过 `focusStyle="none"` 关闭默认 inverse，然后自己通过 `onFocusChange` + signal 手动控制 cursor 样式的反显。

规则：

```text
focusStyle 未设置:
  等价于 "inverse"，保持 Button 等简单控件现有行为。

focusStyle = "inverse":
  focused 时 renderer 对该 LayoutNode rect 叠加 inverse。

focusStyle = "none":
  focused 时 renderer 不自动叠加 inverse。
  控件可通过 onFocusChange + signal + 自己的 paint props 手动实现 focused 样式。
```

TextInput 应使用 `focusStyle="none"` 放在接收 `onKey` 的外层 `box` 上，避免外层 box 的整块 focused inverse 覆盖内部 cursor 样式。

`render()` 是有状态的：它会保存上一帧，用于下一次 diff。`reset()` 清空上一帧，适用于终端 resize、进入 alternate screen、清屏后重绘等场景。

## 4. 与其它模块的接口调用

renderer 不直接挂到 runtime，也不直接拥有 terminal。组合由 `bindtty` 包的 `createApp()` 完成。

### 4.1 import 方向

包之间的依赖方向应保持单向：

```text
@bindtty/runtime
  import @bindtty/vnode
  不 import @bindtty/layout
  不 import @bindtty/renderer-terminal

@bindtty/layout
  import @bindtty/vnode
  不 import @bindtty/runtime
  不 import @bindtty/renderer-terminal

@bindtty/renderer-terminal
  import @bindtty/layout
  不 import @bindtty/runtime
  不 import @bindtty/interaction
  不 import process.stdout

bindtty / app layer
  import @bindtty/runtime
  import @bindtty/layout
  import @bindtty/renderer-terminal
  import @bindtty/interaction
  负责把三者组合起来
```

也就是说：

```text
runtime 不知道 layout / renderer
layout 不知道 renderer
renderer 不知道 runtime
app layer 负责调度整条链路
```

### 4.2 flush 调用链

runtime flush 时，app layer 读取 viewport，调用 layout，再调用 renderer，最后写 stdout。

示例：

```ts
import { layoutRoot } from "@bindtty/layout";
import { createTerminalRenderer } from "@bindtty/renderer-terminal";
import { createRuntimeRoot } from "@bindtty/runtime";
import { createInteractionController } from "@bindtty/interaction";

const runtime = createRuntimeRoot(view);
const renderer = createTerminalRenderer();
const interaction = createInteractionController();

function readViewport(stdout: { columns?: number; rows?: number }) {
  return {
    width: stdout.columns ?? 80,
    height: stdout.rows ?? 24
  };
}

runtime.onFlush(({ root }) => {
  const viewport = readViewport(process.stdout);
  interaction.refresh(root);
  const layoutTree = layoutRoot(root, { viewport });
  const patch = renderer.render(layoutTree, {
    viewport,
    isFocused: (mounted) => interaction.isFocused(mounted)
  });

  process.stdout.write(patch);
  runtime.clearDirty();
});
```

职责划分：

```text
runtime.onFlush
  通知 mounted tree 发生变化

readViewport
  读取 terminal 当前尺寸

layoutRoot
  MountedNode + viewport → LayoutNode

renderer.render
  LayoutNode + viewport + optional isFocused → ANSI string

stdout.write
  app layer 写入 terminal

runtime.clearDirty
  app layer 在 layout / render 完成后清理 dirty
```

### 4.3 resize 调用链

terminal resize 不由 renderer 监听。app layer 监听 resize，然后用当前 runtime root 重新 layout / render。

示例：

```ts
process.stdout.on("resize", () => {
  const viewport = readViewport(process.stdout);
  const layoutTree = layoutRoot(runtime.root, { viewport });

  renderer.reset();

  const patch = renderer.render(layoutTree, {
    viewport,
    isFocused: (mounted) => interaction.isFocused(mounted)
  });
  process.stdout.write(patch);
});
```

resize 时调用 `renderer.reset()` 的原因：

```text
1. previous frame 的尺寸已经不可信。
2. 新 viewport 应该生成完整 next frame patch。
3. app layer 可以在 reset 前后决定是否 clear screen。
```

renderer 自己仍然不主动 clear screen，也不监听 resize。

### 4.4 null root 调用链

当 runtime root 变成 `null`，app layer 仍然应该调用 renderer：

```ts
const layoutTree = layoutRoot(null, { viewport });
const patch = renderer.render(layoutTree, { viewport });
process.stdout.write(patch);
```

此时 `renderer.render(null, { viewport })` 会生成空白 Frame，并通过 diff 清理 previous frame 中的旧内容。

### 4.5 测试层组合

renderer 包内测试不需要真实 runtime，也不需要真实 terminal。

推荐分层：

```text
renderer unit tests:
  手写 LayoutNode 或使用测试 helper
  断言 Frame / Patch / ANSI

cross-package integration tests:
  jsx-runtime + runtime + layout + renderer
  断言 signal change 后最终 frame / ansi patch 变化

future app tests:
  createApp 组合 stdout mock
  断言 flush / resize / dispose 调用顺序
```

这样 renderer MVP 可以先独立交付，后续再在 app 层补完整生命周期。

### 4.6 LayoutNode 消费 contract

renderer 只消费 `@bindtty/layout` 输出的 `LayoutNode`，不参与 layout 计算。

renderer 可以依赖 layout 提供以下保证：

```text
1. node.rect 是绝对坐标。
2. node.contentRect 是绝对坐标。
3. child.rect / child.contentRect 不需要再相对父节点换算。
4. contentRect.width / contentRect.height 不为负数。
5. 非 box 节点 contentRect = rect。
6. box 节点 contentRect 已经扣除 border / padding。
7. fragment / show / for 会保留 LayoutNode，但自身不产生可绘制内容。
8. layout 可以产生超出 parent / viewport 的 rect。
9. renderer 按 viewport 做最终裁剪。
```

renderer 的读取方式：

```text
node.mounted
node.mounted.kind
node.mounted.tag
node.mounted.props
node.rect
node.contentRect
node.children
```

MVP 不要求 `@bindtty/layout` 提供额外 helper：

```ts
isLayoutElement(node)
getLayoutTag(node)
getLayoutProps(node)
```

如果 renderer 实现中出现明显重复判断，再抽 helper。第一版直接消费 `LayoutNode` 结构即可。

## 5. Frame 模型

renderer 内部先把 `LayoutNode` paint 成完整 `Frame`，再和上一帧做 diff。

```text
LayoutNode
  ↓ paint
Frame
  ↓ diff(previous, next)
FramePatch
  ↓ encodeAnsi
ANSI string
```

核心类型：

```ts
export interface Frame {
  width: number;
  height: number;
  cells: Cell[];
}

export interface Cell {
  char: string;
  style: CellStyle;
}

export interface CellStyle {
  foreground?: string;
  background?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
}
```

第一版 `cells` 可以是一维数组：

```text
index = y * width + x
```

空白 cell：

```ts
{
  char: " ",
  style: {}
}
```

第一版只支持单宽字符。宽字符、emoji、组合字符、East Asian Width 先作为后续能力。

## 6. Paint 规则

paint 阶段从根 `LayoutNode` 开始深度优先绘制：

```text
paint node background / border
paint node content
paint children
```

子节点后绘制，因此子节点可以覆盖父节点 content 区域。

第一版支持的 tag：

```text
screen
vstack
hstack
box
text
spacer
fragment
show
for
```

绘制语义：

```text
screen
  不额外绘制，只作为根容器，递归 children

vstack / hstack
  不额外绘制，只递归 children

box
  绘制 background / border，然后递归 children

text
  在 rect 内写入 value 文本

spacer
  不绘制

fragment / show / for
  不绘制自身，只递归 children
```

`text` 第一版规则：

```text
1. 读取 props.value。
2. 转成 string。
3. 只写入单行。
4. 超出 rect.width 的部分裁剪。
5. 不做 wrapping。
6. 不解析 ANSI。
```

`box` 第一版规则：

```text
background:
  如果 props.background 存在，填充 rect 内所有 cell 的 background。

border:
  如果 props.border 为 true 或 number > 0，绘制单线边框。

children:
  children 已经由 layout 放入 contentRect，paint 只按 child.rect 绘制。
```

边框字符建议：

```text
┌ ┐ └ ┘ ─ │
```

如果要保持纯 ASCII 输出模式，后续可以提供：

```ts
borderStyle: "single" | "ascii"
```

MVP 默认可以使用 Unicode 单线边框，因为 TUI 用户通常期待这种表现。

## 7. 实现判定规则

本节用于消除实现时的歧义。MVP 代码和测试都应按这些规则落地。

### 7.1 viewport 是唯一 Frame 尺寸来源

renderer 不主动读取终端尺寸。`Frame` 的宽高只来自 `RenderOptions.viewport`：

```ts
renderer.render(layoutTree, {
  viewport: {
    width,
    height
  }
});
```

即使 `LayoutNode.rect` 超出 viewport，最终也只能写入 viewport 范围内的 cell。

规则：

```text
1. createFrame(width, height) 使用 viewport.width / viewport.height。
2. paint 时所有坐标写入都经过 setCell()。
3. setCell() 对越界坐标静默裁剪，不抛错。
4. width <= 0 或 height <= 0 时，创建空 cells 的 Frame。
```

### 7.2 null root 生成空白 Frame

`render(null, options)` 不直接返回空字符串，而是生成一个空白 Frame，再与上一帧 diff。

原因：

```text
1. 根 show 消失时需要清除旧画面。
2. runtime root dispose 后需要把 terminal viewport 恢复为空白。
3. 行为与普通 LayoutNode paint 保持一致。
```

规则：

```text
previous = null, next = blank frame
  输出完整空白 patch

previous = non-empty frame, next = blank frame
  输出清除旧内容所需 patch

previous = blank frame, next = blank frame
  输出空字符串
```

### 7.3 rect 越界与负坐标

正常情况下 layout 不应产生负坐标，但 renderer 需要防御。

规则：

```text
1. rect.x / rect.y 可以小于 0。
2. rect 可以超过 viewport。
3. paint 不抛错。
4. 只有落在 viewport 内的 cell 会被写入。
```

示例：

```text
viewport: 4x1
text rect: x=-2, width=5, value="hello"

visible frame:
llo 
```

### 7.4 box 小尺寸 border

`box` 的 border 需要定义小尺寸行为，避免实现和测试摇摆。

规则：

```text
width <= 0 或 height <= 0
  不绘制

width == 1 且 height == 1
  绘制 "│"

width == 1 且 height > 1
  每行绘制 "│"

width > 1 且 height == 1
  绘制一行 "─"

width >= 2 且 height >= 2
  绘制完整单线边框
```

完整单线边框：

```text
┌──┐
│  │
└──┘
```

### 7.5 text 写入规则

`text` 第一版只处理单行、单宽字符。

规则：

```text
1. props.value 为 null 或 undefined 时视为 ""。
2. 其他值使用 String(value)。
3. 遇到 "\n" 时只绘制第一行。
4. 超出 rect.width 的部分裁剪。
5. rect.width <= 0 或 rect.height <= 0 时不绘制。
6. 只写入 rect 的第一行，不做 wrapping。
```

### 7.6 style 归一化与比较

写入 `CellStyle` 前先做样式归一化。`diffFrames()` 判断 cell 是否变化时比较归一化后的可见样式：

```text
char
foreground
background
bold
dim
italic
underline
inverse
```

规则：

```text
1. boolean style 只有 true 才写入 CellStyle。
2. false / undefined 都表示未启用该样式。
3. color alias 在写入 CellStyle 前归一化为 foreground。
4. style 使用字段级比较。
5. 不依赖 JSON.stringify。
6. 两个空 style 对象相等。
```

### 7.7 ANSI 输出策略

MVP 不做相邻 cell 合并，逐 cell 输出即可。

规则：

```text
1. 每个 change 输出一次 cursor move。
2. 每个 change 输出完整 style 序列。
3. 然后输出 cell.char。
4. patch.changes 为空时返回 ""。
5. patch.changes 非空时末尾输出 "\x1b[0m"。
```

完整 style 序列表示：

```text
先 reset 当前样式
再输出 cell.style 需要启用的样式
```

这样每个 cell 都不依赖前一个 cell 的样式状态。后续做 run 合并时，可以把 reset / style 切换优化掉。

这样输出不一定最短，但行为最容易测试。后续可以在不改变 `FramePatch` 类型的前提下做 run 合并。

### 7.8 颜色支持范围

MVP 支持 ANSI 8 色和 bright 8 色命名。

支持 foreground / color：

```text
black
red
green
yellow
blue
magenta
cyan
white
gray
brightBlack
brightRed
brightGreen
brightYellow
brightBlue
brightMagenta
brightCyan
brightWhite
```

支持 background 使用同一组颜色名。

规则：

```text
1. color 是 foreground 的别名。
2. color 与 foreground 同时出现时抛错。
3. 不支持的颜色名抛错。
4. hex / rgb / 256-color 后续再支持。
```

### 7.9 尺寸变化

当 previous frame 与 next frame 尺寸不同：

```text
1. diffFrames() 生成 next frame 的全量 changes。
2. renderer 保存 next frame。
3. renderer 不主动 clear screen。
```

不主动 clear screen 的原因：

```text
1. renderer 不拥有 terminal 生命周期。
2. app 层可以决定是否 clear screen / alternate screen。
3. MVP 测试可以只关注 viewport 内完整覆盖。
```

## 8. 样式 Props

renderer 只读取绘制相关 props，不读取布局 props。

第一版建议支持：

```ts
export interface PaintStyle {
  color?: string;
  foreground?: string;
  background?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  focusStyle?: "inverse" | "none";
  border?: boolean | number;
  borderColor?: string;
}
```

命名约定：

```text
1. TypeScript 用户推荐 camelCase。
2. 同时支持 kebab-case alias。
3. renderer 内部统一归一化为 camelCase。
4. camelCase 与 kebab-case 同时出现且指向同一字段时，抛错。
```

示例：

```tsx
<text value="Error" color="red" bold />
<box border border-color="cyan" />
```

`color` 与 `foreground` 的关系：

```text
color 是 foreground 的别名。
color 与 foreground 同时出现时，抛错。
```

## 9. Diff 与 ANSI Patch

第一版 diff 可以按 cell 比较：

```text
for y in height
  for x in width
    if previous.cell != next.cell
      emit changed cell
```

Patch 类型：

```ts
export interface FramePatch {
  width: number;
  height: number;
  changes: CellChange[];
}

export interface CellChange {
  x: number;
  y: number;
  cell: Cell;
}
```

ANSI 编码规则：

```text
1. 移动光标到 change.x / change.y。
2. 设置 cell.style。
3. 写入 cell.char。
4. 相邻同样式 cell 后续可合并，MVP 可以先不合并。
5. patch 末尾 reset style。
```

第一版可以使用 1-based terminal cursor：

```text
\x1b[{row};{col}H
```

其中：

```text
row = y + 1
col = x + 1
```

当 previous frame 为空、尺寸变化或调用 `reset()` 后：

```text
1. 生成完整 next frame patch。
2. 不主动 emit clear screen。
3. 保存 next frame 为 previous frame。
```

MVP 推荐先不强制清屏，而是完整覆盖 viewport 内 cell。这样测试更稳定，也减少 renderer 对 terminal 生命周期的假设。

## 10. Dirty 模型对接

runtime 已经维护 dirty MountedNode。renderer 第一版不直接消费 dirty queue，而是消费 layout 后的完整 `LayoutNode`。

原因：

```text
1. API 简单，容易验证。
2. viewport resize 时天然可以整帧重算。
3. dirty node 到 cell rect 的映射需要 layout 结果，过早增量化会增加复杂度。
4. Frame diff 已经能避免重复写入未变化 cell。
```

第一版链路：

```text
runtime flush
  ↓
layoutRoot(root)
  ↓
renderer.render(layoutTree)
  ↓
terminal.write(ansiPatch)
```

后续优化可以加入：

```text
1. dirty rect 收集
2. subtree paint
3. line diff
4. ANSI run 合并
5. style state machine
```

这些优化不改变 `createTerminalRenderer().render()` 的对外接口。

## 11. Terminal 边界

`@bindtty/renderer-terminal` 只生成字符串，不直接拥有 `process.stdout`。

第一版不做：

```text
process.stdout.write
stdin raw mode
alternate screen
hide / show cursor 生命周期
resize event subscription
```

这些应由未来 app 层负责：

```ts
const app = createApp(view, {
  stdout: process.stdout,
  stdin: process.stdin
});
```

renderer 保持为纯可测试模块：

```text
LayoutNode → ANSI string
```

这样可以在测试中直接断言 frame、patch、ANSI，而不需要真实 terminal。

## 12. MVP 落地阶段

### 阶段 1：Frame 基础设施

目标：

```text
1. 定义 Frame / Cell / CellStyle / FramePatch 类型。
2. 实现 createFrame(width, height)。
3. 实现 getCell / setCell / writeText。
4. 实现 frameToLines() 方便测试。
```

验证：

```text
1. 空帧填充空格。
2. 写入越界时裁剪。
3. 单行文本写入稳定。
4. width <= 0 或 height <= 0 时创建空 cells。
```

### 阶段 2：Paint LayoutNode

目标：

```text
1. 实现 paintLayout(root, viewport)。
2. 支持 screen / vstack / hstack / text / spacer。
3. 支持 fragment / show / for 透明绘制。
4. 支持 box background / border。
```

验证：

```text
1. text 能按 layout rect 写入。
2. box border 能正确绘制四角和边。
3. children 覆盖父级 background。
4. fragment / show / for 不额外占绘制层。
5. null root 生成空白 Frame。
6. 负坐标和越界 rect 被裁剪。
7. 小尺寸 box border 行为稳定。
```

### 阶段 3：Diff

目标：

```text
1. 实现 diffFrames(previous, next)。
2. 支持 previous 为 null。
3. 支持 frame 尺寸变化。
```

验证：

```text
1. 首帧全量输出 changes。
2. 相同帧输出空 changes。
3. 单 cell 改变只输出一个 change。
4. 尺寸变化触发全量输出。
5. cell 比较覆盖 char 和所有 style 字段。
```

### 阶段 4：ANSI 编码

目标：

```text
1. 实现 encodeAnsiPatch(patch)。
2. 支持 cursor move。
3. 支持基础颜色和文本样式。
4. patch 末尾 reset style。
```

验证：

```text
1. 坐标使用 1-based row / col。
2. 样式能被编码。
3. 无 changes 输出空字符串。
4. 有 changes 时末尾输出 reset style。
5. 不支持的颜色名抛错。
```

### 阶段 5：TerminalRenderer

目标：

```text
1. 实现 createTerminalRenderer()。
2. render() 内部完成 paint → diff → ansi。
3. 保存 previous frame。
4. reset() 清空 previous frame。
```

验证：

```text
1. 首次 render 输出完整 patch。
2. 第二次同内容 render 输出空字符串。
3. 内容变化只输出变化 patch。
4. reset 后再次 render 输出完整 patch。
5. render(null) 能清掉 previous frame。
```

## 13. 测试用例建议

单元测试：

```text
frame:
  createFrame
  writeText clipping
  negative coordinate clipping
  zero-size frame
  frameToLines

paint:
  text
  text null / undefined value
  text newline first line only
  box border
  box small border sizes
  background
  transparent controls
  null root blank frame

diff:
  null previous
  equal frames
  changed cell
  changed style
  false style equals absent style
  resized frame

ansi:
  cursor move
  style encode
  empty patch
  reset suffix
  unsupported color

renderer:
  stateful previous frame
  reset
  render null clears previous frame
```

集成测试：

```text
runtime + layout + renderer:
  signal change 更新 text 后只输出变化 cell
  show branch switch 后输出新 branch 区域
  for keyed reorder 后输出变化后的 frame
```

第一版测试优先断言 `frameToLines()`，ANSI 字符串只覆盖关键序列。这样测试更接近用户看到的画面，也避免过早绑定 ANSI 优化策略。

## 14. 当前结论

renderer 适合从 MVP 阶段就独立分包。

原因：

```text
1. layout 默认已接入 Yoga，复杂度与 renderer 分离。
2. renderer 的核心复杂度在 Frame / diff / ANSI，与 layout backend 无关。
3. 独立包可以稳定 `LayoutNode → ANSI Patch` 接口。
4. 测试可以分别验证几何正确性和绘制正确性。
5. 未来支持非终端 renderer 时，不需要重构 layout。
```

第一版接口保持克制：

```text
createTerminalRenderer()
renderer.render(layoutTree, { viewport })
renderer.reset()
```

先保证完整 frame 与 cell diff 正确，再逐步优化 dirty rect、line diff、ANSI run 合并。

## M7 当前实现：Clip Stack 与 Scroll Offset

renderer 已支持 `LayoutNode.clip` 与 `LayoutNode.scrollOffset`：

```text
paint root with terminal viewport clip
  node.clip 与父 clip 求交集
  当前节点 background / border 使用父 clip 绘制
  children 使用交集 clip 绘制
  children 坐标应用 -scrollOffset
```

当前行为：

1. text / background / border / focused inverse 都走同一套 clipped cell write。
2. scroll offset 只移动 children，不移动当前 box 的 border/background。
3. offset 变化仍走普通 frame diff，不引入特殊 scroll patch。
4. mock E2E 已覆盖静态 clip、signal offset、ScrollView 键盘滚动和动态 List。
