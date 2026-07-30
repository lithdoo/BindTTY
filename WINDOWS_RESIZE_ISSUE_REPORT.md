# Windows 窗口缩放问题报告（dayloom TUI / BindTTY）

**状态**：已确认复现路径与根因方向；实机矩阵验收尚未完成（见 [WINDOWS_RESIZE_VALIDATION.md](./WINDOWS_RESIZE_VALIDATION.md)、[doc/testing/BASELINE.md](./doc/testing/BASELINE.md) M7）。  
**报告日期**：2026-07-30  
**相关消费方**：`dayloom` TUI（`bindtty@0.1.0-beta.4` / `@bindtty/terminal@0.1.0-beta.4`）  
**触发脚本**：`dayloom/examples/dayloom-tui/verify-resize.bat`

---

## 1. 问题表现

在真实 Windows 宿主上手动缩放窗口时，BindTTY 全屏 TUI（以 dayloom 为例）出现下列现象。现象随宿主差异明显，不是偶发花屏。

| 宿主 | 典型表现 |
| --- | --- |
| PowerShell + 经典 Console Host（conhost） | 缩放过程**明显闪动**；字符有**横向/纵向偏移**；快速**向外拖宽**时进程可能直接**闪退** |
| VS Code / Cursor 集成终端 | 缩放时字符**直接乱码/错位**；停拖后 idle 数秒也常无法自愈 |
| Windows Terminal（预期对照） | 相对上述宿主应更好（DEC 2026 更可能生效）；本报告复现时主路径为 conhost / IDE 终端，WT 仍待矩阵验收 |

`verify-resize.bat` 一次实测环境摘要：

```text
shell        = cmd.exe（由 bat 拉起）
WT_SESSION   = （空）
TERM_PROGRAM = （空）
columns/rows = 探测为空（cmd 下常见；真实尺寸由 Node stdout 读取）
node         = 22.12.0
bindtty      = 0.1.0-beta.4
@bindtty/terminal = 0.1.0-beta.4
host 判断    = 无 WT_SESSION → 更可能 classic Console Host (conhost)
```

验收检查单期望（bat 文案）：缩窄/放宽、宿主最小宽、快速左右拖、改高、最大化恢复后，静止 2s 应无残留字符、无重叠行、无不可逆滚屏、CJK 无半格；失败则画面持续花或 Ctrl+C 后 shell 损坏。

---

## 2. 调用链（消费方 → BindTTY）

dayloom 挂载方式（摘要）：

1. `createNodeTerminal({ useAltScreen, hideCursor, rawMode, ... })`
2. 额外 `terminal.onResize(syncLayout)`：写入 `viewportWidth` / `listHeight` 等 signal
3. `createApp(view, { terminal })` → `app.start()` 内部再订阅 `terminal.onResize` 做 viewport 全帧重绘

BindTTY 缩放主路径：

```text
stdout resize event 和/或 win32 轮询 (默认 50ms)
  → ResizeCoordinator（minFrame ≈ 32ms，settle ≈ 100ms）
  → App handleResize → FrameCoordinator intent kind=viewport
  → renderer.reset()（丢弃 previousFrame）
  → layoutRoot(新 viewport) → renderer.render → full ANSI patch
  → TerminalOutput.present（win32/WT/vscode 默认可包 DEC 2026 synchronized-output）
```

全帧 patch 行为要点：

- 写入前关闭 ANSI autowrap，写完再打开（降低右下角误滚屏）
- 用绝对光标定位重写单元格（含空白格），**不**发送 `\x1b[2J` 清屏
- 文档明确 MVP **不主动 clear screen**（见 `doc/packages/TERMINAL.md` / `RENDERER.md`）

---

## 3. 根因分析

### 3.1 闪动（conhost / 快速拖动）

- 拖动突发期间，coordinator 约每 **32ms** 发布一次 viewport，每次都是 **整屏 full repaint**。
- 经典 conhost 对 **DEC 2026 synchronized-output** 支持差或忽略时，中间帧直接可见 → 肉眼闪动。
- dayloom 在 app 之外再挂一层 `onResize(syncLayout)`，可能在同一次尺寸变化上再叠 runtime dirty 重绘，加重闪动。

### 3.2 字符偏移 / 乱码（尤其 VS Code、Cursor）

- Windows **ConPTY** 常在应用收到尺寸并重绘之前，对已有缓冲做 **reflow / 折行**。
- BindTTY 随后按「新尺寸 + 绝对坐标」覆盖；若宿主已折行/滚行，覆盖无法等价于清屏重建 → 残留、错位、重叠。
- `process.stdout.columns/rows` 与真实可视列行短暂不一致时，应用按错误宽度排版 → **整列偏移**。
- IDE 终端（`TERM_PROGRAM=vscode`）+ ConPTY 是 fullscreen TUI 的已知高风险组合；自动化 PTY 步进尺寸用例**不能**等价于用户手拖窗口。

