# BindTTY 视图树设计

本文档描述 BindTTY 的视图树设计。

BindTTY 的目标是构建一个面向 **MVVM + signal-driven TUI** 的 TypeScript/TSX 框架。它不是 React VDOM 的简单复刻，而是一个以 **ViewModel binding** 为核心的终端 UI 声明系统。

核心思想：

~~~text
View 声明 UI 结构和绑定关系
  ↓
运行时建立视图实例和 signal 订阅
  ↓
signal 更新触发对应节点变化
  ↓
视图树标记更新范围
  ↓
重新布局 / 重新绘制 / 输出终端 patch
~~~

---

## 1. 设计目标

视图树设计需要满足以下目标：

1. 支持 TSX 声明终端 UI。
2. 支持 MVVM 风格的 ViewModel 绑定。
3. 支持 signal / computed / binding expression 作为动态值。
4. 区分声明结构、运行时实例、布局结果和终端输出。
5. 避免以 React 式整棵组件树重渲染作为唯一更新模型。
6. 为 TUI 特有能力预留空间，例如 focus、keyboard input、viewport、scroll、overlay、ANSI diff。

---

## 2. 为什么不直接采用 React VNode 模型

React VNode 通常表示一次组件函数执行后的 UI 描述。React 的典型流程是：

~~~text
state changed
  ↓
component function rerun
  ↓
new VNode
  ↓
diff old/new VNode
  ↓
commit
~~~

但 BindTTY 的目标是 MVVM。MVVM 更关注的是：

~~~text
ViewModel signal changed
  ↓
对应 binding 更新
  ↓
对应视图节点变化
  ↓
局部 layout / paint / frame patch
~~~

因此，BindTTY 不应该把 VNode 设计成“每次 render 后的静态快照”。
它应该保存 **声明关系** 和 **绑定关系**。

---

## 3. 核心分层

BindTTY 的视图系统分为四层：

~~~text
ViewTemplate
  ↓
MountedNode
  ↓
LayoutNode
  ↓
Frame
~~~

### 3.1 ViewTemplate

`ViewTemplate` 是 TSX 产生的声明树，也可以直接命名为 `Template`：

~~~ts
export type ViewTemplate = Template;
~~~

它表示用户声明的 UI 结构和 binding source，可以包含：

~~~text
empty
element
fragment
component
show
for
binding value
~~~

`ViewTemplate` 是声明层，因此可以包含 Component，也可以保存 signal、computed、binding expression 等动态值本身。

例如：

~~~tsx
function Header({ title }: { title: ReadableSignal<string> }) {
  return <text value={title} />;
}

<box>
  <Header title={vm.title} />
</box>
~~~

这里 `<Header />` 在声明层存在，`vm.title` 仍然只是 binding source。mount 后 Component 会被执行并展开，不会进入最终渲染节点。

### 3.2 MountedNode

`MountedNode` 是运行时视图树。

它由 `ViewTemplate` 挂载后产生。它不再包含 Component，只包含实际可渲染的终端节点。

它负责保存：

~~~text
节点类型
当前 resolved props / text value
children
binding subscriptions
dirty state
focus/input metadata
~~~

Component 会在 mount 阶段被展开：

~~~text
ComponentTemplate
  ↓ execute component
ViewTemplate
  ↓ mount
MountedNode
~~~

因此：

~~~text
Component 属于声明层
不属于运行时渲染层
~~~

### 3.3 LayoutNode

`LayoutNode` 是布局结果。

它基于 `MountedNode` 生成，保存节点在终端中的空间信息：

~~~text
x
y
width
height
children layout
~~~

`LayoutNode` 不保存 Component，也不保存 binding。
它只使用当前已经 resolved 的运行时值。

### 3.4 Frame

`Frame` 是最终要输出到终端的内容。

MVP 阶段可以表示为：

~~~text
string[]
~~~

即一组终端行。

后续可以升级为 cell buffer：

~~~text
Cell[][]
~~~

用于更精确地处理：

~~~text
ANSI style
宽字符
emoji
CJK
局部 repaint
~~~

---

## 4. 总体结构

整体结构如下：

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

各层职责：

| 层 | 职责 | 包含 Component | 包含 Binding |
| --- | --- | ---: | ---: |
| `ViewTemplate` | 用户声明 UI 和 binding source | 是 | 是 |
| `MountedNode` | 运行时视图实例 | 否 | 是，且已建立订阅 |
| `LayoutNode` | 布局结果 | 否 | 否 |
| `Frame` | 终端输出结果 | 否 | 否 |

---

## 5. ViewTemplate 的定位

