# Scroll 控件规范（VScrollView / HScrollView / ScrollView / List）

> **类型**：widget
> **范围**：@bindtty/widgets
> **状态**：implemented
> **最后核对**：2026-07
> **代码入口**：packages/widgets/src/scroll/
> **相关**：[SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md) · [WIDGETS.md](../packages/WIDGETS.md)

引擎层 clip / scroll / layout / renderer 契约见 [../specs/SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md)。

---

## 1. 范围

### 1.1 已支持

- `VScrollView` — 垂直受控 offset、stickToBottom、showScrollbar
- `HScrollView` — 水平受控 offset、stickToEnd、showScrollbar
- `ScrollView` — 双轴 X+Y 受控 offset
- `List` — `VScrollView` + `<for>` 语法糖

### 1.2 不在范围

- 虚拟列表、selected row
- 鼠标滚轮 / 拖拽 scrollbar

---

## 2. VScrollView

`@bindtty/widgets` 提供 `VScrollView`，不新增 intrinsic tag。

```tsx
import { createSignal } from "@bindtty/signal";
import { VScrollView } from "@bindtty/widgets";

const offset = createSignal(0);

<VScrollView height={10} offset={offset}>
  <vstack>
    <for each={logs} key={(line) => line.id}>
      {(line) => <text value={line.text} />}
    </for>
  </vstack>
</VScrollView>
```

`VScrollView` props：

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
| `focusStyle` | `"inverse" \| "none"` | 透传到内部 focus target，默认使用 renderer focused inverse |
| `stickToBottom` | `BindingValue<boolean>` | 内容增高时自动滚到底，默认 `false` |
| `showScrollbar` | `BindingValue<boolean>` | 显示纯视觉滚动条（占 1 列宽），默认 `false` |

受控规则：

1. `offset` 是外部状态来源，`VScrollView` 不拥有自己的长期 offset state。
2. 键盘滚动时，如果提供 `onOffsetChange`，调用它；如果没有提供，则 `VScrollView` 只是静态裁剪容器，不进入 focus list。
3. `onOffsetChange` 接收下一次用户意图值；键盘滚动基于上一轮 layout 输出的 applied offset / max offset 计算 next，而不是基于可能越界的原始 `offset`。
4. layout 不会隐式反写用户传入的 `offset` signal；若外部 `offset` 越界，画面按 layout clamp 后的 applied offset 渲染，用户状态保持受控。
5. 若业务希望精确知道 applied scroll state，后续可以增加 `onScrollStateChange`，M7 不做。

### 2.1 `stickToBottom`

log viewer / chat 场景：新行追加时自动滚到底；用户手动上滚后暂停跟随，滚回底部后恢复。

| 规则 | 行为 |
| --- | --- |
| 前置条件 | 必须提供 `onOffsetChange`；否则与无 handler 时一样，不自动 stick |
| 启用且未 detach | 每次 `onLayout` 后，若 `appliedY < maxY`，调用 `onOffsetChange(maxY)` |
| 用户 detach | sticky 启用时，按 `up` / `pageup` / `home` → 进入 **detached**（停止自动 stick） |
| 重新 attach | 按 `end`；或 `down` / `pagedown` 使 offset 到达 `maxY` → 清除 detached |
| Prop 变 `false` | 停止自动 stick，保留当前 offset |
| Prop 变 `true` | 下一帧 layout 后若 `appliedY < maxY` 且未 detached，则滚到底 |
| 外部改 offset | 非首帧 layout 且外部 `offset < maxY` 时视为 detached；若仅因 content 增高导致 `maxY` 变大且 offset 仍停在原底部，则不 detach |
| 内部状态 | `userDetached` 为 widget 闭包状态，不暴露为 prop |

`stickToBottom` 是 layout 不反写 signal 规则的唯一例外：`VScrollView` 在 `onLayout` 中可主动调用 `onOffsetChange(maxY)`。仅在 `appliedY < maxY` 时调用，避免 layout 循环。

### 2.2 `showScrollbar`

纯视觉滚动条，不响应鼠标或点击。