### 3.3 无清屏的全帧策略放大宿主缺陷

- `renderer.reset()` 只清空内部 previousFrame，迫使下一次 `diff` 走 full patch。
- full patch **依赖**「写满每一格（含空格）+ 关 wrap」来擦掉旧内容，而不是 ED 清屏。
- 在宿主已 reflow、行数/滚动位置已变的情况下，该策略不足以保证最终画面干净。

### 3.4 向外拖宽闪退（待堆栈钉死）

- `FrameCoordinator` 在 `render` 抛错时会 **重新抛出**；resize 监听若未接住，未捕获异常可直接结束 Node 进程。
- dayloom 当前未展示对 `onLifecycleError` / uncaught 的专门兜底。
- 候选：paint/layout 在某些宽度下抛错（例如宽字符边界约束）、stdout/原生输入路径异常。需用 `--trace-uncaught` 与退出码确认，**尚未在本报告中钉死到单一 throw 点**。

### 3.5 与现有测试覆盖的差距

- 已有：`real PTY: resize keeps final screen rows at exact coordinates`（受控 cols/rows 步进 + 最终坐标断言）。
- 未覆盖：conhost / VS Code 手拖突发、DEC 2026 无效宿主、reflow 后无清屏的残留、消费方双订阅 resize。
- 基线文档写明：Windows Terminal、PowerShell、conhost/ConPTY **实机矩阵仍按计划留在 M7**。

---

## 4. 结论

| 判断 | 说明 |
| --- | --- |
| 问题归属 | **主要在 BindTTY 的 Windows 缩放/呈现策略与宿主差异**；dayloom 的双 `onResize` 会加重症状，但不是唯一根因 |
| 严重程度 | 阻塞 Windows 上可靠全屏 TUI 体验；IDE 终端路径尤甚 |
| 自动化现状 | Linux/受控 PTY 坐标回归有覆盖；**不能**据此宣称 Windows 手拖缩放通过 |
| 闪退 | 高度怀疑 resize 路径未捕获异常；需堆栈确认后再合入防护 |

---

## 5. 建议修复方向（BindTTY 优先）

1. **viewport 全帧**：在 synchronized-output（若开启）区域内先 ED 清屏（或等价 `CSI 2J` + home），再写 full patch，降低 ConPTY reflow 残留。
2. **突发策略**：拖动中可降低 mid-burst 全帧频率，或偏重 settle 后一次全量重绘，减轻 conhost 闪动（需权衡中间态正确性）。
3. **错误边界**：App/Terminal resize 路径捕获 render 错误并经 `onLifecycleError` 上报，避免未捕获异常闪退。
4. **消费方**：dayloom 将 `syncLayout` 并入同一次 viewport frame，避免双订阅竞态。
5. **文档/验收**：标明 VS Code/Cursor 为降级环境；以 Windows Terminal + conhost 实机矩阵为门禁（见验证手册）。

---

## 6. 建议复现与取证步骤

1. **隔离 BindTTY**：在仓库根执行 `npm start --workspace @bindtty/example-wide-text`，用与 dayloom 相同宿主手拖缩放。若同样闪/乱/崩 → 纯 BindTTY；若仅 dayloom 崩 → 再查 signal/列表高度路径。
2. **宿主对比**：Windows Terminal → 纯 conhost → VS Code/Cursor，记录差异。
3. **闪退取证**：
   ```powershell
   node --trace-uncaught <dayloom-or-example-entry>
   echo $LASTEXITCODE
   ```
4. **自动化**：`npm run test:e2e:real:win`，确认 `resize keeps final screen rows at exact coordinates` 实际执行且通过（非 skip）。
5. **人工矩阵**：按 [WINDOWS_RESIZE_VALIDATION.md](./WINDOWS_RESIZE_VALIDATION.md) 四组 shell/host 填写结论。

---

## 7. 相关文件

| 路径 | 角色 |
| --- | --- |
| `packages/terminal/src/resize-coordinator.ts` | 事件 + 轮询、burst/settle |
| `packages/terminal/src/terminal-profile.ts` | win32 默认 50/32/100ms；sync output 策略 |
| `packages/terminal/src/terminal-output.ts` | DEC 2026 包裹 present |
| `packages/bindtty/src/app.ts` | viewport intent → `renderer.reset()` |
| `packages/bindtty/src/frame-coordinator.ts` | 渲染错误重新抛出 |
| `packages/renderer-terminal/src/ansi.ts` | full patch：关 wrap + 绝对定位写格，无 ED |
| `packages/e2e/real/test/pty-e2e.test.ts` | 受控 PTY 缩放坐标回归 |
| `WINDOWS_RESIZE_VALIDATION.md` | Windows 实机缩放验收手册 |
| `dayloom/packages/tui/src/app.tsx` | 消费方：双 resize 订阅 + alt screen |
