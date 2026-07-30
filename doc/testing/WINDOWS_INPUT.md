# Windows 输入验收

本页是 BindTTY 输入层的 Windows 发布门禁。自动测试不能代替真实键盘，
尤其不能证明 ConPTY 是否保留 Ctrl+Enter 的 modifier。

## 自动门禁

GitHub Actions 的 `windows-input` job 必须通过：

- `@bindtty/input`：未知/不完整 CSI、SS3 原子消费，F1-F24、modified Enter。
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

Cursor / VS Code 在 viewport 查询期间还必须满足：

1. `CSI 8;<rows>;<columns>t` 响应由 terminal response router 完整消费，不能把
   `;<rows>;<columns>t` 尾部插入输入框。
2. viewport 响应与 `SS3 Q`（F2）跨任意 stdin chunk 相邻时，仍只发布一个 `f2`
   语义事件。
3. native Win32 backend 不把物理 F2 重新编码成 VT 字节；只有查询响应候选字符
   进入 response router。
4. caret 使用 ANSI inverse，继承字符前景/背景色，不出现硬编码黑块。
5. bracketed paste 内容正确进入 value，trace 文件不包含 paste 明文。
6. stop/dispose 后协议、raw mode、光标和 alternate screen 全部恢复。

## 诊断

普通应用可通过环境变量启用 JSONL trace：

```powershell
$env:BINDTTY_INPUT_TRACE = '1'
$env:BINDTTY_INPUT_TRACE_FILE = "$env:TEMP\bindtty-input.jsonl"
npm run tui
```

复现后检查 `rawHex`、`event.kind`、`event.protocol`、`event.key` 和
`event.modifiers`。
trace 不写 stdout；bracketed paste 的 raw 与 event 内容均标为
`redacted: "paste"`。

trace 按顺序记录：

- `environment`：平台、架构、TTY、请求的协议以及安全的终端标识。
- `backend`：实际 platform/stdin adapter 和选择原因。
- `capabilities`：当前协议提供的键盘能力。
- `raw` 或 `win32-record`：输入层收到的原始证据。
- `event`：TerminalHost 最终分发的事件及协议。

自动选择策略由 `@bindtty/terminal` 覆盖，而不是由应用按 shell 名称分支：
native Win32 provider 优先，其次是支持 raw mode 的 Windows TTY，最后才是
readline。显式 backend 覆盖和 provider 缺失降级都必须体现在
`backend.reason` 中。

native provider 由 optional `@bindtty/win32-input` 自动加载，应用不得把
手工注入作为正常启动条件。Windows CI 必须实际编译该 Node-API addon；
重定向 stdin 或 addon 加载失败时必须验证 raw/readline 降级。stop/dispose
后还必须验证原 console input mode 已恢复。

raw backend 的协议协商还必须覆盖 Kitty response、primary DA 否定、畸形
response、split chunk、response 与用户输入同 chunk、超时和 restart。
readline 与 native Win32 backend 不得发送 VT probe。auto 模式不得在没有
明确确认时开启 modifyOtherKeys。

`WT_SESSION`、ConEmu、ANSICON 只记录是否存在，不记录可能包含标识符的
变量内容。bracketed paste 不得包含 `rawHex` 或 `event.text`。

## 引导式实机采集

不要手写或合成 Windows fixture。必须在目标 PowerShell 与 host 中运行
采集器，按屏幕提示逐项按键。没有实体键或被宿主保留的组合使用
`Ctrl+G` 明确标记为 skipped。

Windows PowerShell 5.1：

```powershell
npm run capture:windows:ps51
```

PowerShell 7：

```powershell
npm run capture:windows:pwsh
```

采集器覆盖：

- F1–F24。
- Shift/Ctrl/Alt + F1–F12。
- Enter、Ctrl+Enter、Alt+Enter。
- 方向键与 Ctrl 修饰方向键。
- Backspace、Delete、Tab、Shift+Tab。
- ASCII、中文、emoji。
- 固定文本 `BINDTTY_PASTE_SAMPLE` 的粘贴。

采集时不要输入密码、token、个人文本或无关命令。脚本拒绝覆盖已有
fixture；重采前必须人工移动或删除旧文件。采集失败或校验失败时脚本会
删除本次产生的不完整文件。

目标文件：

```text
packages/e2e/fixtures/windows-input/
  powershell-5.1-windows-terminal.jsonl
  powershell-7-windows-terminal.jsonl
  powershell-5.1-console-host.jsonl
  powershell-7-console-host.jsonl
```

校验单个 fixture：

```powershell
node packages/e2e/scripts/validate-windows-input-fixture.mjs <fixture-path>
```

校验完整发布矩阵：

```powershell
npm run validate:windows-matrix --workspace @bindtty/e2e
```

完整矩阵门禁要求四个文件全部存在，文件名与 shell/host 元数据一致，并且
backend 必须是由 auto policy 选中的 native Win32 provider。F2、Enter、Ctrl+Enter、
导航/编辑键、ASCII/CJK/emoji 和固定 paste sample 不允许标为 skipped；
Alt+Enter、物理键盘缺失的扩展键或被 host 明确保留的组合键允许跳过。手写 fixture
无法替代物理采集。

校验器要求环境、backend、capabilities、原始输入证据、最终事件和完整的
引导步骤标记同时存在。每一步必须 observed 或明确 skipped，因此失败
行为也可以作为基线保存，不要求当前 parser 已经正确识别该键。

发布记录必须附上：

- Windows build、PowerShell 与 host 版本。
- `terminal.keyboardCapabilities.protocol`。
- 上述六项结果。
- 失败时的脱敏 trace。
