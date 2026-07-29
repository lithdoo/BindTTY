# BindTTY 系统性重构 TODO

> 状态：已完成代码核对，待按里程碑执行  
> 基线版本：`0.1.0-beta.3`  
> 建立日期：2026-07-29  
> 最近核对：2026-07-29  
> 范围：BindTTY 全仓，不局限于 Windows 输入与窗口缩放修复

当前执行进度：

- [x] M0-01 基线清单：见 [`doc/testing/BASELINE.md`](./doc/testing/BASELINE.md)。
- [x] M0-02 测试入口分层。
- [x] M0-03 包依赖检查。
- [x] M0-04 发布 dry-run。
- [x] M0-05 最小性能基线。
- [x] M0 阶段 gate：`731 passed / 2 skipped`，见基线记录。

## 1. 目标

本计划用于解决 BindTTY 在 MVP 快速迭代后形成的系统性问题，同时保留已经验证有效的核心设计：

- 保留 `ViewTemplate → MountedNode → LayoutNode → Frame → ANSI Patch` 主链路。
- 保留语义输入事件、Cell Frame、宽字符占位、ANSI diff、Yoga 布局。
- 保留 Windows resize event + polling、resize burst 合并、输出背压和最终帧策略。
- 不进行一次性推倒重写；所有阶段必须可独立测试、提交和回滚。
- 修复应落在拥有该职责的底层包，不把终端兼容策略转交应用层。

## 2. 当前基线

2026-07-29 全仓检查结果：

- 全仓 TypeScript build 通过。
- 单元与集成测试：`660 passed / 2 skipped`。
- mock E2E：`49 passed`。
- real PTY：`22 passed`。
- 合计：`731 passed / 2 skipped`。
- Linux/WSL 验证通过；Windows Terminal、PowerShell、conhost 仍需执行实机矩阵。
- 原始 `npm test` 存在大量重复构建，不能把执行时间直接视为测试耗时。

重构期间不得降低以上基线。

### 2.1 已核对的代码事实

以下内容已经在 `0.1.0-beta.3` 源码中确认，执行时应以这些事实为 characterization
起点，不重复发明抽象：

- `@bindtty/signal` 的 `computed()` 创建时立即求值并持续订阅依赖；公开返回值没有
  `dispose()`，取消最后一个普通 listener 也不会释放上游依赖。
- signal 更新按 `subscriber → listener` 同步深度优先传播；目前没有事务队列或
  `batch()`，菱形依赖可能让 effect 观察到中间状态。
- runtime 已经生成包含 `dirtyNodes` 的 `RuntimeFlushRecord`，MountedNode 也已有
  `paint | layout | structure` dirty kind；当前 App 的 `onFlush` listener 丢弃 record，
  统一调用完整 render。
- `createApp()` 每次 render 都刷新 interaction、重新执行 `layoutRoot()`、paint/diff，
  并通过 `renderTransactionActive`、`renderRequested`、`pendingResizeViewport`、
  `outputBlocked` 四组状态协调重入、resize 和背压。
- input tokenizer 已经跨 chunk 保留 CSI/SS3/paste 状态，并把完整 bracketed paste
  解析为一个 `PasteToken`；但 `RawStdinInput` 仍逐个语义事件发布，且独立 ESC
  没有 ambiguity timer。
- tokenizer 已在 `readCsiToken()` 中实现 `4096` UTF-16 code unit 的 CSI 长度上限；
  Kitty 与 modifyOtherKeys 也经 CSI 解析，SS3 则固定消费三个字符。未结束 paste
  仍会无限累积。因此应分别补齐 CSI 长度、SS3 分片/timeout 和 paste 容量契约，
  而不是重新实现已有的 CSI 长度限制。
- `layoutText` 与 `measureText` 使用模块级无界 `Map`。
- `BasicLayoutEngine` 计算了纵向最大滚动范围，但将 `scrollOffset.x` 固定为 `0`。
- `TerminalKeyEvent` 已经是 `SemanticInputEvent` 的兼容别名；当前剩余问题主要是
  widgets/jsx-runtime 的导入方向和重复类型来源。
- `renderer-terminal` 的公开类型使用 vnode，但 `@bindtty/vnode` 只在
  `devDependencies`；widgets 源码直接导入 terminal 类型，却没有声明 terminal 依赖。
- 发布脚本缺省 dist-tag 仍是 `alpha`；`packages/` 下共有 14 个包，其中 13 个公开
  发布包、1 个私有 E2E 包；`examples/` 下另有 6 个私有 workspace。发布与文档中的
  包数量必须按 public/private 和 packages/examples 明确定义。

## 3. 执行规则

- [ ] 每个小节先增加修改前能够通过的 characterization test，再修改实现。
- [ ] 当前实现不满足的新语义写成 target contract test；允许先以 TODO/skip 提交，但
      必须记录原因，并在对应实现完成的同一里程碑内启用。
- [ ] 不得把预期失败的目标测试称为 characterization test，也不得长期保留没有
      对应 issue/里程碑的 skip。
- [ ] 一个提交只完成一个明确行为或结构边界。
- [ ] 每个提交都必须能够单独回滚。
- [ ] 结构重构提交不得同时改变未声明的公共行为。
- [ ] 公共 API 变化必须提供兼容期、迁移说明和 changelog。
- [ ] 涉及 Windows 的阶段必须同时验证自动测试与实机验证文档。
- [ ] 新增跨包 import 时自动检查 `package.json` 的直接依赖声明。
- [ ] 新增状态机时使用显式状态和事件，避免继续增加互相制约的布尔变量。

## 4. 执行模型

### 4.1 优先级总览

| 阶段 | 内容 | 优先级 | 主要风险 |
| --- | --- | --- | --- |
| R0 | 正确性与发布热修复 | P0 | 输入丢失、内存增长、错误发布 |
| R1 | 响应式内核与生命周期 | P0 | computed 泄漏、菱形依赖中间态 |
| R2 | Runtime 失效模型与 App 调度 | P1 | 每次更新全量布局和绘制 |
| R3 | 输入、交互与事件契约 | P1 | 类型复制、粘贴渲染风暴 |
| R4 | Terminal 内部分层 | P1 | host 状态持续膨胀 |
| R5 | Schema、布局与包边界 | P2 | 多事实来源、backend 漂移 |
| R6 | 性能、构建和发布工程 | P1 | CI 缓慢、包发布不可靠 |
| R7 | 全平台验收与稳定发布 | P0 gate | Windows 实机行为未验证 |

优先级不等于执行顺序。R7 是 gate，R1 是 R2 的架构前置，R2 的 dirty 模型又是
R3.4 interaction 索引的前置。

### 4.2 里程碑与依赖

