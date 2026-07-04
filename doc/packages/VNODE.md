# @bindtty/vnode 设计

本文档是 @bindtty/vnode 包的实现依据，合并 Template 声明层与 MountedNode 运行时层设计。

- 总体架构见 [DESIGN.md](../architecture/DESIGN.md)
- 实现计划见 [TUI_IMPLEMENTATION_PLAN.md](../architecture/ROADMAP.md)
- 原始分拆文档备份见 [archive/VIEW_TEMPLATE.md](./archive/VIEW_TEMPLATE.md)、[archive/MOUNTED_NODE.md](./archive/MOUNTED_NODE.md)

BindTTY 是一个面向 **MVVM + signal-driven TUI** 的 TypeScript/TSX 框架。

当前实现说明：`button` / `input` 仍保留为 intrinsic tag 与 schema 类型的一部分，但 layout / renderer 尚未把它们作为完整 intrinsic 控件实现；用户侧 Button / TextInput 行为由 `@bindtty/widgets` 通过 `box` / `text` / `onKey` 组合提供。本文后半部分关于 `ElementDefinition` 与 intrinsic button/input/input system 的内容属于前瞻架构设计，不代表当前已落地代码。

## 1. 主链路

```text
TSX
  ↓
Template / ViewTemplate
  ↓ mount
MountedNode
  ↓ layout
LayoutNode
  ↓ paint
Frame
  ↓ diff
ANSI Patch
```

@vnode 包负责 Template 层的类型定义、构造与归一化。

**注意：** mount、binding subscription、dirty 传播、dispose 等运行时行为实际由 `@bindtty/runtime` 包实现。vnode 只提供 `MountedNode` 类型定义（含 `state`、`binding`、`dirty` 等字段），不包含运行时 mount 函数。

## 2. 包职责

```text
Template 层（声明）:
  ViewTemplate 类型、BindingValue、control node、normalize 规则、element schema

MountedNode 层（类型）:
  MountedElementNode / ShowNode / ForNode 类型定义（含 state、binding、dirty 等字段）

运行时行为（由 @bindtty/runtime 实现）:
  mount、binding subscription、dirty 传播、dispose
```

与相邻包的边界：

```text
@bindtty/jsx-runtime:  TSX → Template
@bindtty/vnode:        Template 类型、构造、MountedNode 类型定义
@bindtty/runtime:      Template → MountedNode mount、binding、dirty、scheduler、dispose
@bindtty/interaction:  keyboard focus、onKey 派发
@bindtty/widgets:      高层控件语义
@bindtty/layout:       MountedNode → LayoutNode
@bindtty/renderer-terminal: LayoutNode → Frame → ANSI diff
```

---

# Part I — Template（声明层）

## 3. 设计目标

Template 的目标是：

```text
1. 表达 TSX 声明出来的 UI 结构。
2. 保存 element / fragment / component / show / for 等声明节点。
3. 保存 props 中的 BindingValue。
4. 支持 MVVM 风格的 ViewModel binding。
5. 支持 signal / computed / binding expression 作为动态值。
6. 支持动态结构节点 show / for。
7. 保持声明层结构简单、稳定、可扩展。
```

Template 不负责：

```text
1. 不负责 signal 订阅。
2. 不负责 resolved value。
3. 不负责 dirty state。
4. 不负责 layout。
5. 不负责 paint。
6. 不负责 ANSI 输出。
7. 不负责 focus / input runtime state。
```

---



## 4. 核心原则

Template 设计遵循以下原则：

```text
Template 是声明层，不是运行时层。
Template 保存 binding source，不保存 binding subscription。
Template 保存 component，不执行 component runtime 更新。
Template 中的 children 只表示结构节点。
Template children 不承载 string / number 文本内容。
文本显示统一使用 <text value={...} />。
<text> 是 ElementTemplate 的一种。
所有 intrinsic element 使用统一的 ElementTemplate 表示。
```

最关键的边界是：

```text
Template:
  保存声明结构、props、binding source、component、control node

MountedNode:
  保存运行时节点、resolved props、subscriptions、dirty flags
```

---



## 5. Template 节点集合

Template 最小节点集合为 6 种：

```text
Template
  ├─ EmptyTemplate
  ├─ ElementTemplate
  ├─ FragmentTemplate
  ├─ ComponentTemplate
  ├─ ShowTemplate
  └─ ForTemplate
```

TypeScript 类型：

