# BindTTY TODO

**开放改进项。** 已实现能力与 display-width 规范见 [doc/specs/DISPLAY_WIDTH.md](doc/specs/DISPLAY_WIDTH.md)。

---

## 已完成的 display-width 收尾

- TextInput grapheme-aware 编辑：光标 / backspace / delete 按 `segmentText()` 的 grapheme index。
- TextInput display-column 输入窗口：监听自身 layout `contentRect.width`，通过 `overflow: "clip"` + `scrollX` 让光标保持在可视窗口内。
- Renderer placeholder-only patch：`diffFrames` 过滤不可见 placeholder-only dirty range。
- `writeText()` public API：保留为 low-level Frame text writer。

---

## 暂缓（单独 spec，不与此批次混做）

以下项已在 [doc/specs/DISPLAY_WIDTH.md](doc/specs/DISPLAY_WIDTH.md) §1.2 / §11 说明，**不要**在无 spec 变更时直接改代码：

- RichText / TextSpan（text value 内嵌 ANSI）
- Frame `width > 2` / placeholder 链扩展
- IME / 多行 / 选区（见 [doc/specs/TEXT_INPUT.md](doc/specs/TEXT_INPUT.md) 非目标）
- TextInput selection / 鼠标定位 / 复杂编辑快捷键

---

## 贡献

1. TextInput 改动保留 grapheme 单测，并更新 mock E2E。
2. 勿扩大 Frame `width > 2` 或 placeholder 链，除非先更新 DISPLAY_WIDTH spec。
