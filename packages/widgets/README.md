# @bindtty/widgets

高层 TUI 控件：`Button`、`Checkbox`、`Select`、`ProgressBar`、`TextInput`、`Textarea`、`ScrollView`、`VScrollView`、`HScrollView`、`List`。

## 安装

与 `bindtty` 分开安装，版本号应对齐（如均为 `0.1.0-alpha.10`）：

```bash
npm install bindtty @bindtty/widgets
```

Signal 请从 `bindtty` 导入，widgets 从本包导入：

```tsx
import { createApp, createSignal } from "bindtty";
import { Button, Textarea, VScrollView } from "@bindtty/widgets";
```

`bindtty` 顶层不 re-export widgets。

## 导出

- `Button` / `Checkbox` / `Select` / `TextInput` / `Textarea`
- `ProgressBar`：纯展示进度条（`value` / `max`、`label`、`showPercent`）
- `ScrollView`：双轴 X+Y 滚动（`stickToBottom` / `stickToEnd`、`showScrollbar`）
- `VScrollView`：垂直滚动（`stickToBottom`、`showScrollbar`）
- `HScrollView`：水平滚动（`stickToEnd`、`showScrollbar`）
- `List`：`VScrollView` + `<for>` 语法糖

## 滚动组件对照

| 组件 | 方向 | 典型场景 |
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

- [doc/specs/SCROLL_VIEWPORT.md](../../doc/specs/SCROLL_VIEWPORT.md) - clip / scroll 引擎
- [doc/packages/INPUT.md](../../doc/packages/INPUT.md) - raw keyboard input parser
- [doc/widgets/SCROLL.md](../../doc/widgets/SCROLL.md) - ScrollView / VScrollView / HScrollView / List
- [doc/widgets/TEXT_INPUT.md](../../doc/widgets/TEXT_INPUT.md) - TextInput
- [TEXTAREA.md](./TEXTAREA.md) - Textarea
- [doc/widgets/PROGRESS_BAR.md](../../doc/widgets/PROGRESS_BAR.md) - ProgressBar
