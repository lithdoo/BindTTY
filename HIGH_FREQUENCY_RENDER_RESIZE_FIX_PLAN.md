# BindTTY 高频刷新与复杂结构 Resize 稳定性修复方案

**状态**：核心实现和相关自动化验证完成，待 dayloom 实机矩阵验收
**范围**：`@bindtty/runtime`、`@bindtty/widgets`、`bindtty` app/frame pipeline、测试与诊断
**主要环境**：原生 PowerShell / Console Host / Windows Terminal；同时覆盖 VS Code、Cursor 和 Unix PTY
**原则**：修复 BindTTY 的核心稳定性，不要求消费方通过降低 AI 流速、删除复杂结构或把正文放进 key 来规避。

## 1. 问题定义

当前简单 Hub 页面可以完成 resize，但包含以下组合的 Session 页面仍可能卡死或退出：

- keyed `<for>` 动态消息；
- AI 异步流式 delta；
- `VScrollView`、scrollbar 和 `stickToBottom`；
- Textarea 高度变化；
- viewport resize；
- stdout backpressure。

这不是单独的终端尺寸探测问题。原生 PowerShell 不使用 xterm viewport query，近期 terminal response router 与 Win32 输入隔离提交不能解决此处的 runtime/render 调度问题。

### 1.1 已确认的核心缺陷

#### Keyed For 不能更新同 key 的新 item

`runtime/src/mount.ts` 当前在 key 相同时只替换 `MountedForItemNode.item`，不会让
`renderItem` 或已挂载子树读取新的 item。

结果：

- 稳定 `message.id` 会导致消息正文停止更新；
- 消费方只能把 `message.text` 放进 key，强制卸载并重建消息子树；
- 每个流式 delta 被提升为 structure dirty。

目标契约：

> key 只标识逻辑 identity。相同 key 的 item 内容变化必须更新对应子树，不能要求 key
> 包含可变正文。

#### Runtime flush 与 viewport resize 没有统一帧预算

当前 terminal resize coordinator 只限制 viewport 事件频率。AI delta、scroll layout
反馈和其他 runtime dirty 仍可在每个异步 tick 触发完整 frame。

`FrameCoordinator` 只在正在 render 或 stdout blocked 时合并 pending intent，没有：

- 跨异步 tick 的 frame cadence；
- 每帧 stabilization pass 上限；
- runtime revision；
- 对 layout 回写的统一事务；
- 持续高频输入下的公平调度。

#### VScrollView 在 layout 后继续写 signal

当前 `VScrollView.onLayout` 会更新外部 offset、无条件递增 `layoutTick`，并更新
scrollbar signal。一次 layout 可能继续派生 layout/paint frame。

在 Session 页面中，典型链路为：

```text
assistant delta
  -> keyed collection structure dirty
  -> Yoga layout
  -> VScrollView onLayout
  -> offset/layoutTick/scrollbar signal
  -> runtime dirty
  -> additional layout/paint

viewport resize
  -> viewport frame
  -> Yoga layout
  -> the same scroll feedback chain
```

#### 单帧失败默认停止整个应用

resize、runtime-flush 或 drain frame 抛错后，app 默认取消 pending 并执行 `app.stop()`。
瞬时 layout/render/write 错误因此表现为“崩回 PowerShell”，且应用未提供 `onError`
时缺少可持久化诊断。

## 2. 修复目标

必须同时满足：

1. 相同 key 的新 item 能更新画面，key 不包含正文。
2. AI delta、layout feedback、resize 和 drain 使用同一个 frame scheduler。
3. 高频输入期间输出帧率有明确上限，同时保留最终状态。
4. viewport frame 使用最新 viewport 与最新 runtime revision，不渲染过期组合。
5. scroll layout 反馈在有限 pass 内稳定，不形成无限 render 链。
6. stdout blocked 时只保留最新合并状态，drain 后提交最终 frame。
7. 单帧 layout/render 失败保留上一成功画面并上报，不立即拆除 terminal lifecycle。
8. 不吞掉错误；诊断必须包含 phase、intent、revision、viewport 和 scheduler 状态。
9. 原生 PowerShell Session 页面在 resize 和 AI streaming 同时发生时不退出。