`ViewTemplate` 是用户视图声明，不是最终渲染节点。它只保存声明结构和 binding source，不读取 signal、不建立订阅、不保存 resolved value。

它不负责：

~~~text
signal subscription
resolved props
dirty state
layout
paint
ANSI output
focus / input runtime state
~~~

Template 最小节点集合为：

~~~text
Template
  ├─ EmptyTemplate
  ├─ ElementTemplate
  ├─ FragmentTemplate
  ├─ ComponentTemplate
  ├─ ShowTemplate
  └─ ForTemplate
~~~

概念类型：

~~~ts
type Template =
  | EmptyTemplate
  | ElementTemplate
  | FragmentTemplate
  | ComponentTemplate
  | ShowTemplate
  | ForTemplate;

type ViewTemplate = Template;
~~~

其中 `ElementTemplate` 表示所有 intrinsic terminal element：

~~~ts
interface ElementTemplate {
  kind: "element";
  tag: IntrinsicElementTag;
  props: TemplateProps;
  children: Template[];
}
~~~

`text`、`button`、`input`、`spacer` 这类 leaf-like element 也统一使用 `ElementTemplate`。是否允许 children、是否要求 `value` prop、某个 prop 变化影响 layout 还是 paint，都由 element schema 或 JSX 类型约束表达，而不是通过拆分 Template 类型表达。

例如：

~~~tsx
<text value={vm.countLabel} color={vm.color} />
~~~

这里：

~~~text
vm.countLabel 是 text value binding source
vm.color 是 style prop binding source
~~~

它们不应该在 TSX 阶段被立即求值成 primitive value。

---

## 6. BindingValue

MVVM 视图系统的核心是 `BindingValue`。

一个可绑定值可以是：

~~~text
静态值
ReadableSignal<T>
BindingExpression<T>
~~~

概念上：

~~~ts
type BindingValue<T> =
  | T
  | ReadableSignal<T>
  | BindingExpression<T>;

type TemplateProps = Record<string, BindingValue<unknown>>;
~~~

Template 中的 props 保存 `BindingValue` 本身。mount 阶段才读取初始值并建立订阅。

### 6.1 静态值

~~~tsx
<text value="Hello" color="green" />
~~~

### 6.2 Signal binding

~~~tsx
<text value={vm.title} color={vm.color} />
~~~

### 6.3 Text binding

~~~tsx
<text value={vm.countLabel} />
~~~

### 6.4 Expression binding

~~~tsx
<text value={bind(() => `${vm.firstName.get()} ${vm.lastName.get()}`)} />
~~~

不过推荐把复杂派生值放在 ViewModel 的 `computed` 中：

~~~ts
class UserVM {
  fullName = computed(() => {
    return `${this.firstName.get()} ${this.lastName.get()}`;
  });
}
~~~

View 中直接绑定：

~~~tsx
<text value={vm.fullName} />
~~~

---

## 7. Text 设计

BindTTY Template 中，文本内容不作为 children 表达。

标准写法是：

~~~tsx
<text value="Hello" />
<text value={vm.title} />
<text value={vm.countLabel} color={vm.color} />
~~~

不推荐，也不作为标准 Template 模型：

~~~tsx
<text>Hello</text>
<text>Count: {vm.count}</text>
~~~

原因是：

~~~text
1. children 应只表示结构节点。
2. string / number child 会让结构和内容混杂。
3. 文本内容本质上是 text element 的 value prop。
4. value prop 可以统一接入 BindingValue。
5. prop binding 更新路径更简单。
~~~

如果未来支持：

~~~tsx
<text>Hello</text>
~~~

它也只是一种 TSX 语法糖，最终必须归一化成：

~~~tsx
<text value="Hello" />
~~~

最终 Template 仍然是：

~~~ts
{
  kind: "element",
  tag: "text",
  props: {
    value: "Hello"
  },
  children: []
}
~~~

这样当 `value` binding 更新时，运行时可以只标记对应 mounted text element 变化，而不是重新执行整个 View。

---

## 8. Component 的定位

Component 是声明层抽象。

它用于组织 ViewTemplate，但不进入 MountedNode。

~~~tsx
function StatusBar({ status }: { status: ReadableSignal<string> }) {
  return <text value={status} />;
}
~~~

在声明层：

~~~text
ComponentTemplate(StatusBar)
~~~

mount 后：

~~~text
MountedElementNode(type: "text")
~~~

因此 BindTTY MVP 只需要支持函数组件。
不需要支持 class component。

---

## 9. Control Node

由于 BindTTY 是 MVVM 模型，动态结构应该通过 control node 表达，而不是通过 `.get()` 立即求值。

### 9.1 show

