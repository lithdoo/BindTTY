# BindTTY TUI Implementation Plan

## 当前结论

@bindtty/signal 已经具备响应式内核雏形：它不是简单的 pub/sub，而是实现了读取时追踪依赖、更新时触发依赖的响应式图。当前已经支持：

- createSignal()
- computed()
- effect()
- subscribe()
- dispose / cleanup
- 动态依赖追踪

源码中已经有 ReactiveSource、ReactiveComputation、依赖集合、computation stack、动态依赖清理等结构。测试也覆盖了基础 signal、computed 链、effect dispose、动态依赖和 cleanup。

下一步不应该继续深挖 signal 本身，而应该开始打通 MVVM + signal-driven TUI 的主链路：

~~~text
TSX
  ↓
ViewTemplate
  ↓ mount
MountedNode
  ↓ layout
LayoutNode
  ↓ paint
Frame
  ↓ diff
ANSI Patch
~~~

## 总体目标

BindTTY 的第一阶段目标不是完整组件生态，也不是 React VDOM 的简单复刻。第一阶段应先让 TSX 生成 `ViewTemplate`，运行时把它挂载成保存 binding subscription 的 `MountedNode`，再经过 layout / paint 输出终端 frame。

推荐的最小目标示例：

~~~tsx
class CounterVM {
  count = createSignal(0);
  inc = () => this.count.set(this.count.get() + 1);
}

function App({ vm }: { vm: CounterVM }) {
  return <text>Count: {vm.count}</text>;
}

createApp({
  viewModel: new CounterVM(),
  view: App
}).mount();
~~~

`<text>{vm.count}</text>` 应保存为 text binding。运行时订阅 `vm.count`，更新时标记对应 `MountedNode` dirty，而不是把组件整棵树重新执行作为唯一模型。

## 核心分层

### 1. @bindtty/vnode：ViewTemplate 设计层

当前 `packages/vnode` 是视图树设计包，负责定义 TSX 产生的声明结构和 binding 语义。它描述的是 `ViewTemplate`，不是最终终端渲染节点。

`ViewTemplate` 应支持：

- empty
- text
- element
- fragment
- component
- show
- for
- BindingValue

核心原则：

~~~text
ViewTemplate 保存声明和 binding
MountedNode 保存运行时实例和订阅
LayoutNode 保存布局结果
Frame 保存终端输出
~~~

这份设计的详细说明见 `DESIGN.md`。

### 2. @bindtty/jsx-runtime：TSX 到 ViewTemplate

实现自己的 JSX runtime，让用户写 TSX 时生成 BindTTY 的 `ViewTemplate`，而不是 React/Ink 节点。

建议路径：

~~~text
packages/jsx-runtime
~~~

或者先放在：

~~~text
packages/core/src/jsx-runtime.ts
~~~

需要导出：

~~~ts
export function jsx(type, props, key) {}
export const jsxs = jsx;
export const Fragment = Symbol("Fragment");
~~~

用户 tsconfig 目标形态：

~~~json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "bindtty"
  }
}
~~~

用户代码：

~~~tsx
<box>
  <text>Hello</text>
</box>
~~~

编译后应调用 BindTTY 的 jsx runtime，并生成 `ViewTemplate`。

### 3. @bindtty/runtime：mount、binding 和 dirty

runtime 是 MVVM 模型的核心。它把 `ViewTemplate` 挂载成 `MountedNode`，展开函数组件，并为 signal / computed / BindingExpression 建立订阅。

建议路径：

~~~text
packages/runtime
~~~

需要实现：

- mountTemplate()
- mountComponent()
- mountControlNode()
- createBinding()
- bindTextSegments()
- bindProps()
- markDirty()
- disposeMountedNode()
- createApp()

运行时节点应保存：

~~~text
节点类型
当前 props 值
当前 text 值
children
binding subscriptions
dirty state
focus/input metadata
~~~

绑定更新链路：

~~~text
signal.set()
  ↓
binding subscription fired
  ↓
MountedNode 更新当前值
  ↓
标记 dirty
  ↓
scheduler request render
~~~

第一版 dirty 可以粗一些，只要能区分 structure / layout / paint 级别即可。

### 4. @bindtty/layout：MountedNode 到 LayoutNode

layout 层基于当前 resolved 的 `MountedNode` 值计算终端空间，不保存 Component，也不保存 binding。

建议路径：

~~~text
packages/layout
~~~

MVP 支持布局节点：

- screen
- box
- vstack
- hstack
- text
- button
- input
- spacer

`LayoutNode` 最小字段：

~~~ts
interface LayoutNode {
  x: number;
  y: number;
  width: number;
  height: number;
  children: LayoutNode[];
}
~~~

不要把 `x/y/width/height` 存进 `ViewTemplate`，也不要把 ANSI 输出存进 `MountedNode`。

### 5. @bindtty/renderer-terminal：LayoutNode 到 Frame / ANSI Patch

renderer-terminal 负责 paint 和输出，不应该接收 Component，也不应该理解 binding。

