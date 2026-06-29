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

文档索引见 [README.md](./README.md)。

## 总体目标

BindTTY 的第一阶段目标不是完整组件生态，也不是 React VDOM 的简单复刻。第一阶段应先让 TSX 生成 `ViewTemplate`，运行时把它挂载成保存 binding subscription 的 `MountedNode`，再经过 layout / paint 输出终端 frame。

推荐的最小目标示例：

~~~tsx
class CounterVM {
  count = createSignal(0);
  countLabel = computed(() => `Count: ${this.count.get()}`);
  inc = () => this.count.set(this.count.get() + 1);
}

function App({ vm }: { vm: CounterVM }) {
  return <text value={vm.countLabel} />;
}

createApp({
  viewModel: new CounterVM(),
  view: App
}).mount();
~~~

`<text value={vm.countLabel} />` 应保存为 prop binding。运行时订阅对应 signal，更新时标记 `MountedNode` dirty，而不是把组件整棵树重新执行作为唯一模型。

## Monorepo 包结构

MVP 阶段使用 **7 个包**：

~~~text
packages/
  signal/          @bindtty/signal
  vnode/           @bindtty/vnode
  jsx-runtime/     @bindtty/jsx-runtime
  runtime/         @bindtty/runtime
  layout/          @bindtty/layout
  widgets/         @bindtty/widgets
  bindtty/         bindtty（总入口）
~~~

当前已有：`signal`、`vnode`、`bindtty`。

合并原则：

- **layout + render**：MVP 不单独拆 `@bindtty/renderer-terminal`，paint / frame / ANSI diff 放在 `@bindtty/layout` 内，按文件分模块。
- **widgets + input**：MVP 不单独拆 `@bindtty/input`，focus / keyboard / interactive element 放在 `@bindtty/widgets` 内。
- **scheduler**：MVP 不单独拆包，microtask flush 放在 `@bindtty/runtime` 内。

## 核心分层

### 1. @bindtty/signal：响应式内核

已完成 MVP 所需能力。runtime binding 基于 `ReadableSignal.subscribe()` 建立订阅。

短期不在 signal 层大改；TUI 所需 batch、computed dispose 等可后置。

### 2. @bindtty/vnode：ViewTemplate 设计层

`packages/vnode` 负责定义 TSX 产生的声明结构和 binding 语义。它描述的是 `ViewTemplate`，不是最终终端渲染节点。

`ViewTemplate` 应支持：

- empty
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

详细说明见 [DESIGN.md](./DESIGN.md) 和 [VNODE.md](./VNODE.md)。

### 3. @bindtty/jsx-runtime：TSX 到 ViewTemplate

实现自己的 JSX runtime，让用户写 TSX 时生成 BindTTY 的 `ViewTemplate`，而不是 React/Ink 节点。

落地细节见 [JSX_RUNTIME.md](./JSX_RUNTIME.md)。

路径：

~~~text
packages/jsx-runtime
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
  <text value="Hello" />
</box>
~~~

编译后应调用 BindTTY 的 jsx runtime，并生成 `ViewTemplate`。

### 4. @bindtty/runtime：mount、binding、dirty 和调度

runtime 是 MVVM 模型的核心。它把 `ViewTemplate` 挂载成 `MountedNode`，展开函数组件，并为 signal / computed 等 `ReadableSignal` 建立订阅。

第一阶段落地细节见 [RUNTIME.md](./RUNTIME.md)。

路径：

~~~text
packages/runtime
~~~

需要实现：

- mountTemplate()
- mountComponent()
- mountControlNode()
- createBinding()
- bindProps()
- markDirty()
- disposeMountedNode()
- createApp()
- queueJob() / flush（microtask scheduler）

运行时节点应保存：

~~~text
节点类型
当前 props 值
children
binding subscriptions
dirty state
focus/input metadata（注册信息，行为由 widgets 提供）
~~~

绑定更新链路：

~~~text
signal.set()
  ↓
binding subscription fired
  ↓
MountedNode 更新当前值
  ↓
markDirty(node, kind)
  ↓
queueJob(flush)
  ↓
