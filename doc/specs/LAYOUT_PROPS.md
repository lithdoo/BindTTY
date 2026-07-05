# Layout Props 支持矩阵

> **类型**：spec  
> **范围**：@bindtty/layout · @bindtty/vnode · @bindtty/jsx-runtime  
> **状态**：implemented（Yoga 默认 engine：min/max、edge padding、margin 均已落地）  
> **最后核对**：2026-07  
> **代码入口**：`packages/layout/src/layout-props.ts`（单一真相来源）  
> **相关**：[LAYOUT.md](../packages/LAYOUT.md) · [YOGA_AND_TEXT.md](./YOGA_AND_TEXT.md) · [SCROLL_VIEWPORT.md](./SCROLL_VIEWPORT.md)

---

## 1. 范围

本文档描述各 intrinsic 元素在 layout 阶段接受的 **layout prop**，以及默认 `YogaLayoutEngine` 与 legacy `BasicLayoutEngine` 的差异。

**图例：**

| 符号 | 含义 |
| --- | --- |
| ✅ | 已支持，参与 layout |
| ⛔ | 在 `futureLayoutProps` 中，使用会抛 `Unsupported layout prop` |
| — | 不适用（该 tag 无此语义，或 prop 为 paint-only） |

矩阵列仅含 **layout 参与 tag**（`screen` · `vstack` · `hstack` · `box` · `text` · `spacer`）。intrinsic `button` / `input` 不在此表：schema 仍保留类型，但 layout 遇之则抛 `Unsupported layout element`；控件请用 [@bindtty/widgets](../packages/WIDGETS.md)。

**非 layout prop**（校验时跳过）：`id`、`ref`、`focusStyle`、`onKey`、`onFocusChange`。

**kebab-case**：所有带 alias 的 prop 同时支持 camelCase 与 kebab-case；重复传入会抛 `Duplicate layout prop`。

**文档同步**：§2–§3 矩阵与 §3.1 `futureLayoutProps` 列表由 `npm run gen:layout-props` 从 `layout-props.ts` 生成；CI 运行 `npm run check:layout-props` 防止漂移。

---

## 2. YogaLayoutEngine 矩阵（默认 engine）

来源：`yogaSupportedPropsByTag` + `futureLayoutProps`（`layout-props.ts`）。

<!-- layout-props:matrix:yoga:start -->

| prop | screen | vstack | hstack | box | text | spacer |
| --- | --- | --- | --- | --- | --- | --- |
| `width` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| `height` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| `minWidth` | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `minHeight` | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `maxWidth` | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `maxHeight` | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `padding` | — | — | — | ✅ | — | — |
| `paddingX` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| `paddingY` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| `paddingTop` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| `paddingRight` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| `paddingBottom` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| `paddingLeft` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| `margin` | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `marginX` | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `marginY` | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `marginTop` | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `marginRight` | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `marginBottom` | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `marginLeft` | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `border` | — | — | — | ✅ | — | — |
| `overflow` | — | — | — | ✅ | — | — |
| `scrollX` | — | — | — | ✅ | — | — |
| `scrollY` | — | — | — | ✅ | — | — |
| `gap` | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| `flexWrap` | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| `justifyContent` | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| `alignItems` | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| `flexGrow` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `flexShrink` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `flexDirection` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |

<!-- layout-props:matrix:yoga:end -->

`flexDirection` 暂不开放：`vstack` = column、`hstack` = row、`box` = column。

### 2.1 内容与度量（layout 参与）

以下 props 不在 `matrixLayoutProps` 生成表中，但参与 layout 或 validator：

| prop | screen | vstack | hstack | box | text | spacer |
| --- | --- | --- | --- | --- | --- | --- |
| `value` | — | — | — | — | ✅ | — |
| `wrap` | — | — | — | — | ✅ | — |
| `size` | — | — | — | — | — | ✅ |
| `color` / `bold` | — | — | — | — | ✅¹ | — |

¹ `color` / `bold` 在 validator 中视为 layout prop 名称，但只影响 paint，不改变 Yoga 尺寸（除 `value` / `wrap` 外）。

---

## 3. BasicLayoutEngine 矩阵（legacy fallback）