```ts
export type Template =
  | EmptyTemplate
  | ElementTemplate
  | FragmentTemplate
  | ComponentTemplate
  | ShowTemplate
  | ForTemplate;
```

也可以命名为 `ViewTemplate`：

```ts
export type ViewTemplate = Template;
```

---



## 6. EmptyTemplate

`EmptyTemplate` 表示空声明节点。

来源包括：

```tsx
null
undefined
false
[]
```

类型定义：

```ts
export interface EmptyTemplate {
  kind: "empty";
}
```

职责：

```text
1. 表示无内容。
2. 用于 children normalize。
3. mount 时可以不产生 MountedNode，或者产生空 fragment。
```

示例：

```tsx
const view = null;
```

可以归一化为：

```ts
{
  kind: "empty"
}
```

---



## 7. ElementTemplate

`ElementTemplate` 表示所有 intrinsic terminal element。

例如：

```tsx
<screen />
<box />
<vstack />
<hstack />
<text value="Hello" />
<button value="Save" />
<input value={vm.name} />
<spacer size={1} />
```

所有 element 统一使用同一种结构：

```ts
export interface ElementTemplate {
  kind: "element";
  tag: IntrinsicElementTag;
  props: TemplateProps;
  children: Template[];
}
```

---



## 8. 为什么 ElementTemplate 不区分 Container / Leaf

Template 层不区分：

```text
ContainerElementTemplate
LeafElementTemplate
TextElementTemplate
```

原因是：

```text
1. Template 应保持结构稳定。
2. element 的语义差异应由 tag 和 schema 表达。
3. children 是否允许属于 element 规则，不属于 AST 结构差异。
4. 未来新增 element 时不需要修改 Template 核心类型。
5. mount / layout / paint 可以根据 tag 分发。
```

因此，即使是 `text`、`input`、`spacer` 这类 leaf-like element，也统一表示为：

```ts
{
  kind: "element",
  tag: "text",
  props: {
    value: "Hello"
  },
  children: []
}
```

是否允许 children，由 element schema 或 JSX 类型约束负责。

---



## 9. IntrinsicElementTag

MVP 阶段建议支持以下 intrinsic element：

```ts
export type IntrinsicElementTag =
  | "screen"
  | "box"
  | "vstack"
  | "hstack"
  | "text"
  | "button"
  | "input"
  | "spacer";
```

其中：

```text
screen: 根容器
box: 基础容器
vstack: 垂直布局容器
hstack: 水平布局容器
text: 文本显示
button: 按钮
input: 输入框
spacer: 空白占位
```

后续可扩展：

```text
scroll-view
viewport
overlay
modal
list
table
progress
spinner
```

新增 element 不需要改变 Template 节点结构，只需要扩展 `IntrinsicElementTag`、JSX 类型和 element schema。

---



## 10. TemplateProps

Template 中所有 props 都保存为 `BindingValue`。

```ts
export type TemplateProps = Record<string, BindingValue<unknown>>;
```

例如：

```tsx
<text value={vm.title} color={vm.color} />
```

对应：

```ts
{
  kind: "element",
  tag: "text",
  props: {
    value: vm.title,
    color: vm.color
  },
  children: []
}
```

这里：

```text
value 是文本内容 binding。
color 是样式 binding。
```

Template 不会读取 `vm.title.get()`，也不会建立订阅。

---



## 11. BindingValue

`BindingValue` 表示可绑定值。

```ts
export type BindingValue<T> =
  | T
  | ReadableSignal<T>;
```

它支持：

```text
1. 静态值
2. ReadableSignal<T>
```

---

### 9.1 静态值

```tsx
<text value="Hello" color="green" />
```

这里：

```text
value = "Hello"
color = "green"
```

都是静态值。

---

### 9.2 Signal Binding

```tsx
<text value={vm.title} color={vm.color} />
```

这里：

```text
vm.title 是 value prop 的 binding source。
vm.color 是 color prop 的 binding source。
```

Template 只保存 signal 引用，不读取、不订阅。

---

### 9.3 View 层临时派生值

```tsx
<text value={bind(() => `Count: ${vm.count.get()}`)} />
```

这里 `bind(...)` 不应引入第三种 binding source。它本质上是一个由 runtime scope 管理生命周期的临时 `computed`，对外也应该表现为 `ReadableSignal<string>`。

也就是说：

```ts
function bind<T>(derive: () => T): ReadableSignal<T>;
```