按以下可交付里程碑执行；同一里程碑内仍按小提交拆分：

```text
M0 基线与发布护栏
 ├─ M1 parser/tokenizer 与资源安全 ───────────────┐
 ├─ M2 响应式语义 ── M3 ownership ── M4 Runtime ──┼─ M5 Terminal/InputSession
 └─ 最小性能基线 ─────────────────────────────────┘
                                                   │
                           M6 Schema / backend / 定向优化
                                                   │
                                     M7 Windows 验收与发布
```

| 里程碑 | 对应章节 | 进入条件 | 退出产物 |
| --- | --- | --- | --- |
| M0 | R0.5、R0.6、R6.1 最小集、R6.3 最小集 | 当前基线可复现 | 分层测试命令、最小性能基线、tarball smoke、release dry-run |
| M1 | R0.1–R0.4、R3.3 parser/tokenizer 安全项 | M0 | 输入解析/缓存/Basic 修复可独立发布 |
| M2 | R1.1–R1.3 | M0 | 响应式语义文档、无 glitch 测试、`batch()` 或等价机制 |
| M3 | R1.4 | M2 | component/item/App owner 自动释放 |
| M4 | R2 | M3 | App 消费 dirty record，FrameSink 与调度状态机稳定 |
| M5 | R3.1–R3.2、R3.3 session 安全项、R4 | M1、M4 | InputSession 与 Terminal 内部职责完成拆分 |
| M6 | R3.4、R5、R6.1–R6.2 | M5 | metadata 收敛，优化有前后 benchmark |
| M7 | R6.4、R7 | M1–M6 | Windows 矩阵、beta tarball、应用验收 |

### 4.3 决策记录

以下事项不得边实现边隐式决定，必须先形成短 ADR 或对应章节设计说明：

- computed 的同步读取、通知时机、错误、递归 set 和循环依赖语义。
- `@bindtty/signal` 是否继续要求全应用单实例，以及重复实例的诊断/失败语义。
- reactive owner 的创建、嵌套、转移与销毁规则。
- BasicLayoutEngine 是公开 fallback 还是内部测试 engine。
- dirty 等级第一版采用全 App 最高等级还是 subtree invalidation。
- FrameSink 的背压契约以及 stdout/TerminalOutput 的适配边界。
- InputSession 位于 `@bindtty/input`、`@bindtty/terminal` 或拆分为核心与 host 包装。
- 文本缓存采用有界全局 LRU 还是实例级缓存。
- Escape ambiguity timeout、pending sequence timeout、paste 容量、文本缓存预算、
  resize settle/发布频率和 TSFN queue 容量的默认值、配置入口与超限策略。

所有时间、容量和性能验收项必须给出单位、默认值、合法范围、测试时钟/fixture 和
超限行为。文档中的“稳定”“不会卡顿”“合理”等描述只表达目标，不单独构成可执行
验收条件。

---

## R0：正确性与发布热修复

### R0.1 Raw Escape 超时

Characterization（修改前必须通过）：

- [ ] 记录 Alt+字符及完整 CSI/SS3 在同一 chunk 中的现有解析行为。
- [ ] 记录分片完整控制序列在补齐 final 后保持原子性的现有行为。
- [ ] 记录 detach/reset 会清空 parser state 的现有行为。

Target contract（实现完成后必须启用）：

- [ ] 独立 ESC 不再无限 pending，超时后产生 Escape 语义事件。
- [x] 增加 `RawStdinInput` 独立 Escape 回归测试。
- [x] 增加 Escape 与 Alt+字符歧义测试。
- [x] 增加分片 CSI/SS3 在超时前仍保持原子性的测试。
- [x] 先提取最小 parser session（parser + timer + reset），在该层实现可配置的
      escape ambiguity timeout；R3.2 再把它扩展为完整 InputSession。
- [x] 超时后独立 `ESC` 必须产生语义 `key: escape`。
- [x] detach/reset 时清理 pending timer 和 parser state。
- [x] 记录 escape ambiguity timeout 的默认毫秒值、合法范围和显式 override。
- [x] 使用注入 clock/timer 测试 timeout，不依赖真实等待。

验收：

- 独立 Escape 在 raw backend 下稳定可用。
- backend capability 声明支持的 F1–F24、方向键、Kitty、modifyOtherKeys 分片序列
  不回退成普通字符。
- 不在 TextInput、Textarea 或 App 中实现 Escape 特例。

### R0.2 原子 paste

Characterization（修改前必须通过）：

- [x] 保留 tokenizer 已有的单个 `PasteToken` 行为并增加跨 chunk characterization。
- [x] 记录公共 parser 默认将 paste 展开为 text events、`pasteMode: "event"` 发布单个
      paste event 的现有行为。

Target contract（实现完成后必须启用）：

- [x] 增加 RawStdinInput 当前逐 text event 发布 paste 的问题复现测试。
- [x] `RawStdinInput` 默认将 bracketed paste 发布为单个语义 `paste` 事件。
- [x] 明确 `@bindtty/input` 公共 parser 的默认 paste 行为是否保持兼容。
- [x] 明确 TerminalHost 是否提供临时 `pasteMode: "event" | "text"` 兼容选项。
- [x] TextInput 一次插入完整 paste 文本。
- [x] Textarea 一次插入完整 paste 文本并正确处理换行。
- [ ] 为超大 paste 设置合理的容量或流控策略。
- [x] paste trace 继续保持内容脱敏。
- [x] 增加大文本 paste 只触发一次编辑事务的测试。
- [x] 增加直接订阅 `TerminalHost.onKey()` 时的 paste 语义契约测试。
- [x] 将 paste 行为变化写入 changelog 和 migration guide。

验收：

- 一次 bracketed paste 不再扩展为数千次同步 render。
- grapheme、CJK、emoji、组合字符和换行语义保持正确。

容量策略必须明确计量层级和单位：若在 InputSession 的原始 Buffer 边界计量则使用
字节数；若在 tokenizer 解码后的字符串状态计量则使用 UTF-16 code unit 或估算内存。
同时必须定义超限后产生的事件、是否继续扫描结束标记，以及 trace 中不得包含 paste
正文；不能只写“合理容量”。

实施前必须在 ADR 中填写默认容量、合法配置范围、超限事件以及用于“不会卡顿”验收
的 paste fixture、event-loop latency 指标和阈值。

### R0.3 有界文本缓存

- [x] 为 `layoutText` 缓存增加容量上限。
- [x] 为 `measureText` 缓存增加容量上限。
- [x] 选择并记录 LRU 或 App/Renderer 实例缓存策略。
- [x] 同时定义最大条目数与字符数/估算字节预算，避免少量超大字符串占满内存。
- [x] 增加高基数字符串输入下缓存不会无限增长的测试。
- [x] 增加少量超大字符串输入下缓存预算仍然生效的测试。
- [x] 增加缓存命中与淘汰后的结果一致性测试。
- [x] 提供仅供测试/诊断的缓存 size、clear 或 stats 能力，避免测试依赖模块私有状态。

