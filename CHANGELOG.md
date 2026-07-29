# Changelog

BindTTY 当前处于 `0.1.0-beta` 阶段。本文记录公开包与用户可见行为变化；设计细节见 `doc/` 下对应 package/spec/widget 文档。

## Unreleased

- raw stdin backend 增加默认 30ms、可配置的 Escape ambiguity timeout；独立 ESC
  稳定发布为语义 Escape key，同时保持 Alt、CSI、SS3、Kitty 与 modifyOtherKeys
  分片序列的原子解析。
- raw input detach/reset 会取消 pending timer 并清理 parser state。
- raw backend 的 bracketed paste 改为单个语义 `paste` 事件；TextInput 与 Textarea
  在一次编辑事务中插入完整文本，不再按 grapheme 触发大量同步更新。直接使用
  `@bindtty/input` parser 的调用方仍保留原默认行为，也可显式使用
  `pasteMode: "event"`。
- bracketed paste 默认最多保留 1,048,576 个 UTF-16 code unit；超限产生单个
  `unknown` 事件并丢弃到 paste terminator，避免未结束 paste 无限占用内存。
- Kitty 与 modifyOtherKeys codepoint 在转换前验证 Unicode scalar value，畸形或
  超范围输入降级为 `unknown`，不再可能由 `String.fromCodePoint()` 抛错。
- `layoutText` 与 `measureText` 改用模块级有界 LRU，各自最多保留 2,048 条和
  1,048,576 个 UTF-16 code unit；新增 cache stats/clear 诊断 API。
- BasicLayoutEngine 修复横向滚动始终为零的问题，`scrollX` 现在按内容宽度正确
  clamp；Basic 在 0.1.x 继续作为公开 fallback/test engine。

## 0.1.0-beta.3

- Windows resize event 与 polling fallback 并行工作并共享 viewport 去重，不再因存在事件监听而禁用轮询兜底。
- resize burst 默认限制为约 32ms 一帧，并在 100ms settle 后保证发布最终 viewport。
- Terminal/App 传播 stdout backpressure；阻塞期间只保留最新 resize/dirty 意图，drain 后只重绘最终 frame。
- renderer 将相邻单元格合并为连续 ANSI run；80×24 默认样式全帧相较逐单元格编码减少约 90.89% 输出。
- Windows TTY 默认用 DEC 2026 synchronized-output 包装应用 frame，支持的宿主原子呈现重绘，降低缩放时 tearing。
- 增加 resize burst、backpressure、ANSI 压缩、同步 frame 与真实 PTY 最终坐标回归。
- npm `beta` 与 `latest` 均指向本版本。

## 0.1.0-beta.2

- Windows TTY 自动合并 resize event 与 viewport polling，过滤重复或无效尺寸，并向应用发布稳定的 viewport 快照。
- App 将窗口缩放纳入串行渲染事务，避免旧尺寸 frame 在新尺寸布局之后覆盖终端。
- renderer 的 full repaint 在写入期间关闭 ANSI autowrap，避免 Win32/ConPTY 右下角写入触发意外滚屏。
- 增加 ANSI screen model 与真实 PTY 精确坐标回归，覆盖 `40→8→12→6` 列连续缩放及 CJK/emoji 重排。
- 增加 Windows Terminal/Console Host 实机窗口缩放验证手册。
- npm `beta` 与 `latest` 均指向本版本。

## 0.1.0-beta.0

- TextInput/Textarea caret 改用 ANSI inverse 并继承当前前景、背景色，移除硬编码黑白。
- 输入事件增加 `text` / `key` / `paste` / `unknown` 语义分类与协议能力模型。
- CSI/SS3 不完整序列原子消费，修复 PowerShell 中 F2 序列尾字节被插入为 `B`。
- 增加 Kitty keyboard 自动探测、单协议启停及 legacy 安全回退，避免同时盲开多个增强协议。
- 增加 Win32 `KEY_EVENT_RECORD` provider 边界，保留 F2、Ctrl+Enter、modifier、repeat 和 Unicode 语义。
- 增加脱敏输入 trace、Windows CI 输入门禁与 PowerShell/Console Host 实机验收矩阵。
- npm `beta` 与 `latest` 均指向本版本。

## 0.1.0-alpha.10

- 暴露 App 级 programmatic focus API：`app.focus(id | node)`、`app.getFocusedId()`。
- 暴露 element ref 级 focus API：`api.focus()`、`api.isFocused()`。
- 增加 mock 与 real PTY 覆盖：`programmatic-focus-app.tsx`。
- npm `latest` 指向当前 alpha 版本。

## 0.1.0-alpha.9

- `@bindtty/input` 支持 legacy CSI / SS3 / Win32 / Kitty functional F1-F12。
- `Textarea` 默认支持 `F2` 提交，和 `Ctrl+Enter` / `Meta+Enter` 同属 `submitKeys`。

## 0.1.0-alpha.8

- `@bindtty/text` 的 `layoutText()` 使用 display-width-aware word wrap。
- CJK、emoji、combining mark 与 ZWJ grapheme 在 layout / renderer 路径保持一致。

## 0.1.0-alpha.7

- Scroll widgets 转发 `focusStyle` 到内部 focus target。
- 支持调用方在 `VScrollView` / `HScrollView` / `ScrollView` / `List` 上关闭默认 focused inverse。

## 0.1.0-alpha.6

- 修复 Textarea 空行高度与 caret navigation。
- 修复 Textarea 在 flex 剩余宽度中的 soft wrap。
- 增加 textarea 示例与 flex layout 回归覆盖。

## 0.1.0-alpha.5

- bracketed paste 默认按 grapheme 展开为 text events。
- `rawMode: true` 的默认平台与 Win32 平台统一走 `RawStdinInput` parser。
- `@bindtty/input`、`@bindtty/terminal` 与 Textarea 路径补齐 parser 回归。

## 0.1.0-alpha.4

- 发布包含 `@bindtty/input` 与 `Textarea` 的 12 包版本线。
- `@bindtty/input` 拆出 tokenizer / parser / keymap / modifiers 模块。
- Textarea 多行编辑、视觉换行、Ctrl+Enter submit、disabled navigation 首次进入公开 widgets。

## 0.1.0-alpha.3

- 移除 intrinsic `button` / `input` tag，交互控件归入 `@bindtty/widgets`。
- 对齐 focusable interaction model 与文档。
- disabled widgets 默认不进入 focus list。

## 0.1.0-alpha.2

- `bindtty` 与 `@bindtty/widgets` 解耦；widgets 不再由顶层 `bindtty` re-export。
- 重组 widget 文档与源码目录：form / scroll / display。
- 增加 Checkbox、Select、ProgressBar、VScrollView、HScrollView、ScrollView、List。
- 建立 VitePress 文档站点与 GitHub Pages 发布流程。

## 0.1.0-alpha.1

- 首轮 npm alpha 发布元数据、LICENSE 与发布脚本落地。
- 顶层 `bindtty` re-export signal 原语并冻结 alpha 公共入口。
- 声明 `@bindtty/signal` peer dependency，避免多实例 signal 问题。
- 建立 GitHub Actions CI。

## 0.1.0-alpha.0 and earlier

- 初始化 monorepo 与 `bindtty` / `@bindtty/signal` workspace。
- 建立 vnode、JSX runtime、runtime、layout、renderer-terminal、terminal、interaction、widgets 基础链路。
