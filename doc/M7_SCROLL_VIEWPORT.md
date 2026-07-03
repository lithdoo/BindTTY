# Milestone 7：Scroll / Viewport / List 计划与设计

本文档汇总 BindTTY **Milestone 7** 的目标、分层设计、稳定接口契约、实现阶段与验收标准。M1–M7 主链路已完成；M7 是「从可运行 demo 到可承载真实长内容 UI」的关键一步。

当前状态：**已落地**。实现包括 `box` clip/scroll layout props、renderer clip stack、`ScrollView`、`List`、mock E2E 覆盖；虚拟化、scrollbar、stickToBottom 仍为后续增强。

相关文档：

- [TUI_IMPLEMENTATION_PLAN.md](./TUI_IMPLEMENTATION_PLAN.md) — 全项目里程碑与优先级
- [DESIGN.md](./DESIGN.md) — 视图树与 binding 模型
- [LAYOUT.md](./LAYOUT.md) — LayoutNode、overflow 预留
- [RENDERER.md](./RENDERER.md) — Frame、viewport 裁剪、paint 规则
- [VNODE.md](./VNODE.md) — intrinsic tag 扩展点
- [INTERACTION.md](./INTERACTION.md) — focus 与 key dispatch
- [WIDGETS.md](./WIDGETS.md) — 高层控件边界
- [APP.md](./APP.md) — createApp 编排链
- [E2E_TESTING.md](./E2E_TESTING.md) — 测试策略

---

## 1. 背景与目标

### 1.1 为什么需要 M7

当前框架已支持：

- TSX 声明、signal 驱动增量更新
- 终端 lifecycle、focus、Button、TextInput
- 单层 viewport（终端宽高）内的 layout + ANSI diff

尚不支持：

- **内容高度超过可见区域**时的裁剪与滚动
- **长列表 / 日志流**的稳定渲染与更新
- **键盘滚动**与 focus 的协同

没有这些能力，BindTTY 只能做表单、计数器等小界面，难以承载日志面板、菜单列表、聊天记录等典型 TUI 场景。

### 1.2 M7 目标（第一版）

| 目标 | 说明 |
| --- | --- |
| **Clip** | 子内容超出容器时，只绘制可见区域 |
| **Scroll offset** | 用 signal 驱动垂直（优先）滚动偏移 |
| **Scroll 控件** | 用户可声明 `ScrollView` widget |
| **List 场景** | 动态 `items` + `ScrollView` 的组合用法 |
| **键盘滚动** | ↑/↓（及可选 PgUp/PgDn）改变 offset |
| **测试** | 每层单测 + mock E2E；real PTY 保持 smoke |

### 1.3 非目标（M7 不做）

- 虚拟列表 / 窗口化 mount（留 M7+ 或 M8）
- 水平滚动（可预留 API，实现可后置）
- 鼠标滚轮、触摸
- margin / gap / flex grow 等高级 layout（见 [TUI_IMPLEMENTATION_PLAN.md](./TUI_IMPLEMENTATION_PLAN.md) 后续项）
- Unicode 宽字符 / emoji grapheme 精确测量（单列后续里程碑）
- scrollback buffer / 终端历史回滚（与 alternate screen 策略不同）

---

## 2. 术语

避免与现有「viewport」混淆：

| 术语 | 含义 | 所在层 |
| --- | --- | --- |
| **Terminal viewport** | `stdout.columns` × `stdout.rows`，整屏尺寸 | `@bindtty/terminal`、`createApp` |
| **Layout viewport** | 传给 `layoutRoot(root, { viewport })` 的约束 | `@bindtty/layout` |
| **Clip rect** | 某容器分配给子树的可见矩形（content 区域） | `LayoutNode` |
| **Scroll offset** | 子内容相对 clip 原点的位移 `(offsetX, offsetY)` | scroll 容器 |
| **Content size** | 子树自然测量高度/宽度（可大于 clip） | layout measure 阶段 |

关系：

