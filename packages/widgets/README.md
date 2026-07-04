# @bindtty/widgets

高层 TUI 控件：`Button`、`TextInput`、`ScrollView`、`VScrollView`、`HScrollView`、`List`。

## 导出

- `Button` / `TextInput`
- `ScrollView` — 双轴 X+Y 滚动（`stickToBottom` / `stickToEnd`、`showScrollbar`）
- `VScrollView` — 垂直滚动（`stickToBottom`、`showScrollbar`）
- `HScrollView` — 水平滚动（`stickToEnd`、`showScrollbar`）
- `List` — `VScrollView` + `<for>` 语法糖

## 滚动组件对照

| 组件 | 轴 | 典型场景 |
| --- | --- | --- |
| `VScrollView` | Y | 日志、List、聊天 |
| `HScrollView` | X | 单行宽文本 |
| `ScrollView` | X + Y | 大表格、代码视图 |

```tsx
import { createSignal } from "bindtty";
import { ScrollView, VScrollView, HScrollView } from "bindtty";

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
  <Grid />
</ScrollView>
```

## 规范

- [doc/specs/SCROLL_VIEWPORT.md](../../doc/specs/SCROLL_VIEWPORT.md) — ScrollView / VScrollView / HScrollView / List
- [doc/specs/TEXT_INPUT.md](../../doc/specs/TEXT_INPUT.md) — TextInput

## Migration（alpha.2 breaking）

原单轴 `ScrollView` 已重命名为 `VScrollView`（无别名）。横向单轴使用 `HScrollView`；**双轴**使用新恢复的 `ScrollView`。

```tsx
// before (alpha.1)
import { ScrollView } from "bindtty";
<ScrollView height={10} offset={y} onOffsetChange={y.set} />

// after — 垂直-only
import { VScrollView } from "bindtty";
<VScrollView height={10} offset={y} onOffsetChange={y.set} />

// after — 双轴
import { ScrollView } from "bindtty";
<ScrollView width={80} height={20} offsetX={x} offsetY={y}
  onOffsetXChange={x.set} onOffsetYChange={y.set} />
```