`BindingValue` 的消费方只需要识别静态值和 `ReadableSignal`。`bind()` / scoped computed 的 dispose 归 mounted runtime owner 负责。

推荐把复杂派生状态放到 ViewModel 的 computed 中：

```ts
class CounterVM {
  count = createSignal(0);

  countLabel = computed(() => {
    return `Count: ${this.count.get()}`;
  });
}
```

View 中直接绑定：

```tsx
<text value={vm.countLabel} />
```

这样 View 只声明绑定关系，不承担复杂派生逻辑。

---



## 12. 文本设计

BindTTY Template 中，文本内容不作为 children 表达。

标准写法是：

```tsx
<text value="Hello" />
<text value={vm.title} />
<text value={vm.countLabel} color={vm.color} />
```

不推荐，也不作为标准 Template 模型：

```tsx
<text>Hello</text>
<text>Count: {vm.count}</text>
```

原因是：

```text
1. children 应只表示结构节点。
2. string / number child 会让结构和内容混杂。
3. 文本内容本质上是 text element 的 value prop。
4. value prop 可以统一接入 BindingValue。
5. prop binding 更新路径更简单。
```

如果未来支持：

```tsx
<text>Hello</text>
```

它也只是一种 TSX 语法糖，最终必须归一化成：

```tsx
<text value="Hello" />
```

最终 Template 仍然是：

```ts
{
  kind: "element",
  tag: "text",
  props: {
    value: "Hello"
  },
  children: []
}
```

---



## 13. children 规则

Template 中的 `children` 只允许包含 `Template`。

```ts
children: Template[];
```

允许：

```tsx
<box>
  <text value="Hello" />
  <input value={vm.name} />
</box>
```

不允许：

```tsx
<box>
  Hello
</box>
```

MVP 阶段应当报错，并要求用户写成：

```tsx
<box>
  <text value="Hello" />
</box>
```

规则总结：

```text
1. children 只包含 Template。
2. string / number 不允许作为普通 children。
3. null / undefined / false 归一化为 EmptyTemplate。
4. array children 会 flatten。
5. function child 只允许用于特定 control node，例如 for。
```

---



## 14. FragmentTemplate

`FragmentTemplate` 表示一组兄弟节点。

来源：

```tsx
<>
  <text value="A" />
  <text value="B" />
</>
```

类型定义：

```ts
export interface FragmentTemplate {
  kind: "fragment";
  children: Template[];
}
```

职责：

```text
1. 承载多个兄弟 Template。
2. 表示 TSX Fragment。
3. 用于 children normalize 后的数组结构。
4. 本身不对应具体终端元素。
```

对应结构：

```text
FragmentTemplate
  ElementTemplate(tag: "text", props.value = "A")
  ElementTemplate(tag: "text", props.value = "B")
```

---



## 15. ComponentTemplate

`ComponentTemplate` 表示函数组件调用。

示例：

```tsx
function Header({ title }: { title: ReadableSignal<string> }) {
  return <text value={title} />;
}

<Header title={vm.title} />
```

Template 中保存为：

```text
ComponentTemplate(Header)
```

类型定义：

```ts
export type FunctionComponent<P = any> = (props: P) => Template;

export interface ComponentTemplate<P = any> {
  kind: "component";
  component: FunctionComponent<P>;
  props: P;
}
```

职责：

```text
1. 保存组件函数。
2. 保存组件 props。
3. mount 阶段执行组件函数。
4. 组件执行结果继续 mount。
```

关键规则：

```text
ComponentTemplate 只存在于 Template 层。
MountedNode 不包含 Component。
signal 更新不默认重新执行 component。
```

组件展开流程：

```text
ComponentTemplate
  ↓ mount 时执行 component(props)
Template
  ↓ mount
MountedNode
```

推荐写法：

```tsx
function Header({ title }: { title: ReadableSignal<string> }) {
  return <text value={title} />;
}
```

不推荐：

```tsx
function Header({ title }: { title: ReadableSignal<string> }) {
  return <text value={title.get()} />;
}
```

原因：

```text
title 保留 binding 关系。
title.get() 只是当前快照。
```

---



## 16. ShowTemplate

`ShowTemplate` 表示条件结构绑定。

示例：

```tsx
<show when={vm.loading} fallback={<text value="Ready" />}>
  <text value="Loading..." />
</show>
```

类型定义：