建议路径：

~~~text
packages/renderer-terminal
~~~

MVP 先使用 line-based Frame：

~~~ts
type Frame = string[];
~~~

第一版行 diff：

~~~ts
let previousLines: string[] = [];
let nextLines: string[] = [];

for (const index of nextLines.keys()) {
  if (previousLines[index] !== nextLines[index]) {
    cursorTo(index + 1, 1);
    clearLine();
    write(nextLines[index]);
  }
}
~~~

后续可以升级为 cell buffer：

~~~ts
type Frame = Cell[][];
~~~

用于更准确地处理 ANSI style、宽字符、emoji、CJK 和局部 repaint。

### 6. @bindtty/scheduler：批量调度 layout / paint

当前 signal 是同步触发：signal 一 set，subscriber 立即执行。这适合测试，但不适合 TUI 主渲染，因为 stdout 重绘不能太频繁。

建议先做最小 microtask scheduler：

~~~ts
const queue = new Set<() => void>();
let flushing = false;

export function queueJob(job: () => void) {
  queue.add(job);

  if (flushing) return;
  flushing = true;

  queueMicrotask(() => {
    for (const job of queue) job();
    queue.clear();
    flushing = false;
  });
}
~~~

runtime 中的 binding subscriber 不应直接输出终端，而是标记 dirty 并请求一次调度：

~~~text
binding update
  ↓
markDirty(node, kind)
  ↓
queueJob(flush)
  ↓
layout / paint / frame diff
~~~

### 7. @bindtty/input：键盘输入、焦点、事件派发

TUI 不只是渲染，还需要输入系统。

建议路径：

~~~text
packages/input
~~~

先支持按键：

- char
- enter
- escape
- backspace
- tab
- up / down / left / right
- ctrl-c

最小 focus manager：

~~~ts
class FocusManager {
  focusNext(): void;
  focusPrevious(): void;
  activate(): void;
  register(node: InteractiveNode): void;
}
~~~

事件链路：

~~~text
stdin raw mode
  -> parseKey()
  -> focusManager.dispatch()
  -> widget handler
  -> ViewModel signal.set()
  -> binding update
  -> scheduler
  -> layout / paint / frame diff
~~~

## BindingValue 和 control node

MVVM 视图系统的核心是 `BindingValue`。

~~~ts
type BindingValue<T> =
  | T
  | ReadableSignal<T>
  | BindingExpression<T>;
~~~

推荐：

~~~tsx
<text>{vm.count}</text>
<text color={vm.color}>Ready</text>
~~~

不推荐：

~~~tsx
<text>{vm.count.get()}</text>
~~~

`.get()` 表示立即求值，会得到当前快照。MVVM 视图更应该保存绑定关系。

动态结构应该通过 control node 表达：

~~~tsx
<show when={vm.loading} fallback={<main-view />}>
  <text>Loading...</text>
</show>

<for each={vm.items} key={(item) => item.id}>
  {(item) => <text>{item.title}</text>}
</for>
~~~

不推荐：

~~~tsx
{vm.loading.get() ? <text>Loading...</text> : <main-view />}
{vm.items.get().map(item => <text>{item.title}</text>)}
~~~

因为 `.get()` 会立即求值，运行时无法保留结构绑定关系。

## Signal 后续补强

@bindtty/signal 当前已经足够进入下一阶段，不建议继续大改。但为了服务 TUI runtime，建议补 4 个能力。

### A. 统一订阅接口

runtime 需要能识别 `ReadableSignal<T>` 并订阅它。当前 `ReadableSignal<T>` 已有：

~~~ts
interface ReadableSignal<T> {
  get(): T;
  subscribe(listener: SignalListener<T>): Dispose;
}
~~~

短期可以基于这个接口实现 binding。

### B. BindingExpression

为了表达 View 中的轻量派生值，可以增加：

~~~ts
const fullName = bind(() => `${vm.firstName.get()} ${vm.lastName.get()}`);
~~~

不过复杂派生值仍推荐放进 ViewModel 的 `computed`：

~~~ts
class UserVM {
  fullName = computed(() => {
    return `${this.firstName.get()} ${this.lastName.get()}`;
  });
}
~~~

### C. 后置考虑 batch()

API 形态：

~~~ts
batch(() => {
  a.set(1);
  b.set(2);
  c.set(3);
});
~~~

语义：batch 内部的多次更新，只触发一次下游 binding 更新或调度 flush。

第一版可以只靠 scheduler，batch() 可以后置。

### D. 明确 computed 生命周期

当前 computed() 创建时立即运行并订阅依赖，简单直接，但如果在 View 中频繁创建 computed，又没有 dispose，就可能留下依赖订阅。

短期规则：

- ViewModel 里的 computed 可以长期存在
- View 中不要临时创建 computed
- 复杂 View 表达式用 `bind()`，由 runtime owner/scope 负责释放

长期方向：

- computed(...).dispose()
- owner / scope 机制

## 里程碑

### Milestone 1：让 TSX 生成 ViewTemplate

