# BindTTY Windows 窗口缩放修复计划

**依据**：[WINDOWS_RESIZE_ISSUE_REPORT.md](./WINDOWS_RESIZE_ISSUE_REPORT.md)  
**目标版本**：`0.1.0-beta.5`（建议）  
**优先级**：P0  
**范围**：BindTTY 的 Windows viewport resize、全帧呈现、错误边界、测试与文档；dayloom 仅包含接入要求，不在本仓库直接修改。

---

## 1. 修复目标

本次修复完成后，应满足：

1. Windows Terminal、经典 Console Host（conhost）中连续拖动窗口后，最终画面能在 settle 后恢复为干净、坐标正确的完整帧。
2. VS Code / Cursor 集成终端即使无法保证拖动过程无闪动，也不得在停止拖动后持续残留、重叠或错位。
3. CJK、emoji 等宽字符在缩窄、放宽和最小宽度附近不产生半格字符或整列偏移。
4. resize 触发的 layout、paint、ANSI 编码或 stdout 写入异常不得成为未捕获异常；错误必须带阶段和 viewport 上下文交给应用错误回调。
5. 不改变普通增量帧的输出策略，不在 renderer 中引入 terminal 生命周期职责，不默认改变 start、dispose 时是否清屏的行为。
6. 自动化测试和 Windows 实机矩阵均通过后，才把问题标记为修复。

## 2. 非目标

- 不承诺所有 Windows 宿主在拖动过程完全无闪烁；不支持 DEC 2026 的宿主只能通过降低重绘频率减轻闪动。
- 不在本次修复中实现通用 dirty-rect renderer 或重写 ConPTY。
- 不把 VS Code / Cursor 与 Windows Terminal 宣称为同等级体验。
- 不用吞掉异常或全局 `uncaughtException` 监听代替局部错误边界。
- 不把 dayloom 的双 resize 订阅问题作为 BindTTY 正确性修复的前置条件。

---

## 3. 设计决策

### 3.1 仅 viewport 全帧执行 ED 清屏

viewport 变化后的第一帧使用以下原子序列：

```text
DEC 2026 begin（宿主策略开启时）
  disable autowrap
  CSI 2J
  CSI H
  full frame
  reset style
  enable autowrap
DEC 2026 end（宿主策略开启时）
```

清屏只用于 `FrameIntent.kind === "viewport"`，不用于普通 paint/layout/structure 帧，也不用于首次启动和退出清理。

实现边界：

- `renderer.reset()` 仍只负责丢弃 `previousFrame`。
- renderer 仍生成与 terminal 生命周期无关的 full patch。
- app 在确认本次是 viewport repaint 后，为该 patch 添加“清屏 + home”语义。
- terminal 的 `present()` 继续负责把整个 frame 包入 synchronized-output，保证 ED 与 full patch 位于同一个呈现边界内。
- stdout 兼容模式使用相同 frame 内容，但没有 DEC 2026 包装。

建议在 `@bindtty/terminal` 导出的 `ANSI` 中补充命名常量（例如 `eraseDisplay`、`cursorHome`），由 app 组合 frame；不要在业务代码散落裸 escape sequence。

### 3.2 resize burst 使用 leading + settled 策略

Windows 默认策略调整为：

- burst 首个有效尺寸立即发布，避免窗口拖动时 UI 长时间冻结；
- burst 中间尺寸按较低频率发布，目标上限建议为 10–15 FPS；
- 每次采样到新尺寸都重置 settle timer；
- settle 时无条件发布最新且尚未发布的尺寸；
- 相同 viewport 去重，event 与 poll 命中同一尺寸时只发布一次。

首轮建议把 Win32 `minFrameIntervalMs` 从 32ms 调整为 80ms，保留 `pollIntervalMs = 50ms`、`settleDelayMs = 100ms`。最终默认值必须以 conhost 实机观测为准，不能只根据受控 PTY 测试决定。

### 3.3 resize 错误使用 app 级错误类型

现有 `RuntimeLifecycleErrorHandler` 只描述 mounted/layout/unmount，不应把 render 错误伪装成 runtime lifecycle 错误。建议：

- 新增 app 级 `onError`（或扩展为兼容的 app error handler），错误阶段至少包含 `resize`、`render`、`write`；
- 错误对象包含原始 `error`、当前 intent、目标 viewport；
- `handleResize` 和 drain 后的 `writable()` 入口捕获并上报同步异常；
- 上报后取消失败的 pending intent，保持 app/terminal 可 `stop()`、`dispose()`，避免同一坏帧在 drain 或下一事件中无限重试；
- 若未提供 `onError`，采用明确且可测试的默认策略：记录到 stderr 并停止 app，不能从事件监听器重新抛出导致进程闪退。