来源：`basicSupportedPropsByTag`。未列出的 Yoga-only prop（如 `gap`、`flexGrow`）在 `futureLayoutProps` 中会抛错。

<!-- layout-props:matrix:basic:start -->

| tag | 已支持 props |
| --- | --- |
| `screen` | （无 layout props） |
| `vstack` | （无 layout props） |
| `hstack` | （无 layout props） |
| `box` | `border`, `height`, `overflow`, `padding`, `scrollX`, `scrollY`, `width` |
| `text` | `bold`, `color`, `value`, `wrap` |
| `spacer` | `size` |

<!-- layout-props:matrix:basic:end -->

### 3.1 `futureLayoutProps`（Basic 与未支持 tag 均可能抛错）

<!-- layout-props:future:start -->

- `alignItems`
- `flexDirection`
- `flexGrow`
- `flexShrink`
- `flexWrap`
- `gap`
- `height`
- `justifyContent`
- `margin`
- `marginBottom`
- `marginLeft`
- `marginRight`
- `marginTop`
- `marginX`
- `marginY`
- `maxHeight`
- `maxWidth`
- `minHeight`
- `minWidth`
- `paddingBottom`
- `paddingLeft`
- `paddingRight`
- `paddingTop`
- `paddingX`
- `paddingY`
- `width`

<!-- layout-props:future:end -->

---

## 4. 实现路线（已完成）

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| Phase 0 | 抽取 `layout-props.ts`、文档骨架 | ✅ |
| Phase 1 | min/max size props | ✅ |
| Phase 2 | edge `padding*`、非对称 `contentRect` | ✅ |
| Phase 3 | margin shorthand 与 edge props | ✅ |
| Phase 4 | `gen:layout-props` + CI `check:layout-props` | ✅ |

新增 layout prop 须同步：vnode schema、JSX 类型、`layout-props.ts`、Yoga engine、layout 测试，然后运行 `npm run gen:layout-props`。

---

## 5. Prop 语义摘要

### 5.1 数值 prop

- 类型：`number`（终端格/cell 单位，非 CSS px）
- 非法或负数经 `toNonNegativeNumber` 钳制为 `0`
- 不支持百分比、`auto`、`flexBasis`

### 5.2 `padding`

- 仅 `box` 支持 `padding` 与 edge shorthand（`paddingX/Y`、`paddingTop` 等）
- 解析优先级：**edge > axis > `padding`**
- `contentRect` 按四边独立扣除 `border`（0 或 1）与 padding
- `BasicLayoutEngine` 仍只支持统一 `padding`；edge props 会抛错

### 5.3 `margin`

- 走 Yoga margin，影响 sibling 间距与外层排布
- 支持 tag：`box`、`text`、`spacer`、`vstack`、`hstack`
- 解析优先级：**edge > axis > `margin`**
- 不改变 `contentRect`；renderer 不为 margin 留 drawable inset
- `BasicLayoutEngine` 遇到 margin props 仍抛错

### 5.4 min / max

- 走 Yoga `setMinWidth` / `setMaxWidth` 等
- 支持 tag：`box`、`text`、`spacer`、`vstack`、`hstack`（`screen` 对 min/max 仍 ⛔）
- `BasicLayoutEngine` 遇到 min/max 仍抛 `Unsupported layout prop`
- 典型：`maxWidth` + `text wrap="wrap"`；`maxHeight` + `overflow="clip"`

---

## 6. 非目标

- `flexDirection` 开放（已有 tag 语义）
- `alignSelf`、`alignContent`、`flexBasis`
- 百分比尺寸、absolute positioning
- intrinsic `button` / `input` 作为 layout 节点（请用 widgets；见 §1）

---

## 7. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-07 | Phase 4：矩阵生成脚本 + CI `check:layout-props` |
| 2026-07 | Phase 3：margin shorthand 与 edge props |
| 2026-07 | Phase 2：edge `padding*` 与非对称 `contentRect` |
| 2026-07 | Phase 1：`minWidth` / `minHeight` / `maxWidth` / `maxHeight` 落地 |
| 2026-07 | Phase 0：抽取 `layout-props.ts`，建立本文档与 Yoga/Basic 双矩阵 |