```text
Terminal viewport（整屏）
  └─ layout 树
       └─ scroll 容器（clip rect = 可见窗口，例如 10 行）
            └─ 子内容（content height 可能 = 100 行）
                 paint 时应用 offset，renderer 按 clip 裁剪
```

---

## 3. 分层职责

M7 改动应**自下而上**，尽量不动 `@bindtty/signal` 与 runtime 核心调度模型。

```text
@vnode / @bindtty/jsx-runtime
  M7 第一版不新增 intrinsic tag；只需要允许 box 接收新增 layout metadata props

@bindtty/layout
  measure：子树自然尺寸
  arrange：scroll 容器 content rect + clip bounds
  输出 LayoutNode 携带 clip / scrollOffset 元数据

@bindtty/renderer-terminal
  paint：绘制时应用 scroll offset
  setCell：按 clip rect 裁剪（在 terminal viewport 裁剪之上）

@bindtty/interaction
  scroll 容器或 ScrollView widget 消费 ↑/↓/PgUp/PgDn
  与 focus 链协同：focus 在内部可编辑控件上时优先交给 TextInput

@bindtty/widgets（推荐）
  ScrollView / List 作为高层 API，内部组合 box + metadata props + onKey

bindtty createApp
  无结构性变更；仍 layoutRoot → render → write
```

原则（与 [RENDERER.md](./RENDERER.md) §7 一致）：

- **layout 可产生超出 parent 的 rect**；**renderer 负责最终裁剪**
- **Terminal viewport 仍是 Frame 全屏尺寸来源**；scroll 是 layout 树内的子窗口
- **M7 第一版只落地 widget API**；不新增 `<scroll>` / `<list>` intrinsic，避免扩大 vnode 与 JSX runtime 的表面积

### 3.1 对外 API 决策

M7 第一版统一采用：

```tsx
import { ScrollView, List } from "@bindtty/widgets";
```

不采用：

```tsx
<scroll />
<list />
```

原因：

1. 当前 vnode intrinsic tag 是闭合集合，新增 tag 会同时影响 vnode schema、jsx runtime、layout、renderer、文档与测试。
2. `ScrollView` 可以先编译成普通 `box`，通过内部 metadata props 驱动 layout / renderer。
3. 未来若需要 `<scroll>` intrinsic，可以在保持 `ScrollView` API 不变的前提下把内部实现替换为 intrinsic。

### 3.2 内部 metadata prop 决策

`ScrollView` 第一版渲染为：

```tsx
<box
  id={props.id}
  height={props.height}
  width={props.width}
  overflow="clip"
  scrollX={0}
  scrollY={props.offset}
  onKey={computed onKey}
  onFocusChange={props.onFocusChange}
>
  {props.children}
</box>
```

这些 props 进入 intrinsic element，但不是用户直接书写的公共基础控件 API：

| Prop | dirty | 归属 | 说明 |
| --- | --- | --- | --- |
| `height` | layout | layout | 固定可见高度，M7 必须支持 |
| `width` | layout | layout | 可选；未传时使用父级可用宽度 |
| `overflow` | layout | layout / renderer | M7 只支持 `"visible"` 与 `"clip"`，默认 `"visible"` |
| `scrollX` | layout | layout / renderer | 预留，M7 固定为 0 |
| `scrollY` | layout | layout / renderer | 垂直滚动 offset，layout clamp 后输出给 renderer |

`height` / `width` 同时作为未来通用 layout props 的第一步。M7 只实现固定数值，不实现百分比、flex、min/max 系列。

---

## 4. 数据流

### 4.1 静态 offset（切片 A/B）

```text
scrollY signal 变化
  ↓ binding 更新 scroll 节点 props
  ↓ runtime dirty
  ↓ createApp flush
  ↓ layoutRoot（读取新 offset，排列子节点）
  ↓ renderer.paint（子坐标 - offset，clip 到容器）
  ↓ ANSI diff → terminal.write
```

### 4.2 键盘滚动（切片 C）