验收参数必须明确默认最大条目数、字符数/估算字节预算、单条目准入上限和淘汰策略；
不得只验证条目数量有界。

### R0.4 BasicLayoutEngine 契约修复

- [ ] 增加 Basic engine `scrollX` 回归测试。
- [ ] 修复 `scrollOffset.x` 始终为 `0` 的问题。
- [ ] 对比 Basic/Yoga 共同声明能力的契约测试。
- [ ] 明确 Basic engine 是公开 fallback 还是仅内部测试 engine。

### R0.5 包依赖完整性

- [ ] `renderer-terminal` 正确声明其公开 `.d.ts` 使用的 `@bindtty/vnode`。
- [ ] 移除 widgets 对 terminal 类型的直接依赖，或显式声明依赖。
- [ ] 增加源码 import 与 `package.json` 依赖一致性检查。
- [ ] 增加 npm tarball 在隔离目录中的 TypeScript consumer smoke test。
- [ ] 至少验证 npm 与严格依赖布局下的类型解析。

### R0.6 发布安全

- [ ] 发布脚本不再默认使用过时的 `alpha` tag。
- [ ] 根据 semver prerelease 自动推导 `alpha` / `beta` / `rc`，或强制显式传入 tag。
- [ ] 发布前检查 git worktree clean。
- [ ] 发布前检查全部 BindTTY 包版本一致。
- [ ] 发布前检查内部依赖版本一致。
- [ ] 发布前执行 build、test、pack 和隔离安装 smoke test。
- [ ] 发布后核对 npm version 与 dist-tags。
- [ ] `latest` 更新必须是显式步骤并输出最终确认。
- [ ] 修正文档中的 12/13 包数量、当前版本和 beta.1 changelog 漂移。

验收：

- dry-run 输出明确区分 `packages/` 下 13 个公开发布包、1 个私有 E2E 包，以及
  `examples/` 下 6 个不参与发布的私有 workspace。
- 对当前 `0.1.0-beta.3`，默认或显式推导的 dist-tag 只能是 `beta`。
- 隔离 consumer 不借助 monorepo hoist 也能完成 ESM import 和 TypeScript 类型检查。

---

## R1：响应式内核与组件生命周期

本阶段先固定可观察语义，再修改调度算法。Signal 包语义与 runtime ownership 分成
两个可独立回滚的里程碑，不在同一结构提交中完成。

### R1.1 Characterization

以下测试记录修改前现状，提交时必须通过：

- [ ] 增加 computed 初次 `get()`、缓存值和显式 listener 新旧值的测试。
- [ ] 增加动态依赖切换测试。
- [ ] 增加嵌套 computed/effect 测试。
- [ ] 增加 derive/effect 抛错后的栈与订阅恢复测试。
- [ ] 增加 effect cleanup 在 rerun/dispose 时执行的测试。
- [ ] 增加 mount/unmount 的现有 DOM-free MountedNode 生命周期测试。
- [ ] 增加隔离安装与重复 `@bindtty/signal` 实例的行为/诊断测试。

以下 target contract tests 可以先标记 TODO/skip，但必须分别在 R1.2–R1.4 完成时启用：

- [ ] computed 创建但没有消费者时不订阅上游。
- [ ] computed 取消最后一个消费者后释放上游。
- [ ] effect 不观察菱形依赖中间态。
- [ ] `batch()` 内多次更新只执行一次 effect。
- [ ] widget/component unmount 后不再响应外部 signal。

### R1.2 Computed 模型

- [ ] 将 computed 改为 lazy/stale 模型，或实现等价的一致性方案。
- [ ] `get()` 在源更新后同步得到最终值。
- [ ] 无消费者 computed 不持续订阅上游。
- [ ] 最后一个消费者解绑后释放依赖。
- [ ] 下游重新订阅时能够恢复依赖收集。
- [ ] 保留动态依赖分支切换能力。

### R1.3 批处理与无 glitch 调度

- [ ] 定义 `set()` 后同步 `get()`、显式 listener、effect 的正式时序。
- [ ] 增加 `batch()`，或在内部实现等价事务边界。
- [ ] 同一次 source 更新中 effect 不得观察到菱形图中间态。
- [ ] computed 先失效，effect/listener 后执行。
- [ ] 防止同一 computation 在同一事务中重复执行。
- [ ] 明确循环依赖和递归 set 的错误策略。
- [ ] 明确 effect/derive/listener 抛错时剩余队列、依赖图和 cleanup 的处理。
- [ ] 文档说明外部 `subscribe()` 是否计入 computed consumer，以及无消费者 computed
      在单次 `get()` 后是否保留缓存和依赖。
- [ ] 明确单实例 peer dependency 是否继续作为正确性前提，并提供 `npm ls` 或运行时
      诊断；不得让跨实例 signal 静默停止依赖追踪。

### R1.4 Reactive ownership

- [ ] 定义 component/runtime reactive owner。
- [ ] 组件执行期间创建的 computed/effect 能注册到 owner。
- [ ] Show 分支卸载时释放 owner。
- [ ] For item 删除时释放 item owner。
- [ ] App/runtime dispose 时释放全部 owner。
- [ ] 处理返回 empty template 的 component cleanup。
- [ ] 不要求每个 widget 手动维护一组 dispose 回调。

验收：

- 反复 mount/unmount TextInput、Textarea、ScrollView 后，上游 signal 不再保留旧计算图。
- 响应式语义有独立文档，不能仅依赖实现细节。

---

## R2：Runtime 失效模型与 App 调度

### R2.1 失效记录

- [ ] App 的 runtime flush listener 不再丢弃参数，正式消费 `RuntimeFlushRecord`。
- [ ] 汇总 dirty node 的最高失效等级。
- [ ] 定义 `paint < layout < structure < viewport` 的升级规则。
- [ ] 节点 dispose 后不保留 pending invalidation。
- [ ] resize 与 runtime dirty 合并时只提交最终意图。
- [ ] 第一版明确采用全 App 最高 dirty 等级；subtree 增量布局仅保留数据入口，不作为
      本阶段完成条件。
- [ ] 建立 prop → dirty kind 的最小注册表，R5.1 再将其并入统一 metadata。

### R2.2 布局复用