`onLifecycleError` 保持现有 runtime 元素生命周期语义，避免破坏公开 API。

### 3.4 消费方只保留一个 resize 调度源

dayloom 不再单独使用 `terminal.onResize(syncLayout)` 触发第二套 signal/render 链。所需的 `viewportWidth`、`listHeight` 等派生状态应：

- 从 BindTTY 布局信息派生；或
- 通过 BindTTY 提供的单次 viewport transaction/hook，在 app 提交该 viewport 帧之前更新。

BindTTY 修复不依赖 dayloom 先改，但最终集成验收必须在移除双订阅后再执行一次。

---

## 4. 实施阶段

### 阶段 0：建立证据基线

目标是先区分“画面损坏”和“进程闪退”两条问题链。

工作项：

1. 用 `@bindtty/example-wide-text` 分别在 Windows Terminal、conhost、VS Code/Cursor 中执行相同手拖步骤。
2. 为 example 增加可选诊断日志：resize source、采样尺寸、发布时间、frame intent、patch 字节数、write 结果。
3. 使用 `node --trace-uncaught` 记录向外拖宽闪退的堆栈和退出码。
4. 对比纯 BindTTY example 与 dayloom，确认闪退是否需要消费方状态才能复现。
5. 保存修复前的宿主、Node 版本、终端环境变量、操作步骤和结果。

退出条件：

- 至少取得一次闪退堆栈；若仍无法复现，保留独立的防回归故障注入测试，但不宣称已确认闪退根因。
- 三类宿主至少各有一次修复前记录。

### 阶段 1：实现 viewport 原子清屏重绘

涉及文件：

- `packages/terminal/src/ansi.ts`
- `packages/terminal/src/index.ts`
- `packages/bindtty/src/app.ts`
- `packages/bindtty/test/app.test.ts`
- `packages/terminal/test/terminal.test.ts`

工作项：

1. 导出 ED2 与 cursor-home ANSI 常量。
2. 在 app 的 viewport render 路径中，把 ED2 + home 与 full patch 组合成一次 sink write。
3. 确认 terminal 模式下 synchronized-output 的 begin/end 只出现一次，且完整包住清屏与重绘。
4. 保持普通 render、首次启动、stop/dispose 输出不变。
5. 校验 backpressure：清屏帧被阻塞时不得拆分写入，恢复 writable 后只提交最新 pending viewport。

退出条件：

- 单元测试精确断言 viewport frame 的 ANSI 顺序。
- 普通 full/diff renderer 测试不因清屏策略改变。
- 受控 reflow/旧内容场景在 resize settle 后无残留。

### 阶段 2：修正 burst/settle 调度

涉及文件：

- `packages/terminal/src/resize-coordinator.ts`
- `packages/terminal/src/terminal-profile.ts`
- `packages/terminal/test/terminal.test.ts`

工作项：

1. 修正当前 sample 在“pending 尺寸未变化”时不刷新 settle timer的问题，保证 settle 表示最后一次观测后的稳定期。
2. 明确定义 leading、throttled intermediate、trailing 三类发布行为。
3. event/poll 共存时按 viewport 去重，并保留最终事件的 source 诊断信息。
4. 先用 80/100ms 作为 Win32 候选默认值，通过实机记录决定是否调整。
5. 覆盖 stop/dispose 清 timer、时钟回退、零延迟配置和快速来回改变尺寸。

退出条件：

- fake clock 测试证明 burst 首帧及时、频率受限、末帧必达。
- 真实 PTY 快速 resize 序列最终只呈现最后尺寸，且不会遗漏 settle repaint。
- conhost 拖动闪动相较基线明显减少，没有以最终正确性换取平滑。

### 阶段 3：建立 resize/render/write 错误边界

涉及文件：

- `packages/bindtty/src/app.ts`
- `packages/bindtty/src/frame-coordinator.ts`
- `packages/bindtty/test/app.test.ts`
- `packages/bindtty/README.md`
- `doc/packages/APP.md`

工作项：

1. 定义 app 级错误事件和兼容策略。
2. 对 resize listener、runtime flush、drain retry 三个异步入口统一使用安全调度包装。
3. 分别注入 layout、renderer、sink.write 异常，验证不会逃逸到事件循环。
4. 失败后清除或替换 pending intent，验证不会死循环重试。
5. 验证错误回调自身抛错时的终止策略，并确保 terminal restore 仍可执行。

退出条件：

- resize 回调不产生 `uncaughtException` / `unhandledRejection`。
- 回调收到正确 phase、viewport 和原始 error。
- app 能确定性进入停止/故障状态，随后 `dispose()` 幂等恢复终端。

### 阶段 4：扩充自动化回归

涉及文件：