| 规则 | 行为 |
| --- | --- |
| 可见条件 | `showScrollbar === true` 且 `maxY > 0` |
| 布局 | 外层 `box`（`width` / 样式）+ 内层 `hstack`：左侧 clip 内容区（`height` + `flexGrow: 1`），右侧 1 列 scrollbar（`width: 1` + 同 `height`） |
| 字符 | track `│`；thumb 区间 `█`，其余为 track |
| thumb 尺寸 | `max(1, round(viewportHeight * viewportHeight / contentHeight))` |
| thumb 位置 | `round(appliedY / maxY * (viewportHeight - thumbSize))`（`maxY === 0` 时不显示） |
| CJK | 与 clip 相同，按 display-column 裁剪 |

---

## 3. HScrollView

`@bindtty/widgets` 提供 `HScrollView`，内部组合 `box` + `scrollX` + `onKey`。

```tsx
import { createSignal } from "@bindtty/signal";
import { HScrollView } from "@bindtty/widgets";

const offset = createSignal(0);

<HScrollView width={40} offset={offset} onOffsetChange={offset.set}>
  <text value={longLine} />
</HScrollView>
```

`HScrollView` props：

| Prop | 类型 | 说明 |
| --- | --- | --- |
| `offset` | `BindingValue<number>` | 水平偏移（display column），默认 0 |
| `width` | `BindingValue<number>` | 可见宽度（列），必填 |
| `height` | `BindingValue<number>` | 可选 |
| `scrollOnArrow` | `BindingValue<boolean>` | focus 时响应 `←`/`→`，默认 true |
| `onOffsetChange` | `(nextOffset: number) => void` | 键盘滚动时写回外部状态 |
| `focusStyle` | `"inverse" \| "none"` | 透传到内部 focus target |
| `stickToEnd` | `BindingValue<boolean>` | 内容变宽时自动滚到最右 |
| `showScrollbar` | `BindingValue<boolean>` | 底部 1 行纯视觉滚动条 |

键盘（`scrollOnArrow !== false` 且存在 `onOffsetChange`）：`left` / `right` / `home` / `end`。

`stickToEnd` 规则镜像 §2.1：`left` detach；`end` 或 `right` 到达 `maxX` re-attach；`onLayout` 可在 `appliedX < maxX` 时调用 `onOffsetChange(maxX)`。

`showScrollbar`（水平）：外层 `box` + 内层 `vstack`；track `─`、thumb `█`；thumb 公式与 §2.2 相同（轴换为 width）。

---

## 4. ScrollView（双轴）

`@bindtty/widgets` 提供 `ScrollView`，内部组合单个 `box` + 同时 `scrollX` / `scrollY` + `onKey`。单轴场景继续用 `VScrollView` / `HScrollView`。

```tsx
import { createSignal } from "@bindtty/signal";
import { ScrollView } from "@bindtty/widgets";

const scrollX = createSignal(0);
const scrollY = createSignal(0);

<ScrollView
  width={80}
  height={20}
  offsetX={scrollX}
  offsetY={scrollY}
  onOffsetXChange={scrollX.set}
  onOffsetYChange={scrollY.set}
>
  <LargeGrid />
</ScrollView>
```

`ScrollView` props：

| Prop | 类型 | 说明 |
| --- | --- | --- |
| `id` | `BindingValue<string \| number>` | 可选 focus id |
| `offsetX` / `offsetY` | `BindingValue<number>` | 水平 / 垂直偏移，默认 0 |
| `width` / `height` | `BindingValue<number>` | 可见宽高，**必填** |
| `children` | `Template` | 可滚动内容 |
| `scrollOnArrow` | `BindingValue<boolean>` | focus 于容器时响应方向键，默认 true |
| `onOffsetXChange` / `onOffsetYChange` | `(nextOffset: number) => void` | 各轴键盘滚动写回；缺一则该轴不可键盘滚动 |
| `onFocusChange` | `InteractionNodeFocusChangeEvent => void` | 透传到内部 box |
| `focusStyle` | `"inverse" \| "none"` | 透传到内部 focus target |
| `stickToBottom` | `BindingValue<boolean>` | Y 轴 stick，规则同 §2.1 |
| `stickToEnd` | `BindingValue<boolean>` | X 轴 stick，规则同 §3 |
| `showScrollbar` | `BindingValue<boolean \| { vertical?: boolean; horizontal?: boolean }>` | 纯视觉滚动条，默认 false |

