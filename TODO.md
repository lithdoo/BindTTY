# BindTTY TODO

**开放改进项。** 已实现能力与 display-width 规范见 [doc/DISPLAY_WIDTH.md](doc/DISPLAY_WIDTH.md)。

---

## TextInput：display-column 输入窗口

**包**：`@bindtty/widgets` — `packages/widgets/src/text-input.ts`

**已完成**：grapheme-aware 编辑（光标 / backspace / delete 按 `segmentText()` 的 grapheme index）。

**待做**（需先定 spec 再实现）：

| 能力 | 说明 |
| --- | --- |
| 固定宽度视口 | 输入框可见列数由 layout 还是 props 决定 |
| 水平滚动 | 超长内容在视口内 clip + scroll offset |
| 光标跟随 | 光标移出可见区时 scroll，使当前 grapheme 可见 |

**渲染现状**：仍用 before / cursor / after 三段 `<text>`，无独立 display-column 光标列。

**参考**： [doc/TEXT_INPUT.md](doc/TEXT_INPUT.md)、[doc/DISPLAY_WIDTH.md](doc/DISPLAY_WIDTH.md) §8

---

## 暂缓（单独 spec，不与此批次混做）

以下项已在 [doc/DISPLAY_WIDTH.md](doc/DISPLAY_WIDTH.md) §1.2 / §11 说明，**不要**在无 spec 变更时直接改代码：

- RichText / TextSpan（text value 内嵌 ANSI）
- Frame `width > 2` / placeholder 链扩展
- IME / 多行 / 选区（见 [doc/TEXT_INPUT.md](doc/TEXT_INPUT.md) 非目标）

---

## 贡献

1. TextInput 改动保留 grapheme 单测，并更新 mock E2E。
2. 勿扩大 Frame `width > 2` 或 placeholder 链，除非先更新 DISPLAY_WIDTH spec。
