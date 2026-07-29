# ADR：Runtime invalidation 与 App 帧调度

状态：Accepted  
日期：2026-07-29  
里程碑：M4

## Dirty 语义

第一版采用全 App 最高 dirty 等级，不实现 subtree 增量布局：

`paint < layout < structure < viewport`

- `paint`：颜色、粗体、focusStyle 等不改变几何或交互索引的视觉属性。复用上次
  LayoutNode，只执行 paint/diff。
- `layout`：文本 value/wrap、尺寸、间距、padding、border、scroll offset 等可能改变
  intrinsic size、content rect 或位置的属性。重新执行 `layoutRoot()`。
- `structure`：Show/For 结构变化，以及 id、focusable、onKey、onKeyCapture、
  onFocusChange 等改变 interaction 索引的属性。刷新 interaction 并重新布局。
- `viewport`：终端尺寸变化。合并当前 runtime dirty，刷新 interaction、重新布局、
  reset renderer 并完整 repaint。
- `ref` 仍是静态 mount-only prop，不允许 signal，因此不进入动态 dirty 注册表。

RuntimeFlushRecord 保留原始 dirtyNodes，并同时提供 `highestDirty`。scheduler 生成 record
时过滤已 dispose 的节点；App 合并 record 时再次忽略无 dirty 标记的节点。

`onLayout` 在布局完成后发布。由它触发的 signal 更新进入 runtime 的 microtask flush，
不会递归当前 layout。

## LayoutNode 复用

App 缓存最近一次成功布局。只有 paint intent 且 viewport 未变化时才复用；layout、
structure、viewport 或没有缓存时重新布局。结构节点 dispose 后，任何包含旧引用的缓存
都不会用于 structure/viewport intent。

## FrameSink

stdout 与 TerminalHost 都适配为同一个内部 FrameSink：

- `write(frame)` 返回 `accepted | blocked`。
- 返回 blocked 表示 frame 已被 sink 接收进自身缓冲，但在 writable/drain 前不得继续写。
- 能返回 blocked 的 sink 必须实现 `onWritable(listener)`；否则 App 抛出契约错误并进入
  可恢复 idle 状态。
- TerminalHost 的 `write()`/`onDrain()` 和 Node 风格 stdout 的 `write()`/`drain`
  分别由 adapter 转换，不在 coordinator 中猜测能力。

## FrameCoordinator

状态只有 `idle | rendering | blocked | disposed`。pending intent 保存最高 dirty 等级和
最新 viewport：

- rendering 期间的新 dirty/resize 合并到 pending，当前 frame 完成后再处理。
- blocked 期间不 render，只保留最终 intent；writable 后只提交一次最终状态。
- render/layout/write 抛错时回到 idle，pending intent 保留，可由下一次显式 render、
  resize 或 runtime flush 重试。
- dispose 将状态设为 disposed 并丢弃 pending。

## App lifecycle

- start 只有全部资源注册成功后才进入 started；任一步骤抛错时按逆序 best-effort
  rollback。
- stop/dispose 先切换不可重入状态，再执行全部清理；单项失败不阻止后续项。
- 一个错误原样抛出，多个错误使用 AggregateError。dispose 即使抛错也保持幂等。
- Terminal 内部 cursor、alt screen、raw mode 和协议恢复仍由 TerminalHost 负责。
