# Terminal Display-Width Text（宽字符 / Grapheme 支持）

BindTTY 在 **text → layout → renderer → ANSI** 全链路使用 **terminal display column** 语义，支持 CJK、常见 emoji、combining mark 与 grapheme cluster。

> **状态（2026-07）**：`@bindtty/text`、`@bindtty/layout`、`@bindtty/renderer-terminal`、app/E2E 已落地。  
> 历史实施计划见 [archive/WIDE_TEXT_IMPLEMENTATION_PLAN.md](./archive/WIDE_TEXT_IMPLEMENTATION_PLAN.md)。

相关文档：

- [RENDERER.md](./RENDERER.md) — Frame / Cell / paint / diff / ANSI 细节
- [YOGA_LAYOUT.md](./YOGA_LAYOUT.md) — Yoga measure 与 `layoutText()` 集成
- [LAYOUT.md](./LAYOUT.md) — LayoutNode / contentSize
- [TEXT_INPUT.md](./TEXT_INPUT.md) — TextInput 控件（**编辑语义见已知限制**）
- [../packages/e2e/README.md](../packages/e2e/README.md) — 宽字符 E2E harness
- [../TODO.md](../TODO.md) — 已知代码缺口与后续工作

---

## 1. 范围

### 1.1 已支持

```text
@bindtty/text
  segmentText()、measureTextWidth()、layoutText()
  wrap / hard / truncate 按 display width，不切断 grapheme

@bindtty/layout
  BasicLayoutEngine / YogaLayoutEngine 通过 layoutText() 测量
  wrapped CJK / emoji 的 contentSize、resize rewrap

@bindtty/renderer-terminal
  Cell.width (0 | 1 | 2) + placeholder
  segment-based 写入、whole-grapheme clip
  diff dirty range 扩展、ANSI 跳过 placeholder

app / E2E / examples/wide-text
  首屏渲染、更新、resize、ScrollView、focus inverse
```

### 1.2 不在范围内

```text
text value 内嵌 ANSI escape（style 走 CellStyle / props）
RichText / TextSpan（后续单独设计）
TextInput 按 grapheme 移动光标 / 删除（当前为 JS string index，见 §8）
IME preedit
width > 2 的 grapheme（segment 层 clamp 到 2）
```

### 1.3 Width oracle

```text
display width 以 string-width 结果为 BindTTY 标准。
不保证所有 terminal 字体与 string-width 完全一致；测试以 string-width 为准。
grapheme 分割优先 Intl.Segmenter("en", { granularity: "grapheme" })，否则 code point fallback。
string-width > 2 时 clamp 到 2。
```

---

## 2. 术语

| 术语 | 含义 |
| --- | --- |
| Code unit | JS `string` 的 UTF-16 单元；`"🙂".length === 2`，不能当 column |
| Grapheme cluster | 用户感知的一个字符；renderer / text 按此处理 |
| Display width | 终端占用的列数：`A→1`，`中→2`，`🙂→2`，`é→1` |
| Leading cell | 宽字符首列，`width: 2`，存真实 grapheme |
| Placeholder cell | 宽字符续列，`width: 0`，`char: ""`，ANSI 不输出 |

---

## 3. 数据流

```text
text value (plain string)
  ↓ segmentText() + string-width
  ↓ layoutText() — measure / wrap / truncate / slice
LayoutNode (display-width-aware rect / contentSize)
  ↓ paintLayout() — writeText / setCell by segment
Frame (Cell.width + placeholders)
  ↓ diffFrames()
FramePatch
  ↓ encodeAnsiPatch() — skip width=0, emit leading char only for width=2
ANSI → terminal
```

BindTTY 保持 **MountedNode → LayoutNode → Frame → FramePatch** 分层，不把 `string-width` 暴露到 `@bindtty/vnode`。

---

## 4. @bindtty/text

### 4.1 核心 API

```ts
interface TextSegment {
  text: string;
  width: 0 | 1 | 2;
}

segmentText(text: string): TextSegment[];
measureTextWidth(text: string): number;
layoutText(text: string, options): TextLayout;
sliceTextByWidth(text: string, startColumn: number, endColumn: number): string;
```

### 4.2 规则摘要

- **测量**：`layoutText` / wrap / truncate / slice 在 segment 级别工作，不返回半个 grapheme。
- **单行超长 grapheme**：若 grapheme display width 大于目标行宽，layout 允许该行超出目标 width；renderer clip 时整 grapheme 跳过，不画半个。
- **换行**：`\n` 由 `layoutText` 分行处理，不在单行 `segmentText` 内切分。
- **实现位置**：`packages/text/src/{segment,width,measure,layout,wrap,truncate}.ts`

---

## 5. Frame / Cell

public `Cell`（详见 [RENDERER.md](./RENDERER.md)）：

```ts
interface Cell {
  char: string;
  style: CellStyle;
  width?: 0 | 1 | 2;  // 缺省按 1；内部归一化为 0|1|2
}
```

| width | 语义 |
| --- | --- |
| 1 | 普通列：display width 1 的 grapheme 或空格 |
| 2 | Leading：display width 2 的 grapheme；`setCell` 自动写后一列 placeholder |
| 0 | Placeholder：`char` 必须为 `""`；仅由 wide 写入流程创建 |

