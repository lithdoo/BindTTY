# ADR：Signal 响应式语义

状态：Accepted  
日期：2026-07-29  
里程碑：M2

## 背景

原实现创建 `computed()` 时立即求值并永久订阅上游，更新按同步深度优先顺序传播。
这会让无消费者的派生值长期占用订阅，在菱形依赖中也可能让 effect 观察到一部分已更新、
另一部分未更新的中间状态。

## 决策

### Computed 与 consumer

- `computed()` 采用 lazy/stale 模型；创建时不执行 derive，也不订阅上游。
- `get()` 同步返回当前最终值。首次读取或 stale 后读取会立即重新计算。
- effect、下游 computed 和公开 `subscribe()` 都是 consumer。
- computed 有 consumer 时保持上游订阅并在上游变化时标记 stale。
- 最后一个 consumer 解绑后立即释放上游订阅。之后的单次 `get()` 可以缓存值，但不会
  保留上游订阅；下次读取会重新 derive，以免依赖无订阅期间变化后返回陈旧值。
- 动态依赖在每次 derive 时重新收集。

### 事务与执行顺序

- 最外层 `set()` 是一个隐式事务；`batch(fn)` 把多个 `set()` 合并为一个事务。
- source 先写入新值并让 computed 失效，随后重新计算有 consumer 的 computed，最后执行
  effect 和显式 listener。
- 同一事务中的同一个 computation 或 listener 至多进入一次队列。effect 因多个依赖
  同时变化仍只执行一次，因此不会观察菱形中间态。
- `get()` 不等待队列：在任何时刻读取 stale computed 都同步得到最终派生值。
- listener 接收该事务开始前的旧值和事务结束时的新值；值最终未变化时不通知。
- effect 创建时立即执行一次；effect cleanup 在 rerun 前和 dispose 时执行。
- 嵌套 `batch()` 复用外层事务。`batch()` 返回 callback 的返回值。

### 递归、循环与错误

- listener 或 effect 中的 `set()` 加入当前 flush 的后续轮次，不递归调用当前
  computation；队列持续排空后事务才结束。
- 同一事务最多执行 1,000 个 computation/listener job。超过上限视为响应式更新循环，
  清空剩余队列并抛出 `Reactive update cycle exceeded 1000 jobs`。
- computed 在自身 derive 尚未结束时再次读取自身，抛出 `Reactive computed cycle
  detected`。
- derive 抛错时恢复 computation stack 和旧依赖图；computed 保持 stale，后续 `get()`
  可以重试。
- effect body 或 cleanup 抛错时恢复依赖图与栈，停止并清空当前事务队列，然后把原错误
  同步抛给触发者；effect 本身仍可由后续更新重试或 dispose。
- listener 抛错时停止并清空当前事务队列，把原错误同步抛给触发者。已完成的写入不回滚。
- dispose 即使 cleanup 抛错也必须先标记 disposed 并解除依赖，再向调用者抛错。

### 单实例

继续把单个有效 `@bindtty/signal` 版本作为应用安装契约：

- 生产包通过同版本 `dependencies` 与 `peerDependencies` 让包管理器复用应用实例。
- `bindtty` 和 `@bindtty/widgets` 的隔离 consumer smoke test 必须执行
  `npm ls @bindtty/signal`，并验证只有一个有效版本。
- README 记录诊断命令。M2 不增加跨 JavaScript realm 的全局可变 registry；该机制会
  让测试隔离、并存应用和热重载产生额外的全局状态风险。

## 后果

`computed()` 的 derive 执行时机从创建时改为首次读取/订阅时。依赖 derive 副作用的代码
本来就不符合 computed 契约，应改为 `effect()`。`batch()` 成为新增公共 API，并由
`bindtty` 顶层转发。