- [ ] paint-only 更新复用上次 LayoutNode。
- [ ] layout dirty 重新计算布局。
- [ ] structure dirty 重建布局结构。
- [ ] viewport 变化强制重新布局和完整 repaint。
- [ ] `onLayout` 触发的 signal 更新进入下一事务，不递归当前事务。
- [ ] 为复用 LayoutNode 增加生命周期与陈旧引用测试。
- [ ] 明确文本/value/style 变化何时从 paint 升级为 intrinsic layout。
- [ ] 明确 focus、handler、ref 和 focusability 变化是否属于 structure 或独立索引 dirty。

### R2.3 FrameCoordinator

本节同时提取 AppLifecycle，但只负责 App 自身资源和调用顺序；终端模式恢复属于
R4.5 LifecycleGuard。App 不得直接理解 cursor、alt screen、raw mode 或 keyboard
protocol。

- [ ] 从 `createApp` 提取显式 FrameCoordinator。
- [ ] 使用明确状态：`idle | rendering | blocked | disposed`。
- [ ] pending intent 保存 dirty 等级和最新 viewport。
- [ ] backpressure 阻塞期间只保留最新意图。
- [ ] drain 后只渲染一次最终状态。
- [ ] render 中发生 resize、signal update、dispose 时都有确定语义。
- [ ] render/layout/write 抛错后状态机能够恢复或安全停止。
- [ ] App 在 `terminal.start()` 抛错后恢复 `started=false` 并回滚已注册资源。
- [ ] start 过程中部分 listener 注册失败时按逆序执行 best-effort rollback。
- [ ] stop/dispose 中单项清理失败不得阻止其他 listener、runtime、interaction、
      renderer 和 terminal 资源继续释放。
- [ ] 明确多个清理错误采用首个错误、AggregateError 或 lifecycle callback 的契约。

### R2.4 输出接口统一

- [ ] stdout 模式与 TerminalHost 模式使用统一 FrameSink。
- [ ] 定义 `accepted/blocked` 的一致返回契约。
- [ ] 能返回 blocked 的 sink 必须提供 writable/drain 通知。
- [ ] App 不再通过可选 `onDrain` 猜测背压能力。
- [ ] 增加 stdout-only 背压测试。

---

## R3：输入、交互与事件契约

### R3.1 依赖方向

目标：

```text
input ───────────────┐
                     ↓
terminal          interaction
                     ↓
                  widgets
```

- [ ] `interaction` 直接依赖 `@bindtty/input` 的语义事件，不依赖 TerminalHost。
- [ ] `TerminalKeyEvent` 逐步收敛为语义输入事件别名或兼容导出。
- [ ] Textarea 不再从 `@bindtty/terminal` 导入事件类型。
- [ ] jsx-runtime 不再复制 protocol/modifier/key event 联合类型。
- [ ] interaction handler 类型成为 JSX 与 widgets 的单一来源。

### R3.2 输入 session

- [ ] 把 parser、协议协商、pending timeout、paste 和 trace 归入 InputSession。
- [ ] backend 只负责读取原始来源或 Win32 records。
- [ ] InputSession 负责统一发布语义事件。
- [ ] start/stop/restart 不遗留 parser、timer 或协议状态。
- [ ] backend fallback 原因可以稳定诊断。

### R3.3 输入健壮性

M1 完成不依赖完整 InputSession 的 parser/tokenizer 安全项：

- [x] Kitty codepoint 在调用 `String.fromCodePoint` 前验证 Unicode 范围。
- [x] bracketed paste 未结束时有容量保护。
- [x] 保留 tokenizer 已有的 4096 UTF-16 code unit CSI 上限，并为普通 CSI、Kitty、
      modifyOtherKeys 增加超限契约测试。
- [ ] 为 SS3 增加跨 chunk、缺失 final 和原子消费测试，不把 SS3 当作可变长度
      CSI 处理。
- [x] malformed input 产生 `unknown`，不得导致进程崩溃。

M5 随 InputSession 完成的 session 安全项：

- [ ] 所有 pending 控制序列都有 timeout/reset 策略。
- [ ] 为 pending SS3 增加 timeout 测试。
- [ ] start/stop/restart 后不继承旧 pending sequence、paste、timer 或协议状态。
- [ ] pending timeout 使用注入 clock/timer，并明确默认值、合法范围和超时后的
      `unknown`/fallback 事件语义。

跨 backend 契约：

- [ ] repeat、modifier、AltGr、surrogate pair 有跨 backend 契约测试。
- [ ] F1–F24 使用参数化测试覆盖所有 backend，不为 F2 建立应用层专项分支。

### R3.4 Interaction 索引

- [ ] 测量每帧重新遍历 MountedNode 构建 focus list 的成本。
- [ ] 仅在 structure/focusability dirty 时刷新 focus entries。
- [ ] 建立 id → entry 和 node → entry 索引。
- [ ] 明确 `clearFocus()` 在下一次 refresh 后是否保持无焦点。
- [ ] 增加 clearFocus、节点删除、同 id、reorder 的契约测试。

---

## R4：Terminal 内部分层

### R4.1 ResolvedTerminalProfile

- [ ] 创建一次性解析的 `ResolvedTerminalProfile`。
- [ ] 统一平台来源，不混用 `process.platform` 与 adapter name。
- [ ] profile 包含 TTY、host、input/output capabilities、resize policy。
- [ ] resize、input、synchronized output 都只读取 profile。
- [ ] PlatformAdapter 注入测试覆盖所有默认策略。
- [ ] 保留显式 option override。

### R4.2 ResizeCoordinator

- [ ] 从 `host.ts` 提取 ResizeCoordinator。
- [ ] 统一 event 与 polling sample。
- [ ] 统一 viewport 校验与去重。
- [ ] 统一 burst minimum interval 与 settle final publish。
- [ ] 注入 clock/timer，测试不依赖真实等待。
- [ ] start/stop/restart 清理所有 timer 和 listener。
- [ ] Cursor、ConPTY、普通 POSIX resize 使用同一状态机。
- [ ] 明确 burst minimum interval、settle delay、最大发布频率的默认值和 override。

### R4.3 TerminalOutput / FrameSink

边界：FrameSink 是 App 使用的提交接口，TerminalOutput 是 terminal 包中的一种实现；
两者不得合并成要求 App 理解 terminal capability 的单一对象。

- [ ] 区分 `writeRaw(chunk)` 与 `present(frame)`。
- [ ] 生命周期和协议控制序列只使用 raw write。
- [ ] renderer patch 作为完整 frame 提交。
- [ ] synchronized-output 只包裹完整 frame。
- [ ] 保留旧 `write()` 的兼容语义并给出迁移期。
- [ ] 增加拆分 ANSI raw write 不被同步边界破坏的测试。
- [ ] 输出队列和 drain 状态由 TerminalOutput 独立管理。

### R4.4 Capability negotiation