## 3. 非目标

- 不通过 dayloom debounce AI delta 作为核心修复。
- 不要求 dayloom 把正文放进 key。
- 不用全局 `uncaughtException` / `unhandledRejection` 掩盖错误。
- 不把 xterm viewport query 当作原生 PowerShell 修复。
- 不在本轮重写 Yoga、renderer 或全部 vnode API。

## 4. 目标架构

```text
terminal resize ───────────────┐
runtime dirty / AI delta ──────┤
layout feedback ───────────────┼─> AppFrameScheduler
stdout drain ──────────────────┤     - merge latest state
manual render/focus ───────────┘     - bounded cadence
                                     - revision snapshot
                                     - bounded stabilization
                                               |
                                               v
                                      prepare frame transaction
                                      layout -> scroll resolve
                                      -> render candidate
                                               |
                                  success -----+----- failure
                                    |                  |
                              commit state       retain last commit
                              write atomically   report structured error
```

### 4.1 Runtime revision

每次 runtime dirty 分配单调递增 revision。scheduler 保存：

```ts
interface PendingFrame {
  kind: FrameIntentKind;
  revision: number;
  viewport?: AppViewport;
  reasons: Set<FrameReason>;
}
```

合并规则：

- dirty 等级仍为 `paint < layout < structure < viewport`；
- viewport 永远取最新有效值；
- revision 永远取最新值；
- reasons 合并，用于诊断；
- blocked/rendering/scheduled 状态下不丢失更新。

### 4.2 帧调度

引入可注入 clock 的 `AppFrameScheduler`：

- 同一 tick 更新只安排一个 flush；
-持续更新默认限制为约 16–32ms 一帧；
- 首帧和用户直接输入可以立即执行；
- burst 停止后必须执行 trailing frame；
- viewport 与 runtime dirty 在同一 pending frame 中合并；
- drain 不直接恢复旧 intent，而是提交当前最新 pending snapshot；
- 每次 flush 最多执行固定次数的 stabilization pass，默认 2；
- 超过上限时保留 dirty，在下一帧继续，禁止同步死循环。

公共配置建议：

```ts
interface CreateAppBaseOptions {
  frameIntervalMs?: number;
  frameSettleDelayMs?: number;
  maxStabilizationPasses?: number;
  frameClock?: AppFrameClock;
}
```

默认值需要通过 benchmark 确定，不能直接复用 terminal resize interval。

### 4.3 Keyed item 更新

先补齐行为契约，再选择内部实现。推荐分两步：

#### 第一步：正确性

相同 key 且 item identity/value 变化时，重新计算该 item template，并更新对应 slot。
第一版允许替换该 item 的局部 mounted subtree，但不能重建整个 list，也不能要求改变 key。

必须保证：

- item 顺序保持；
- focus/ref/onUnmount 行为有定义；
- 旧 item owner 和 binding 完整释放；
- 新 item 不重复注册残留 owner；
- 同 key、同引用可以跳过；
- duplicate key 抛出明确错误，不能静默覆盖 Map entry。

#### 第二步：性能

为 keyed slot 增加内部 item signal，使支持该模式的 render item 可以在不替换子树的情况下
更新动态 props。API 设计必须保持旧用法可迁移，不能偷偷把普通对象变成代理。

可选 API：

```tsx
<for each={messages} key={(message) => message.id}>
  {(message) => <text value={message.map((item) => item.text)} />}
</for>
```

最终 API 需单独 ADR；第一步正确性修复不等待完整 API 重构。

### 4.4 Scroll layout stabilization