```text
stdin key (↑)
  ↓ terminal adapter → TerminalKeyEvent
  ↓ interaction.handleKey
  ↓ ScrollView onKey
  ↓ 基于上一轮 layout appliedY / maxY / pageY 计算 nextOffset
  ↓ onOffsetChange(nextOffset)
  ↓ 外部 signal.set(nextOffset)
  ↓ 同上 binding dirty 链
```

### 4.3 动态 list（切片 D）

```text
items signal push 新行
  ↓ for 节点 structure dirty
  ↓ layout remeasure content height
  ↓ scroll 容器 content size 增大
  ↓ 若 offset 贴底策略：自动 scrollY 跟随到底（可选行为，文档写清）
```

---

## 5. 稳定接口契约

### 5.1 LayoutNode 扩展（内部）

布局引擎向 renderer 传递裁剪与滚动信息。M7 第一版固定字段名如下：

```ts
export interface LayoutClip {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutScrollState {
  x: number;
  y: number;
}

export interface LayoutSize {
  width: number;
  height: number;
}

export interface LayoutNode {
  // ...现有字段
  clip?: LayoutClip;                 // 绘制子树时裁剪边界；默认继承父级 clip
  scrollOffset?: LayoutScrollState;  // 绘制子树前应用的位移；已由 layout clamp
  contentSize?: LayoutSize;          // 子树自然尺寸；用于测试、调试、未来 scrollbar
}
```

语义：

1. `clip` 使用绝对坐标，与 `rect` / `contentRect` 同坐标系。
2. `scrollOffset` 只影响 children 的绘制位置，不移动当前节点自己的背景与边框。
3. `contentSize` 是 children 未被 clip 截断时的自然尺寸。
4. `scrollOffset.y` 必须在 layout 阶段 clamp，renderer 不再二次 clamp，只负责按值绘制。
5. 非 scroll 节点不写 `scrollOffset`；普通 clip 节点可只写 `clip`。

### 5.2 vnode / JSX schema 变更

`box` 的 schema 增加这些 layout props：

```ts
box: {
  props: {
    height: { dirty: "layout" },
    width: { dirty: "layout" },
    overflow: { dirty: "layout" },
    scrollX: { dirty: "layout" },
    scrollY: { dirty: "layout" }
  }
}
```

TSX 类型同步增加：

```ts
interface IntrinsicBoxStyleProps {
  border?: BindingValue<boolean | number>;
  padding?: BindingValue<number>;
  height?: BindingValue<number>;
  width?: BindingValue<number>;
  overflow?: BindingValue<"visible" | "clip">;
  scrollX?: BindingValue<number>;
  scrollY?: BindingValue<number>;
}
```

规则：

1. `height` / `width` 只接受非负数值；非法值按 0 处理或复用现有 `toNonNegativeNumber`。
2. `overflow` 只支持 `"visible"` / `"clip"`；其它值抛错，避免 silent behavior。
3. `scrollY` 改变必须触发布局，因为 clamp 依赖 `contentSize` 与 `clip.height`。
4. 这些 props 初期只在 `box` 支持；`vstack` / `hstack` 后续再扩展。

### 5.3 ScrollView 控件（用户面向）

`@bindtty/widgets` 提供 `ScrollView`，不新增 intrinsic tag。

```tsx
import { createSignal } from "@bindtty/signal";
import { ScrollView } from "@bindtty/widgets";

const offset = createSignal(0);

<ScrollView height={10} offset={offset}>
  <vstack>
    <for each={logs} key={(line) => line.id}>
      {(line) => <text value={line.text} />}
    </for>
  </vstack>
</ScrollView>
```

`ScrollView` props：

| Prop | 类型 | 说明 |
| --- | --- | --- |
| `id` | `BindingValue<string | number>` | 可选 focus id |
| `offset` | `BindingValue<number>` | 垂直偏移（行），默认 0 |
| `height` | `BindingValue<number>` | 可见高度（行），必填 |
| `width` | `BindingValue<number>` | 可选，默认撑满父级 |
| `children` | `Template` | 可滚动内容 |
| `scrollOnArrow` | `BindingValue<boolean>` | 是否在 focus 于容器时响应方向键，默认 true |
| `onOffsetChange` | `(nextOffset: number) => void` | 键盘滚动时写回外部状态 |
| `onFocusChange` | `InteractionNodeFocusChangeEvent => void` | 透传到内部 box |