用于条件渲染：

~~~tsx
<show when={vm.loading} fallback={<text value="Ready" />}>
  <text value="Loading..." />
</show>
~~~

`show` 保存的是结构绑定：

~~~text
when 变化
  ↓
切换 active branch
  ↓
标记结构变化
  ↓
触发布局和绘制
~~~

不推荐：

~~~tsx
{vm.loading.get() ? <text value="Loading..." /> : <text value="Ready" />}
~~~

因为 `.get()` 会立即求值，运行时无法保留结构绑定关系。

### 9.2 for

用于列表渲染：

~~~tsx
<for each={vm.items} key={(item) => item.id}>
  {(item) => <text value={item.title} />}
</for>
~~~

`for` 保存的是列表绑定：

~~~text
items 变化
  ↓
根据 key 更新子节点
  ↓
新增 / 删除 / 复用 item node
  ↓
触发布局和绘制
~~~

不推荐：

~~~tsx
{vm.items.get().map(item => <text value={item.title} />)}
~~~

---

## 10. 用户写法规范

### 10.1 推荐绑定 signal

推荐：

~~~tsx
<text value={vm.countLabel} />
~~~

不推荐：

~~~tsx
<text value={vm.countLabel.get()} />
~~~

`.get()` 表示立即求值，会得到当前快照。
而 MVVM 视图更应该保存绑定关系。

### 10.2 推荐 computed 承载派生状态

推荐：

~~~ts
class CounterVM {
  count = createSignal(0);

  double = computed(() => {
    return this.count.get() * 2;
  });
}
~~~

~~~tsx
<text value={vm.double} />
~~~

不推荐在 View 中写复杂 `.get()` 表达式。

### 10.3 推荐 control node 表达动态结构

推荐：

~~~tsx
<show when={vm.visible}>
  <panel />
</show>
~~~

推荐：

~~~tsx
<for each={vm.todos} key={(todo) => todo.id}>
  {(todo) => <todo-row todo={todo} />}
</for>
~~~

不推荐：

~~~tsx
{vm.visible.get() && <panel />}
~~~

---

## 11. Element Schema

Template 层统一使用 `ElementTemplate`，但不同 element 的规则仍然需要表达。这些规则不放进 Template 类型分支，而是放进 element schema。

示例：

~~~ts
interface ElementSchema {
  acceptsChildren: boolean;
  requiredProps?: string[];
  props?: Record<string, PropSchema>;
}

interface PropSchema {
  required?: boolean;
  dirty?: DirtyKind;
}
~~~

示例 schema：

~~~ts
const elementSchemas = {
  screen: {
    acceptsChildren: true,
  },
  box: {
    acceptsChildren: true,
  },
  vstack: {
    acceptsChildren: true,
  },
  hstack: {
    acceptsChildren: true,
  },
  text: {
    acceptsChildren: false,
    requiredProps: ["value"],
  },
  button: {
    acceptsChildren: false,
    requiredProps: ["value"],
  },
  input: {
    acceptsChildren: false,
  },
  spacer: {
    acceptsChildren: false,
  },
} satisfies Record<string, ElementSchema>;
~~~

这样可以做到：

~~~text
1. Template AST 保持统一。
2. element 规则集中管理。
3. 新增 element 不需要修改 Template 核心结构。
4. runtime 可以根据 schema 校验 children 和 required props。
5. scheduler 可以根据 prop schema 判断 dirty 类型。
~~~

---

## 12. TSX Normalize 规则

TSX runtime 负责把用户写法归一化为 Template。

intrinsic element：

~~~tsx
<text value="Hello" />
~~~

归一化为：

~~~ts
{
  kind: "element",
  tag: "text",
  props: {
    value: "Hello"
  },
  children: []
}
~~~

container children：

~~~tsx
<box>
  <text value="Hello" />
</box>
~~~

归一化后，`box.children` 只包含 Template：

~~~ts
{
  kind: "element",
  tag: "box",
  props: {},
  children: [
    {
      kind: "element",
      tag: "text",
      props: {
        value: "Hello"
      },
      children: []
    }
  ]
}
~~~

component：

~~~tsx
<Header title={vm.title} />
~~~

归一化为：

~~~ts
{
  kind: "component",
  component: Header,
  props: {
    title: vm.title
  }
}
~~~

show / for 会保留结构 binding：

~~~tsx
<show when={vm.loading}>
  <text value="Loading..." />
</show>

<for each={vm.items} key={(item) => item.id}>
  {(item) => <text value={item.title} />}
</for>
~~~

`null`、`undefined`、`false` 归一化为 `EmptyTemplate`；数组 children 会 flatten。MVP 阶段，普通 string / number children 不允许：