```ts
export interface ShowTemplate {
  kind: "show";
  when: BindingValue<boolean>;
  children: Template;
  fallback?: Template;
}
```

职责：

```text
1. 保存条件 binding source。
2. 保存 true branch。
3. 保存 fallback branch。
4. mount 后由 MountedShowNode 维护 active branch。
```

运行时语义：

```text
when changed
  ↓
切换 active branch
  ↓
dispose old branch
  ↓
mount new branch
  ↓
mark structure dirty
```

推荐：

```tsx
<show when={vm.visible}>
  <panel />
</show>
```

不推荐：

```tsx
{vm.visible.get() && <panel />}
```

原因：

```text
vm.visible.get() 会立即求值。
Template 只得到当前结构快照。
运行时无法保留结构绑定关系。
```

---



## 17. ForTemplate

`ForTemplate` 表示列表结构绑定。

示例：

```tsx
<for each={vm.items} key={(item) => item.id}>
  {(item) => <text value={item.title} />}
</for>
```

类型定义：

```ts
export interface ForTemplate<T = any> {
  kind: "for";
  each: BindingValue<readonly T[]>;
  key?: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => Template;
}
```

职责：

```text
1. 保存列表 binding source。
2. 保存 key 函数。
3. 保存 item template factory。
4. mount 后由 MountedForNode 维护 item nodes。
```

运行时语义：

```text
items changed
  ↓
根据 key 计算 item identity
  ↓
新增 / 删除 / 复用 item node
  ↓
mark structure dirty
```

推荐：

```tsx
<for each={vm.todos} key={(todo) => todo.id}>
  {(todo) => <todo-row todo={todo} />}
</for>
```

不推荐：

```tsx
{vm.todos.get().map((todo) => <todo-row todo={todo} />)}
```

原因：

```text
vm.todos.get() 会立即求值。
map 的结果只是当前列表快照。
运行时无法追踪列表结构变化。
```

MVP 建议支持基础 keyed reuse，因为 TUI 中列表、菜单、日志、表格很常见。没有 key reuse 时，focus、selection、input state 容易丢失。

---



## 18. Element Schema

虽然 Template 层统一使用 `ElementTemplate`，但不同 element 的规则仍然需要表达。

这些规则不放进 Template 类型分支，而是放进 element schema。

示例：

```ts
interface ElementSchema {
  acceptsChildren: boolean;
  requiredProps?: string[];
  props?: Record<string, PropSchema>;
}

interface PropSchema {
  required?: boolean;
  dirty?: DirtyKind;
}
```

示例 schema：

```ts
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
```

这样可以做到：

```text
1. Template AST 保持统一。
2. element 规则集中管理。
3. 新增 element 不需要修改 Template 核心结构。
4. runtime 可以根据 schema 校验 children 和 required props。
5. scheduler 可以根据 prop schema 判断 dirty 类型。
```

---



## 19. JSX 类型约束

Template 核心类型保持简单，但 TypeScript 层可以通过 JSX namespace 做更精确约束。

示例：

```ts
declare namespace JSX {
  interface IntrinsicElements {
    box: {
      children?: TemplateChildren;
      border?: BindingValue<boolean>;
      padding?: BindingValue<number>;
    };

    text: {
      value: BindingValue<string | number>;
      color?: BindingValue<string>;
      bold?: BindingValue<boolean>;
      children?: never;
    };

    input: {
      value?: BindingValue<string>;
      placeholder?: BindingValue<string>;
      children?: never;
    };

    spacer: {
      size?: BindingValue<number>;
      children?: never;
    };
  }
}
```

职责分离：

```text
JSX 类型:
  尽量在编译期约束用户写法

TSX normalize:
  把 TSX 输入转换成 Template

Element schema:
  在运行时校验 element 规则

Template:
  只保存统一声明结构
```

---



## 20. TSX Normalize 规则

TSX runtime 负责把用户写法归一化为 Template。

### 18.1 intrinsic element

```tsx
<text value="Hello" />
```

归一化为：

```ts
{
  kind: "element",
  tag: "text",
  props: {
    value: "Hello"
  },
  children: []
}
```

---

### 18.2 container children

```tsx
<box>
  <text value="Hello" />
</box>
```

归一化为：

```ts
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
```

---

### 18.3 component

```tsx
<Header title={vm.title} />
```

归一化为：

```ts
{
  kind: "component",
  component: Header,
  props: {
    title: vm.title
  }
}
```

---

### 18.4 show

