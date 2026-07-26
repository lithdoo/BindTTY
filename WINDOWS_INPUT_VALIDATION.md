# BindTTY Windows 输入功能验证手册

本文档供 Windows 环境中的 AI 验证代理执行。目标是验证 BindTTY 输入层在
PowerShell、Windows Terminal 和传统 Console Host 中是否正确处理原生
Win32 输入、功能键、修饰键、Unicode、粘贴和 Textarea。

验证必须在 **BindTTY 仓库根目录**执行。AI 可以执行构建、自动测试和结果
分析；物理键盘采集阶段必须由用户根据屏幕提示按键。AI 不得生成、补写或
修改采集结果来伪造通过。

## 1. 验收结论规则

只有同时满足以下条件，才可以报告 Windows 验证通过：

1. `@bindtty/win32-input` 在 Windows 上成功编译。
2. input、terminal、interaction、widgets 自动测试全部通过。
3. Windows ConPTY E2E 全部通过。
4. 四组 PowerShell/Host 物理 fixture 全部存在并通过严格矩阵校验。
5. Textarea 中 F2 不输入 `B`，Ctrl+Enter 只提交一次，caret 没有黑色硬编码色块。
6. stop/dispose 后 Console Input Mode、raw mode、光标和 alternate screen 正常恢复。

如果缺少物理 fixture，只能报告“自动测试通过，物理矩阵未完成”，不得报告
M7 或 Windows 发布门禁完成。

## 2. 环境要求

- Windows 10/11。
- Node.js 22；最低支持版本为 Node.js 18。
- npm。
- Windows PowerShell 5.1。
- PowerShell 7 (`pwsh`)。
- Windows Terminal。
- Visual Studio Build Tools，安装 “Desktop development with C++”。
- Python 3，供 `node-gyp` 使用。
- 一个带 F1–F12 的实体键盘。没有 F13–F24 属于允许跳过的情况。

首先打开 PowerShell，进入仓库根目录：

```powershell
Set-Location <bindtty-repository-path>
node --version
npm --version
$PSVersionTable.PSVersion
```

AI 应记录：

- Windows build；
- Node/npm 版本；
- PowerShell 版本；
- 当前 host；
- 当前 commit；
- 工作区是否有未提交修改。

```powershell
[System.Environment]::OSVersion.VersionString
git rev-parse HEAD
git status --short
```

不得擅自清理或覆盖现有工作区修改。

## 3. 安装及 native addon 编译

执行：

```powershell
npm ci
```

安装过程应编译 `@bindtty/win32-input`。确认产物存在：

```powershell
Test-Path packages\win32-input\build\Release\bindtty_win32_input.node
```

结果必须为 `True`。如果编译失败：

1. 保存完整的 `node-gyp` 错误。
2. 检查 Visual Studio C++ workload 和 Python。
3. 不得通过删除 optional package 或改用 raw backend 来宣称 native 验证通过。

## 4. 自动测试

依次执行；任一命令失败都应停止并分析：

```powershell
npm test --workspace @bindtty/win32-input
npm test --workspace @bindtty/input
npm test --workspace @bindtty/terminal
npm test --workspace @bindtty/interaction
npm test --workspace @bindtty/widgets
npm test --workspace @bindtty/e2e
```

随后执行 Windows ConPTY runner：

```powershell
npm run test:e2e:real:win
```

重点确认测试输出包含：

- native provider discovery；
- F1–F24 和修饰键映射；
- UTF-16 surrogate/emoji 合并；
- F2 语义提交且 Textarea 没有 value 变更；
- real PTY/ConPTY 测试无失败。

最后执行全仓与产物门禁：

```powershell
npm test
npm run build:examples
npm run docs:build
npm run pack:dry-run
git diff --check
```

构建或测试生成的正常 `dist` 文件通常被 gitignore；如果 `git status` 出现新的
非预期源码改动，AI 必须列出并解释，不能自行删除用户文件。