layout / paint / frame diff
~~~

第一版 dirty 可以粗一些，只要能区分 structure / layout / paint 级别即可。

MountedNode 设计见 [VNODE.md](./VNODE.md) Part II。

### 5. @bindtty/layout：layout、paint 和终端输出

layout 包负责从 resolved 的 `MountedNode` 到终端输出的完整渲染链路。它不保存 Component，也不理解 binding。

路径：

~~~text
packages/layout
~~~

建议模块：

~~~text
src/layout-node.ts    LayoutNode 类型
src/layout.ts         布局引擎
src/measure-text.ts   文本测量
src/frame.ts          Frame 类型
src/paint.ts          绘制
src/ansi.ts           ANSI 工具
src/line-diff.ts      行级 diff 输出
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

后续可升级为 `Cell[][]`，用于 ANSI style、宽字符、emoji、CJK 和局部 repaint。届时可考虑拆出 `@bindtty/renderer-terminal`。

不要把 `x/y/width/height` 存进 `ViewTemplate`，也不要把 ANSI 输出存进 `MountedNode`。

layout 引擎通过 `@bindtty/widgets` 提供的 ElementDefinition 参与 measure / paint；widgets 不直接写 stdout。

### 6. @bindtty/widgets：ElementDefinition 和输入

widgets 包定义 intrinsic element 的运行时行为，并承载 MVP 阶段的 focus / keyboard 能力。

路径：

~~~text
packages/widgets
~~~

建议模块：

~~~text
src/elements/
  text.ts
  box.ts
  button.ts
  input.ts
src/focus.ts
src/keyboard.ts
src/registry.ts
~~~

每种 element 提供 ElementDefinition：

~~~text
text:   测量、绘制
box:    边框、padding、children layout
vstack / hstack: 排列 children
button: focus、activate、绘制
input:  focus、编辑状态、keyboard、双向 value binding
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
  -> parseKey()          // widgets/keyboard
  -> focusManager.dispatch()
  -> element definition handler
  -> ViewModel signal.set()
  -> binding update
  -> runtime scheduler
  -> layout / paint / frame diff
~~~

当 focus scope、global shortcut 等变复杂时，可再拆 `@bindtty/input`。

### 7. bindtty：总入口

~~~ts
export * from "@bindtty/signal";
export * from "@bindtty/vnode";
export * from "@bindtty/runtime";
export * from "@bindtty/widgets";
~~~

用户通常只 import `bindtty`；各子包保持独立以便测试和按需引用。

## BindingValue 和 control node

MVVM 视图系统的核心是 `BindingValue`。

~~~ts
type BindingValue<T> =
  | T
  | ReadableSignal<T>;
~~~

推荐：

~~~tsx
<text value={vm.countLabel} />
<text value="Ready" color={vm.color} />
~~~

不推荐：

~~~tsx
<text value={vm.countLabel.get()} />
~~~

`.get()` 表示立即求值，会得到当前快照。MVVM 视图更应该保存绑定关系。

动态结构应该通过 control node 表达：

~~~tsx
<show when={vm.loading} fallback={<text value="Ready" />}>
  <text value="Loading..." />
</show>

<for each={vm.items} key={(item) => item.id}>
  {(item) => <text value={item.title} />}
</for>
~~~

不推荐：

~~~tsx
{vm.loading.get() ? <text value="Loading..." /> : <main-view />}
{vm.items.get().map(item => <text value={item.title} />)}
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

### B. View 层 scoped computed

为了表达 View 中的轻量派生值，可以增加 `bind()` helper：

~~~ts
const fullName = bind(() => `${vm.firstName.get()} ${vm.lastName.get()}`);
~~~

`bind()` 本质上应返回 `ReadableSignal<T>`，可以用 runtime-owned computed 实现。它不需要成为 `BindingValue` 的第三种分支；真正需要明确的是它由哪个 mounted runtime scope dispose。

不过复杂派生值仍推荐放进 ViewModel 的 `computed`：

~~~ts
class UserVM {
  fullName = computed(() => {
    return `${this.firstName.get()} ${this.lastName.get()}`;
  });
}
~~~