受控规则：

1. `offset` 是外部状态来源，`ScrollView` 不拥有自己的长期 offset state。
2. 键盘滚动时，如果提供 `onOffsetChange`，调用它；如果没有提供，则 `ScrollView` 只是静态裁剪容器，不进入 focus list。
3. `onOffsetChange` 接收下一次用户意图值；键盘滚动基于上一轮 layout 输出的 applied offset / max offset 计算 next，而不是基于可能越界的原始 `offset`。
4. layout 不会隐式反写用户传入的 `offset` signal；若外部 `offset` 越界，画面按 layout clamp 后的 applied offset 渲染，用户状态保持受控。
5. 若业务希望精确知道 applied scroll state，后续可以增加 `onScrollStateChange`，M7 不做。

### 5.4 List 场景（用户面向）

M7 不强制新 `<list>` intrinsic；推荐 **composition**：

```tsx
<ScrollView height={12} offset={scrollY}>
  <for each={items} key={(item) => item.id}>
    {(item) => <Row item={item} />}
  </for>
</ScrollView>
```

`List` 是可选语法糖，归属 `@bindtty/widgets`：

```tsx
<List
  height={12}
  offset={scrollY}
  items={items}
  getKey={(item) => item.id}
  render={(item) => <text value={item.label} />}
/>
```

内部仍是 `ScrollView` + `<for>`；**第一版 List 可以是语法糖，不做虚拟化**。

`List` MVP props：

| Prop | 类型 | 说明 |
| --- | --- | --- |
| `items` | `BindingValue<readonly T[]>` | 列表数据 |
| `getKey` | `(item: T, index: number) => string | number` | 稳定 key，转发给内部 `<for key={...}>` |
| `render` | `(item: T, index: number) => Template` | 行渲染 |
| `height` | `BindingValue<number>` | 转发给 `ScrollView` |
| `offset` | `BindingValue<number>` | 转发给 `ScrollView` |
| `onOffsetChange` | `(nextOffset: number) => void` | 转发给 `ScrollView` |

不做 `selectedIndex`、虚拟化、滚动条、行复用；这些进入后续里程碑。

---

## 6. Layout 设计要点

### 6.1 新增 prop 读取规则

在 `@bindtty/layout` 中增加这些读取 helper：

```ts
readOptionalSize(value: unknown): number | undefined
readOverflow(value: unknown): "visible" | "clip"
readScrollOffset(value: unknown): number
```

规则：

1. `undefined` / `null` 表示未设置。
2. `height` / `width` 若设置，使用 `Math.floor` + 非负 clamp。
3. `overflow` 未设置时为 `"visible"`。
4. `scrollX` / `scrollY` 未设置时为 0。
5. `scrollX` M7 只读取并输出 0；若用户传非 0，可以 clamp 为 0，避免暗示水平滚动已可用。

### 6.2 Measure

scroll 容器：

1. 用 `height`（及可选 `width`）约束 **可见区域**（clip rect）
2. 对 children 做 **无高度上限**（或极大上限）的 measure，得到 **content height**
3. `contentHeight` 记录于节点，供 clamp offset 与滚动条逻辑使用

普通 `box`：

1. 没有 `height` / `width` 时保持现有自然尺寸。
2. 设置 `height` 时，box 外部 `rect.height = height`；children 仍按自然高度 measure。
3. 设置 `width` 时，box 外部 `rect.width = width`；children 的可用宽度使用 content width。
4. `padding` / `border` 仍按现有逻辑扣减 contentRect。

### 6.3 Arrange

