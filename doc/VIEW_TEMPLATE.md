# BindTTY Template 设计

本文档描述 BindTTY 声明层的 Template 设计。

BindTTY 是一个面向 **MVVM + signal-driven TUI** 的 TypeScript/TSX 框架。Template 是 TSX 编译或运行时转换后的声明结构，用于描述用户声明的 UI、绑定关系、组件关系和动态结构。

Template 不等同于运行时节点，也不等同于布局结果或终端输出。

整体管线如下：

```text
TSX
  ↓
Template
  ↓ mount
MountedNode
  ↓ layout
LayoutNode
  ↓ paint
Frame
  ↓ diff
ANSI Patch
```

其中 Template 只负责第一阶段：**保存声明结构和 binding source**。

---

## 1. 设计目标

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

## 2. 核心原则

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

## 3. Template 节点集合

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

## 4. EmptyTemplate

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

## 5. ElementTemplate

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

## 6. 为什么 ElementTemplate 不区分 Container / Leaf

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

## 7. IntrinsicElementTag

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

## 8. TemplateProps

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

## 9. BindingValue

`BindingValue` 表示可绑定值。

```ts
export type BindingValue<T> =
  | T
  | ReadableSignal<T>
  | BindingExpression<T>;
```

它支持：

```text
1. 静态值
2. ReadableSignal<T>
3. BindingExpression<T>
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

### 9.3 BindingExpression

```tsx
<text value={bind(() => `Count: ${vm.count.get()}`)} />
```

这里 `bind(...)` 返回 `BindingExpression<string>`。

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

## 10. 文本设计

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

## 11. children 规则

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

## 12. FragmentTemplate

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

## 13. ComponentTemplate

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

## 14. ShowTemplate

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

## 15. ForTemplate

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

## 16. Element Schema

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

## 17. JSX 类型约束

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

## 18. TSX Normalize 规则

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

## 19. Template 与 MountedNode 的边界

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

Template 不做这些事情。

对比：

| 能力                | Template | MountedNode |
| ----------------- | -------: | ----------: |
| 保存 element tag    |        是 |           是 |
| 保存 component      |        是 |           否 |
| 保存 BindingValue   |        是 |  可保留 source |
| 读取初始值             |        否 |           是 |
| 建立 subscription   |        否 |           是 |
| 保存 resolved props |        否 |           是 |
| 保存 dirty state    |        否 |           是 |
| 保存 layout         |        否 |           否 |
| 保存 ANSI output    |        否 |           否 |

---

## 20. Template 示例

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

## 21. 推荐用户写法

### 21.1 文本显示

推荐：

```tsx
<text value="Hello" />
<text value={vm.title} />
<text value={vm.countLabel} />
```

不推荐：

```tsx
<text>Hello</text>
```

MVP 不支持，后续即使支持也只是语法糖。

---

### 21.2 signal binding

推荐：

```tsx
<text value={vm.title} color={vm.color} />
```

不推荐：

```tsx
<text value={vm.title.get()} color={vm.color.get()} />
```

原因：

```text
vm.title 保留 binding 关系。
vm.title.get() 只是当前快照。
```

---

### 21.3 computed 派生值

推荐：

```ts
class UserVM {
  fullName = computed(() => {
    return `${this.firstName.get()} ${this.lastName.get()}`;
  });
}
```

```tsx
<text value={vm.fullName} />
```

不推荐：

```tsx
<text value={vm.firstName.get() + " " + vm.lastName.get()} />
```

---

### 21.4 条件结构

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

---

### 21.5 列表结构

推荐：

```tsx
<for each={vm.items} key={(item) => item.id}>
  {(item) => <item-row item={item} />}
</for>
```

不推荐：

```tsx
{vm.items.get().map((item) => <item-row item={item} />)}
```

---

## 22. 完整类型草案

```ts
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
  | ReadableSignal<T>
  | BindingExpression<T>;

export interface ReadableSignal<T> {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
}

export interface BindingExpression<T> {
  kind: "binding-expression";
  evaluate(): T;
}
```

---

## 23. 总结

BindTTY Template 是声明层结构。

它的核心节点是：

```text
empty
element
fragment
component
show
for
```

其中：

```text
element 是统一节点。
text 是 element 的一种。
文本内容通过 props.value 表达。
children 只表示结构节点。
BindingValue 只作为 props / control source 存在。
```

Template 的核心职责是：

```text
保存用户声明的 UI 结构。
保存绑定源。
保存组件调用。
保存动态结构控制关系。
```

Template 不做：

```text
不求值。
不订阅。
不布局。
不绘制。
不输出终端。
```

最终 BindTTY 的更新模型应建立在 Template 之后的 MountedNode 上：

```text
signal change
  ↓
binding update
  ↓
mounted node dirty
  ↓
layout / paint / frame patch
```

而不是：

```text
state change
  ↓
component rerun
  ↓
new VNode
  ↓
diff
```