### C. 后置考虑 batch()

~~~ts
batch(() => {
  a.set(1);
  b.set(2);
  c.set(3);
});
~~~

语义：batch 内部的多次更新，只触发一次下游 binding 更新或调度 flush。第一版可以只靠 runtime scheduler，batch() 可以后置。

### D. 明确 computed 生命周期

短期规则：

- ViewModel 里的 computed 可以长期存在
- View 中不要临时创建 computed
- 复杂 View 表达式用 `bind()`，由 runtime owner/scope 负责释放

## 里程碑

### Milestone 1：让 TSX 生成 ViewTemplate

~~~tsx
function App() {
  return (
    <vstack>
      <text value="Hello" />
      <text value="BindTTY" />
    </vstack>
  );
}
~~~

需要实现：

- @bindtty/vnode 核心类型
- @bindtty/jsx-runtime
- ViewTemplate normalize
- Fragment / ComponentTemplate

### Milestone 2：挂载成 MountedNode

~~~tsx
class CounterVM {
  count = createSignal(0);
  countLabel = computed(() => `Count: ${this.count.get()}`);
}

function App({ vm }: { vm: CounterVM }) {
  return <text value={vm.countLabel} />;
}
~~~

需要实现：

- mountTemplate()
- function component 展开
- prop binding
- dispose subscriptions
- dirty 标记
- runtime microtask scheduler

### Milestone 3：layout / paint / line diff

~~~text
MountedNode -> LayoutNode -> Frame -> ANSI Patch
~~~

需要实现：

- @bindtty/layout：screen / vstack / hstack / box / text layout
- line-based Frame、paint、line diff
- @bindtty/widgets：基础 ElementDefinition（text、box、vstack、hstack）
- runtime scheduler flush 串联完整渲染

### Milestone 4：control node

~~~tsx
<show when={vm.loading} fallback={<text value="Ready" />}>
  <text value="Loading..." />
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

### Milestone 5：交互 widget（button + focus + keyboard）

~~~tsx
<button value="Increment" onPress={vm.inc} />
~~~

需要实现（均在 @bindtty/widgets）：

- stdin raw mode
- key parser
- focus manager
- interactive node registry
- button ElementDefinition

### Milestone 6：input 双向绑定

~~~tsx
<input value={vm.name} />
<text value={vm.name} />
~~~

`value` 可以直接接收 `Signal<string>`。input ElementDefinition 和 keyboard 处理同在 widgets 包。

### Milestone 7：scroll / list / viewport

~~~tsx
<scroll height={10} offset={vm.offset}>
  <list items={vm.logs} />
</scroll>
~~~

viewport rows、scrollback、历史消息限制在这一层解决。这是 TUI 与 Web MVVM 的关键差异点。

## 工程事项

- @bindtty/signal 当前仍是 private: true。若未来单独发布 npm，需移除 private 并配置发布元数据。
- 根 README 和 @bindtty/signal README 仍是占位。下一步应补 Counter ViewModel 示例。
- 测试继续使用 Node 内置 node:test。每个 package 保持 `npm run build && node --test` 风格。
- 先保持包小而清楚，避免在 layout、widgets 未成型前过度设计 signal。
- 文档中应持续避免把 BindTTY 描述成 React VDOM 复刻；核心叙事应是 MVVM binding tree。

## 优先级

1. @bindtty/vnode：ViewTemplate / BindingValue / control node 类型
2. @bindtty/jsx-runtime：TSX → ViewTemplate
3. @bindtty/runtime：mount / binding / dirty / scheduler
4. @bindtty/layout：MountedNode → LayoutNode → Frame → ANSI diff
5. @bindtty/widgets：ElementDefinition / focus / keyboard / button / input
6. bindtty：统一入口
7. scroll / list / viewport：TUI 核心组件（后续）

## 一句话方向

signal 包已经够用。现在应该从响应式内核转向 MVVM TUI 框架主链路，优先打通 TSX → ViewTemplate → MountedNode → LayoutNode → Frame → ANSI Patch，并让 signal 更新以 binding-level invalidation 的方式驱动 dirty、layout 和 paint。
