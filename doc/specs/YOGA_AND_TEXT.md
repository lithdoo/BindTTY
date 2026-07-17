# Text Measurement 与 Yoga Layout 规范（Yoga and Text）

> **类型**：spec
> **范围**：@bindtty/text · @bindtty/layout
> **状态**：partial（BasicLayoutEngine 去留未决）
> **最后核对**：2026-07
> **代码入口**：packages/text/src/index.ts · packages/layout/src/layout.ts
> **相关**：[DISPLAY_WIDTH.md](./DISPLAY_WIDTH.md) · [LAYOUT.md](../packages/LAYOUT.md) · [SCROLL_VIEWPORT.md](./SCROLL_VIEWPORT.md)

相关文档：

- [packages/LAYOUT.md](../packages/LAYOUT.md) — LayoutEngine、LayoutNode
- [DISPLAY_WIDTH.md](./DISPLAY_WIDTH.md) — display-width / grapheme
- [archive/plans/YOGA_LAYOUT_PLAN.md（GitHub）](https://github.com/lithdoo/BindTTY/blob/main/doc/archive/plans/YOGA_LAYOUT_PLAN.md) — 完整历史计划

---

::: info 本章导航

| § | 章节 |
| --- | --- |
| [1. 范围](#_1-范围) | Yoga measure 与 text 集成 |
| [2. 数据流](#_2-数据流) | 数据流 |
| [3. Yoga flex props](#_3-yoga-flex-props-当前已开放) | 已开放 props |
| [4. 默认 engine](#_4-默认-engine-与-legacy) | engine 与 legacy |
| [5. 测试回归](#_5-测试回归索引) | 测试回归 |
| [6. 已知限制](#_6-已知限制) | 已知限制 |
| [7. 历史计划](#_7-历史计划) | 历史计划 |

:::

## 1. 范围

### 1.1 已支持

```text
@bindtty/text
  measureTextWidth()、layoutText()、segmentText()
  wrap / hard / truncate 按 display width

@bindtty/layout
  layoutRoot() 默认 createYogaLayoutEngine()
  BasicLayoutEngine 保留为 legacy fallback（createBasicLayoutEngine()）
  text leaf 通过 layoutText() 测量（Basic 与 Yoga 共用）

YogaLayoutEngine
  screen / box / vstack / hstack / text / spacer + fragment/show/for
  clip / contentSize / scrollOffset（见 SCROLL_VIEWPORT）
  第一批 flex props（见 §3）

app
  createApp({ layoutEngine }) 可注入自定义 engine
```

### 1.2 不在范围内

- percentage size、absolute position（Yoga 后续）
- RichText / ANSI in text value（见 DISPLAY_WIDTH §1.2）

### 1.3 术语

- **layoutText()**：layout 与 renderer 共享的文本测量入口
- **YogaLayoutEngine**：默认 layout backend
- **BasicLayoutEngine**：legacy 轻量 flow，不消费 Yoga-only props

---

## 2. 数据流

```text
MountedNode (text value + wrap)
  ↓
layoutEngine.layout(root, { viewport })
  ↓ layoutText() per text leaf
LayoutNode（rect、contentSize、clip、scrollOffset）
  ↓
renderer.paint（segmentText + display width）
```

`@bindtty/text` 是 Basic、Yoga、renderer 的 **唯一 width oracle**（CJK/emoji 见 DISPLAY_WIDTH）。

`layoutText()` 的 word wrap 使用 display column 而不是 UTF-16 length：CJK 宽字符、emoji、combining mark 与 ZWJ grapheme 都按 `segmentText()` 结果测量。Yoga 与 Basic 的 text leaf 测量、renderer 的 hard wrap / truncate 绘制共享这一套结果，避免 layout 认为一行能放下但 renderer 实际溢出的情况。

---

## 3. Yoga flex props（当前已开放）

`YogaLayoutEngine` 在 `screen` / `vstack` / `hstack` / `box` 上支持（camelCase 与 kebab-case alias）：

| Prop | 说明 |
| --- | --- |
| `gap` | 子项间距 |
| `flexGrow` / `flex-grow` | flex grow |
| `flexShrink` / `flex-shrink` | flex shrink |
| `flexWrap` / `flex-wrap` | wrap / nowrap |
| `alignItems` / `align-items` | flex 交叉轴对齐 |
| `justifyContent` / `justify-content` | 主轴对齐 |

`text` / `spacer` / widget 占位 tag 支持 `flexGrow` / `flexShrink`。

**BasicLayoutEngine**：对上述 Yoga-only props 报 unsupported；scroll/clip props 在 Basic 上可用。

---

## 4. 默认 engine 与 legacy

```ts
// packages/layout/src/layout.ts
const defaultEngine = createYogaLayoutEngine();

export function layoutRoot(root, options) {
  return (options.engine ?? defaultEngine).layout(root, { viewport: options.viewport });
}
```

显式 legacy：

```ts
import { createBasicLayoutEngine, layoutRoot } from "@bindtty/layout";

layoutRoot(root, { viewport, engine: createBasicLayoutEngine() });
```

**开放决策（阶段 8）**：BasicLayoutEngine 长期去留尚未定论；当前必须保留 fallback 与测试。

---

## 5. 测试回归索引

| 包 | 路径 |
| --- | --- |
| text | `packages/text/test/text.test.ts` |
| layout Basic | `packages/layout/test/layout.test.ts` |
| layout Yoga | `packages/layout/test/yoga-engine.test.ts` |
| bindtty app | `packages/bindtty/test/app.test.ts`（layoutEngine 注入） |
| E2E wide/rewrap | `packages/e2e/mock/`、`packages/e2e/real/` |

---

## 6. 已知限制

- Basic vs Yoga 对 fragment/show/for wrapper 语义略有差异（见 SCROLL_VIEWPORT §5.4）
- 复杂 ZWJ、width>2：见 [DISPLAY_WIDTH.md](./DISPLAY_WIDTH.md) §8

---

## 7. 历史计划

完整分阶段 checklist（阶段 0–8、子计划 A/B）见 [archive/plans/YOGA_LAYOUT_PLAN.md（GitHub）](https://github.com/lithdoo/BindTTY/blob/main/doc/archive/plans/YOGA_LAYOUT_PLAN.md)。