1. 容器 `rect` = 父级分配到的区域（或固定 height）
2. `clip` = 容器 content 区域（扣除 border/padding 后）
3. 子节点按正常 flow 排列，**不因 clip 而截断 measure 结果**
4. `scrollOffset.y` clamp 到 `[0, max(0, contentHeight - clip.height)]`
5. 设置 `overflow="clip"` 的节点输出 `clip = contentRect`
6. 设置 `scrollY` 的节点输出 `scrollOffset = { x: 0, y: clampedOffset }`
7. 设置 `overflow="clip"` 或 `scrollY` 的节点都输出 `contentSize`

### 6.4 Flow 与结构节点

`fragment` / `show` / `for` 仍是 transparent layout node：

1. 当它们作为 root 节点时，默认 column flow。
2. 当它们位于父级内部时，沿用父级 flow。
3. 它们不主动产生 clip / scrollOffset。
4. 如果 `for` 的 children 高度超过外层 `ScrollView`，由外层 box 的 clip 裁剪。

### 6.5 与现有 BasicLayoutEngine 的关系

- 只在 `box` 上增加 `height` / `width` / `overflow` / `scrollX` / `scrollY`
- 不实现 `maxHeight`，避免与未来 min/max layout props 混在一起
- 不改变 `screen` 占满 terminal viewport 的语义
- 参考 [LAYOUT.md](./LAYOUT.md) §10.4：children 可超出 parent，overflow 由 renderer/scroll 处理
- `contentSize` 可由 arrange 阶段重新 measure children 得出；M7 优先正确性，不先做 measure cache

---

## 7. Renderer 设计要点

在 [RENDERER.md](./RENDERER.md) 已有规则上扩展：

### 7.1 绘制顺序

```text
paint(node, context):
  nextClip = intersect(context.clip, node.clip ?? context.clip)
  paint current node background / border in context.clip

  childContext = {
    clip: nextClip,
    offsetX: context.offsetX - (node.scrollOffset?.x ?? 0),
    offsetY: context.offsetY - (node.scrollOffset?.y ?? 0)
  }

  paint children with childContext
```

### 7.2 裁剪

- `setCell(x, y)` 前检查：cell 是否在当前 **clip rect** 与 **terminal viewport** 交集内
- 负坐标、部分可见字符按现有 §7.3 防御性处理
- 当前节点自身的 border/background 不受自身 scrollOffset 影响，只受父级 clip 影响
- children 的坐标在绘制前应用 scroll offset

### 7.3 renderer 内部结构

新增内部类型即可，不需要暴露到 public API：

```ts
interface PaintContext {
  clip: LayoutRect;
  offsetX: number;
  offsetY: number;
}
```

`paintText` / `paintBox` / `paintFocusedState` 从 context 读取 offset 和 clip：

1. 对真实写入坐标使用 `node.rect.x + offsetX` / `node.rect.y + offsetY`。
2. `writeText` 需要支持 clip，可以新增 `writeTextClipped`，也可以在 paint 层逐 cell 写入。
3. `fillRect`、border、focused inverse 都必须走同一套 `setCellClipped`。
4. clip 交集为空时，直接跳过子树。

### 7.4 Diff 行为

- offset 变化 → 内容在 clip 内移动 → 可以产生普通 diff patch，不需要特殊 scroll patch
- resize clip 区域 → 按现有 resize 路径整帧重算
- 如果 diff patch 较大，M7 不优化；正确性优先

### 7.5 测试重点

- clip 外 cell 不写入
- offset 增加 1 行后，可见行内容下移一行
- content 少于 clip height 时，offset clamp 为 0
- focused inverse 不应越过 clip
- box border 保持固定，children 滚动

---

## 8. Interaction 设计要点

### 8.1 键盘绑定

| 键 | 行为（ScrollView focused 或 scrollOnArrow） |
| --- | --- |
| ↑ | `offset -= 1`（clamp） |
| ↓ | `offset += 1` |
| PgUp | `offset -= clip.height`（可选，切片 C） |
| PgDn | `offset += clip.height` |
| Home / End | `offset = 0` / `offset = max`（可选） |

### 8.2 与 focus 的优先级

```text
1. 若 focus 在 TextInput 内：方向键优先移动光标（现有行为）
2. 若 focus 在 ScrollView 或可滚动容器上：方向键改 offset
3. 若 focus 在 scroll 内非输入子节点：M7 不做事件冒泡，只有当前 focused 节点收到 key
```