```tsx
<show when={vm.loading}>
  <text value="Loading..." />
</show>
```

归一化为：

```ts
{
  kind: "show",
  when: vm.loading,
  children: {
    kind: "element",
    tag: "text",
    props: {
      value: "Loading..."
    },
    children: []
  }
}
```

---

### 18.5 for

```tsx
<for each={vm.items} key={(item) => item.id}>
  {(item) => <text value={item.title} />}
</for>
```

归一化为：

```ts
{
  kind: "for",
  each: vm.items,
  key: (item) => item.id,
  renderItem: (item) => ({
    kind: "element",
    tag: "text",
    props: {
      value: item.title
    },
    children: []
  })
}
```

---

### 18.6 empty values

```tsx
null
undefined
false
```

归一化为：

```ts
{
  kind: "empty"
}
```

---

### 18.7 array children

数组 children 会 flatten。

```tsx
<>
  {[<text value="A" />, <text value="B" />]}
</>
```

归一化为：

```text
FragmentTemplate
  ElementTemplate(text, value = "A")
  ElementTemplate(text, value = "B")
```

---

### 18.8 string / number children

MVP 阶段，普通 string / number children 不允许。

不允许：

```tsx
<box>
  Hello
</box>
```

应该写成：

```tsx
<box>
  <text value="Hello" />
</box>
```

未来如果允许：

```tsx
<text>Hello</text>
```

也必须在 normalize 阶段转换为：

```tsx
<text value="Hello" />
```

Template 中不会引入 text segment，也不会让 string 成为 child node。

---



## 21. Template 示例

用户代码：

```tsx
function Header({ title }: { title: ReadableSignal<string> }) {
  return <text value={title} bold />;
}

<screen>
  <box border>
    <Header title={vm.title} />

    <show when={vm.loading} fallback={<text value="Ready" />}>
      <text value="Loading..." />
    </show>

    <for each={vm.items} key={(item) => item.id}>
      {(item) => <text value={item.name} />}
    </for>
  </box>
</screen>
```

对应 Template：

```text
ElementTemplate(tag: "screen")
  props: {}
  children:
    ElementTemplate(tag: "box")
      props:
        border: true
      children:
        ComponentTemplate(Header)
          props:
            title: vm.title

        ShowTemplate
          when: vm.loading
          children:
            ElementTemplate(tag: "text")
              props:
                value: "Loading..."
              children: []
          fallback:
            ElementTemplate(tag: "text")
              props:
                value: "Ready"
              children: []

        ForTemplate
          each: vm.items
          key: item.id
          renderItem: function
```

注意：

```text
Header 仍然是 ComponentTemplate。
vm.title / vm.loading / vm.items 仍然只是 binding source。
text 的内容都在 props.value 中。
所有 element 都有 children 字段。
text 的 children 是空数组。
```

---



---

# Part II — MountedNode（运行时层）

## 22. MountedNode 的定位

Template 是声明结构，MountedNode 是运行时实例。

Template 描述：

```text
用户声明了什么节点
节点有哪些 props
哪些 props 来自 signal
有哪些 component
有哪些 show / for 结构绑定
```

MountedNode 描述：

```text
当前实际存在什么节点
当前 props 的 resolved value 是什么
哪些 binding 已经建立订阅
哪些节点处于 dirty 状态
哪些节点可以 focus
哪些节点可以处理 input
哪些 element 具备 layout / paint / input 能力
```

因此，MountedNode 不是简单地把 Component 展开后的 Template。Component 展开只是 mount 阶段的一部分。MountedNode 的核心职责是：

```text
把声明关系变成运行时关系。
```

---



## 23. 为什么需要 MountedNode

BindTTY 的目标不是 React 式的：

```text
state changed
  ↓
component rerun
  ↓
new tree
  ↓
diff
```

而是：

```text
signal changed
  ↓
binding update
  ↓
mounted node dirty
  ↓
layout / paint / frame patch
```

`box` scroll/clip props 见 [SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md) §4.2。

为了实现这个模型，运行时必须有一棵“活的视图树”。

这棵树需要保存：

```text
resolved props
binding subscription
dirty flags
element local state
focus / input metadata
show / for 的当前结构状态
dispose 逻辑
```

这些信息都不应该放在 Template 里，也不应该放在 LayoutNode 或 Frame 里。

所以 MountedNode 是 BindTTY 响应式更新模型的核心承载层。

---



