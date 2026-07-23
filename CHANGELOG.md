# Changelog

BindTTY 当前处于 `0.1.0-beta` 阶段。本文记录公开包与用户可见行为变化；设计细节见 `doc/` 下对应 package/spec/widget 文档。

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