实现上：`ScrollView` 提供 `onKey`，在 `interaction` 中与 TextInput 相同模式；focus 进入 scroll 区域时由 Tab 顺序决定。

### 8.3 ScrollView onKey 规则

`ScrollView` 内部 box 只有在 `scrollOnArrow !== false` 且存在 `onOffsetChange` 时才挂载滚动 handler。

```ts
if (event.name === "up") onOffsetChange(Math.max(0, appliedY - 1))
if (event.name === "down") onOffsetChange(Math.min(maxY, appliedY + 1))
if (event.name === "pageup") onOffsetChange(Math.max(0, appliedY - pageY))
if (event.name === "pagedown") onOffsetChange(Math.min(maxY, appliedY + pageY))
if (event.name === "home") onOffsetChange(0)
if (event.name === "end") onOffsetChange(maxY)
```

返回值：

1. 识别并调用 `onOffsetChange` 时返回 `true`。
2. 未识别的 key 返回 `false`。
3. `scrollOnArrow === false` 或未提供 `onOffsetChange` 时，内部 `box` 使用 `onKey=false`，不进入 focus list。

### 8.4 Real PTY 覆盖

`@bindtty/terminal` 的 raw stdin 路径已支持 CSI / SS3 方向键与 Home / End / PageUp / PageDown 解析，也支持 Windows console prefixed navigation key。real PTY E2E 已覆盖 `ScrollView` / `List` 的 Down 键滚动；更细的组合键仍主要由 mock E2E 覆盖。

---

## 9. 分阶段开发计划

建议分 **6 个阶段**顺序交付，每阶段独立可测、可合并。每阶段完成后都应运行对应包测试；第 4 阶段后开始补 mock E2E。

### 阶段 1：Layout props 与 schema 打底

**目标**：让 `box` 可以合法接收 `height` / `width` / `overflow` / `scrollX` / `scrollY`，但先不要求 renderer 裁剪。

**改动包**：

- `@bindtty/vnode`
- `@bindtty/jsx-runtime`
- `@bindtty/layout`

**实现任务**：

- [x] vnode `box` schema 增加新增 props，dirty 均为 `layout`
- [x] JSX `box` 类型增加新增 props
- [x] layout `supportedPropsByTag.box` 增加新增 props
- [x] layout 增加 prop 读取 helper 与非法 `overflow` 校验
- [x] `height` / `width` 固定尺寸参与 `measureBox`

**验收**：

- [x] `<box height={3}>` 不再抛 unsupported prop
- [x] layout 单测：box 设置 height 后 `rect.height === 3`
- [x] layout 单测：box 设置 width 后 `rect.width === width`
- [x] 动态 height signal 更新会触发 layout dirty

**不涉及**：clip、scroll offset、renderer。

---

### 阶段 2：Layout clip / contentSize / scrollOffset

**目标**：layout 输出完整 scroll 契约。

**改动包**：

- `@bindtty/layout`

**实现任务**：

- [x] `LayoutNode` 增加 `clip?`、`scrollOffset?`、`contentSize?`
- [x] `overflow="clip"` 时输出 `clip = contentRect`
- [x] `scrollY` 时计算 children 自然 `contentSize`
- [x] `scrollOffset.y` clamp 到合法范围
- [x] children rect 保持自然排列，不因 clip 截断

- [x] layout 单测：子 rect 可大于 parent
- [x] layout 单测：`contentSize.height > clip.height`
- [x] layout 单测：offset 过大时 `scrollOffset.y` clamp 到 max
- [x] layout 单测：内容不足 clip 高度时 `scrollOffset.y === 0`

**不涉及**：renderer 实际裁剪。

---

### 阶段 3：Renderer clip stack

**目标**：renderer 按 LayoutNode 的 `clip` 裁剪绘制。

**改动包**：

- `@bindtty/renderer-terminal`

**实现任务**：