~~~tsx
<box>
  Hello
</box>
~~~

应该写成：

~~~tsx
<box>
  <text value="Hello" />
</box>
~~~

---

## 13. MountedNode 的定位

`MountedNode` 是实际运行中的视图实例。它位于声明层和布局层之间，负责把 Template 中的声明关系转化为可运行、可更新、可交互的视图实例。

可以把 MountedNode 理解为 BindTTY 的 Runtime View Tree。它有点类似 DOM，但不是 HTML DOM 的复刻，而是面向 terminal layout / paint / input 的运行时节点系统。

它的职责是：

~~~text
展开 ComponentTemplate
实例化 ElementTemplate
保存当前 resolved props / text value
保存 binding subscription
保存 dirty state
保存 element local state
挂接 intrinsic element 的基础能力
管理 show / for 的运行时结构
参与 input/focus 管理
提供 dispose 机制
~~~

MountedNode 不需要为每一种 intrinsic element 定义一种节点类型。

不推荐：

~~~text
MountedTextNode
MountedInputNode
MountedBoxNode
MountedButtonNode
MountedVStackNode
~~~

更推荐将 MountedNode 分为少量结构类型：

~~~text
MountedElementNode
MountedFragmentNode
MountedShowNode
MountedForNode
~~~

其中：

~~~text
MountedElementNode:
  表示 intrinsic element 的运行时实例，例如 text、box、input、button。

MountedFragmentNode:
  表示透明结构节点，用于承载多个兄弟节点。

MountedShowNode:
  表示条件结构运行时节点，维护当前 active branch。

MountedForNode:
  表示列表结构运行时节点，维护 item 到 node 的映射。
~~~

mount 阶段的主要转换关系是：

~~~text
ElementTemplate  → MountedElementNode
FragmentTemplate → MountedFragmentNode
ShowTemplate     → MountedShowNode
ForTemplate      → MountedForNode
BindingValue     → mounted binding / subscription
ComponentTemplate 在 mount 阶段执行并消解
EmptyTemplate 通常不产生 MountedNode
~~~

当 binding 更新时：

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

这意味着 BindTTY 的更新单位不是“组件重新执行”，而是“绑定影响的运行时节点”。

---

## 14. ElementDefinition 与基础控件能力

`MountedElementNode` 本身不应该只保存 `tag`、`props`、`children`，否则它会过于接近“展开后的 Template”，无法体现基础控件能力。

每一种 intrinsic element 都应该有自己的 `ElementDefinition`，用来定义它的运行时行为：

~~~text
text element:
  负责文本测量、布局和绘制。

input element:
  负责焦点、键盘输入、光标、编辑状态和绘制。

box element:
  负责边框、padding、背景和 children layout。

vstack element:
  负责纵向排列 children。

hstack element:
  负责横向排列 children。

button element:
  负责 focus、按键触发和绘制。
~~~

因此，`MountedElementNode` 应该理解为：

~~~text
ElementTemplate 被实例化后，挂接了 ElementDefinition 的运行时 element 实例。
~~~

也就是说：

~~~text
tag 决定它是什么元素。
ElementDefinition 决定它具备什么能力。
MountedElementNode 保存它当前的运行时状态。
~~~

例如 `text` 不需要成为独立的 MountedNode 类型。`<text value={vm.title} />` 会被挂载成 `MountedElementNode(tag: "text")`，它的测量、布局、绘制由 text definition 提供。

`input` 同理也是 `MountedElementNode(tag: "input")`，只是挂接了 input definition。输入事件的典型流程是：

~~~text
keyboard event
  ↓
InputSystem 接收事件
  ↓
FocusManager 找到当前 focused node
  ↓
调用该 node 的 element definition
  ↓
input local state 更新
  ↓
触发绑定回调或用户事件
  ↓
标记 dirty
  ↓
scheduler 触发 layout / paint
~~~

因此，基础控件能力不属于 Template，也不应该散落在 scheduler 中，而应该由 element runtime 承载。

---

## 15. Control Runtime

`show` 和 `for` 不是普通 element，而是 control runtime node。它们不负责终端绘制，而负责动态结构。

`MountedShowNode` 负责：

~~~text
订阅 when binding
维护当前 active branch
条件变化时切换 branch
dispose 旧 branch
mount 新 branch
标记 structure dirty
~~~

`MountedForNode` 负责：

~~~text
订阅 each binding
维护当前 item nodes
根据 key 复用节点
mount 新节点
dispose 删除节点
标记 structure dirty
~~~

它们的存在是为了避免用户通过 `.get()` 在 Template 阶段立即求值动态结构。

