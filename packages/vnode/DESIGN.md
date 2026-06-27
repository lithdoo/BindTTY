# @bindtty/vnode Design

## 目标

@bindtty/vnode 负责定义 BindTTY 内部 UI 树的最小数据模型。它是 TSX runtime、组件解析、终端 renderer 之间的中间层。

第一阶段只做设计和边界确认，不实现具体代码。

主链路位置：

~~~text
TSX View -> JSX Runtime -> VNode -> Resolver -> Renderer Terminal
~~~

## 非目标

@bindtty/vnode 不负责：

- 终端输出
- ANSI diff
- 键盘输入
- focus 管理
- signal 调度
- 组件生命周期
- DOM-like mutation API
- 局部 diff / reconciliation

这些能力后续分别放到 renderer、input、scheduler、runtime 层。

## 设计原则

1. VNode 必须是普通数据对象，便于测试、序列化和 renderer 消费。
2. VNode 不直接持有终端状态，也不直接执行 IO。
3. VNode 层只描述“想要的界面”，不描述“如何绘制”。
4. 第一版接受整树重新 resolve 和 render，不做局部更新优化。
5. View 函数应该只读 signal，不在 render 期间写 signal。

## 核心节点类型

第一版建议包含 5 类节点。

### TextVNode

用于表示纯文本。它可以来自字符串 children，也可以来自显式 <text> 节点内部的文本内容。

建议形态：

~~~ts
interface TextVNode {
  kind: "text";
  value: string;
}
~~~

### ElementVNode

用于表示内建 TUI 元素，例如 text、vstack、hstack、box、button、input。

建议形态：

~~~ts
interface ElementVNode {
  kind: "element";
  type: string;
  props: Record<string, unknown>;
  children: VNode[];
  key?: string | number;
}
~~~

### ComponentVNode

用于表示函数组件。第一阶段可以在 resolve 阶段直接调用组件函数，得到下一层 VNode。

建议形态：

~~~ts
type Component<P = Record<string, unknown>> = (props: P) => VNode;

interface ComponentVNode<P = Record<string, unknown>> {
  kind: "component";
  type: Component<P>;
  props: P;
  key?: string | number;
}
~~~

### FragmentVNode

用于承载多个同级节点，不产生真实终端元素。

建议形态：

~~~ts
interface FragmentVNode {
  kind: "fragment";
  children: VNode[];
  key?: string | number;
}
~~~

### EmptyVNode

用于表达条件渲染中的空值。

建议允许这些值作为 VNode 输入：

~~~ts
type EmptyVNode = null | false | undefined;
~~~

normalize 阶段会丢弃 EmptyVNode。

## VNode 输入和值域

用户写 TSX 时，children 可能出现很多形态：

- 字符串
- 数字
- VNode
- VNode[]
- null / false / undefined
- 嵌套数组

建议区分两个概念：

~~~ts
type VNodeChild = VNode | string | number | boolean | null | undefined | VNodeChild[];
type VNode = TextVNode | ElementVNode | ComponentVNode | FragmentVNode;
~~~

这样 createVNode 可以接收宽松输入，normalizeChildren 输出稳定的 VNode[]。

## createVNode 设计

createVNode 是 JSX runtime 和手写调用的共同入口。

建议职责：

1. 判断 type 是内建元素、函数组件还是 Fragment。
2. 抽出 key。
3. 把 children 规范化。
4. 返回普通 VNode 对象。

建议签名：

~~~ts
function createVNode(
  type: string | Component | typeof Fragment,
  props: Record<string, unknown> | null,
  key?: string | number
): VNode;
~~~

第一版不做复杂 props 校验。renderer 或 widgets 层再解释 props。

## normalizeChildren 设计

normalizeChildren 负责把 JSX children 变成稳定数组。

规则：

1. null、undefined、false、true 都丢弃。
2. string 和 number 转成 TextVNode。
3. 数组递归 flatten。
4. 已经是 VNode 的对象原样保留。
5. 其他对象第一版可以抛出开发期错误。

需要特别注意：数字 0 是有效文本，不应被当作空值丢弃。

## resolveVNode 设计

