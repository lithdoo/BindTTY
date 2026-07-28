# BindTTY Windows 窗口缩放验证手册

本文档供 Windows 环境中的 AI 验证代理执行，用于验证 PowerShell 和不同
Windows 终端宿主中，BindTTY 在调整窗口大小后不会出现字符错位、残留、
重复、意外滚屏或宽字符破坏。

验证必须在 **BindTTY 仓库根目录**执行。AI 可以安装依赖、构建、运行测试和
分析结果，但不得修改源码、测试或基准来换取通过。Windows 输入层的功能键、
Ctrl+Enter 和 caret 验收是另一套门禁，见
[WINDOWS_INPUT_VALIDATION.md](./WINDOWS_INPUT_VALIDATION.md)。

## 1. 验收结论规则

只有同时满足以下条件，才可以报告 Windows 窗口缩放验证通过：

1. `node-pty` 在当前 Windows 环境可加载。
2. real PTY 测试实际执行，不能处于 skipped 状态。
3. `real PTY: resize keeps final screen rows at exact coordinates` 通过。
4. 四组 PowerShell/Host 实机人工检查全部完成。
5. 缩窄、放宽和连续快速缩放后，最终字符坐标正确，无旧帧残留或意外滚屏。
6. CJK、emoji、边框和光标状态正确，退出后终端恢复。

允许的最终结论只有：

- `PASS`：自动测试和四组实机检查全部通过。
- `AUTOMATION PASS / PHYSICAL MATRIX INCOMPLETE`：自动测试通过，但实机矩阵
  未完成。
- `FAIL`：任一已执行的必测项失败。

`node-pty` 缺失或测试被 skip 只能记为未完成，不能记为通过。Windows 输入
fixture 缺失不等同于窗口缩放失败，但必须在独立的输入验证报告中说明。

## 2. 实机矩阵

必须在真实 Windows 10/11 上覆盖以下四组，不得用 WSL 代替：

| Shell | Host | Host 识别 |
| --- | --- | --- |
| Windows PowerShell 5.1 | Windows Terminal | `PSEdition=Desktop`，`WT_SESSION` 非空 |
| PowerShell 7 | Windows Terminal | `PSEdition=Core`，`WT_SESSION` 非空 |
| Windows PowerShell 5.1 | 传统 Console Host | `PSEdition=Desktop`，`WT_SESSION` 为空 |
| PowerShell 7 | 传统 Console Host | `PSEdition=Core`，`WT_SESSION` 为空 |

传统 Console Host 必须实际从 `conhost.exe` 窗口运行，不能把 Windows Terminal
标签页当作 Console Host。

## 3. 环境记录与安装

每个 shell/host 组合开始前，在仓库根目录记录：

```powershell
[System.Environment]::OSVersion.VersionString
$PSVersionTable
$Host.Name
$env:WT_SESSION
node --version
npm --version
git rev-parse HEAD
git status --short
```

不得清理或覆盖已有工作区修改。首次验证时安装锁文件指定的依赖：

```powershell
npm ci
npm run test:e2e:real:env
```

环境输出必须包含：

```text
host=windows
platform=win32
nodePty=true
runner=windows-native
```

如果 `nodePty=false`，先保存安装或 native 编译错误。不得把 real PTY 的 skip
当作测试通过，也不得改用 WSL 结果代替 Windows native 结论。

## 4. 自动坐标验证

每个 shell/host 组合都执行 Windows runner：

```powershell
npm run test:e2e:real:win
```

该 runner 当前会构建并执行 `@bindtty/e2e` 的 mock 与 real 测试。输出中必须
实际出现并通过：

```text
real PTY: resize keeps final screen rows at exact coordinates
```

不能只看退出码；AI 必须检查该测试不是 `SKIP`。这个用例使用真实
PTY/ConPTY，把窗口按以下序列调整并校验完整最终屏幕：

| 尺寸 | 预期内容布局 |
| --- | --- |
| `40x12` | 初始窗口 |
| `8x12` | 内容区 `4x4`，边框和 12 行坐标完全匹配 |
| `12x12` | 内容区 `8x2`，旧窄帧不得残留 |
| `6x12` | 内容区 `2x7`，CJK/emoji 不得拆列或触发底行滚屏 |

若只需复查精确坐标用例，先构建 real 测试，再执行：

```powershell
npm run build:real --workspace @bindtty/e2e
node --test --test-concurrency=1 --test-force-exit --test-name-pattern="resize keeps final screen rows at exact coordinates" packages/e2e/dist/real/test/pty-e2e.test.js
```

目标命令仍会加载同文件中的其他测试；它们应显示为 name pattern mismatch 的
skip，目标 resize 测试本身必须执行并通过。

首次验证当前 commit 时还应在任一 Windows Terminal 组合中执行全仓门禁：

```powershell
npm test
git diff --check
```

测试产生的 `dist` 通常被 gitignore。如果出现非预期源码修改，列出并停止，
不要自行删除用户文件。

## 5. 人工连续缩放验证

