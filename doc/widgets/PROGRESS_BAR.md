# ProgressBar 规范（Progress Bar）

> **类型**：widget
> **范围**：@bindtty/widgets
> **状态**：implemented
> **最后核对**：2026-07
> **代码入口**：packages/widgets/src/display/progress-bar.ts
> **相关**：[WIDGETS.md](../packages/WIDGETS.md) · [DISPLAY_WIDTH.md](../specs/DISPLAY_WIDTH.md)

---

::: info 本章导航

| § | 章节 | § | 章节 |
| --- | --- | --- | --- |
| [1](#1-范围) | 范围 | [5](#5-填充算法) | 填充算法 |
| [2](#2-数据流) | 数据流 | [6](#6-focus-与-interaction) | Focus |
| [3](#3-对外-api) | 对外 API | [7](#7-测试回归索引) | 测试回归 |
| [4](#4-布局) | 布局 | [8](#8-已知限制) | 已知限制 |

:::

## 1. 范围

### 1.1 已支持

- `ProgressBar` widget（纯展示）
- 受控 `value` / `max` binding
- 单行 `hstack`：`label` | 条 | 可选百分比
- `filledChar` / `emptyChar` 自定义（display-width = 1）
- 文本样式：`color`、`bold`、`dim`；外层 `background` / `padding`

### 1.2 不在范围

- indeterminate / spinner 动画
- focus、`onKey`、鼠标交互
- filled / empty 分色（两条 `text` 各设色）
- intrinsic `<progress>` tag
- layout / renderer 变更

### 1.3 术语

| 术语 | 含义 |
| --- | --- |
| **条本体** | 中间 `box width={width}` 内的填充字符行 |
| **display column** | 终端列宽；条字符须为单列宽 |

---

## 2. 数据流

```text
外部 value / max signal
  → ProgressBar computed
  → renderProgressBar() 生成条字符串
  → text value binding
  → runtime flush → renderer paint
```

无 interaction、无 layout metadata、无 `ref` / `onLayout`。

---

## 3. 对外 API

```tsx
import { createSignal } from "bindtty";
import { ProgressBar } from "@bindtty/widgets";

const progress = createSignal(42);

<ProgressBar
  width={30}
  value={progress}
  max={100}
  label="Loading"
  showPercent={true}
/>
```

| Prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `width` | `BindingValue<number>` | — | **必填**；条本体列宽 |
| `value` | `BindingValue<number>` | `0` | 当前进度 |
| `max` | `BindingValue<number>` | `100` | 上限；`max <= 0` 时条为空 |
| `label` | `BindingValue<string \| number>` | — | 可选；hstack 最左 |
| `showPercent` | `BindingValue<boolean>` | `false` | 为 true 时最右 `" NN%"` |
| `filledChar` | `BindingValue<string>` | `"█"` | 填充字符（单列宽） |
| `emptyChar` | `BindingValue<string>` | `"░"` | 空白字符（单列宽） |
| `color` / `bold` / `dim` | 同 Checkbox 文本 | — | 应用于条 `text` |
| `background` / `padding` | — | — | 外层 `box` |

---

## 4. 布局

```text
box（background / padding）
└─ hstack gap=1
   ├─ text(label?)           ← prop 未定义时省略
   ├─ box width={width}
   │    └─ text(barValue)
   └─ text(percent?)         ← showPercent 启用时
```

- `width` 仅约束条本体，不含 label 与百分比。
- label 与条字符 **不** 混于同一 `text` 节点（宽字符标签独立，见 [DISPLAY_WIDTH.md](../specs/DISPLAY_WIDTH.md)）。

---

## 5. 填充算法

```ts
ratio = clamp(value, 0, max) / max        // max <= 0 → 条为空串
filledCols = round(ratio * width)         // width <= 0 → 空串
emptyCols = width - filledCols
bar = filledChar.repeat(filledCols) + emptyChar.repeat(emptyCols)
percent = ` ${round(ratio * 100)}%`       // showPercent 时
```

---

## 6. focus 与 interaction

- **不** 挂载 `onKey`；**不** 进入 focus list。
- 无 `id` prop（v1）。

---

## 7. 测试回归索引

| 层 | 位置 |
| --- | --- |
| unit | `packages/widgets/test/widgets.test.ts` — `renderProgressBar`、template 结构、signal |
| bindtty | `packages/bindtty/test/app.test.ts` — export |
| mock E2E | `packages/e2e/mock/test/app-terminal.test.tsx` — signal 更新、label/percent |

---

## 8. 已知限制

- 条符与百分比为 ASCII 块符；CJK 仅用于 `label`。
- 同行总宽可能超出父级：由父 layout 负责；`width` 只限条本体。
