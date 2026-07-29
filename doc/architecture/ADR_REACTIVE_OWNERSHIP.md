# ADR：Reactive ownership 与卸载清理

状态：Accepted  
日期：2026-07-29  
里程碑：M3

## 背景

widget 和组件执行时会创建多个 `computed()`。M2 已让无消费者 computed 释放上游，
但只要 runtime binding 仍订阅它，组件从 Show/For 分支移除后就必须保证 binding 与
响应式资源一起释放。`effect()` 还可能持有定时器、事件监听等外部资源，不能依赖垃圾
回收处理。

## 决策

### Owner 模型

- signal 包提供不从 `bindtty` 顶层转发的内部 owner API。runtime 使用它建立 owner
  边界，普通应用 API 暂不承诺 owner 的兼容性。
- owner 组成树。创建 owner 时，当前 owner 自动成为其 parent。
- `runWithOwner(owner, fn)` 仅在 `fn` 同步执行期间压入 owner stack；抛错时也必须恢复
  stack。
- `computed()` 与 `effect()` 创建时自动把自身 dispose 注册到当前 owner。
- owner dispose 幂等。先按创建逆序 dispose children，再按注册逆序执行本 owner
  cleanup；即使其中一项抛错也继续清理剩余项。
- 一个错误原样抛出；多个错误以 `AggregateError` 抛出。owner 在执行 cleanup 前即标记
  disposed，避免 cleanup 重入导致重复执行。
- disposed owner 不能再次承载工作；`runWithOwner()` 对它抛出明确错误。

### Runtime 边界

- RuntimeRoot 持有根 owner，整个初始 mount 都在该 owner 中执行。
- 每次 component 执行和其返回模板的 mount 使用一个 child owner。component 返回
  empty、无效模板或抛错时立即 dispose owner。
- 每个 Show active branch 和每个 For item 都有独立 child owner。分支切换、item 删除
  和 control dispose 会释放对应 owner；相同 key reorder 复用原 owner。
- owner 通过 runtime 私有 WeakMap 关联实际 MountedNode，不修改 vnode 的公共
  `MountedNode` 结构。多个嵌套 component 可以关联同一最终节点，幂等 owner tree 保证
  不重复 cleanup。
- MountedNode 先完成 element binding、子节点和 control binding 清理，再释放关联
  owner。RuntimeRoot 无论 cleanup 是否抛错都必须清空 scheduler。

### Widget

TextInput、Textarea、ScrollView 及其他 widget 不维护手工 computed dispose 列表。
它们作为函数组件执行时创建的 computed 自动归属 component owner；对应 MountedNode
卸载即释放整组资源。

## 后果

直接调用 `mountTemplate()` 仍会为 component、Show branch 和 For item 建立独立 owner，
不要求必须通过 RuntimeRoot。组件之外、没有当前 owner 时创建的 signal/computed/effect
继续由调用者自行管理；尤其 `effect()` 仍应保存并调用其公开 dispose。