- `packages/renderer-terminal/test/ansi.test.ts`
- `packages/bindtty/test/app.test.ts`
- `packages/terminal/test/terminal.test.ts`
- `packages/e2e/real/test/pty-e2e.test.ts`
- `packages/e2e/real/harness/wide-text-resize-app.tsx`

新增用例：

1. viewport repaint 输出 `disable wrap → ED2 → home → full frame → enable wrap`。
2. synchronized-output 开启/关闭两种模式的序列边界正确。
3. 预填旧屏幕、模拟 resize/reflow 后，最终 virtual screen 与期望逐格一致。
4. `40 → 8 → 12 → 6` 以及快速 `40 → 8 → 30 → 9 → 60` burst 的最终坐标正确。
5. 宽字符恰好落在右边界、从双宽裁剪到单宽空间、最小宽度场景无 continuation cell 泄漏。
6. sink backpressure 与 resize 交错时，恢复后提交最新 viewport。
7. layout/render/write 故障注入不会结束 Node 测试进程。

必跑命令：

```powershell
npm run build:tests
npm run test:unit:run
npm run test:integration:run
npm run test:e2e:mock:run
npm run test:e2e:pty:run
npm run test:e2e:real:win
```

### 阶段 5：Windows 实机矩阵与消费方验收

矩阵至少包含：

| 宿主 | Shell | 必须通过 |
| --- | --- | --- |
| Windows Terminal | PowerShell 7、cmd | 是 |
| 经典 Console Host | Windows PowerShell 5.1、cmd | 是 |
| VS Code terminal | PowerShell 或 cmd | 最终画面正确；允许记录降级体验 |
| Cursor terminal | PowerShell 或 cmd | 最终画面正确；允许记录降级体验 |

每组依次执行：

1. 缩窄到宿主允许的最小宽度。
2. 缓慢放宽和快速向外拖宽。
3. 快速左右往返拖动至少 5 秒。
4. 改变高度。
5. 最大化并恢复。
6. 停止操作 2 秒，检查残留、重叠、滚屏和 CJK 半格。
7. Ctrl+C，检查 cursor、raw mode、alt screen 和 shell 是否恢复。

随后使用已移除双 resize 订阅的 dayloom 重复矩阵。

退出条件：

- Windows Terminal 与 conhost 全项通过。
- VS Code/Cursor 停拖 2 秒后最终画面正确，且无闪退和 shell 损坏。
- 所有失败项都有日志、截图/录像、宿主版本和明确处置结论。

---

## 5. 提交拆分

建议按以下顺序提交，便于独立评审和回滚：

1. `test: capture Windows resize and failure baselines`
2. `fix(app): clear and repaint viewport atomically on resize`
3. `fix(terminal): guarantee trailing resize after Windows bursts`
4. `fix(app): contain asynchronous render and write failures`
5. `test(e2e): cover resize reflow, wide text, and backpressure`
6. `docs: document Windows host policy and validation results`

不要把 dayloom 接入改动与 BindTTY 核心修复放在同一个提交中。

## 6. 风险与回滚

| 风险 | 控制措施 |
| --- | --- |
| ED2 在非全屏/非 alt-screen 应用中清除用户可见内容 | 只在已启动 app 的 viewport repaint 使用；补充公开选项以允许兼容场景禁用 |
| conhost 忽略 DEC 2026，仍能看到清屏中间态 | ED2 与 full frame 保持单次 write，并降低 burst 中间帧频率 |
| 80ms 节流导致交互跟手性下降 | 保留 leading frame；用实机数据调整默认值；允许用户覆盖 |
| 错误被上报后 app 状态不一致 | 明确 fault/stop 状态，取消 pending，测试 dispose 恢复路径 |
| 新错误 API 破坏 `onLifecycleError` 使用者 | 保留原 API 语义，新增 app 级 handler，并在文档中说明迁移 |
| 自动化 PTY 通过但手拖仍失败 | Windows 实机矩阵作为发布门禁，不用 PTY 结果替代 |

若 ED2 在某宿主引入更严重回归，应通过显式配置回退到旧的“完整覆盖、不清屏”策略；不能撤销错误边界和 trailing resize 修复。

## 7. 完成定义

只有同时满足以下条件才算完成：

- 阶段 0–5 的退出条件全部满足。
- 全量构建、单元、集成、mock E2E、PTY E2E 和 Windows real E2E 通过。
- Windows Terminal 与 conhost 实机矩阵通过；VS Code/Cursor 达到已定义的降级标准。
- dayloom 移除双 resize 订阅后的集成验收通过。
- 文档更新了清屏策略、Win32 resize 默认值、错误 API、宿主兼容性和真实验证结果。
- changelog 记录行为变化及兼容配置。
- 没有用未捕获异常处理器掩盖闪退，也没有把“未复现”写成“已修复”。
