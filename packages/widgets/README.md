# @bindtty/widgets

高层 TUI 控件：`Button`、`TextInput`、`VScrollView`、`HScrollView`、`List`。

## 导出

- `Button` / `TextInput`
- `VScrollView` — 垂直滚动（`stickToBottom`、`showScrollbar`）
- `HScrollView` — 水平滚动（`stickToEnd`、`showScrollbar`）
- `List` — `VScrollView` + `<for>` 语法糖

## 规范

- [doc/specs/SCROLL_VIEWPORT.md](../../doc/specs/SCROLL_VIEWPORT.md) — VScrollView / HScrollView / List
- [doc/specs/TEXT_INPUT.md](../../doc/specs/TEXT_INPUT.md) — TextInput

## Migration（alpha.2 breaking）

`ScrollView` 已重命名为 `VScrollView`（无别名）。横向滚动使用新组件 `HScrollView`。

```tsx
// before
import { ScrollView } from "bindtty";

// after
import { VScrollView, HScrollView } from "bindtty";
```