resolveVNode 把 ComponentVNode 展开成只包含 element、text、fragment 的树。

第一版策略：

1. 遇到 ComponentVNode，调用 component(props)。
2. 对返回值继续 resolve。
3. 遇到 FragmentVNode，resolve children。
4. 遇到 ElementVNode，resolve children。
5. 遇到 TextVNode，直接返回。

建议输出类型：

~~~ts
type ResolvedVNode = TextVNode | ResolvedElementVNode | ResolvedFragmentVNode;
~~~

第一版可以整树 resolve，不需要 component instance，也不需要 memo。

## key 的定位

key 第一阶段只保存，不参与 diff。

原因：

- 当前 renderer 计划先做整树 render + line diff。
- 没有 component instance 和局部 reconciliation 时，key 暂时没有行为意义。
- 保留 key 字段可以避免未来 API 破坏。

## props 的定位

VNode 层不解释 props，只保留 props。

例如：

~~~tsx
<box padding={1} border>
  <text color="green">Ready</text>
</box>
~~~

VNode 只记录：

~~~ts
{
  kind: "element",
  type: "box",
  props: { padding: 1, border: true },
  children: [...]
}
~~~

具体 padding、border、color 怎么渲染，由 widgets 或 renderer-terminal 决定。

## 与 JSX Runtime 的关系

jsx-runtime 应该很薄，只把编译器传来的 type、props、key 转交给 createVNode。

目标：

~~~ts
export function jsx(type, props, key) {
  return createVNode(type, props, key);
}

export const jsxs = jsx;
export const Fragment = Symbol("Fragment");
~~~

后续可以把 jsx-runtime 独立为 @bindtty/jsx-runtime，也可以先作为 bindtty 的导出入口。

## 与 renderer-terminal 的关系

renderer-terminal 不应该接收 ComponentVNode。

推荐链路：

~~~text
View function -> unresolved VNode -> resolveVNode -> resolved VNode -> renderToLines
~~~

renderer 只需要处理：

- text
- element
- fragment

这会让 renderer 保持简单，不需要知道函数组件。

## 与 signal 的关系

VNode 不直接绑定 signal。

signal 的读取发生在 View 函数执行期间：

~~~tsx
function App({ vm }) {
  return <text>Count: {vm.count.get()}</text>;
}
~~~

createApp 后续会用 effect 包住 render：

~~~ts
effect(() => {
  const vnode = view(props);
  const resolved = resolveVNode(vnode);
  renderer.render(resolved);
});
~~~

这样 vm.count.get() 会被 signal 自动追踪，vm.count.set() 会触发重新 render。

## 错误处理

第一版建议只做开发期清晰报错：

- children 中出现无法 normalize 的对象
- component 返回无法 normalize 的值
- element type 为空字符串
- Fragment 带不支持的 props

不要在 VNode 层吞掉错误。错误应该尽早暴露。

## 测试计划

实现阶段至少覆盖：

1. string / number children 转 TextVNode。
2. null / false / undefined children 被丢弃。
3. 嵌套 children 数组被 flatten。
4. string element 创建 ElementVNode。
5. function component 创建 ComponentVNode。
6. Fragment 创建 FragmentVNode。
7. resolveVNode 可以展开 function component。
8. resolveVNode 可以递归处理 nested component。
9. key 被保存但不参与行为。
10. 无效 child 抛出清晰错误。

## 第一阶段交付物

当前初始化阶段只交付：

- packages/vnode/package.json
- packages/vnode/README.md
- packages/vnode/DESIGN.md

下一步实现阶段再加入：

- src/index.ts
- src/types.ts
- src/create-vnode.ts
- src/normalize-children.ts
- src/resolve-vnode.ts
- test/*.test.js

## 开放问题

1. 包名最终使用 @bindtty/vnode，还是合并进 @bindtty/core？
2. Fragment 应使用 Symbol，还是导出一个稳定对象？
3. TextVNode 是否保留原始 number，还是统一 string？当前建议统一 string。
4. Element type 是否允许自定义字符串，还是限制到内建 widget 名称？当前建议允许字符串，后续 renderer 再报 unknown element。
5. Component props 是否需要 readonly？第一版可以不强制。