`VScrollView`、`HScrollView` 和 `ScrollView` 调整为：

- 仅当 applied offset、max、viewport size 或 scrollbar text 实际变化时更新状态；
- 删除每次 layout 无条件递增的 `layoutTick`；
- 自动 stick-to-end correction 与用户 scroll intent 分开；
- layout correction 进入当前 frame 的 stabilization pass；
- correction 未稳定时不先写一个中间 frame；
- 相同 offset 不调用 `onOffsetChange`；
- scrollbar paint 不要求额外完整 layout。

长期方向是把 scroll clamp/scrollbar derivation 变成 layout result 的纯派生数据，而不是
在 `onLayout` 中反向写 signal。

### 4.5 原子 frame transaction

当前 layout、renderer state、runtime dirty 和 sink write 的提交边界需要明确。

一个 frame 应按以下步骤执行：

1. 读取 pending revision 与 viewport snapshot。
2. flush 该 revision 前的 runtime binding。
3. layout candidate。
4. 解析 scroll correction；必要时执行有限 stabilization pass。
5. render candidate。
6. 组合 viewport clear/full repaint。
7. 单次 sink write。
8. 成功后提交 cached layout、cached viewport、renderer baseline 和 committed revision。
9. 清理由该 revision 覆盖的 dirty。

如果 3–7 任一步失败：

- 不提交 candidate cache；
- 不破坏上一成功 renderer baseline；
- 不清除更新后的 dirty revision；
- 不重放已经写出的半帧；
- 通过结构化错误上报。

renderer 若无法回滚，应增加 checkpoint/transaction，或为 viewport/full frame 使用候选
renderer，成功后替换。

### 4.6 错误等级与恢复

区分：

| 错误类型 | 默认行为 |
| --- | --- |
| layout/render candidate 失败 | 保留上一帧，上报，等待下一 revision；同 revision 不无限重试 |
| layout stabilization 超限 | 延后到下一帧并上报警告，不停止 terminal |
| stdout backpressure | blocked，等待 drain，只保留最新 pending |
| stdout 同步写异常 | 上报 output fault；根据明确策略决定 stop |
| terminal lifecycle 损坏 | fatal，执行恢复并停止 |

扩展 `AppError`：

```ts
interface AppError {
  phase: AppErrorPhase;
  error: unknown;
  viewport: AppViewport;
  intent: FrameIntent;
  revision: number;
  schedulerState: AppFrameSchedulerState;
  recoverable: boolean;
}
```

默认 handler 至少把完整错误写到 stderr。只有 `recoverable: false` 才自动 stop。

## 5. 分阶段实施

### 阶段 0：建立失败基线

新增确定性测试 harness，构造与 dayloom Session 同型的树：

- Header；
- 动态 keyed message list；
- `VScrollView + scrollbar + stickToBottom`；
- streaming message；
- Textarea 高度变化；
- mock terminal resize；
- 可控 stdout backpressure；
- injectable scheduler clock。

场景：

1. 同 key 消息正文连续更新。
2. 1000 次不同 tick 的 delta。
3. delta 中交错宽度、高度 resize。
4. resize 中交错 input height 变化。
5. blocked 后继续 delta 与 resize，再 drain。
6. layout/render 在指定 revision 抛错。

记录修改前：

- writes 数量；
- layout 次数；
- render 次数；
- mounted/unmounted item 次数；
- 最大 pending 数；
- 最终 viewport 和最终文本；
- 错误与 stop 次数。

退出条件：测试能稳定暴露 stale keyed item、过量 frame 和错误停机。

### 阶段 1：修复 keyed For 正确性

1. duplicate key 校验。
2. 相同 key 的新 item 更新对应 slot。
3. owner/binding/ref 生命周期测试。
4. reorder、insert、remove 与 update 组合测试。
5. dayloom 型流式文本使用稳定 id 后仍显示最终文本的核心测试。