## 24. MountedNode 和 Template 的关系

Template 负责声明，MountedNode 负责实例化。

例如：

```tsx
<text value={vm.title} />
```

Template 中保存的是：

```text
text element
value prop 绑定到 vm.title
```

MountedNode 中保存的是：

```text
text element 的运行时实例
当前 value
对 vm.title 的订阅
value 变化后的 dirty 策略
text element 的渲染能力
```

也就是说：

```text
Template 保存 binding source。
MountedNode 保存 mounted binding。
Template 保存 component。
MountedNode 不保存 component。
Template 不保存 dirty。
MountedNode 保存 dirty。
```

---



## 25. MountedNode 的核心职责

MountedNode 层主要承担以下职责：

```text
1. 展开 ComponentTemplate。
2. 实例化 ElementTemplate。
3. 建立 BindingValue 的运行时订阅。
4. 保存 props 的当前 resolved value。
5. 保存节点 dirty state。
6. 保存 element local state。
7. 挂接 intrinsic element 的基础能力。
8. 管理 show / for 的运行时结构。
9. 支持 focus / keyboard input 的路由。
10. 提供 dispose 机制，清理订阅和运行时资源。
```

其中最关键的是三类能力：

```text
binding runtime
element runtime
control runtime
```

---



## 26. MountedNode 的节点类型

MountedNode 不需要为每一种 intrinsic element 定义一种节点类型。

不推荐：

```text
MountedTextNode
MountedInputNode
MountedBoxNode
MountedButtonNode
MountedVStackNode
```

因为这样会导致节点类型随着 element 数量膨胀。

更推荐将 MountedNode 分为少量结构类型：

```text
MountedElementNode
MountedFragmentNode
MountedShowNode
MountedForNode
```

其中：

```text
MountedElementNode:
  表示 intrinsic element 的运行时实例，例如 text、box、input、button。

MountedFragmentNode:
  表示透明结构节点，用于承载多个兄弟节点。

MountedShowNode:
  表示条件结构运行时节点，维护当前 active branch。

MountedForNode:
  表示列表结构运行时节点，维护 item 到 node 的映射。
```

这种设计让 MountedNode 的结构保持稳定，同时又可以通过 element definition 扩展基础控件能力。

---



## 27. ElementDefinition：基础控件能力的来源

MountedElementNode 本身不应该只保存：

```text
tag
props
children
```

否则它会过于接近“展开后的 Template”，无法体现基础控件能力。

每一种 intrinsic element 都应该有自己的 ElementDefinition，用来定义它的运行时行为。

例如：

```text
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
```

因此，MountedElementNode 应该理解为：

```text
ElementTemplate 被实例化后，挂接了 ElementDefinition 的运行时 element 实例。
```

也就是说：

```text
tag 决定它是什么元素。
ElementDefinition 决定它具备什么能力。
MountedElementNode 保存它当前的运行时状态。
```

---



## 28. text 的渲染在哪里处理

`text` 不需要成为独立的 MountedNode 类型。

在 BindTTY 中，文本显示的标准写法是：

```tsx
<text value={vm.title} />
```

`text` 是 intrinsic element 的一种，它的能力由 text element definition 提供。

text definition 负责：

```text
读取 props.value
计算文本宽度和高度
参与 layout
将文本绘制到 FrameBuffer
根据 color / style props 生成绘制样式
```

当 `value` 绑定的 signal 更新时：

```text
signal changed
  ↓
MountedElementNode.props.value 更新
  ↓
标记 layout / paint dirty
  ↓
LayoutEngine 重新计算 text layout
  ↓
PaintEngine 重新绘制 text
```

因此，text 的渲染逻辑属于 element runtime，而不是 Template，也不是 Component。

---



## 29. input 的交互在哪里处理

`input` 也不需要成为独立的 MountedNode 类型。

它同样是一个 MountedElementNode，只是挂接了 input element definition。

input definition 负责：

```text
判断是否可 focus
维护输入状态
处理 keyboard event
更新 cursor
触发 onChange 或 ViewModel 更新
标记 dirty
绘制输入框和光标
```

输入事件的典型流程是：

```text
keyboard event
  ↓
InputSystem 接收事件
  ↓
InteractionController 找到当前 focused node
  ↓
调用该 node 的 onKey
  ↓
widgets / 业务组件更新 input state
  ↓
触发绑定回调或用户事件
  ↓
标记 dirty
  ↓
scheduler 触发 layout / paint
```

