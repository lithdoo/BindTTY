# BindTTY TODO

已知缺口、文档债务与后续改进。Display-width 现行规范见 [doc/DISPLAY_WIDTH.md](doc/DISPLAY_WIDTH.md)。

---

## 高优先级

### TextInput：grapheme-aware 编辑语义

**位置**：`packages/widgets/src/text-input.ts`

**现状**：光标与删除按 JavaScript string index（UTF-16 code unit）工作，未使用 `@bindtty/text` 的 `segmentText()`。

**影响**：

- emoji 光标可能停在 surrogate 中间，`cursorChar` 显示半个字符
- `backspace` / `delete` 一次只删一个 code unit，删 emoji 需两次，可能留下孤立 surrogate（`\uD83D`）
- `left` / `right` 在 emoji 内部逐步移动，而非按 display column 或 grapheme 跳转
- 宽字符 value 在 TextInput 内的「列宽」与 terminal renderer 的 display width 语义不一致

**测试（记录现状，非目标行为）**：

- `packages/widgets/test/text-input.test.ts` — `TextInput moves the cursor by JavaScript string index around emoji`
- `packages/e2e/mock/test/app-terminal.test.tsx` — `tsx app types emoji into TextInput through fake terminal`

**建议方向**：

- 用 `segmentText()` 维护 cursor 为 grapheme index 或 display column offset
- backspace/delete 按 grapheme 边界删整段
- 可选：光标移动按 display column（与 renderer 对齐）

---

## 中优先级

### Real PTY：Windows 上 `stdout` `resize` 事件不可靠

**位置**：`packages/e2e/real/harness/wide-text-resize-app.tsx`

**现状**：父进程 `pty.resize()` 后，子进程有时收不到 `stdout` `resize` 事件；harness 用 **viewport 轮询** + `boxWidth` signal + `app.resize()` 补偿。

**影响**：仅 E2E harness  workaround；真实应用在 Windows PTY 下若仅依赖 `terminal.onResize`，resize rewrap 可能延迟或缺失。

**建议方向**：

- 调查 `@bindtty/terminal` / node-pty 在 Windows 的 resize 传播
- 或在 `createNodeTerminal` 层增加与 harness 相同的 viewport 轮询兜底（需评估性能）

### `encodeAnsiPatch`：placeholder-only patch

**位置**：`packages/renderer-terminal/src/ansi.ts`

**现状**：已修复——仅含 placeholder 的 patch 返回空字符串（不再输出多余 `\x1b[0m`）。

**后续**：若 diff 不应产生 placeholder-only change，可在 `diffFrames` 层过滤，减少无效 patch 条目。

---

## 低优先级 / 设计项

### Rich Text / ANSI in text value

**现状**：`text` 的 `value` 为 plain string；内嵌 ANSI escape 不按终端语义解析。颜色/style 应走 `CellStyle` 与 props。

**文档**：[doc/DISPLAY_WIDTH.md](doc/DISPLAY_WIDTH.md) §1.2

**后续**：单独设计 TextSpan / RichText widget。

### Grapheme display width > 2

**现状**：`segmentText()` 将 `string-width` 结果 clamp 到 `0 | 1 | 2`；Frame placeholder 模型仅支持 width=2 leading + width=0 continuation。

**后续**：若需支持更宽 grapheme，需扩展 placeholder 链、`findWideLeadingCell`、`diffFrames` dirty expansion 与 ANSI 清屏逻辑。

### `writeText()` public API 定位

**位置**：`packages/renderer-terminal/src/index.ts`

**现状**：仍为 public export；内部已是 segment-based。

**文档债务**：归档计划曾讨论是否改为 internal helper——未决。若无 external 消费者，可标记 deprecated 或移出 public index。

### 复杂 ZWJ emoji sequence

**现状**：`@bindtty/text` 对 ZWJ 有基础 segment + string-width 测试；layout/renderer 路径可用。TextInput 与极端 terminal 字体组合未 hardening。

**测试**：`packages/text/test/text.test.ts` — ZWJ family emoji

### IME / 多行 / 选区

见 [doc/TEXT_INPUT.md](doc/TEXT_INPUT.md) 非目标列表；不在 display-width MVP 范围。

---

## 文档（已完成 2026-07）

- [x] 现行规范：`doc/DISPLAY_WIDTH.md`
- [x] 归档：`doc/archive/WIDE_TEXT_IMPLEMENTATION_PLAN.md`
- [x] 同步：`LAYOUT.md` §12.1、`YOGA_LAYOUT.md`、`TEXT_INPUT.md`、`E2E_TESTING.md`、`doc/README.md`
- [x] 重定向：`doc/WIDE_TEXT_FRAME.md` → `DISPLAY_WIDTH.md`

**仍可选**：`doc/LAYOUT.md` 前文里程碑列表（约 §504）中「unicode display width」条目可改为「已完成，见 DISPLAY_WIDTH.md」。

---

## 如何贡献

1. 先读 [doc/DISPLAY_WIDTH.md](doc/DISPLAY_WIDTH.md) 与对应包测试。
2. TextInput grapheme 改动应更新 widget 单测 + mock E2E，并修正本节「记录现状」的测试断言为期望行为。
3. 不要在没有 spec 变更的情况下扩大 Frame width > 2 范围。