在每个 shell/host 组合中运行宽字符示例：

```powershell
npm start --workspace @bindtty/example-wide-text
```

应用启动后按顺序操作：

1. 记录初始窗口尺寸，确认三个边框完整，能看到 CJK、emoji 和 combining mark。
2. 缓慢把窗口缩到约 20 列，再放宽到 80 列。
3. 缩到宿主允许的最窄宽度，再恢复到约 80 列。
4. 连续快速左右拖动窗口边缘至少 10 次，最后停在约 40 列。
5. 缩短和增高窗口各一次，确认底部没有触发不可逆滚屏。
6. 最大化，再恢复窗口。
7. 停止拖动后等待 2 秒，检查最终稳定画面。
8. 按 `Ctrl+C` 退出，确认光标、输入回显和 alternate screen 已恢复。

每次停止缩放后的验收标准：

- 所有可见边框的四角和横竖线对齐。
- `中` 和 emoji 各占两个显示列，不出现半个字符、替代符或后一列脏数据。
- 文本只按当前宽度换行，不保留上一尺寸的字符。
- 不出现重复行、错位行、空洞、闪回到旧帧或内容整体上移。
- 右下角写入不引发额外滚屏，顶部内容和边框不消失。
- 停止拖动后画面稳定，不持续重绘或在两个布局间振荡。
- 退出后没有隐藏光标、残留边框或异常控制台模式。

Windows Terminal 和 Console Host 的最小窗口宽度可能不同；记录实际可达到的
尺寸即可，不要通过修改系统设置强行达到 6 列。`6x12` 的精确极窄坐标由
ConPTY 自动测试负责。

## 6. 失败复现与证据

出现异常时，先保持代码不变并收集：

- commit SHA、`git status --short`。
- Windows build、Node/npm、PowerShell 版本。
- Windows Terminal 或 Console Host，以及宿主版本。
- 失败前后的列数和行数、完整缩放序列。
- 首个失败命令、退出码和未截断输出。
- resize 目标测试是 fail、skip 还是超时。
- 失败画面截图；截图不得包含密码、token 或私人内容。
- 是否只在快速缩放、极窄宽度、Console Host 或某个 PowerShell 版本出现。
- 退出后光标和控制台状态是否恢复。

优先用相同尺寸序列重跑目标自动用例。不要先调整 debounce/poll 时间、放宽
断言或更新期望屏幕；这些行为会破坏失败证据。报告应区分：

- viewport 事件没有到达；
- 收到旧尺寸或重复尺寸；
- layout 使用了错误尺寸；
- renderer 留下旧 frame；
- ANSI autowrap 导致右下角滚屏；
- 宿主渲染异常但 screen model 坐标正确。

## 7. AI 执行约束

交给 AI 验证时，要求它完整阅读本文档并遵守：

1. 只做环境准备、测试、人工引导和诊断，不修改代码。
2. 逐组记录 shell/host，不能用一个宿主的结果复制到其他组合。
3. 检查测试数量和 skip 原因，不能只报告命令退出码。
4. 没有看到目标 resize 测试实际执行时，结论必须是未完成。
5. 人工检查需要用户拖动窗口时，明确给出操作并等待用户确认；不得自行假设。
6. 保留首个失败的原始输出，不通过重跑隐藏偶发错误。
7. 不运行删除、reset、checkout 或覆盖 fixture 的命令。

可直接给 Windows AI 以下任务：

```text
请完整阅读仓库根目录 WINDOWS_RESIZE_VALIDATION.md，严格按文档验证当前
commit。不要修改任何源码、测试、fixture 或期望值。依次完成环境检查、
Windows native real PTY 精确坐标测试和四组 PowerShell/Host 人工缩放矩阵。
逐项区分 PASS、FAIL、SKIP、NOT RUN；需要我拖动窗口时暂停并给出明确指令。
最后使用文档模板报告，并附首个失败证据。目标测试被 skip 或实机矩阵未完成
时不得报告 PASS。
```

## 8. 最终报告模板

```text
BindTTY Windows 窗口缩放验证

Commit:
git status:
Windows:
Node/npm:

环境:
- host=windows:
- platform=win32:
- nodePty=true:

自动测试:
- test:e2e:real:win:
- exact-coordinate resize test (PASS/FAIL/SKIP):
- full npm test:
- git diff --check:

实机矩阵:
- PowerShell 5.1 / Windows Terminal:
- PowerShell 7 / Windows Terminal:
- PowerShell 5.1 / Console Host:
- PowerShell 7 / Console Host:

逐项结果:
- 慢速缩窄/放宽:
- 极窄/恢复:
- 快速连续缩放:
- 高度变化:
- 最大化/恢复:
- CJK/emoji/combining:
- 边框和最终坐标:
- 无意外滚屏/旧帧:
- 退出恢复:

Skipped/Not run:
Failures:
Evidence:

最终结论:
- PASS
或
- AUTOMATION PASS / PHYSICAL MATRIX INCOMPLETE
或
- FAIL
```
