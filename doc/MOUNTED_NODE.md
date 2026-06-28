# BindTTY MountedNode 设计思路

本文档描述 BindTTY 视图系统中的 MountedNode 层设计。

MountedNode 是 Template 被 mount 后形成的运行时视图树。它可以类比为 BindTTY 的 Runtime DOM，但它不是 HTML DOM 的复刻，而是一个面向 **MVVM + signal-driven TUI** 的运行时节点系统。

BindTTY 的整体视图管线为：

```text
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

其中 MountedNode 位于声明层和布局层之间，负责把 Template 中的声明关系转化为可运行、可更新、可交互的视图实例。

---

## 1. MountedNode 的定位

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

## 2. 为什么需要 MountedNode

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

## 3. MountedNode 和 Template 的关系

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

## 4. MountedNode 的核心职责

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

## 5. MountedNode 的节点类型

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

## 6. ElementDefinition：基础控件能力的来源

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

## 7. text 的渲染在哪里处理

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

## 8. input 的交互在哪里处理

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
FocusManager 找到当前 focused node
  ↓
调用该 node 的 element definition
  ↓
input state 更新
  ↓
触发绑定回调或用户事件
  ↓
标记 dirty
  ↓
scheduler 触发 layout / paint
```

所以 input 的交互逻辑不在 Template 层，也不应该散落在 scheduler 中，而应该由 input 的 ElementDefinition 承载。

---

## 9. show / for 的职责

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

## 10. Layout / Paint / Input 与 MountedNode 的关系

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

InputSystem 则通过 FocusManager 找到 active MountedElementNode，再调用对应 element definition 的输入处理能力。

---

## 11. Dirty 更新模型

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

## 12. dispose 机制

MountedNode 必须支持 dispose。

dispose 的职责包括：

```text
取消 binding subscriptions
dispose children
清理 element local state
从 focus manager 注销
清理 input handlers
释放 control node 持有的 branch / item nodes
```

尤其是 show / for，如果没有明确的 dispose 机制，很容易出现 signal subscription 泄漏。

因此，MountedNode 是运行时资源的所有者，Template 不是。

---

## 13. 推荐的整体理解

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

## 14. 和 React / DOM 的区别

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

## 15. 总结

MountedNode 不是简单的 Component 展开结果。

它的真正定位是：

```text
Template 被实例化后的运行时视图树。
```

它负责把声明层的结构、binding 和 control node 转化为可运行的节点实例。

其中：

```text
ElementTemplate 变成 MountedElementNode。
MountedElementNode 挂接 ElementDefinition。
BindingValue 变成 MountedBinding。
ShowTemplate 变成 MountedShowNode。
ForTemplate 变成 MountedForNode。
ComponentTemplate 在 mount 阶段被执行并消解。
EmptyTemplate 通常不产生 MountedNode。
```

MountedNode 的核心价值是：

```text
承载基础控件能力。
承载 binding subscription。
承载 dirty state。
承载动态结构状态。
承载 focus / input 的运行时基础。
```

因此，BindTTY 的更新模型可以保持为：

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
new tree
  ↓
diff
```