- [ ] synchronized output 不再仅以 `win32 TTY` 作为能力判断。
- [ ] 定义已知 host profile、保守 fallback 和显式 override。
- [ ] 评估 DECRQM/能力查询是否值得实现。
- [ ] 若采用 DECRQM，查询与响应必须由 InputSession/统一协议协商器路由，不能增加
      第二个独立 stdin consumer，也不能与 keyboard probe 竞争响应。
- [ ] 不支持 DEC 2026 的终端保持正常输出。
- [ ] capability trace 可用于实机诊断。

### R4.5 LifecycleGuard

本节只负责 TerminalHost 和进程级终端状态恢复；App listener/runtime/renderer 的
回滚由 R2.3 AppLifecycle 负责。

- [ ] Terminal start 失败时回滚已启用的模式。
- [ ] stop/dispose 即使部分恢复失败也继续清理其他资源。
- [ ] 增加 SIGINT、SIGTERM、SIGHUP 的 best-effort restore。
- [ ] 明确 uncaught exception/unhandled rejection 的恢复策略。
- [ ] 多 TerminalHost 实例共享进程 hook 时不重复恢复。
- [ ] 恢复 cursor、alt screen、raw mode 和 keyboard protocol。

### R4.6 `host.ts` 收口

最终 `createNodeTerminal` 只负责组合：

```text
ResolvedTerminalProfile
InputSession
ResizeCoordinator
TerminalOutput
LifecycleGuard
```

- [ ] `host.ts` 不再直接拥有所有 timer、parser、protocol、resize 和 output 状态。
- [ ] 公共 `TerminalHost` API 在拆分过程中保持兼容。

---

## R5：Schema、布局与包边界

### R5.1 单一 Element metadata

- [ ] 定义 element/prop metadata 的单一来源。
- [ ] metadata 包含 required、children、dirty kind、alias、类型类别。
- [ ] JSX intrinsic props 从统一类型或生成结果获得。
- [ ] runtime validation 使用同一 metadata。
- [ ] layout backend support matrix 使用同一 prop 名称。
- [ ] 文档矩阵由 metadata 生成。
- [ ] 删除 schema、JSX、layout 中重复维护的 alias/prop 清单。

### R5.2 Layout backend 决策

- [ ] 记录 BasicLayoutEngine 的长期定位。
- [ ] 若保留公开：建立所有共同能力的跨 backend 契约测试。
- [ ] 若降级内部：更新公共导出、文档和迁移说明。
- [ ] 避免在两个 backend 中分别复制结构遍历、scroll metadata 和 prop validation。
- [ ] 评估持久化 Yoga tree，避免每帧 create/free 全树。

### R5.3 Renderer 优化

- [ ] 保留 Frame/wide placeholder/diff 的现有语义。
- [ ] 避免对已经有序的 change list 重复排序。
- [ ] 减少 Cell/style 的重复 clone 和临时字符串。
- [ ] 为 ANSI encoder 建立可选状态对象，但不把终端 capability 放入 renderer。
- [ ] 增加 full/incremental frame 的字节数与耗时 benchmark。
- [ ] 在 benchmark 前不进行大规模 renderer 重写。

### R5.4 公共包分级

- [ ] 明确一级公共包：`bindtty`、`@bindtty/widgets`、`@bindtty/terminal`。
- [ ] 明确高级公共包：`signal`、`input`、`text` 等。
- [ ] 判断 vnode/runtime/layout/renderer/interaction 是否承诺独立稳定 API。
- [ ] 内部实现包不必因目录存在就冻结公共 API。
- [ ] 暂不直接物理合并全部 workspace。
- [ ] 发布包数量和文档必须一致。

---

## R6：性能、构建和发布工程

### R6.1 性能基线

最小基线（signal update、一次完整 frame、长 paste、heap/cache size）在 M0 建立；
本节负责补全矩阵和持续记录。任何性能优化都必须先有对应 benchmark，不能等到 R6
才测量 R2/R3/R5 已经修改过的路径。

- [ ] 建立小、中、大三种 MountedNode tree benchmark。
- [ ] 测量 signal update、layout、paint、diff、ANSI encode、stdout write。
- [ ] 建立 resize burst benchmark。
- [ ] 建立长日志、长 paste、频繁 TextInput 编辑 benchmark。
- [ ] 记录 heap、缓存规模、frame bytes 和 event-loop latency。
- [ ] 固定 benchmark fixture、Node 主版本、warmup、采样次数和统计口径。
- [ ] 为关键指标定义回归预算；超过预算时 CI 报告差异，是否阻断由独立配置决定。
- [ ] 保存原始结果和环境信息，保证优化前后数据可复现。
- [ ] 优化提交必须提供优化前后数据。

### R6.2 构建图

- [ ] 使用 TypeScript project references 或等价任务图。
- [ ] 根 build 每个 package 只编译一次。
- [ ] workspace test 不递归重建全部上游依赖。
- [ ] E2E mock/real 共享一次 dependency build。
- [ ] CI 分离 build artifact 与 test 执行。
- [ ] 增加增量构建和 clean build 两种验证。

### R6.3 测试分层

- [ ] `test:unit`：无 PTY、快速执行。
- [ ] `test:integration`：跨包 fake terminal。
- [ ] `test:e2e:mock`：完整 App 链路。
- [ ] `test:e2e:pty`：真实 PTY 串行运行。
- [ ] `test:windows`：ConPTY + native input。
- [ ] `test:all`：CI/release gate。
- [ ] 输出每层测试数量、跳过原因和耗时。

### R6.4 Win32 native 分发

- [ ] 为支持的 Node/架构生成 Node-API prebuild。
- [ ] 安装时优先下载/使用 prebuild，node-gyp 作为 fallback。
- [ ] x64/arm64 Windows 都有明确支持策略。
- [ ] native provider attach/detach 不在每次 stop 后保留 ProviderState 到进程退出。
- [ ] 防止同一 console handle 被多个 provider 无协调 attach。
- [ ] TSFN queue 有合理的容量与过载策略。
- [ ] 明确 TSFN queue 默认容量、可配置范围，以及满载时丢弃、合并、阻塞或 fallback
      的确定语义和 trace。
- [ ] native 不可用时 trace 明确记录 fallback 原因。

---

## R7：全平台验收与稳定发布

### R7.1 自动验证

- [ ] Ubuntu CI：build、unit、integration、mock E2E、real PTY。
- [ ] Windows CI：input、terminal、widgets、ConPTY E2E。
- [ ] 严格依赖安装环境的 tarball consumer test。
- [ ] tarball consumer 验证 `@bindtty/signal` peer dependency 只有一个有效实例，或
      在重复实例时产生已定义的诊断结果。
- [ ] docs、layout matrix、package dependency lint。
- [ ] release dry-run 验证所有 tarball 内容。

### R7.2 Windows 实机矩阵