## 5. 验证 native provider 自动选择

在普通 PowerShell 控制台中执行：

```powershell
$env:BINDTTY_INPUT_TRACE = "1"
$env:BINDTTY_INPUT_TRACE_FILE = Join-Path $env:TEMP "bindtty-native-smoke.jsonl"
npm start --workspace @bindtty/example-textarea
```

应用启动后按一次 F2，再按 `Ctrl+C` 正常退出。此步骤只用于快速确认 backend
和 Textarea，不替代正式矩阵。检查 trace：

```powershell
Get-Content $env:BINDTTY_INPUT_TRACE_FILE |
  Select-String '"recordType":"backend"'
Get-Content $env:BINDTTY_INPUT_TRACE_FILE |
  Select-String '"recordType":"capabilities"'
```

预期包含：

```text
"stdinAdapter":"win32"
"reason":"win32-input-provider-available"
"protocol":"win32"
```

完成后清理本次 smoke 环境变量；临时 trace 可在保存诊断后删除：

```powershell
Remove-Item Env:BINDTTY_INPUT_TRACE -ErrorAction SilentlyContinue
Remove-Item Env:BINDTTY_INPUT_TRACE_FILE -ErrorAction SilentlyContinue
```

如果 backend 是 `raw` 或 `readline`，Windows native 发布门禁失败。应检查：

- addon 是否编译并能加载；
- stdin 是否被重定向；
- 当前进程是否真的连接 Windows console handle；
- trace 中的 backend reason。

## 6. 四组物理键盘采集

目标文件：

```text
packages/e2e/fixtures/windows-input/
  powershell-5.1-windows-terminal.jsonl
  powershell-7-windows-terminal.jsonl
  powershell-5.1-console-host.jsonl
  powershell-7-console-host.jsonl
```

采集器拒绝覆盖已有 fixture。若需要重采，AI 应先把旧文件移动到明确的备份
目录，不得直接删除：

```powershell
$backup = Join-Path $env:TEMP ("bindtty-input-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $backup
Move-Item packages\e2e\fixtures\windows-input\*.jsonl $backup
```

没有现有 fixture 时不要运行上述 `Move-Item`。

### 6.1 Windows Terminal + Windows PowerShell 5.1

在 Windows Terminal 的 Windows PowerShell profile 中确认：

```powershell
$PSVersionTable.PSEdition
$env:WT_SESSION
```

预期为 `Desktop`，且 `WT_SESSION` 非空。执行：

```powershell
npm run capture:windows:ps51
```

### 6.2 Windows Terminal + PowerShell 7

在 Windows Terminal 的 PowerShell profile 中确认：

```powershell
$PSVersionTable.PSEdition
$env:WT_SESSION
```

预期为 `Core`，且 `WT_SESSION` 非空。执行：

```powershell
npm run capture:windows:pwsh
```

### 6.3 Console Host + Windows PowerShell 5.1

必须从传统 Console Host 启动，不能把 Windows Terminal 标签页当作
Console Host。确认：

```powershell
$PSVersionTable.PSEdition
$env:WT_SESSION
```

预期为 `Desktop`，且 `WT_SESSION` 为空。执行：

```powershell
npm run capture:windows:ps51
```

### 6.4 Console Host + PowerShell 7

确认：

```powershell
$PSVersionTable.PSEdition
$env:WT_SESSION
```

预期为 `Core`，且 `WT_SESSION` 为空。执行：

```powershell
npm run capture:windows:pwsh
```

### 6.5 采集时的按键规则

- 严格按屏幕顺序，每个物理键只按一次。
- F2、Enter、Ctrl+Enter、导航键、编辑键、Tab/Shift+Tab、ASCII、中文、
  emoji 和固定 paste sample 不允许跳过。
- Alt+Enter 如果被 Windows Terminal 明确绑定为全屏切换，可按 `Ctrl+G` 标为
  skipped；必须在报告中注明宿主保留，不能写成 BindTTY 通过。
