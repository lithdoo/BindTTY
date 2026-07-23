# Windows 输入验收

本页是 BindTTY 输入层的 Windows 发布门禁。自动测试不能代替真实键盘，
尤其不能证明 ConPTY 是否保留 Ctrl+Enter 的 modifier。

## 自动门禁

GitHub Actions 的 `windows-input` job 必须通过：

- `@bindtty/input`：未知/不完整 CSI、SS3 原子消费，F1-F12、modified Enter。
- `@bindtty/terminal`：协议探测、单协议启停、Win32 record 映射和生命周期。
- `@bindtty/interaction`、`@bindtty/widgets`：只有 `kind: "text"` 能修改 value。
- Windows ConPTY E2E。

## 实机矩阵

每次修改 tokenizer、协议协商、Win32 adapter 或 Textarea 时，至少覆盖：

| Shell | Host | 必测 |
| --- | --- | --- |
| Windows PowerShell 5.1 | Windows Terminal | F2、Ctrl+Enter、中文、paste、caret |
| PowerShell 7 | Windows Terminal | F2、Ctrl+Enter、中文、paste、caret |
| Windows PowerShell 5.1 | 传统 Console Host | F2、Ctrl+Enter capability fallback、caret |
| PowerShell 7 | 传统 Console Host | F2、Ctrl+Enter capability fallback、caret |

验收标准：

1. F2 只产生 `kind: "key", name: "f2"`，Textarea 不得插入 `B`。
2. 能力声明 `modifiedEnter: true` 时，Ctrl+Enter 只提交一次且不插入换行。
3. 能力声明 `modifiedEnter: false` 时，应用显示 F2 等 fallback，不能谎报快捷键。
4. caret 使用 ANSI inverse，继承字符前景/背景色，不出现硬编码黑块。
5. bracketed paste 内容正确进入 value，trace 文件不包含 paste 明文。
6. stop/dispose 后协议、raw mode、光标和 alternate screen 全部恢复。

## 诊断

在 PowerShell 中启用 JSONL trace：

```powershell
$env:BINDTTY_INPUT_TRACE = '1'
$env:BINDTTY_INPUT_TRACE_FILE = "$env:TEMP\bindtty-input.jsonl"
npm run tui
```

复现后检查 `rawHex`、`event.kind`、`event.protocol`、`name` 和 modifiers。
trace 不写 stdout；bracketed paste 的 raw 与 event 内容均标为
`redacted: "paste"`。

发布记录必须附上：

- Windows build、PowerShell 与 host 版本。
- `terminal.keyboardCapabilities.protocol`。
- 上述六项结果。
- 失败时的脱敏 trace。