按照以下文档执行：

- [WINDOWS_INPUT_VALIDATION.md](./WINDOWS_INPUT_VALIDATION.md)
- [WINDOWS_RESIZE_VALIDATION.md](./WINDOWS_RESIZE_VALIDATION.md)

至少覆盖：

| Shell | Host | 输入 | resize |
| --- | --- | --- | --- |
| PowerShell 5.1 | Windows Terminal | 必测 | 必测 |
| PowerShell 7 | Windows Terminal | 必测 | 必测 |
| PowerShell 5.1 | Console Host | 必测 | 必测 |
| PowerShell 7 | Console Host | 必测 | 必测 |
| PowerShell | Cursor/VS Code integrated terminal | 必测 | 必测 |

验收内容：

- [ ] F1–F12 不插入尾字节字符。
- [ ] F13–F24 在支持的 backend 中语义正确。
- [ ] Ctrl/Alt/Shift/Meta 修饰键符合 capability 声明。
- [ ] Ctrl+Enter、Meta+Enter、F2 提交正确。
- [ ] 独立 Escape 正确。
- [ ] paste 原子且不会卡顿。
- [ ] 连续缩放最终坐标准确。
- [ ] resize burst 无永久卡死、无无限 timer、无持续 CPU 占用。
- [ ] 不支持 synchronized output 的 host 仍能正常工作。
- [ ] 退出、异常终止后 cursor、raw mode、alt screen 恢复。

### R7.3 发布 gate

- [ ] 所有自动验证通过。
- [ ] Windows 实机矩阵记录已归档。
- [ ] changelog 包含所有用户可见变化。
- [ ] migration guide 已完成。
- [ ] beta tag 发布并验证。
- [ ] `latest` 是否移动经过显式确认。
- [ ] Dayloom 使用新版本完成一次真实应用验收。

## 5. 暂不纳入本轮

- Modal / Overlay / z-index / focus trap。
- List/ScrollView virtualization，先完成 benchmark。
- Tabs 等新增 widget。
- 大规模主题系统。
- 直接合并全部发布包。
- 在核心失效模型完成前继续增加布局 props。

这些工作应在 R0–R4 稳定后重新评估。

## 6. 完成定义

本计划完成必须同时满足：

1. 不再存在已知的 computed 卸载泄漏和菱形依赖中间态。
2. raw backend 的 Escape、控制序列和 paste 有完整事务语义。
3. App 真正消费 dirty 等级，不再对所有更新无条件重建完整链路。
4. Terminal 环境探测、输入、resize、输出和生命周期职责已经分层。
5. Element prop 与事件类型不再存在多份手工复制的事实来源。
6. build/test/release 可以重复执行且结果可验证。
7. Windows CI 与实机矩阵通过。
8. 所有测试层通过，未经说明的 skip 不增加；`731 passed / 2 skipped` 作为审计基线，
   测试合并、拆分或删除允许调整数量，但必须记录原因和等价覆盖。
9. release dry-run、隔离 tarball consumer、性能基线和 Windows 记录均可由他人复现。

## 7. 分阶段逐步落地计划

### 7.1 通用落地节奏

每个阶段统一采用以下节奏，不跨阶段混合结构变更：

1. **盘点**：确认涉及的包、公共 API、现有测试和可观察行为。
2. **决策**：完成本阶段要求的 ADR，冻结默认值和边界。
3. **Characterization**：补齐修改前能够通过的测试与 fixture。
4. **Target contract**：增加目标契约测试；允许短暂 TODO/skip，但必须绑定本阶段任务。
5. **最小实现**：先修行为，再提取结构；不同时进行无关重命名或格式化。
6. **兼容层**：公共 API 变化保留旧入口、弃用说明和迁移示例。
7. **验证**：执行本阶段包测试、跨包测试、基线 smoke 和相关 benchmark。
8. **归档**：记录测试数量、性能数据、已知限制、提交范围和回滚点。

每一步完成后才能进入下一步。若出现以下任一情况，停止扩展本阶段并先恢复绿色基线：

- build、既有测试或隔离 tarball consumer 失败；
- 出现无法解释的公共行为变化；
- 新增 skip 没有对应 issue 和启用里程碑；
- 性能超过已定义回归预算；
- Windows 相关行为缺少可复现 trace 或验证记录。

### 7.2 M0：冻结基线与建立护栏

目标：在修改运行时行为前，让 build、test、pack、benchmark 和发布结果可重复。

建议提交顺序：

1. **M0-01 基线清单**
   - 记录 Node/npm/TypeScript 版本、操作系统、测试数量和 skip 原因。
   - 固化当前 `731 passed / 2 skipped` 的来源分类。
   - 只增加报告，不改变构建和测试行为。

2. **M0-02 测试入口分层**
   - 增加 `test:unit`、`test:integration`、`test:e2e:mock`、`test:e2e:pty`、
     `test:all` 入口。
   - 第一提交只包装现有命令，暂不改测试归属。
   - 第二提交再消除测试脚本中的重复上游 build。

3. **M0-03 包依赖检查**
   - 修正 `renderer-terminal → vnode` 和 widgets 事件类型依赖。
   - 增加源码 import 与直接依赖一致性检查。
   - 增加严格依赖布局下的 TypeScript consumer。

4. **M0-04 发布 dry-run**
   - 修复 prerelease dist-tag 推导。
   - 检查 worktree、包版本、内部依赖版本和 public/private package 集合。
   - dry-run 不执行 npm publish，只生成 tarball 清单和验证报告。

5. **M0-05 最小性能基线**
   - 固定 signal update、完整 frame、长 paste、文本缓存/heap fixture。
   - 记录环境、warmup、采样次数和原始结果。
   - M0 只报告差异，不设置不稳定的强制性能 gate。

阶段验证：

- clean build 和分层测试全部通过；
- mock/PTY 数量与当前基线可对应；
- 13 个公开包均能 pack，私有 E2E 和 examples 不进入发布集合；
- 隔离 consumer 完成 ESM import 与 TypeScript 类型检查；
- `0.1.0-beta.3` dry-run 只得到 `beta` tag；
- 生成首份可重复的性能基线。

阶段回滚点：M0 不修改 signal、runtime、input、layout 或 terminal 的公共运行时语义。

### 7.3 M1：输入解析与资源安全热修复

目标：先解决可以独立发布的输入、缓存和 Basic layout 正确性问题，不等待完整架构拆分。

建议提交顺序：

1. **M1-01 Escape characterization 与最小 parser session**
   - 固化 Alt+字符、完整/分片 CSI、SS3 和 reset 行为。
   - 提取仅包含 parser、timer、reset 的最小 session。
   - 注入 clock/timer，不在 widget 或 App 中增加 Escape 特例。