所以 input 的交互逻辑不在 Template 层，也不应该散落在 scheduler 中，而应该由 input 的 ElementDefinition 承载。

---



## 30. show / for 的职责

show 和 for 不是普通 element，而是 control runtime node。

它们不负责终端绘制，而负责动态结构。

### show

show 负责：

```text
订阅 when binding
维护当前 active branch
条件变化时切换 branch
dispose 旧 branch
mount 新 branch
标记 structure dirty
```

### for

for 负责：

```text
订阅 each binding
维护当前 item nodes
根据 key 复用节点
mount 新节点
dispose 删除节点
标记 structure dirty
```

它们的存在是为了避免用户通过 `.get()` 在 Template 阶段立即求值动态结构。

---



## 31. Layout / Paint / Input 与 MountedNode 的关系

MountedNode 本身不直接等于布局结果，也不直接等于终端画面。

职责边界如下：

```text
MountedNode:
  保存运行时节点、props、binding、dirty、state、element definition。

LayoutNode:
  保存布局结果，例如 x、y、width、height。

Frame:
  保存最终要输出到终端的画面。

ElementDefinition:
  定义 element 如何参与 layout、paint、input。
```

LayoutEngine 不需要知道 Template，也不需要知道 Component。

它只需要读取 MountedNode，并调用对应 element definition 的布局能力。

PaintEngine 同理，它读取 MountedNode 和 LayoutNode，然后调用对应 element definition 的绘制能力。

InputSystem 则通过 InteractionController 找到 focused MountedElementNode，再调用该节点的 onKey。具体 button / input 语义由 widgets 或业务组件在 onKey 内实现。

包归属：

~~~text
@bindtty/runtime:     mount、binding、dirty、scheduler
@bindtty/interaction: keyboard focus、onKey 派发
@bindtty/widgets:     高层控件语义、input 行为
@bindtty/layout:      layout、paint、Frame、ANSI diff（调用 widgets definition）
~~~

---



## 32. Dirty 更新模型

MountedNode 是 dirty state 的持有者。

当 binding 变化时：

```text
binding subscription fired
  ↓
更新 MountedNode 的 resolved props
  ↓
根据 prop 类型标记 dirty
  ↓
scheduler 合并更新
```

不同变化会产生不同 dirty 类型：

```text
text.value 变化:
  layout + paint

text.color 变化:
  paint

box.padding 变化:
  layout + paint

input cursor 变化:
  paint

show branch 变化:
  structure + layout + paint

for items 变化:
  structure + layout + paint
```

这样 BindTTY 可以避免把每次 signal 更新都变成整棵组件树重新执行。

---



## 33. dispose 机制

MountedNode 必须支持 dispose。

dispose 的职责包括：

```text
取消 binding subscriptions
dispose children
清理 element local state
释放 interaction 可引用的 mounted node
清理 input handlers
释放 control node 持有的 branch / item nodes
```

尤其是 show / for，如果没有明确的 dispose 机制，很容易出现 signal subscription 泄漏。

因此，MountedNode 是运行时资源的所有者，Template 不是。

---



## 34. 推荐的整体理解

可以把 MountedNode 层理解为：

```text
Runtime View Tree
```

它同时承载三类运行时能力：

```text
1. Element runtime:
   text / input / box / button 等 intrinsic element 的基础能力。

2. Binding runtime:
   signal / computed / expression 的订阅和更新。

3. Control runtime:
   show / for 的动态结构维护。
```

这三类能力共同构成 BindTTY 的运行时视图系统。

---



## 35. 和 React / DOM 的区别

MountedNode 可以类比 DOM，但它不是 HTML DOM。

相似点：

```text
都是运行时节点树。
都保存当前节点状态。
都作为 layout / paint 的输入。
都不包含用户层 component。
```

不同点：

```text
MountedNode 保存 binding subscription。
MountedNode 保存 dirty flags。
MountedNode 面向 terminal layout / paint。
MountedNode 挂接 element definition。
MountedNode 需要处理 focus / keyboard input / ANSI output 的前置状态。
```

和 React VDOM 的区别更明显：

```text
React VDOM 通常是一次 render 的快照。
BindTTY Template 是声明结构。
BindTTY MountedNode 是长期存在的运行时节点。
signal 更新直接作用到 MountedNode，而不是默认重新执行 component。
```

---



---

# Part III — 实现参考

## 36. Template 与 MountedNode 边界