---

## 16. Dirty 标记原则

BindTTY 不需要一开始实现非常复杂的 dirty 系统，但设计上应该区分不同更新影响：

~~~text
text.value 变化
  → layout / paint

text.color 变化
  → paint

box.padding 变化
  → layout / paint

input cursor 变化
  → paint

show branch 变化
  → structure / layout / paint

for items 变化
  → structure / layout / paint

input/focus 状态变化
  → input / paint
~~~

这为后续局部 layout 和局部 repaint 提供基础。

---

## 17. Layout / Paint / Input

Layout、Paint 和 Input 应该与声明层分离。

~~~text
ViewTemplate 只描述 UI 和 binding source
MountedNode 保存运行时节点、props、binding、dirty、state、element definition
LayoutNode 保存布局结果，例如 x、y、width、height
Frame 保存最终要输出到终端的画面
ElementDefinition 定义 element 如何参与 layout、paint、input
~~~

不要把 `x/y/width/height` 存进 ViewTemplate。
也不要把 ANSI 输出存进 MountedNode。

LayoutEngine 不需要知道 Template，也不需要知道 Component。它只需要读取 MountedNode，并调用对应 element definition 的布局能力。

PaintEngine 同理，它读取 MountedNode 和 LayoutNode，然后调用对应 element definition 的绘制能力。

InputSystem 则通过 FocusManager 找到 active MountedElementNode，再调用对应 element definition 的输入处理能力。

---

## 18. Dispose 机制

MountedNode 必须支持 dispose，因为它是运行时资源的所有者。

dispose 的职责包括：

~~~text
取消 binding subscriptions
dispose children
清理 element local state
从 focus manager 注销
清理 input handlers
释放 control node 持有的 branch / item nodes
~~~

尤其是 `show` / `for`，如果没有明确的 dispose 机制，很容易出现 signal subscription 泄漏。

Template 不是运行时资源的所有者，因此不负责 dispose。

---

## 19. 和 React memo 的关系

BindTTY MVP 不需要 React-style `memo`。

React 需要 memo，是因为它的默认模型是：

~~~text
父组件重新 render
  ↓
子组件可能跟着重新 render
  ↓
memo 用 props comparison 跳过子组件
~~~

BindTTY 的目标模型是：

~~~text
signal 更新
  ↓
对应 binding 更新
  ↓
对应 MountedNode dirty
~~~

因此优化方向不是：

~~~text
props memoization
~~~

而是：

~~~text
binding-level invalidation
layout dirty
paint dirty
frame diff
~~~

---

## 20. MVP 范围

视图树 MVP 建议包含：

~~~text
ViewTemplate:
  empty
  element
  fragment
  component
  show
  for

Binding:
  static value
  ReadableSignal
  BindingExpression

MountedNode:
  element
  fragment
  show
  for
  binding subscription
  dirty state
  dispose

Layout:
  screen
  box
  vstack
  hstack
  text
  button
  input
  spacer

Render:
  line-based Frame
  line diff
  ANSI patch

ElementDefinition:
  layout
  paint
  input
  focus metadata
~~~

暂不纳入 MVP：

~~~text
React-style memo
class component
hydration
Suspense
concurrent rendering
component-level error boundary
portal
~~~

---

## 21. 后续扩展方向

后续可以扩展：

~~~text
keyed for diff
switch / case
theme context
overlay / modal
scroll view
virtual list
node ref
focus scope
component-level error boundary
cell-based frame
partial layout
partial paint
~~~

这些扩展应建立在当前四层结构之上：

~~~text
ViewTemplate
  ↓
MountedNode
  ↓
LayoutNode
  ↓
Frame
~~~

---

## 22. 总结

BindTTY 的视图树核心不是 React VDOM，而是 MVVM 绑定树。

核心原则：

~~~text
ViewTemplate 保存声明和 binding source
MountedNode 保存运行时实例、订阅、dirty、state 和 element definition
LayoutNode 保存布局结果
Frame 保存终端输出
~~~

推荐用户写：

~~~tsx
<text value={vm.countLabel} />
~~~

而不是：

~~~tsx
<text value={vm.countLabel.get()} />
~~~

推荐使用：

~~~tsx
<show when={vm.loading}>...</show>
<for each={vm.items}>...</for>
~~~

而不是在 TSX 中通过 `.get()` 立即求值动态结构。

最终目标是形成这样的更新模型：

~~~text
signal change
  ↓
binding update
  ↓
mounted node dirty
  ↓
layout / paint / frame patch
~~~

这才是 BindTTY 区别于 React-like TUI 框架的核心。
