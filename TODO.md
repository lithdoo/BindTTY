# BindTTY TODO

已知缺口、文档债务与后续改进。Display-width 现行规范见 [doc/DISPLAY_WIDTH.md](doc/DISPLAY_WIDTH.md)。

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

**后续**：已在 `diffFrames` 层过滤不可见的 placeholder-only dirty range，减少无效 patch 条目。

### TextInput：display-column 输入窗口

**位置**：`packages/widgets/src/text-input.ts`

**现状**：已修复 grapheme-aware 编辑语义；cursor / backspace / delete 按 `segmentText()` 的 grapheme index 工作。

**剩余限制**：

- 尚未实现固定宽度输入窗口
- 尚未实现横向滚动
- 光标位置不是按 terminal display column 绝对定位，而是通过 before / cursor / after 三段 `<text>` 渲染

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

**结论**：保留为 public low-level Frame text writer；现行规范见 [doc/DISPLAY_WIDTH.md](doc/DISPLAY_WIDTH.md) §6.3。

### 复杂 ZWJ emoji sequence

**现状**：`@bindtty/text` 对 ZWJ 有基础 segment + string-width 测试；layout/renderer/TextInput 路径可用。极端 terminal 字体组合未 hardening。

**测试**：`packages/text/test/text.test.ts` — ZWJ family emoji

### IME / 多行 / 选区

见 [doc/TEXT_INPUT.md](doc/TEXT_INPUT.md) 非目标列表；不在 display-width MVP 范围。

---

## 文档（已完成 2026-07）

- [x] 现行规范：`doc/DISPLAY_WIDTH.md`
- [x] 归档：`doc/archive/WIDE_TEXT_IMPLEMENTATION_PLAN.md`
- [x] 同步：`LAYOUT.md` §12.1、`YOGA_LAYOUT.md`、`TEXT_INPUT.md`、`E2E_TESTING.md`、`doc/README.md`
- [x] 重定向：`doc/WIDE_TEXT_FRAME.md` → `DISPLAY_WIDTH.md`
- [x] TextInput grapheme-aware 编辑：emoji / combining mark 不再按 UTF-16 code unit 切分
- [x] `diffFrames` 过滤 placeholder-only dirty range
- [x] `writeText()` public API 定位为 low-level Frame text writer

**仍可选**：`doc/LAYOUT.md` 前文里程碑列表（约 §504）中「unicode display width」条目可改为「已完成，见 DISPLAY_WIDTH.md」。

---

## 如何贡献

1. 先读 [doc/DISPLAY_WIDTH.md](doc/DISPLAY_WIDTH.md) 与对应包测试。
2. TextInput 后续编辑能力改动应保留 grapheme 单测，并同步更新 mock E2E。
3. 不要在没有 spec 变更的情况下扩大 Frame width > 2 范围。