目标：

~~~tsx
function App() {
  return (
    <vstack>
      <text>Hello</text>
      <text>BindTTY</text>
    </vstack>
  );
}
~~~

需要实现：

- @bindtty/vnode 的核心类型
- @bindtty/jsx-runtime
- ViewTemplate normalize
- Fragment / ComponentTemplate

### Milestone 2：挂载成 MountedNode

目标：

~~~tsx
class CounterVM {
  count = createSignal(0);
}

function App({ vm }: { vm: CounterVM }) {
  return <text>Count: {vm.count}</text>;
}
~~~

需要实现：

- mountTemplate()
- function component 展开
- text segment binding
- prop binding
- dispose subscriptions
- dirty 标记

### Milestone 3：layout / paint / line diff

目标：

~~~text
MountedNode -> LayoutNode -> Frame -> ANSI Patch
~~~

需要实现：

- layout screen / vstack / hstack / box / text
- line-based Frame
- line diff renderer
- scheduler flush

### Milestone 4：control node

目标：

~~~tsx
<show when={vm.loading} fallback={<main-view />}>
  <text>Loading...</text>
</show>

<for each={vm.todos} key={(todo) => todo.id}>
  {(todo) => <todo-row todo={todo} />}
</for>
~~~

需要实现：

- show mount / branch switch
- for mount / keyed child reuse
- structure dirty
- child node dispose

### Milestone 5：键盘和 button

目标：

~~~tsx
<button onPress={vm.inc}>Increment</button>
~~~

需要实现：

- stdin raw mode
- key parser
- focus manager
- interactive node registry
- button widget

### Milestone 6：input 双向绑定

目标：

~~~tsx
<input value={vm.name} />
<text>Hello {vm.name}</text>
~~~

`value` 可以直接接收 `Signal<string>`。这一层会让 BindTTY 的 MVVM 味道真正出来。

### Milestone 7：scroll / list / viewport

目标：

~~~tsx
<scroll height={10} offset={vm.offset}>
  <list items={vm.logs} />
</scroll>
~~~

这是 TUI 和 Web MVVM 框架的关键差异点。viewport rows、scrollback、历史消息限制，都应该在这一层解决。

## 建议包结构

当前已有：

~~~text
packages/
  signal/
  vnode/
  bindtty/
~~~

建议扩展为：

~~~text
packages/
  signal/
    src/index.ts

  vnode/
    src/types.ts
    src/create-template.ts
    src/normalize-children.ts
    src/control-node.ts

  jsx-runtime/
    src/jsx-runtime.ts
    src/jsx-dev-runtime.ts
    src/jsx-types.ts

  runtime/
    src/app.ts
    src/mount.ts
    src/binding.ts
    src/dirty.ts
    src/dispose.ts

  scheduler/
    src/index.ts

  layout/
    src/layout-node.ts
    src/layout.ts
    src/measure-text.ts

  renderer-terminal/
    src/ansi.ts
    src/frame.ts
    src/paint.ts
    src/line-diff-renderer.ts

  input/
    src/keyboard.ts
    src/focus.ts

  widgets/
    src/text.ts
    src/box.ts
    src/button.ts
    src/input.ts

  bindtty/
    src/index.ts
~~~

最终 bindtty 做总入口：

~~~ts
export * from "@bindtty/signal";
export * from "@bindtty/vnode";
export * from "@bindtty/runtime";
export * from "@bindtty/widgets";
~~~

## 工程事项

- @bindtty/signal 当前仍是 private: true。如果未来要单独发布 npm，需要移除 private 并配置发布元数据。
- 根 README 目前只有标题和 monorepo 说明，@bindtty/signal README 也仍是占位。下一步应补一个 Counter ViewModel 示例，明确仓库定位。
- 测试继续使用 Node 内置 node:test 即可。后续每个 package 都保持 npm run build && node --test 风格，先不要引入复杂测试框架。
- 先保持包小而清楚，避免在 layout、renderer、input、widgets 都未成型前过度设计 signal。
- 文档中应持续避免把 BindTTY 描述成 React VDOM 复刻；核心叙事应是 MVVM binding tree。

## 优先级

1. @bindtty/vnode：ViewTemplate / BindingValue / control node 类型
2. @bindtty/jsx-runtime：TSX -> ViewTemplate
3. @bindtty/runtime：mount / binding subscription / dirty
4. @bindtty/layout：MountedNode -> LayoutNode
5. @bindtty/renderer-terminal：LayoutNode -> Frame -> ANSI diff
6. @bindtty/scheduler：批量 flush
7. @bindtty/input：键盘 + focus
8. widgets：text / box / button / input
9. scroll / list：TUI 真正的核心组件

## 一句话方向

signal 包已经够用。现在应该从响应式内核转向 MVVM TUI 框架主链路，优先打通 TSX -> ViewTemplate -> MountedNode -> LayoutNode -> Frame -> ANSI Patch，并让 signal 更新以 binding-level invalidation 的方式驱动 dirty、layout 和 paint。
