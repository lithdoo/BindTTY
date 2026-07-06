# BindTTY 路线图

> **类型**：architecture  
> **状态**：implemented（M1–M7）  
> **最后核对**：2026-07  
> **相关**：[DESIGN.md](./DESIGN.md) · [../specs/SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md) · [../README.md](../README.md)

::: info 本章导航

| 章节 | 内容 |
| --- | --- |
| [当前结论](#当前结论) | M1–M7 完成状态 |
| [总体目标](#总体目标) | 框架目标 |
| [Monorepo 包结构](#monorepo-包结构) | 11 包模型 |
| [核心分层](#核心分层) | 四层链路 |
| [BindingValue 和 control node](#bindingvalue-和-control-node) | 绑定与控制流 |
| [Signal 后续补强](#signal-后续补强) | signal 包规划 |
| [里程碑](#里程碑) | M1–M7 明细 |
| [工程事项](#工程事项) | CI / 发布等 |
| [优先级](#优先级) | 下一阶段 |
| [一句话方向](#一句话方向) | 总结 |

:::

## 当前结论

@bindtty/signal 已具备响应式内核：读取时追踪依赖、更新时触发依赖，支持 `createSignal`、`computed`、`effect`、`subscribe`、dispose 与动态依赖清理。

**M1–M7 主链路已完成**：TSX → ViewTemplate → MountedNode → LayoutNode → Frame (Cell) → ANSI Patch，含 terminal、interaction、widgets（Button / Checkbox / TextInput / Select / ScrollView 系列 / List / ProgressBar）与 `bindtty` createApp。

下一阶段重点为高级 layout props、Scroll/List 后续增强、顶层 API 完善与 npm 发布准备。主链路示意：

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

文档索引见 [README.md](../README.md)。

## 总体目标

BindTTY 的第一阶段目标不是完整组件生态，也不是 React VDOM 的简单复刻。第一阶段应先让 TSX 生成 `ViewTemplate`，运行时把它挂载成保存 binding subscription 的 `MountedNode`，再经过 layout / paint 输出终端 frame。

推荐的最小目标示例：

~~~tsx
import { createSignal, computed } from "@bindtty/signal";
import { createApp } from "bindtty";

class CounterVM {
  count = createSignal(0);
  countLabel = computed(() => `Count: ${this.count.get()}`);
  inc = () => this.count.set(this.count.get() + 1);
}

function App({ vm }: { vm: CounterVM }) {
  return <text value={vm.countLabel} />;
}

const app = createApp(<App vm={new CounterVM()} />, {
  stdout: process.stdout
});
app.start();
~~~

`<text value={vm.countLabel} />` 应保存为 prop binding。运行时订阅对应 signal，更新时标记 `MountedNode` dirty，而不是把组件整棵树重新执行作为唯一模型。

## Monorepo 包结构

当前正式模型为 **11 个可发布包** + 私有 `packages/e2e`。历史 7 包 / 10 包规划见 [archive/plans/PACKAGE_MODEL_HISTORY.md（GitHub）](https://github.com/lithdoo/BindTTY/blob/main/doc/archive/plans/PACKAGE_MODEL_HISTORY.md)。

| 包 | 职责 |
| --- | --- |
| `@bindtty/signal` | 响应式内核：`createSignal`、`computed`、`effect` |
| `@bindtty/vnode` | 声明层：`ViewTemplate`、`BindingValue`、control node 类型 |
| `@bindtty/jsx-runtime` | TSX → `ViewTemplate` |
| `@bindtty/runtime` | `mount`、binding subscription、dirty、dispose、microtask 调度 |
| `@bindtty/text` | display-width-aware 文本测量 / wrapping / truncation |
| `@bindtty/layout` | `MountedNode` → `LayoutNode`，默认 Yoga backend |
| `@bindtty/renderer-terminal` | `LayoutNode` → `Frame` → ANSI diff |
| `@bindtty/terminal` | Terminal lifecycle、viewport、resize、input event adapter |
| `@bindtty/interaction` | keyboard focus、`onKey` dispatch、focused state |
| `@bindtty/widgets` | 高层 interactive widget 与复合控件 |
| `bindtty` | 框架入口（`createApp`、signal re-export、JSX runtime 转发；不含 widgets） |

包边界：

~~~text
@bindtty/layout:
  只负责 MountedNode -> LayoutNode 的几何计算。

@bindtty/renderer-terminal:
  只负责 LayoutNode -> Frame -> ANSI patch。

@bindtty/terminal:
  只负责 terminal lifecycle、viewport、resize、keypress adapter。

@bindtty/interaction:
  负责 keyboard focus、onKey dispatch、focused state。

@bindtty/widgets:
  负责 Button / Checkbox / TextInput / Select / ScrollView 系列 / List / ProgressBar 等高层控件语义。

@bindtty/text:
  负责 terminal display-width / grapheme / wrapping / truncation（layout 与 renderer 共用）。
~~~

focus / keyboard 与 widget 语义分工：

~~~text
focus / keyboard dispatch:  @bindtty/interaction
button / input 业务语义:      @bindtty/widgets 或用户组件
~~~

### Shared Prop Model

实现 `@bindtty/interaction` 前，必须先落地一层 shared prop model，避免样式、焦点控制和组件自定义字段混在一起后被 layout / renderer / interaction 误读。

MVP props 分为三类：

~~~text
style props:
  layout / paint 使用。
  例如 padding、border、color、background、bold。

interaction props:
  interaction 使用。
  例如 id、onKey、onFocusChange。

component custom props:
  组件自己消费。
  例如 label、disabled、onPress、placeholder、items。
~~~

规则：

~~~text
intrinsic element:
  可以接收 style props + interaction props。

custom component:
  可以定义任意 custom props。
  custom props 不自动进入底层 intrinsic element。
  如果 custom prop 需要影响布局、绘制或交互，组件必须显式转发为 style / interaction prop。
~~~

示例：

~~~tsx
function Button(props: {
  id?: string;
  label: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <box
      id={props.id}
      onKey={
        props.disabled
          ? false
          : (event) => {
              if (event.name === "return" || event.input === " ") {
                props.onPress?.();
                return true;
              }
            }
      }
      border
      padding={1}
    >
      <text value={props.label} />
    </box>
  );
}
~~~

这里：

~~~text
label / disabled / onPress:
  component custom props。

border / padding:
  style props。

id / onKey:
  interaction props。
~~~

落地任务：

~~~text
1. 在 JSX intrinsic element 类型中抽共享 base props。
2. vnode schema 接受通用 interaction props。
3. layout 明确忽略 id / onKey / onFocusChange。
4. renderer 明确忽略 id / onKey / onFocusChange。
5. interaction 只读取 interaction props，不读取 style props。
6. widgets / 用户组件负责显式转发 custom props。
~~~

验收：

~~~text
<box id="x" onKey={true} border padding={1} /> 类型通过。
layoutRoot 遇到 id / onKey / onFocusChange 不报 Unsupported layout prop。
renderer 遇到 id / onKey / onFocusChange 不改变 paint 结果。
custom component props 不会自动进入 intrinsic element。
~~~

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

详细说明见 [DESIGN.md](./DESIGN.md) 和 [VNODE.md](../packages/VNODE.md)。

### 3. @bindtty/jsx-runtime：TSX 到 ViewTemplate

实现自己的 JSX runtime，让用户写 TSX 时生成 BindTTY 的 `ViewTemplate`，而不是 React/Ink 节点。

落地细节见 [JSX_RUNTIME.md](../packages/JSX_RUNTIME.md)。

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

第一阶段落地细节见 [RUNTIME.md](../packages/RUNTIME.md)。

路径：

~~~text
packages/runtime
~~~

需要实现（均已落地，`createApp` 在 `bindtty` 包而非 runtime）：

- mountTemplate()
- mountComponent()
- mountControlNode()
- createBinding()
- bindProps()
- markDirty()
- disposeMountedNode()
- queueJob() / flush（microtask scheduler）

运行时节点应保存：

~~~text
节点类型
当前 props 值
children
binding subscriptions
dirty state
interaction metadata（注册信息，行为由 @bindtty/interaction 提供）
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

MountedNode 设计见 [VNODE.md](../packages/VNODE.md) Part II。

### 5. @bindtty/layout 与 @bindtty/renderer-terminal

**当前实现**：layout 与 renderer 已拆为两个包。`@bindtty/layout` 只负责 `MountedNode → LayoutNode` 几何计算；`@bindtty/renderer-terminal` 负责 `LayoutNode → Frame → ANSI patch`。

layout 路径：

~~~text
packages/layout
  src/layout.ts
  src/measure.ts
  src/intrinsic.ts
  src/basic-engine.ts
  src/engine.ts
  src/types.ts
~~~

renderer 路径：

~~~text
packages/renderer-terminal
  src/frame.ts
  src/paint.ts
  src/style.ts
  src/diff.ts
  src/ansi.ts
  src/renderer.ts
~~~

MVP 已支持布局节点：

- screen、box、vstack、hstack、text、spacer（layout + paint）
- fragment、show、for（结构节点）

intrinsic `button` / `input` 在 vnode schema 有类型，但 layout / paint 抛 `Unsupported`；交互语义由 `@bindtty/widgets` 的 `Button` / `TextInput` 通过组合 primitive 实现。

`LayoutNode` 使用绝对坐标 `rect` / `contentRect` + `mounted` 引用。

Frame 已采用 **Cell 栅格**（非早期计划的 `string[]` 行数组），支持 per-cell 样式与 cell-level diff。

不要把 `x/y/width/height` 存进 `ViewTemplate`，也不要把 ANSI 输出存进 `MountedNode`。

### 6. @bindtty/widgets：高层控件

**当前实现**：Button、Checkbox、TextInput、Select、VScrollView、HScrollView、ScrollView、List、ProgressBar 已落地，通过组合 primitive 与 `focusable` / `onKey` / `onKeyCapture` 实现交互语义。focus / keyboard dispatch 在 `@bindtty/interaction`；请从 `@bindtty/widgets` 单独导入，**不**经 `bindtty` 顶层 re-export。

### 7. bindtty：总入口

**alpha 冻结公共 API**：

~~~ts
export { createApp } from "./app.js";
export { createSignal, computed, effect } from "@bindtty/signal";
// + CreateAppOptions、Signal 相关类型
// JSX: bindtty/jsx-runtime、bindtty/jsx-dev-runtime
// widgets 从 @bindtty/widgets 单独安装/导入
~~~

`createApp` 组合 runtime、layout、renderer、terminal、interaction，支持 stdout 与 terminal 双模式。JSX 通过 `./jsx-runtime` 子路径转发。

**不**从顶层导出 `runtime` / `vnode` / `layout` / `renderer-terminal` / `@bindtty/widgets`；高级扩展按需引用子包。`@bindtty/signal` 仍可独立安装。

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

### Milestone 1：让 TSX 生成 ViewTemplate ✅

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

已实现：

- @bindtty/vnode 核心类型
- @bindtty/jsx-runtime
- ViewTemplate normalize
- Fragment / ComponentTemplate

### Milestone 2：挂载成 MountedNode ✅

~~~tsx
class CounterVM {
  count = createSignal(0);
  countLabel = computed(() => `Count: ${this.count.get()}`);
}

function App({ vm }: { vm: CounterVM }) {
  return <text value={vm.countLabel} />;
}
~~~

已实现：

- mountTemplate()
- function component 展开
- prop binding
- dispose subscriptions
- dirty 标记
- runtime microtask scheduler

### Milestone 3：layout / paint / ANSI diff ✅

~~~text
MountedNode -> LayoutNode -> Frame (Cell[]) -> ANSI Patch
~~~

已实现：

- @bindtty/layout：screen / vstack / hstack / box / text / spacer layout
- @bindtty/renderer-terminal：Cell-based Frame、paint、cell diff、focusStyle
- runtime scheduler flush 串联完整渲染（由 createApp 组合）

### Milestone 4：control node ✅

~~~tsx
<show when={vm.loading} fallback={<text value="Ready" />}>
  <text value="Loading..." />
</show>

<for each={vm.todos} key={(todo) => todo.id}>
  {(todo) => <todo-row todo={todo} />}
</for>
~~~

已实现：

- show mount / branch switch
- for mount / keyed child reuse
- structure dirty
- child node dispose

### Milestone 5：交互 widget（button + focus + keyboard）✅

~~~tsx
<Button label="Increment" onPress={vm.inc} />
~~~

已实现：

- stdin raw mode 与 key parser：`@bindtty/terminal`
- focus traversal 与 onKey dispatch：`@bindtty/interaction`
- button 语义：`@bindtty/widgets` Button 组件

### Milestone 6：input 双向绑定 ✅

~~~tsx
<TextInput value={vm.name} onChange={vm.setName} />
~~~

已实现：

- `TextInput` 受控 value/onChange、拆分光标渲染、placeholder、disabled
- keyboard dispatch 由 `@bindtty/interaction` 负责

### Milestone 7：scroll / list / viewport ✅ 已完成

详见 **[SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md)**（分层设计、稳定接口契约与测试索引）。历史分阶段计划见 [archive/plans/M7_SCROLL_VIEWPORT_PLAN.md（GitHub）](https://github.com/lithdoo/BindTTY/blob/main/doc/archive/plans/M7_SCROLL_VIEWPORT_PLAN.md)。

~~~tsx
<ScrollView height={10} offset={vm.offset} onOffsetChange={vm.setOffset}>
  <List items={vm.logs} getKey={(log) => log.id} render={(log) => <text value={log.message} />} />
</ScrollView>
~~~

viewport rows、scrollback、历史消息限制在这一层解决。这是 TUI 与 Web MVVM 的关键差异点。

已实现：

- `box` 支持 fixed `height` / `width`、`overflow="clip"`、`scrollX` / `scrollY` layout props。
- `LayoutNode` 输出 `clip`、`contentSize`、clamp 后的 `scrollOffset`。
- renderer 支持 clip stack 与 children scroll offset，box border/background 保持固定。
- `@bindtty/widgets` 导出 VScrollView、HScrollView、ScrollView、List 及 form/display 控件。
- mock E2E 覆盖静态 clip、signal offset、键盘滚动、TextInput 优先级、动态 List。

## 工程事项

- 可发布包已移除 `private: true`，版本 `0.1.0-alpha.2`；根目录含 MIT `LICENSE`；`scripts/publish-packages.mjs` 按依赖顺序发布。
- 发布前运行 `npm run pack:dry-run` 验证 tarball；确认 `npm login` 与 `@bindtty` scope 权限后执行 `npm run publish:packages`。
- 根 README 已描述主链路与包职责；`@bindtty/signal` README 已补 Counter 示例。
- 测试使用 Node 内置 `node:test`；各包 `npm run build && node --test`；另有私有 `packages/e2e` 端到端验证。
- 文档应持续避免把 BindTTY 描述成 React VDOM 复刻；核心叙事应是 MVVM binding tree。
- 部分设计文档（如 `doc/APP.md` 早期章节）描述的是落地前状态，以根 README「当前完成状态」与各包 README 为准。

## 优先级

**已完成（M1–M7）**：vnode → jsx-runtime → runtime → layout → renderer-terminal → terminal → interaction → widgets → bindtty createApp。

**下一步**（详见 [NEXT_STEPS.md](./NEXT_STEPS.md)）：

1. CI 与 npm 发布执行
2. ~~顶层 `bindtty` API 冻结（signal re-export）~~（已完成；见 [bindtty README](https://github.com/lithdoo/BindTTY/blob/main/packages/bindtty/README.md)）
3. Layout prop matrix：`min/max`、margin、edge padding
4. Scroll/List 后续增强（stickToBottom、scrollbar、virtualization）
5. signal `batch()`、runtime `bind()` helper
6. intrinsic `<button>` / `<input>` 与 widgets 路线统一（或明确废弃 intrinsic 交互元素）
7. ~~npm 发布准备~~（工程配置已完成；待 `npm run publish:packages`）

## 一句话方向

M1–M7 主链路已打通。下一阶段重点是高级 layout、Scroll/List 后续增强，以及顶层 API 与示例完善；signal 更新继续以 binding-level invalidation 驱动 dirty、layout 和 paint。
