# @bindtty/signal

BindTTY 响应式内核。提供 signal、computed、effect、batch 与订阅清理，供 runtime
binding 与 widget 内部状态使用。

## API

```ts
import { batch, createSignal, computed, effect } from "@bindtty/signal";

const count = createSignal(0);
const label = computed(() => `Count: ${count.get()}`);

effect(() => {
  console.log(label.get());
});

count.set(1);
count.subscribe((value) => { /* ... */ });

batch(() => {
  count.set(2);
  count.set(3);
});
```

- `createSignal(initial)` — 可写 signal
- `computed(fn)` — 派生只读 signal
- `effect(fn)` — 副作用，返回 dispose
- `batch(fn)` — 合并多个更新并返回 callback 的结果
- `ReadableSignal.subscribe(listener)` — binding 层建立订阅

## 响应式语义

- `computed()` 是 lazy 的：创建时不执行，首次 `get()` 或建立 consumer 时才求值。
- `get()` 始终同步返回最终派生值；不会为了等待 effect/listener 队列而返回旧值。
- effect、下游 computed 和公开 `subscribe()` 都计为 computed consumer。最后一个
  consumer 解绑后，computed 会释放上游依赖。
- 单独读取、没有 consumer 的 computed 不长期订阅上游；后续读取会重新求值。
- 最外层 `set()` 是隐式事务。`batch()` 可把多个 `set()` 合并为一个事务，同一个
  effect 在事务中至多执行一次。
- computed 先失效，effect 与显式 listener 后执行，因此菱形依赖不会暴露中间状态。
- listener 获得事务开始前的旧值和事务结束时的新值；最终值未变化时不通知。
- effect cleanup 在 rerun 前和 dispose 时执行。响应式错误和循环的完整策略见
  [Signal 响应式语义 ADR](../../doc/architecture/ADR_SIGNAL_SEMANTICS.md)。

## Counter 示例

```ts
import { createSignal, computed } from "@bindtty/signal";

class CounterVM {
  count = createSignal(0);
  countLabel = computed(() => `Count: ${this.count.get()}`);
  inc = () => this.count.set(this.count.get() + 1);
}
```

View 中绑定 `vm.countLabel`，signal 更新后由 runtime binding 驱动局部 repaint，无需整树重渲染。

## 单实例要求

`@bindtty/signal` 在模块内维护 `computationStack` 与订阅图，**全应用只能有一份物理拷贝**。若应用与 `@bindtty/widgets` 各解析到不同版本的 signal，computed 与 binding 可能异常。

- 推荐从 `bindtty` 导入 signal（应用主入口）
- 使用 widgets 时，`bindtty` 与 `@bindtty/widgets` 须**同版本**安装；勿单独安装冲突版本的 `@bindtty/signal`
- 检查：`npm ls @bindtty/signal --all` 应只有一个有效版本，其余引用显示为 deduped

## 文档

- [doc/architecture/ROADMAP.md](../../doc/architecture/ROADMAP.md) — 实现计划
- [doc/architecture/DESIGN.md](../../doc/architecture/DESIGN.md) — MVVM binding 模型