- [x] 增加 `PaintContext`
- [x] paint children 时计算 clip 交集
- [x] 所有 cell 写入统一走 clipped setCell
- [x] text / box / border / focus inverse 都遵守 clip
- [x] 没有 `clip` 的现有场景保持行为不变

**验收**：

- [x] renderer 单测：clip 外无 cell
- [x] renderer 单测：负坐标 + clip 不越界
- [x] renderer 单测：focused inverse 不越过 clip
- [x] mock E2E：固定 `height=3` 的 box 内放 10 行 text，只显示前 3 行

---

### 阶段 4：Renderer scrollOffset

**目标**：renderer 应用 `scrollOffset` 绘制 children。

**改动包**：

- `@bindtty/renderer-terminal`
- `packages/e2e/mock`

**实现任务**：

- [x] children paint context 应用 `-scrollOffset`
- [x] 当前节点 border/background 不随 scrollOffset 移动
- [x] offset 变化通过普通 frame diff 输出 patch
- [x] mock E2E 增加静态 offset 场景

**验收**：

- [x] offset 0 显示第 1 行起
- [x] offset 5 显示第 6 行起
- [x] offset 过大显示最后可见窗口
- [x] box border 固定，只有 content 滚动

---

### 阶段 5：ScrollView widget 与键盘滚动

**目标**：用户可以通过 `ScrollView` 声明滚动窗口，并用 key 更新 offset。

**改动包**：

- `@bindtty/widgets`
- `packages/e2e/mock`

**实现任务**：

- [x] 新增 `ScrollView`
- [x] `ScrollView` 渲染为内部 `box`
- [x] `height` / `width` / `overflow="clip"` / `scrollY` 转发到 box
- [x] `onKey` 支持 ↑/↓/PgUp/PgDn/Home/End
- [x] `onOffsetChange` 受控写回外部 signal
- [x] `@bindtty/widgets` 与 `bindtty` 入口导出 `ScrollView`

**验收**：

- [x] widgets 单测：`scrollOnArrow` / 无 `onOffsetChange` 时 focus 行为符合文档
- [x] mock E2E：focus 到 ScrollView 后 ↓ 改变可见行
- [x] mock E2E：TextInput focused 时方向键优先被 TextInput 消费，不滚动外层 ScrollView
- [x] mock E2E：PgDn/Home/End 行为正确

---

### 阶段 6：List 语法糖与动态数据

**目标**：给常见长列表提供更顺手的 API，但不做虚拟化。

**改动包**：

- `@bindtty/widgets`
- `packages/e2e/mock`
- 文档

**实现任务**：

- [x] 新增 `List<T>`
- [x] 内部组合 `ScrollView` + `<for>`
- [x] `items` / `getKey` / `render` 转换到 `<for>`
- [x] 增加动态 items 场景测试
- [x] 更新 `WIDGETS.md`、`TUI_IMPLEMENTATION_PLAN.md`、根 README 状态

**验收**：

- [x] `items.push()` 后 content 变长，clamp 行为正确
- [x] 删除当前可见前方 item 后，可见窗口稳定且不越界
- [x] key 未变、内容变更时复用现有 for 行为
- [x] mock E2E：For 增删与滚动组合场景

**后置项**：

- `stickToBottom`
- virtualization
- scrollbar
- selected row / active descendant

---

## 10. 测试策略

| 层级 | 内容 |
| --- | --- |
| `@bindtty/vnode` | box 新 props schema、dirty kind |
| `@bindtty/jsx-runtime` | TSX 类型接入，`height` / `overflow` 可编译 |
| `@bindtty/layout` | fixed size、contentSize、clip rect、offset clamp |
| `@bindtty/renderer-terminal` | clip paint、offset translate、focused inverse、diff |
| `@bindtty/widgets` | ScrollView props、onKey、List composition |
| `packages/e2e/mock` | 可见输出断言（strip ANSI 后）、键盘滚动、动态 list |
| `packages/e2e/real` | 不新增方向键 PTY 用例；可选 smoke「长输出不崩溃」 |