退出条件：key 只承担 identity，不携带 text 也能正确更新。

### 阶段 2：消除 scroll layout 无条件反馈

1. 三种 ScrollView 共享稳定的 layout-derived state。
2. 相同 layout 不写 signal。
3. stick-to-end correction 只发一次。
4. scrollbar 变化只产生必要 paint。
5. 增加 stabilization pass 测试。

退出条件：静态 viewport 重复 layout 不产生额外 frame。

### 阶段 3：统一 AppFrameScheduler

1. runtime dirty、viewport、manual render 和 drain 进入同一个 scheduler。
2. 引入 revision、reason、frame cadence 和 trailing flush。
3. 限制单次 stabilization pass。
4. 保证 blocked 状态只保存最新 snapshot。
5. 所有 clock 可注入，测试不依赖真实 timer。

退出条件：

- 1000 delta 的 writes/layout 次数受 frame budget 约束；
- 最终文本和 viewport 一定提交；
- 不出现同步 livelock。

### 阶段 4：原子提交与可恢复错误

1. candidate/committed frame state 分离。
2. renderer baseline 支持 transaction。
3. recoverable frame error 不再默认 stop。
4. 错误包含 revision、viewport、intent 和 scheduler state。
5. 下一有效 revision 可以恢复并提交。

退出条件：注入一次 layout/render 故障后，应用不退出且后续 frame 正确。

### 阶段 5：真实环境验证

矩阵：

| Shell | Host | 场景 |
| --- | --- | --- |
| Windows PowerShell 5.1 | Console Host | Session streaming + rapid resize |
| Windows PowerShell 5.1 | Windows Terminal | Session streaming + rapid resize |
| PowerShell 7 | Windows Terminal | Session streaming + rapid resize |
| PowerShell 7 | VS Code | Session streaming + rapid resize |
| PowerShell 7 | Cursor | Session streaming + rapid resize |
| bash/zsh | Unix PTY | 自动化回归 |

每项执行：

1. 进入 Session。
2. 连续产生至少 30 秒 AI delta。
3. 同时快速拖动宽度和高度。
4. 缩到宿主最小尺寸再恢复。
5. 模拟 stdout backpressure。
6. 停止拖动后等待 2 秒。
7. 检查最终消息、scrollbar、Textarea、输入与退出恢复。

退出条件：

- 进程不退出；
- 无未捕获异常；
- 无持续 CPU 空转；
- 最终 frame 与最新状态一致；
- Ctrl+C 后 cursor/raw mode/alt screen 恢复。

## 6. 测试门禁

新增以下门禁：

### 正确性

- stable key item update；
- duplicate key；
- reorder + update；
- streaming final text；
- latest viewport wins；
- scroll correction converges；
- recoverable frame error。

### 调度

- same-tick 合并；
- cross-tick cadence；
- leading/trailing frame；
- max stabilization passes；
- resize + structure 合并；
- blocked + drain 只提交最终状态。

### 性能

固定 fake clock 下记录：

- 1000 delta 的 frame 数；
- 500 resize 的 frame 数；
- Yoga layout 次数；
- item mount/unmount 次数；
- ANSI 总字节数。

性能断言使用确定性计数，不使用容易波动的 wall-clock 时间。优化提交必须记录前后数据。

## 7. 可审查提交拆分

建议依次提交：

1. `test(app): capture streaming resize instability`
   - 只增加 deterministic harness、失败契约和基线数据。

2. `fix(runtime): update keyed items without mutable keys`
   - keyed For 正确性、duplicate key 和 lifecycle。

3. `fix(widgets): stabilize scroll layout feedback`
   - ScrollView layout-derived state 与收敛测试。

4. `refactor(app): unify runtime and viewport frame scheduling`
   - revision、cadence、trailing frame、stabilization 上限。

5. `fix(app): recover from transient frame failures`
   - 原子 candidate commit、renderer transaction、结构化错误。