受控规则与 V/H 相同：layout 不隐式反写外部 signal；键盘基于 applied offset / max 计算 next intent。

### 4.1 键盘

`scrollOnArrow !== false` 且至少一个 `onOffsetChange` 存在时挂载 handler：

| 键 | 行为 |
| --- | --- |
| `up` / `down` | `offsetY ± 1`；`stickToBottom` 时 `up` detach |
| `left` / `right` | `offsetX ± 1`；`stickToEnd` 时 `left` detach |
| `pageup` / `pagedown` | Y 轴翻页（page = viewportHeight） |
| `home` | `onOffsetXChange(0)` 与 `onOffsetYChange(0)`（若存在） |
| `end` | `onOffsetXChange(maxX)` 与 `onOffsetYChange(maxY)`；sticky 两轴 re-attach |

与单轴 widget 差异：`home` / `end` 同时作用于 X 与 Y（单轴时 `VScrollView` 的 home/end 仅 Y，`HScrollView` 仅 X）。

### 4.2 `showScrollbar`（双轴）

`showScrollbar === true` 等价 `{ vertical: true, horizontal: true }`。

布局：

```text
outer box (width, height, 样式)
└─ vstack
   ├─ hstack [ scrollBox (flexGrow) | vScrollbar (w=1) ]
   └─ hstack [ hScrollbar (flexGrow) | corner (1×1) ]   ← 仅 maxX>0 且 horizontal 启用
```

- 垂直条：`maxY > 0` 且 `vertical !== false`；track `│`、thumb `█`
- 水平条：`maxX > 0` 且 `horizontal !== false`；track `─`、thumb `█`
- corner：两轴条均可见时 1×1，内容为空
- thumb 公式：§2.2 / §3（各轴独立）
- 无溢出轴不占用 scrollbar 行/列（layout 后动态 `width: 0` / `height: 0`）

---

## 5. List

M7 不强制新 `<list>` intrinsic；推荐 **composition**：

```tsx
<VScrollView height={12} offset={scrollY}>
  <for each={items} key={(item) => item.id}>
    {(item) => <Row item={item} />}
  </for>
</VScrollView>
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

内部仍是 `VScrollView` + `<for>`；**第一版 List 可以是语法糖，不做虚拟化**。

`List` MVP props：

| Prop | 类型 | 说明 |
| --- | --- | --- |
| `items` | `BindingValue<readonly T[]>` | 列表数据 |
| `getKey` | `(item: T, index: number) => string | number` | 稳定 key，转发给内部 `<for key={...}>` |
| `render` | `(item: T, index: number) => Template` | 行渲染 |
| `height` | `BindingValue<number>` | 转发给 `VScrollView` |
| `offset` | `BindingValue<number>` | 转发给 `VScrollView` |
| `onOffsetChange` | `(nextOffset: number) => void` | 转发给 `VScrollView` |
| `focusStyle` | `"inverse" \| "none"` | 转发给 `VScrollView` |
| `stickToBottom` | `BindingValue<boolean>` | 转发给 `VScrollView` |
| `showScrollbar` | `BindingValue<boolean>` | 转发给 `VScrollView` |

不做 `selectedIndex`、虚拟化、行复用；这些进入后续里程碑。

---

## 6. 测试回归索引

| 层 | 位置 |
| --- | --- |
| unit | `packages/widgets/test/widgets.test.ts` — scroll / list template |
| layout | `packages/layout/test/` — clip / contentSize |
| bindtty | `packages/bindtty/test/app.test.ts` — export |
| mock E2E | `packages/e2e/mock/test/app-terminal.test.tsx` — scroll 场景 |

完整引擎层测试索引见 [SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md) §10。
