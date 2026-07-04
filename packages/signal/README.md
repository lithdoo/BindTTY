# @bindtty/signal

BindTTY 响应式内核。提供 signal、computed、effect 与订阅清理，供 runtime binding 与 widget 内部状态使用。

## API

```ts
import { createSignal, computed, effect } from "@bindtty/signal";

const count = createSignal(0);
const label = computed(() => `Count: ${count.get()}`);

effect(() => {
  console.log(label.get());
});

count.set(1);
count.subscribe((value) => { /* ... */ });
```

- `createSignal(initial)` — 可写 signal
- `computed(fn)` — 派生只读 signal
- `effect(fn)` — 副作用，返回 dispose
- `ReadableSignal.subscribe(listener)` — binding 层建立订阅

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

- 推荐从 `bindtty` 导入（re-export 同源 signal）
- 若单独安装本包，版本须与 `bindtty` / `@bindtty/widgets` 的 peer 声明一致
- 检查：`npm ls @bindtty/signal` 应只有一棵树、一个版本

## 文档

- [doc/architecture/ROADMAP.md](../../doc/architecture/ROADMAP.md) — 实现计划
- [doc/architecture/DESIGN.md](../../doc/architecture/DESIGN.md) — MVVM binding 模型