Template mount 后生成 MountedNode。

```text
Template
  ↓ mount
MountedNode
```

mount 阶段负责：

```text
1. 执行 ComponentTemplate。
2. 创建 MountedElementNode。
3. 读取 BindingValue 初始值。
4. 建立 signal subscription。
5. 创建 MountedShowNode。
6. 创建 MountedForNode。
7. 初始化 dirty state。
8. 注册 focus / input metadata。
```

| 能力 | Template | MountedNode |
| --- | ---: | ---: |
| 保存 element tag | 是 | 是 |
| 保存 component | 是 | 否 |
| 保存 BindingValue | 是 | 可保留 source |
| 读取初始值 | 否 | 是 |
| 建立 subscription | 否 | 是 |
| 保存 resolved props | 否 | 是 |
| 保存 dirty state | 否 | 是 |
| 保存 layout | 否 | 否 |
| 保存 ANSI output | 否 | 否 |

mount 转换关系：

```text
ElementTemplate   → MountedElementNode
FragmentTemplate  → MountedFragmentNode
ShowTemplate      → MountedShowNode
ForTemplate       → MountedForNode
BindingValue      → mounted binding / subscription
ComponentTemplate → mount 阶段执行并消解
EmptyTemplate     → 通常不产生 MountedNode
```

## 37. 完整类型草案

```ts
// --- Template ---

export type Template =
  | EmptyTemplate
  | ElementTemplate
  | FragmentTemplate
  | ComponentTemplate
  | ShowTemplate
  | ForTemplate;

export type ViewTemplate = Template;

export interface EmptyTemplate {
  kind: "empty";
}

export interface ElementTemplate {
  kind: "element";
  tag: IntrinsicElementTag;
  props: TemplateProps;
  children: Template[];
}

export interface FragmentTemplate {
  kind: "fragment";
  children: Template[];
}

export type FunctionComponent<P = any> = (props: P) => Template;

export interface ComponentTemplate<P = any> {
  kind: "component";
  component: FunctionComponent<P>;
  props: P;
}

export interface ShowTemplate {
  kind: "show";
  when: BindingValue<boolean>;
  children: Template;
  fallback?: Template;
}

export interface ForTemplate<T = any> {
  kind: "for";
  each: BindingValue<readonly T[]>;
  key?: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => Template;
}

export type TemplateProps = Record<string, BindingValue<unknown>>;

export type IntrinsicElementTag =
  | "screen"
  | "box"
  | "vstack"
  | "hstack"
  | "text"
  | "button"
  | "input"
  | "spacer";

export type BindingValue<T> =
  | T
  | ReadableSignal<T>;

export interface ReadableSignal<T> {
  get(): T;
  subscribe(listener: (value: T, previousValue: T) => void): () => void;
}

// --- MountedNode ---

export type MountedNode =
  | MountedElementNode
  | MountedFragmentNode
  | MountedShowNode
  | MountedForNode;

export interface MountedElementNode {
  kind: "element";
  tag: IntrinsicElementTag;
  props: Record<string, unknown>;
  children: MountedNode[];
}

export interface MountedFragmentNode {
  kind: "fragment";
  children: MountedNode[];
}

export interface MountedShowNode {
  kind: "show";
  activeBranch: MountedNode | null;
}

export interface MountedForNode {
  kind: "for";
  items: MountedNode[];
}
```

MountedNode 完整字段（binding、dirty、dispose 等）在实现阶段于 `packages/vnode/src/mounted/types.ts` 细化。

## 38. 推荐用户写法

### 文本显示

```tsx
<text value="Hello" />
<text value={vm.title} />
<text value={vm.countLabel} />
```

### signal binding

```tsx
<text value={vm.title} color={vm.color} />
```

不要 `vm.title.get()`，那会丢失 binding 关系。

### 动态结构

```tsx
<show when={vm.visible}>
  <panel />
</show>

<for each={vm.items} key={(item) => item.id}>
  {(item) => <item-row item={item} />}
</for>
```

复杂派生值放在 ViewModel 的 `computed` 中。

## 39. 总结

```text
Template 保存声明和 binding source，不求值、不订阅。
MountedNode 保存运行时实例、订阅、dirty、dispose。
signal 更新走 binding → dirty → layout / paint / frame patch。
```

更新模型：

```text
signal change
  ↓
binding update
  ↓
mounted node dirty
  ↓
layout / paint / frame patch
```