遵循 [E2E_TESTING.md](./E2E_TESTING.md)：**细节在 mock，真实性在 PTY smoke**。

### 10.1 最小用例清单

Layout：

- [x] `box height` 固定外部 rect
- [x] `box width` 固定外部 rect
- [x] `overflow="clip"` 输出 `clip`
- [x] `scrollY` 输出 clamp 后 `scrollOffset`
- [x] `contentSize` 记录未裁剪 children 尺寸
- [x] `for` 作为 scroll content 时 content height 正确

Renderer：

- [x] text 被 clip 截断
- [x] background fill 被 clip 截断
- [x] border 被父 clip 截断，但不被自身 scrollOffset 移动
- [x] children 被 scrollOffset 移动
- [x] focused inverse 被 clip 截断
- [x] diff 在 offset 改变后输出正确 patch

Widgets：

- [x] `ScrollView` 输出内部 box props
- [x] `ScrollView` onKey 调用 `onOffsetChange`
- [x] `scrollOnArrow=false` 行为符合文档
- [x] `List` 渲染所有 item 并保留 key

E2E mock：

- [x] 静态 clip
- [x] signal offset 更新
- [x] 键盘滚动
- [x] TextInput 与 ScrollView 同屏时方向键优先级
- [x] 动态 list push/delete

---

## 11. 示例应用（M7 完成后）

建议在 `examples/log-viewer` 或文档内嵌示例：

```tsx
const logs = createSignal<LogLine[]>([]);
const scrollY = createSignal(0);

const app = createApp(
  <screen>
    <vstack>
      <text value="Log Viewer" bold />
      <ScrollView height={20} offset={scrollY}>
        <for each={logs} key={(line) => line.id}>
          {(line) => <text value={line.message} />}
        </for>
      </ScrollView>
    </vstack>
  </screen>,
  { terminal }
);
```

用于验证 M7 端到端体验，并作为 Quick Start 素材。

---

## 12. 风险与对策

| 风险 | 对策 |
| --- | --- |
| clip + diff 产生大量 ANSI 抖动 | 先正确性后优化；必要时 scroll 区域短时整段重绘 |
| measure 性能（超长列表） | M7 全量 mount；文档注明行数建议；M8 虚拟化 |
| offset 与 TextInput 焦点冲突 | 明确 interaction 优先级；E2E 覆盖 |
| 水平滚动与边框 padding 交互复杂 | M7 仅垂直；水平 API 预留 |
| `height` props 与未来 layout props 设计冲突 | M7 只实现 fixed number，并在 LAYOUT.md 标注这是通用 layout props 的第一步 |
| 外部 `offset` 可能越界 | layout 输出 applied offset；ScrollView 键盘处理基于 applied offset 和 max offset 计算下一次意图，不隐式反写用户 signal |
| raw stdin 不支持箭头键 | mock E2E 覆盖细节；real PTY 只做 smoke |

---

## 13. 完成后的文档更新清单

M7 落地时同步更新：

- [x] [TUI_IMPLEMENTATION_PLAN.md](./TUI_IMPLEMENTATION_PLAN.md) — M7 勾选子项
- [x] [LAYOUT.md](./LAYOUT.md) — overflow/scroll 从「后续」改为已实现
- [x] [RENDERER.md](./RENDERER.md) — clip/scroll paint 规则
- [x] [WIDGETS.md](./WIDGETS.md) — ScrollView / List API
- [x] [VNODE.md](./VNODE.md) — box 新 layout props schema
- [x] [JSX_RUNTIME.md](./JSX_RUNTIME.md) — box TSX props 增量
- [x] [E2E_TESTING.md](./E2E_TESTING.md) — 新增场景列表
- [x] 根 [README.md](../README.md) — 当前完成状态

---

## 14. 一句话方向

**M7 不是新造一条渲染管线，而是在现有 layout → frame → diff 链上增加 clip、scroll offset 与 ScrollView 语义**，使 binding-level 更新能作用于「可滚动的可见窗口」，从而让 BindTTY 从控件 demo 迈向可用的长内容 TUI 应用。