6. `test(e2e): stress streaming sessions during resize`
   - PTY、backpressure、Windows real harness。

7. `docs: document frame scheduling and recovery contracts`
   - API、默认值、迁移和验证结果。

每个提交必须可独立回滚。不要在核心提交中修改 dayloom 消息 key；dayloom 只有在
BindTTY stable-key contract 已通过后，才作为集成验证切换到稳定 `message.id`。

## 8. 风险与控制

| 风险 | 控制 |
| --- | --- |
| frame cadence 增加可见延迟 | 用户输入允许 leading frame；streaming 使用 bounded cadence |
| keyed item 更新改变 ref 生命周期 | 先冻结 contract，补 mount/unmount/reorder 测试 |
| stabilization pass 仍不收敛 | 固定上限，延后下一帧并上报诊断 |
| recoverable error 被无限重试 | 记录 failed revision，同 revision 只尝试一次 |
| renderer candidate 增加内存 | benchmark frame size，成功后立即释放旧 candidate |
| Windows 实机与 mock 行为不同 | real host matrix 是发布门禁，不用 PTY 替代 |

## 9. 完成定义

以下条件全部满足才算修复：

- dayloom Session 使用稳定 `message.id` 且流式正文持续更新；
- 不通过 dayloom debounce、删 scrollbar 或禁用 resize 通过测试；
- deterministic stress test 的 frame/layout/write 数满足预算；
- AI streaming 与 rapid resize 同时运行至少 30 秒不退出；
- 单帧可恢复错误不会停止 TUI；
- stdout blocked 后只提交最新最终状态；
- 原生 PowerShell、Windows Terminal、VS Code、Cursor 和 Unix PTY 验证完成；
- 文档记录调度契约、错误恢复行为、性能数据和仍存在的限制。

## 10. 实施记录

已完成：

- keyed `For` 在稳定 key、item 对象变化时更新局部子树，并拒绝重复 key；
- terminal app 使用统一的 leading/trailing 帧预算，合并 runtime、resize 和
  backpressure drain 意图，始终保留最新 viewport 与 dirty level；
- 同步重入稳定化次数有明确上限，剩余工作延后到后续帧；
- scroll widgets 不再通过无条件 `layoutTick` 制造布局反馈；
- terminal renderer 支持 prepare/commit，只有 sink 接受输出后才提交基线；
- 异步 resize/runtime/drain 帧失败通过 `AppError` 报告且保持 app 可恢复；
- 新增稳定 key 内容更新、1000 次 streaming + 500 次 resize、调度预算、
  backpressure、暂态错误恢复和 timer 错误边界测试。
- deterministic stress budget：burst 期间最多 3 个额外 write、最多 8 次 Yoga
  layout、ANSI 总量小于 100KB；首阶段 keyed 正确性实现记录 1001 次 item mount /
  1000 次 replacement unmount，并验证 dispose 后 owner 全部释放。
- 相关门禁通过：runtime 69/69、widgets 142/142、renderer 97/97、
  bindtty app 79/79、mock E2E 49/49。

未以消费方规避：

- 未修改 dayloom 的消息 key；
- 未要求降低 streaming 频率、禁用 resize、移除 scrollbar 或简化页面结构。

仍需发布前人工验收：

- 在原生 PowerShell、Windows Terminal、VS Code、Cursor 和 Unix PTY 中运行
  dayloom Session，边接收 AI streaming 边连续拖拽至少 30 秒；
- 确认无退出、无不可恢复错绘，停止拖拽后最终 viewport 与消息正文一致。

当前全仓 Windows PTY 门禁仍有独立的 terminal input/probe 失败，输出中可见
primary DA 查询响应泄漏（例如 `^[[?1;0cX`）。该问题不经过本方案修改的
runtime/frame/renderer 路径，不能作为本次修复已通过或未通过的替代结论，需要按
terminal input 专项继续处理。