- F13–F24 或被 host/系统保留的修饰功能键可按 `Ctrl+G` 标记 skipped。
- paste 步骤只能粘贴固定文本 `BINDTTY_PASTE_SAMPLE`。
- 不得输入密码、token、个人文本或命令历史。
- 不得手工编辑 JSONL。
- 如果按错键，让校验失败并重新采集，不要修补 fixture。

## 7. 完整矩阵校验

四次采集完成后，在仓库根目录执行：

```powershell
npm run validate:windows-matrix --workspace @bindtty/e2e
```

预期四个文件分别显示 `valid`，命令退出码为 0。校验器会检查：

- 四个文件是否齐全；
- 文件名是否匹配 shell/host 元数据；
- 是否自动选择 native Win32 backend；
- capability 是否为 `win32`；
- 完整 79 步及顺序；
- 每个 observed key 和 modifier 是否匹配；
- mandatory step 是否被跳过；
- paste 是否完整且 trace 中没有 payload。

也可以单独验证一个文件：

```powershell
node packages\e2e\scripts\validate-windows-input-fixture.mjs <fixture-path>
```

## 8. Textarea 人工体验验收

在四个 shell/host 组合中运行 Textarea playground：

```powershell
npm start --workspace @bindtty/example-textarea
```

逐项确认：

1. F2 提交一次，value 中没有新增 `B`。
2. Ctrl+Enter 提交一次，不插入换行。
3. 普通 Enter 插入换行。
4. Alt+Enter 不被误判成 Meta+Enter 提交。
5. 中文和 emoji 输入完整。
6. Backspace/Delete/方向键行为正常。
7. 粘贴固定文本只插入一次。
8. caret 使用字符自身颜色的 inverse 效果，没有全黑硬编码色块。
9. 退出后光标、输入回显和控制台模式恢复正常。

任何一项失败都需要保存脱敏 trace，并记录 shell、host、backend 和 protocol。

## 9. 失败诊断

启用 trace：

```powershell
$env:BINDTTY_INPUT_TRACE = "1"
$env:BINDTTY_INPUT_TRACE_FILE = Join-Path $env:TEMP "bindtty-input-failure.jsonl"
```

复现后检查：

```powershell
Get-Content $env:BINDTTY_INPUT_TRACE_FILE |
  Select-String '"recordType":"environment"|"recordType":"backend"|"recordType":"capabilities"|"recordType":"event"'
```

报告至少包含：

- shell 和版本；
- host；
- Windows build；
- backend reason；
- capability protocol；
- 失败按键；
- 是否重复触发；
- Textarea value 是否被污染；
- 脱敏 trace 路径。

不要把包含敏感输入的 trace 提交到仓库。正式采集器会对固定 paste sample
脱敏；普通诊断仍应只输入无敏感测试文本。

## 10. AI 最终报告模板

```text
BindTTY Windows 输入验证

Commit:
Windows:
Node/npm:

自动测试:
- win32-input:
- input:
- terminal:
- interaction:
- widgets:
- ConPTY E2E:
- full npm test:
- examples/docs/pack:

物理矩阵:
- PowerShell 5.1 / Windows Terminal:
- PowerShell 7 / Windows Terminal:
- PowerShell 5.1 / Console Host:
- PowerShell 7 / Console Host:
- validate:windows-matrix:

人工 Textarea:
- F2:
- Ctrl+Enter:
- Enter / Alt+Enter:
- CJK / emoji / paste:
- caret color:
- console restore:

Backend/protocol:
Skipped keys:
Failures:
Trace:

最终结论:
- PASS
或
- AUTOMATION PASS / PHYSICAL MATRIX INCOMPLETE
或
- FAIL
```

AI 必须根据证据选择结论，不得把 skip、缺失 fixture 或未执行的人工检查写成
PASS。
