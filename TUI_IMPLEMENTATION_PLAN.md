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

下一步不应该继续深挖 signal 本身，而应该开始打通 TUI 框架主链路：

~~~text
TSX View -> VNode -> Terminal Frame -> Signal Update -> Repaint
~~~

## 总体目标

BindTTY 的第一阶段目标不是完整组件生态，而是让一个 TSX View 可以被执行成 VNode tree，再渲染到终端，并在 signal 更新时批量重绘。

最小目标示例：

~~~tsx
class CounterVM {
  count = createSignal(0);
  inc = () => this.count.set(this.count.get() + 1);
}

function App({ vm }: { vm: CounterVM }) {
  return <text>Count: {vm.count.get()}</text>;
}

createApp({
  viewModel: new CounterVM(),
  view: App
}).mount();
~~~

## 核心分层

### 1. @bindtty/core：VNode 和应用运行时

这是下一步最重要的包。先定义自己的 TSX node，不要急着写复杂终端渲染。

建议路径：

~~~text
packages/core
~~~

核心类型：

~~~ts
export type VNode =
  | TextVNode
  | ElementVNode
  | ComponentVNode
  | FragmentVNode
  | null
  | false
  | undefined;

export interface ElementVNode {
  kind: "element";
  type: string;
  props: Record<string, unknown>;
  children: VNode[];
  key?: string | number;
}
~~~

需要实现：

- createVNode()
- normalizeChildren()
- resolveVNode()
- createApp()

第一阶段不需要组件生命周期、不需要 diff、不需要局部 component update。只要能把 TSX View 执行成一棵 VNode tree 就够。

### 2. @bindtty/jsx-runtime：TSX 到 VNode

实现自己的 JSX runtime，让用户写 TSX 时生成 BindTTY 的 VNode，而不是 React/Ink 节点。

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

编译后应调用 BindTTY 的 jsx("box", { children: ... })。

### 3. @bindtty/renderer-terminal：最小终端渲染器

第一版 renderer 不做复杂 layout，只做 VNode 到文本行，再做行级 diff 输出 ANSI patch。

建议路径：

~~~text
packages/renderer-terminal
~~~

MVP 支持节点：

- <text />
- <vstack />
- <hstack />
- <box />

最小渲染规则：

- text：输出一行或多行字符串
- vstack：子节点纵向拼接
- hstack：子节点横向拼接
- box：支持 padding / border

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

这一层完成后，signal 更新才可以真正驱动终端界面刷新。

### 4. @bindtty/scheduler：批量调度 render

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

后续 createApp() 内部可以使用：

~~~ts
effect(render, { scheduler: queueJob });
~~~

这样多次状态更新可以合并成一次 render：

~~~ts
vm.loading.set(false);
vm.status.set("done");
vm.message.set("Build complete");
~~~

### 5. @bindtty/input：键盘输入、焦点、事件派发

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
  -> scheduler
  -> render
~~~

## Signal 后续补强

@bindtty/signal 当前已经足够进入下一阶段，不建议继续大改。但为了服务 TUI runtime，建议补 4 个能力。

### A. 给 effect 加 scheduler

当前 effect 只接受一个函数。后续建议扩展为：

~~~ts
effect(fn, options?: {
  scheduler?: (job: () => void) => void;
});
~~~

这是 render batching 的入口。

### B. 后置考虑 batch()

API 形态：

~~~ts
batch(() => {
  a.set(1);
  b.set(2);
  c.set(3);
});
~~~

语义：batch 内部的多次更新，只触发一次下游 effect。

第一版可以只靠 scheduler，batch() 可以后置。

### C. 明确 computed 生命周期

当前 computed() 创建时立即运行并订阅依赖，简单直接，但如果在组件渲染过程中频繁创建 computed，又没有 dispose，就可能留下依赖订阅。

短期规则：

- ViewModel 里的 computed 可以长期存在
- View 函数内部不要临时创建 computed

长期方向：

- computed(...).dispose()
- owner / scope 机制

### D. 增加开发期保护

需要避免在 View render 期间写 signal：

~~~tsx
function BadView({ vm }) {
  vm.count.set(vm.count.get() + 1); // 应该警告
  return <text>{vm.count.get()}</text>;
}
~~~

先不做强约束，但文档中应明确：

- View 只读 signal
- ViewModel command / input handler / async task 才写 signal

## 里程碑

### Milestone 1：让 TSX 能跑起来

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

createApp(App).mount();
~~~

需要实现：

- @bindtty/core
- @bindtty/jsx-runtime
- @bindtty/renderer-terminal

第一阶段先不接 signal。

### Milestone 2：signal 驱动重绘

目标：

~~~tsx
class CounterVM {
  count = createSignal(0);
  inc = () => this.count.set(this.count.get() + 1);
}

function App({ vm }: { vm: CounterVM }) {
  return <text>Count: {vm.count.get()}</text>;
}

createApp({
  viewModel: new CounterVM(),
  view: App
}).mount();
~~~

需要实现：

- createApp 内部 effect(render)
- scheduler queueJob
- renderer line diff

### Milestone 3：键盘和 button

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

### Milestone 4：input 双向绑定

目标：

~~~tsx
<input value={vm.name} />
<text>Hello {vm.name.get()}</text>
~~~

value 可以直接接收 Signal<string>。这一层会让 BindTTY 的 MVVM 味道真正出来。

### Milestone 5：scroll / list / viewport

目标：

~~~tsx
<scroll height={10} offset={vm.offset}>
  <list items={vm.logs.get()} />
</scroll>
~~~

这是 TUI 和 Web MVVM 框架的关键差异点。viewport rows、scrollback、历史消息限制，都应该在这一层解决。

## 建议包结构

当前已有：

~~~text
packages/signal
~~~

建议扩展为：

~~~text
packages/
  signal/
    src/index.ts

  core/
    src/vnode.ts
    src/app.ts
    src/resolve.ts

  jsx-runtime/
    src/jsx-runtime.ts
    src/jsx-dev-runtime.ts
    src/jsx-types.ts

  renderer-terminal/
    src/ansi.ts
    src/render-to-lines.ts
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
export * from "@bindtty/core";
export * from "@bindtty/widgets";
~~~

## 工程事项

- @bindtty/signal 当前仍是 private: true。如果未来要单独发布 npm，需要移除 private 并配置发布元数据。
- 根 README 目前只有标题和 monorepo 说明，@bindtty/signal README 也仍是占位。下一步应补一个 Counter ViewModel 示例，明确仓库定位。
- 测试继续使用 Node 内置 node:test 即可。后续每个 package 都保持 npm run build && node --test 风格，先不要引入复杂测试框架。
- 先保持包小而清楚，避免在 renderer、input、widgets 都未成型前过度设计 signal。

## 优先级

1. @bindtty/core：VNode / createApp
2. @bindtty/jsx-runtime：TSX -> VNode
3. @bindtty/renderer-terminal：VNode -> lines -> ANSI diff
4. signal effect scheduler：批量 render
5. @bindtty/input：键盘 + focus
6. widgets：text / box / button / input
7. scroll / list：TUI 真正的核心组件

## 一句话方向

signal 包已经够用。现在应该从响应式内核转向 TUI 框架主链路，优先打通 TSX View -> VNode -> Terminal Frame -> Signal Update -> Repaint。
