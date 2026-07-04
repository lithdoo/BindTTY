# @bindtty/widgets

高层 TUI 控件：`Button`、`Checkbox`、`Select`、`ProgressBar`、`TextInput`、`ScrollView`、`VScrollView`、`HScrollView`、`List`。

## 安装

与 `bindtty` **分开安装**，版本号应对齐（如均为 `0.1.0-alpha.2`）：

```bash
npm install bindtty @bindtty/widgets
```

Signal 请从 `bindtty` 导入，widgets 从本包导入：

```tsx
import { createApp, createSignal } from "bindtty";
import { Button, VScrollView } from "@bindtty/widgets";
```

## 导出

- `Button` / `Checkbox` / `Select` / `TextInput`
- `ProgressBar` — 纯展示进度条（`value` / `max`、`label`、`showPercent`）
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
  <Grid />
</ScrollView>
```

## 规范

- [doc/specs/SCROLL_VIEWPORT.md](../../doc/specs/SCROLL_VIEWPORT.md) — clip / scroll 引擎
- [doc/widgets/SCROLL.md](../../doc/widgets/SCROLL.md) — ScrollView / VScrollView / HScrollView / List
- [doc/widgets/TEXT_INPUT.md](../../doc/widgets/TEXT_INPUT.md) — TextInput
- [doc/widgets/PROGRESS_BAR.md](../../doc/widgets/PROGRESS_BAR.md) — ProgressBar

## Migration（alpha.2 breaking）

### Widgets 与 bindtty 解耦

`bindtty` 不再 re-export 本包。须显式安装并从 `@bindtty/widgets` 导入所有控件。

```tsx
// before (alpha.1)
import { createApp, Button } from "bindtty";

// after (alpha.2)
import { createApp } from "bindtty";
import { Button } from "@bindtty/widgets";
```

### ScrollView 重命名

原单轴 `ScrollView` 已重命名为 `VScrollView`（无别名）。横向单轴使用 `HScrollView`；**双轴**使用 `ScrollView`。

```tsx
// before (alpha.1)
import { ScrollView } from "bindtty";
<ScrollView height={10} offset={y} onOffsetChange={y.set} />

// after — 垂直-only
import { VScrollView } from "@bindtty/widgets";
<VScrollView height={10} offset={y} onOffsetChange={y.set} />

// after — 双轴
import { ScrollView } from "@bindtty/widgets";
<ScrollView width={80} height={20} offsetX={x} offsetY={y}
  onOffsetXChange={x.set} onOffsetYChange={y.set} />
```