2. **M1-02 Escape ambiguity timeout**
   - 先提交 ADR 和 target contract。
   - 再实现独立 ESC timeout、Alt 歧义处理和 detach timer cleanup。
   - 使用参数化测试覆盖 CSI、SS3、Kitty 和 modifyOtherKeys 分片。

3. **M1-03 原子 paste**
   - 保持 tokenizer 的单 `PasteToken` 行为。
   - RawStdinInput 改为单个语义 paste event。
   - TextInput/Textarea 各用一个编辑事务消费 paste。
   - 公共 parser 若保留旧默认行为，必须有明确兼容测试。

4. **M1-04 输入容量与 malformed 防护**
   - 增加未结束 paste 的双预算限制。
   - 验证现有 CSI 长度上限和 Kitty/modifyOtherKeys 超限行为。
   - 校验 Kitty Unicode codepoint；异常输入统一降级为 `unknown`。

5. **M1-05 有界文本缓存**
   - 先增加 stats/clear 测试接口。
   - 再实现选定的 LRU 或实例缓存策略。
   - 同时验证高基数小字符串和少量超大字符串。

6. **M1-06 Basic scrollX**
   - 先增加 Basic/Yoga 共同契约测试。
   - 修复横向最大滚动范围和 clamp。
   - 不在此提交决定 Basic engine 的全部长期 API。

阶段验证：

- input、terminal、widgets、text、layout 单元测试通过；
- 一次大 paste 只产生一次语义 paste 和一次 widget 编辑事务；
- timer、parser、paste buffer 在 detach/reset 后清空；
- 缓存容量和内存预算均有可观察上限；
- mock E2E 和 real PTY 不低于 M0 基线；
- Linux/WSL trace 无 paste 正文泄漏。

阶段发布策略：M1 可以发布一个 beta patch；未经 Windows 实机验证不得移动 `latest`。

### 7.4 M2：固定响应式语义

目标：把 signal 从同步深度优先传播改造成有正式契约的 lazy/stale、无 glitch 模型。

建议提交顺序：

1. **M2-01 响应式语义 ADR**
   - 决定同步 `get()`、listener/effect 时序、consumer 定义、错误和递归策略。
   - 决定是否继续要求全应用单一 signal 实例。

2. **M2-02 Characterization 与 target contract**
   - 保留动态依赖、嵌套 computation、cleanup 和错误恢复现有能力。
   - 增加 lazy、最后消费者释放、菱形一致性和 batch 目标测试。

3. **M2-03 Lazy/stale computed**
   - computed 无消费者时不持续订阅。
   - 最后消费者解绑时释放依赖。
   - 重新读取/订阅时恢复动态依赖收集。

4. **M2-04 事务队列与 batch**
   - computed 先标记 stale，effect/listener 后执行。
   - 同一事务对 computation 去重。
   - `get()` 始终同步得到最终派生值。

5. **M2-05 错误与循环防护**
   - 实现 ADR 中的 effect/derive/listener 错误策略。
   - 增加递归 set、循环依赖和 cleanup 抛错测试。

6. **M2-06 单实例诊断**
   - 通过 peer dependency、consumer smoke 或运行时标记落实既定策略。
   - 重复实例不得静默破坏依赖追踪。

阶段验证：

- signal 全部 target contract 启用，无本阶段遗留 skip；
- 动态依赖和嵌套 computed 行为保持；
- 菱形图 effect 不观察中间值；
- batch 中同一 effect 只执行一次；
- signal benchmark 与 M0 对比并记录差异；
- runtime/widgets 现有测试全部通过。

### 7.5 M3：Reactive ownership 与卸载清理

目标：让组件执行期间创建的响应式资源自动归属 owner，并随组件/分支/item 销毁。

建议提交顺序：

1. **M3-01 Owner ADR 与底层 API**
   - 定义 owner stack、父子关系、cleanup 顺序和幂等 dispose。
   - owner API 先在 signal/runtime 内部使用，不急于公开。

2. **M3-02 Component owner**
   - component 执行时建立 owner。
   - computed/effect 自动注册。
   - empty template、执行抛错和重复 dispose 均能清理。

3. **M3-03 Show/For ownership**
   - Show 分支切换释放旧 owner。
   - For item 删除、替换、reorder 时保持正确 owner 身份。

4. **M3-04 Widget cleanup**
   - 覆盖 TextInput、Textarea、ScrollView 和其他内部 computed 较多的 widgets。
   - 删除仅为弥补 owner 缺失而存在的手工 dispose 集合。

5. **M3-05 App/runtime dispose**
   - runtime root dispose 释放完整 owner tree。
   - 生命周期 cleanup 抛错时继续释放剩余资源。

阶段验证：

- 反复 mount/unmount 后旧 computation 不再响应外部 signal；
- owner tree 无悬挂依赖和重复 cleanup；
- Show/For 动态更新测试通过；
- heap/订阅数量在重复挂载 fixture 中回到稳定区间。

### 7.6 M4：Runtime invalidation 与 App 调度

目标：App 真正消费 dirty record，避免所有更新都刷新 interaction、layout 和完整 frame。

建议提交顺序：

1. **M4-01 Dirty 语义 ADR**
   - 冻结第一版全 App 最高 dirty 等级。
   - 建立最小 prop → dirty kind 注册表。
   - 明确 intrinsic text、focusability、handler/ref 和 viewport 的等级。

2. **M4-02 App 消费 RuntimeFlushRecord**
   - 保留 dirty nodes，合并最高等级。
   - disposed node 从 pending invalidation 中移除。
   - 暂不复用 layout，先保证 dirty intent 记录正确。

3. **M4-03 LayoutNode 复用**
   - paint-only 复用 layout。
   - layout/structure/viewport 按契约升级。
   - 处理 `onLayout` 更新和陈旧引用。

4. **M4-04 FrameSink**
   - 定义 accepted/blocked 与 writable/drain 契约。
   - stdout 和 TerminalHost 通过 adapter 接入同一接口。
   - 增加 stdout-only 背压测试。

5. **M4-05 FrameCoordinator**
   - 用 `idle | rendering | blocked | disposed` 替换互相制约的布尔状态。
   - resize、runtime dirty 和 viewport 合并成 pending intent。
   - blocked 期间只保存最终意图，drain 后只提交一次。

6. **M4-06 AppLifecycle**
   - start 部分失败逆序回滚。
   - stop/dispose 单项失败不阻止其余清理。
   - 明确多个错误的报告契约。

阶段验证：

- paint-only fixture 不调用 `layoutRoot()`；
- layout/structure/viewport 各自只执行契约要求的路径；
- blocked + 多次更新 + resize 最终只渲染最新状态；
- render/layout/write 抛错后 coordinator 可恢复或安全停止；
- interaction、layout、frame benchmark 与 M0 对比。