示例 `"中"` 占两列：

```text
[x]   { char: "中", width: 2 }
[x+1] { char: "",  width: 0 }   // placeholder
```

**工具函数**：`createBlankCell`、`createPlaceholderCell`、`frameToLines`（跳过 placeholder）、`frameToDebugLines`（placeholder 显示为 `·`）。

**写入入口**：`setCell` / `writeText` 在落笔前通过 `clearCellsForWrite` 清理目标区域旧 wide cell；覆盖 placeholder 会清除整个 leading+placeholder 对。

---

## 6. Renderer

### 6.1 写入与 clip

- 按 `segmentText()` 迭代，cursor 每次 `+= segment.width`（不是 JS index）。
- **Whole-grapheme clip**：grapheme 任一列超出 clip rect 则整段不绘制。
- **Background / border**：写入 `width: 1` 的 blank 时，若覆盖 wide 的 leading 或 placeholder 列，会清理整段 wide text；**不相邻列**的 background fill 不破坏已有 placeholder（见 paint 测试）。

### 6.2 Diff / ANSI

- `diffFrames`：cell 变化时向前后扩展 dirty range（含 wide leading + placeholder）。
- `encodeAnsiPatch`：`width === 0` 不输出、不移动光标；仅输出 leading char；清理旧 wide 文本时输出足够空格覆盖两列。
- 若 patch 中所有 change 均为 placeholder（无可写 cell），输出空字符串。

### 6.3 Public API 说明

`writeText()` 仍为 `@bindtty/renderer-terminal` 的 public export，内部已改为 segment-based；测试与 frame 工具可直接使用。

---

## 7. Layout / Yoga / ScrollView

- `BasicLayoutEngine` 与 `YogaLayoutEngine` 均通过 `layoutText()` 得到 display-width-aware 的 line 宽与高。
- `contentSize.height` 按 wrapped 行数计算；CJK / emoji 与 renderer 行数一致。
- **ScrollView**：垂直滚动无需 wide 特殊逻辑；水平 clip 依赖 renderer whole-grapheme clipping。
- **Resize rewrap**：viewport 变窄时 flex 子节点宽度变化 → `layoutText` 重新换行（Yoga + mock/real E2E 已覆盖）。

---

## 8. 已知限制

| 区域 | 现状 | 说明 |
| --- | --- | --- |
| **TextInput** | JS `string` index 光标 | `slice(0, cursor)` / `left`/`right` ±1；emoji 可能在 surrogate 中间停住；backspace 一次删一个 code unit |
| **TextInput 显示** | 按 code unit 拆三列 text | 宽字符在输入框内可能占列数与 terminal renderer 不一致 |
| **ANSI in value** | 不支持 | `\x1b[31m` 等按 plain char 处理；颜色应用 CellStyle |
| **复杂 ZWJ** | measure/segment 有基础支持 | 编辑控件与极端 sequence 未 hardening |
| **Terminal 字体** | 不保证一致 | 以 string-width 为 oracle |
| **Real PTY resize** | Windows 可能缺 `resize` 事件 | E2E harness 用 viewport 轮询 + `app.resize()` 补偿 |

Widget 层改进项见 [../TODO.md](../TODO.md)。

---

## 9. 测试回归索引

| 能力 | 主要测试 |
| --- | --- |
| segment / measure / wrap / truncate | `packages/text/test/text.test.ts` |
| Frame / writeText / placeholder | `packages/renderer-terminal/test/frame.test.ts` |
| paint / clip / focus / background | `packages/renderer-terminal/test/paint.test.ts` |
| diff / ANSI | `packages/renderer-terminal/test/diff.test.ts`, `ansi.test.ts` |
| runtime 集成 | `packages/renderer-terminal/test/integration.test.ts` |
| layout CJK / rewrap | `packages/layout/test/layout.test.ts` |
| app terminal 模式 | `packages/bindtty/test/app.test.ts` |
| TextInput CJK / emoji 现状 | `packages/widgets/test/text-input.test.ts` |
| mock E2E 示例 UI | `packages/e2e/mock/test/app-terminal.test.tsx` |
| real PTY CJK / scroll | `packages/e2e/real/harness/wide-text-app.tsx` |
| real PTY resize rewrap | `packages/e2e/real/harness/wide-text-resize-app.tsx` |

---

## 10. 示例

```bash
# 仓库根目录
npm run start --workspace @bindtty/example-wide-text
```

示例源码：`examples/wide-text/src/main.tsx`（CJK、emoji、combining、hard wrap、resize 说明）。

---

## 11. 未来方向

```text
1. TextInput：cursor / backspace / delete 按 grapheme segment 工作
2. RichText / TextSpan：ANSI 或 inline style span
3. width > 2：扩展 placeholder 链与 diff expansion
4. IME / 选区 / 多行编辑（见 TEXT_INPUT.md 非目标）
```

---

## 12. 文档迁移说明

原 `doc/WIDE_TEXT_FRAME.md`（落地计划 + Ink 参考 + 分阶段 PR）已归档为 [archive/WIDE_TEXT_IMPLEMENTATION_PLAN.md](./archive/WIDE_TEXT_IMPLEMENTATION_PLAN.md)。  
日常开发与 code review 以 **本文档 + RENDERER.md** 为准。