### 7.7 M5：InputSession 与 Terminal 内部分层

目标：把 `host.ts` 收敛为组合根，同时保持 TerminalHost 公共 API 兼容。

建议提交顺序：

1. **M5-01 事件依赖方向**
   - interaction 改为依赖 `@bindtty/input`。
   - widgets/jsx-runtime 从 interaction/input 获取统一事件类型。
   - TerminalKeyEvent 只保留兼容别名。

2. **M5-02 完整 InputSession**
   - 接管 parser、escape/pending timeout、paste、协议协商和 trace。
   - backend 只读取 raw bytes 或 Win32 records。
   - start/stop/restart 清理全部 session 状态。

3. **M5-03 ResolvedTerminalProfile**
   - 一次性解析平台、TTY、host、input/output capability 和 resize policy。
   - 保留显式 option override。

4. **M5-04 ResizeCoordinator**
   - 合并 event/polling sample、校验、去重、burst 和 settle publish。
   - 使用注入 timer 覆盖 POSIX、ConPTY、Cursor/VS Code 策略。

5. **M5-05 TerminalOutput**
   - 分离 `writeRaw()` 和 `present()`。
   - 完整 frame 才允许 synchronized-output 包裹。
   - 输出队列和 drain 状态从 host 移出。

6. **M5-06 Capability negotiation**
   - 先实现 profile + conservative fallback + override。
   - DECRQM 只有在 ADR 证明收益后才实现，并统一经 InputSession 路由。

7. **M5-07 LifecycleGuard**
   - 处理 TerminalHost 模式回滚与进程 hooks。
   - 多实例共享 hooks，不重复恢复。
   - 与 M4 AppLifecycle 保持单向调用边界。

8. **M5-08 host.ts 收口**
   - `createNodeTerminal` 只负责组合五个组件。
   - 删除已迁出的 timer/parser/protocol/resize/output 状态。

阶段验证：

- TerminalHost 公共兼容测试通过；
- start/stop/restart 不遗留 timer、listener、parser、paste 或协议状态；
- raw write 不被错误加入 synchronized frame 边界；
- resize burst 始终发布最终 viewport；
- input/terminal/widgets、mock E2E、PTY 和可执行的 Windows CI 全部通过。

### 7.8 M6：Schema、backend 与定向性能优化

目标：在核心边界稳定后收敛事实来源，并且只做 benchmark 证明有效的优化。

建议提交顺序：

1. **M6-01 Element metadata ADR 与模型**
   - 定义 required、children、dirty kind、alias、类型类别和 backend support。
   - 先生成对比报告，不立即删除旧表。

2. **M6-02 消费方迁移**
   - 依次迁移 runtime validation、JSX types、layout matrix 和文档生成。
   - 每迁移一个消费方就增加生成结果一致性检查。

3. **M6-03 删除重复事实来源**
   - 只有所有消费方切换后才删除旧 schema/alias/prop 清单。

4. **M6-04 Basic engine 定位**
   - 若公开保留，补齐共同能力契约。
   - 若转内部，先兼容导出和迁移说明，再在后续版本移除。

5. **M6-05 Renderer/Yoga 定向优化**
   - 按 benchmark 结果选择排序、clone、字符串、ANSI state 或持久 Yoga tree。
   - 每个优化单独提交并附前后数据。

6. **M6-06 构建图**
   - 引入 project references 或等价任务图。
   - clean/incremental build 和测试共享 artifact。

阶段验证：

- prop、alias、dirty kind、backend matrix 只有一个权威来源；
- 生成文件 clean，手工修改会被 CI 检出；
- Basic/Yoga 决策有 ADR、兼容期和契约测试；
- 每项性能优化有可复现的前后数据；
- clean build 和 incremental build 均可重复。

### 7.9 M7：Win32 分发、全平台验收与发布

目标：完成自动化与实机 gate，用真实应用验证 beta，再决定稳定发布。

建议提交/执行顺序：

1. **M7-01 Win32 native 分发**
   - 明确 Node-API、Node 主版本、x64/arm64 支持矩阵。
   - prebuild 优先，node-gyp fallback。
   - 完成 provider ownership 和 TSFN queue 过载策略。

2. **M7-02 Ubuntu/Windows CI**
   - Ubuntu 执行 build、unit、integration、mock 和 real PTY。
   - Windows 执行 input、terminal、widgets、native 和 ConPTY E2E。

3. **M7-03 Tarball release candidate**
   - 对全部公开包执行 pack、隔离安装、类型解析和文件内容检查。
   - 验证 signal 单实例策略和 native fallback trace。

4. **M7-04 Windows 实机矩阵**
   - 按两份验证文档逐项执行。
   - 每个 shell/host 保存版本、配置、trace、结果和已知限制。

5. **M7-05 Dayloom 验收**
   - 使用 tarball 或 beta 版本，不使用 monorepo workspace 链接。
   - 覆盖输入、paste、resize、背压、退出恢复和长时间运行。

6. **M7-06 Beta 发布**
   - worktree clean、版本一致、changelog/migration 完成。
   - 发布后核对 npm version、tarball 和 `beta` dist-tag。

7. **M7-07 稳定发布决策**
   - 汇总 CI、实机、Dayloom、性能和已知问题。
   - `latest` 只能通过独立显式命令移动。

阶段验证：

- R7 自动验证和实机矩阵全部归档；
- native prebuild/fallback 在支持矩阵中行为明确；
- Dayloom 不依赖 workspace hoist 即可运行；
- beta 观察期没有未解决的 P0/P1 回归；
- 发布报告包含版本、dist-tags、tarball、测试、性能和回滚说明。

### 7.10 建议的任务与提交粒度

每个上述编号原则上对应一个 issue；每个 issue 可包含多个提交，但单个提交应属于以下
一种类型：

- `test:` characterization、target contract 或 fixture；
- `docs:` ADR、语义、迁移或验证记录；
- `fix:` 单一可观察缺陷；
- `refactor:` 保持行为的职责提取；
- `perf:` 有 benchmark 数据的单一优化；
- `build:` 构建图、测试入口或发布护栏。

禁止在同一提交中同时执行：

- signal 语义变化与 runtime ownership 引入；
- dirty 行为变化与 FrameCoordinator 提取；
- TerminalHost 公共 API 变化与 host.ts 大规模搬迁；
- metadata 迁移与 renderer 性能重写；
- native 分发变化与 `latest` dist-tag 移动。

每个里程碑建立一个可回滚的集成点。进入下一里程碑后发现前一阶段缺陷时，优先在前一
阶段边界内修复并重新执行其退出验证，不把补丁绕过职责边界放到上层应用。
