# Node Setup 设计与落地计划

本文档描述 BindTTY 的节点级 `onSetup` 能力。它的目标是在不引入完整 hooks / component instance 机制的前提下，让高阶 widget 和业务扩展可以访问自己的真实 mounted element、layout 结果、focus 状态与生命周期注册点。

相关文档：

- [VNODE.md](./VNODE.md) — Template / MountedNode 类型设计
- [RUNTIME.md](./RUNTIME.md) — mount、binding、dirty、dispose
- [APP.md](./APP.md) — createApp 主链路
- [LAYOUT.md](./LAYOUT.md) — LayoutNode 与 scroll clamp
- [INTERACTION.md](./INTERACTION.md) — focus 与 onKey
- [M7_SCROLL_VIEWPORT.md](./M7_SCROLL_VIEWPORT.md) — ScrollView / List 设计

## 1. 背景问题

当前函数组件本质上是 Template 工厂：

```text
FunctionComponent(props)
  ↓
Template
  ↓ mount
MountedNode
```

函数组件执行后不会保留稳定组件实例，也不能直接拿到自己对应的 mounted node 或 layout node。

这会导致一些高阶 widget 难以实现清晰的数据流。例如 `ScrollView`：

```tsx
<ScrollView height={2} offset={offset}>
  ...
</ScrollView>
```

`offset` 是用户意图值，但真实可见 offset 需要 layout 根据 `contentSize.height - clip.height` clamp 后才能知道。

如果 widget 拿不到 layout 后的 applied scroll state，就只能：

1. 基于原始 `offset` 继续计算键盘滚动。
2. 或由 app 在 layout 后把 clamp 值反写用户 signal。

第二种能修 bug，但数据流会变成：

```text
signal -> runtime -> layout -> signal -> runtime -> layout -> renderer
```

这会削弱单向数据流的清晰度。

## 2. 目标

`onSetup` 的目标是提供一个节点级 runtime 入口：

```tsx
<box
  onSetup={(ctx) => {
    ctx.onLayout((layout) => {
      // read applied layout state
    });
  }}
/>
```

它应满足：

1. 让一个 intrinsic element 在 mount 后拿到自己的节点上下文。
2. 允许 widget 注册生命周期与 layout 回调。
3. 允许业务或 widget 查询 focus 状态，并请求 focus / blur。
4. 允许 widget 基于 layout applied state 计算下一次用户意图。
5. 保持 layout 纯计算，不直接反写用户 signal。
6. 不要求立即引入完整 component instance / hooks。

## 3. 非目标

`onSetup` 第一版不解决：

1. 函数组件实例化模型。
2. React/Vue 风格 hooks。
3. 任意组件级生命周期。
4. 在 setup 中直接修改 mounted tree 结构。
5. 用户直接持有可变内部 MountedNode 并绕过 runtime。
6. 自动依赖追踪或 effect system。

这些能力可以在后续基于同一套上下文模型继续扩展。

## 4. 核心设计

### 4.1 新增 prop

所有 intrinsic element 支持：

```ts
onSetup?: NodeSetupHandler;
```

类型：

```ts
export type NodeSetupHandler = (ctx: NodeSetupContext) => void | (() => void);
```

`onSetup` 是初始化钩子，不是动态行为 prop。

规则：

1. 节点第一次 mount 后执行一次。
2. 后续 binding 更新不会重复执行。
3. `show` 从 false 切到 true 导致新节点 mount 时，会执行。
4. `for` 中 key 消失后再次出现时，若产生新 mounted node，会重新执行。
5. 节点 dispose 时执行 setup 返回的 cleanup，以及通过 ctx 注册的 cleanup。

### 4.2 NodeSetupContext

MVP 接口：

```ts
export interface NodeSetupContext {
  readonly id: string | number | undefined;
  readonly nodeId: number;

  getMountedNode(): MountedElementNodeView;
  getLayoutNode(): LayoutNode | null;

  isFocused(): boolean;
  focus(): void;
  blur(): void;

  onUnmount(cleanup: () => void): Dispose;
  onLayout(listener: NodeLayoutListener): Dispose;
  onFocusChange(listener: NodeFocusListener): Dispose;
}

export type Dispose = () => void;
export type NodeLayoutListener = (layout: LayoutNode) => void;
export type NodeFocusListener = (focused: boolean) => void;
```

`MountedElementNodeView` 是只读视图，不直接暴露可变 mounted node：

```ts
export interface MountedElementNodeView {
  readonly kind: "element";
  readonly tag: string;
  readonly id: string | number | undefined;
  getProp(name: string): unknown;
}
```

后续如确实需要更强能力，可以增加受控方法，而不是暴露内部对象引用。

### 4.3 上下文稳定性

`ctx` 对象在节点生命周期内稳定。

```text
same mounted element
  same ctx object
```

但 `getLayoutNode()` 返回的是当前最新 layout 结果：

```text
render #1 layout node A
render #2 layout node B
```

所以不保证 `LayoutNode` 对象引用稳定。用户不应长期保存 layout object，只应读取需要的值。

### 4.4 onSetup 是否支持 BindingValue

MVP 不支持 `BindingValue<NodeSetupHandler>`。

原因：

1. `onSetup` 是 mount 生命周期，不应随 signal 更新重新绑定。
2. 动态替换 setup handler 会引入复杂语义：旧 handler 是否 cleanup、新 handler 是否立即执行。
3. 当前需求是节点初始化与注册回调，静态函数足够。

如果用户需要动态行为，应在 setup 内自行读取 signal，或等待后续 `watch` / effect 能力。

## 5. ScrollView 数据流

引入 `onSetup` 后，`ScrollView` 可以把 layout applied state 存在 widget 闭包中：

```tsx
function ScrollView(props: ScrollViewProps): Template {
  let appliedY = 0;
  let maxY = 0;

  return (
    <box
      height={props.height}
      overflow="clip"
      scrollY={props.offset ?? 0}
      onSetup={(ctx) => {
        ctx.onLayout((layout) => {
          appliedY = layout.scrollOffset?.y ?? 0;
          maxY = Math.max(
            0,
            (layout.contentSize?.height ?? layout.rect.height) - layout.rect.height
          );
        });
      }}
      onKey={(event) => {
        if (event.name === "down") {
          props.onOffsetChange?.(Math.min(appliedY + 1, maxY));
          return true;
        }

        if (event.name === "end") {
          props.onOffsetChange?.(maxY);
          return true;
        }

        return false;
      }}
    >
      {props.children}
    </box>
  );
}
```

数据流变为：

```text
offset signal
  ↓
runtime binding
  ↓
layout clamp
  ↓
ctx.onLayout(applied state)
  ↓
next key event uses applied state
  ↓
onOffsetChange(next intent)
```

layout 不再需要反写用户 signal。

## 6. 与现有模块的关系

### 6.1 @bindtty/vnode

需要新增公共 prop：

```ts
onSetup: { dirty: "paint" }
```

`onSetup` 不影响 layout。标成 `paint` 只是为了让 schema 接受该 prop，并保持 common prop 语义一致。

需要导出类型：

```ts
NodeSetupHandler
NodeSetupContext
NodeLayoutListener
NodeFocusListener
MountedElementNodeView
```

这些类型可以放在 `@bindtty/vnode`，因为 Template props 与 MountedNode 类型都在该包。

### 6.2 @bindtty/runtime

runtime 在 mount element 时：

1. 创建 mounted element。
2. bind props。
3. 如果存在静态 `onSetup`，创建 `NodeSetupContext`。
4. 执行 setup handler。
5. 保存 setup 返回 cleanup 与 ctx 注册的 cleanup。

dispose element 时：

1. 先停止 bindings。
2. 执行 setup cleanup。
3. 执行 ctx 注册的 cleanup。
4. dispose children。

具体顺序可以在实现时统一，但必须保证 cleanup 只执行一次。

runtime 不负责调用 `onLayout`，因为 layout 结果在 app 层产生。

### 6.3 bindtty createApp

app 层在每次 layoutRoot 后，需要把 layout tree 派发给对应 mounted element 的 setup context：

```text
layoutRoot(runtime.root)
  ↓
dispatchLayout(layoutTree)
  ↓
renderer.render(layoutTree)
```

`dispatchLayout` 遍历 layout tree：

```ts
if (layout.mounted.kind === "element") {
  notifyNodeLayout(layout.mounted, layout);
}
```

这一步不修改用户 signal，只通知节点实例。

### 6.4 @bindtty/interaction

`ctx.isFocused()`、`ctx.focus()`、`ctx.blur()` 应通过现有 `InteractionController` 实现。

app 创建 setup context 时注入 interaction adapter：

```ts
interface NodeSetupHost {
  isFocused(node: MountedElementNode): boolean;
  focus(node: MountedElementNode): void;
  blur(node: MountedElementNode): void;
  getLayout(node: MountedElementNode): LayoutNode | null;
}
```

如果没有 interaction controller，例如非 terminal 测试场景：

1. `isFocused()` 返回 false。
2. `focus()` / `blur()` 是 no-op。
3. 不抛错。

### 6.5 @bindtty/layout

layout 不需要知道 `onSetup`。

layout 只继续输出 `LayoutNode`：

```ts
scrollOffset
contentSize
clip
rect
```

### 6.6 @bindtty/widgets

第一批迁移目标：

1. `ScrollView` 使用 `onSetup + onLayout` 记录 applied scroll state。
2. `List` 继续组合 `ScrollView`。
3. 后续 `TextInput` 可以用 setup 读取 focus 状态或布局信息，但 MVP 不强制改造。

## 7. 事件时序

### 7.1 mount

```text
mount element
  create MountedElementNode
  bind props
  create setup context
  call onSetup(ctx)
  mount children
```

如果 setup 需要读取 children layout，必须通过 `ctx.onLayout()`，不能在 setup 同步阶段读取。

### 7.2 render

```text
runtime.flush()
  layoutRoot()
  dispatchLayout()
  renderer.render()
  runtime.clearDirty()
```

`dispatchLayout()` 应在 renderer 前执行，这样同一轮输入后的状态可以被 widget 立即记录，供下一次 key event 使用。

### 7.3 unmount

```text
dispose element
  run setup cleanup once
  remove registered listeners
  dispose bindings
  dispose children
```

如果 listener 在 cleanup 中主动调用自己的 disposer，应保证幂等。

## 8. Focus 语义

`onSetup` 不替代 `onKey` 的 focus 判定规则。

当前交互规则仍然是：

```text
onKey === function 或 true
  node can be focused
```

`ctx.focus()` 的作用是请求 interaction controller 把当前节点设为 focused node。若该节点当前不可 focus，则有两种可选策略：

1. 返回 false 表示失败。
2. no-op。

MVP 建议让 `focus()` 返回 boolean：

```ts
focus(): boolean;
blur(): boolean;
```

这样业务可以判断请求是否成功。

## 9. Layout Listener 语义

`ctx.onLayout(listener)`：

1. 每次该节点出现在 layout tree 中时调用。
2. 参数是该节点对应的 `LayoutNode`。
3. 同一轮 layout 中，同一 mounted element 最多调用一次。
4. 节点被 unmount 后不再调用。
5. listener 抛错时由 app 捕获并向外抛出，MVP 不做错误边界。

如果节点当前不在 layout tree 中，例如 `show=false` 后已 dispose，则 listener 不会再收到事件。

## 10. 生命周期边界

`onSetup` 是 element-level lifecycle，不是 component-level lifecycle。

示例：

```tsx
function Panel() {
  return (
    <box onSetup={...}>
      <text value="A" />
    </box>
  );
}
```

这里 setup 绑定的是内部 `box` 节点，不是 `Panel` 组件实例。

这点需要明确，因为当前 `ComponentTemplate` 在 mount 阶段会消解，不保留组件实例。

## 11. 对 scroll-sync 的影响

当前 `scroll-sync` 修复通过 layout 后回写 `scrollY` signal 保持状态一致。

引入 `onSetup` 后，推荐目标是：

1. 保留 layout clamp。
2. 移除 app 对用户 signal 的隐式反写。
3. `ScrollView` 用 `ctx.onLayout()` 记录 applied scroll state。
4. 键盘滚动基于 applied state 调用 `onOffsetChange(next)`。

迁移后数据流更清晰：

```text
state -> layout -> setup context cache -> input handler -> user callback -> state
```

而不是：

```text
state -> layout -> state
```

## 12. 落地阶段

### 阶段 1：类型与 schema

目标：让 `onSetup` 成为合法 intrinsic prop。

任务：

- [ ] 在 vnode 类型中新增 `NodeSetupHandler` / `NodeSetupContext` 等类型。
- [ ] 在 common element props 中加入 `onSetup`。
- [ ] 补充 TSX intrinsic 类型，使 `<box onSetup={...} />` 可通过类型检查。
- [ ] 单测：`elementTemplate("box", { onSetup })` 合法。

验收：

- [ ] 现有测试通过。
- [ ] TSX 可编译 `onSetup` prop。

### 阶段 2：runtime setup 执行与 cleanup

目标：节点 mount 后执行一次 setup，dispose 时清理。

任务：

- [ ] 在 mounted element 上保存 setup runtime state。
- [ ] mount element 时创建 context 并调用 setup。
- [ ] 支持 setup 返回 cleanup。
- [ ] 支持 `ctx.onUnmount(cleanup)`。
- [ ] dispose 时 cleanup 幂等执行。

验收：

- [ ] setup mount 时只执行一次。
- [ ] binding 更新不重复执行 setup。
- [ ] dispose 后 cleanup 执行一次。
- [ ] show / for 重新 mount 时 setup 重新执行。

### 阶段 3：app layout 派发

目标：`ctx.onLayout()` 能收到当前节点的 layout result。

任务：

- [ ] app 保存 mounted element 到 latest layout node 的映射。
- [ ] 每次 layoutRoot 后遍历 layout tree 派发 layout 事件。
- [ ] `ctx.getLayoutNode()` 返回最新 layout。
- [ ] listener dispose 后不再收到 layout。

验收：

- [ ] 初次 render 后收到 layout。
- [ ] signal 更新触发 relayout 后收到新 layout。
- [ ] unmount 后不再收到 layout。

### 阶段 4：focus adapter

目标：setup context 可以读写 focus。

任务：

- [ ] context 接入 interaction controller。
- [ ] 实现 `isFocused()`。
- [ ] 实现 `focus()` / `blur()`。
- [ ] 实现 `ctx.onFocusChange(listener)`。

验收：

- [ ] Tab 或 controller focus 改变后 listener 被调用。
- [ ] `focus()` 可以聚焦当前可 focus 节点。
- [ ] 不可 focus 节点 focus 返回 false。

### 阶段 5：ScrollView 迁移

目标：移除 scroll clamp 反写 signal，改为基于 setup context 的 applied state。

任务：

- [ ] `ScrollView` 内部注册 `onSetup`。
- [ ] `ctx.onLayout()` 记录 `appliedY` / `maxY`。
- [ ] 键盘滚动基于 `appliedY` / `maxY` 计算 next offset。
- [ ] 移除或废弃 `syncClampedScrollBindings`。
- [ ] 更新 M7 scroll 文档中的受控规则。

验收：

- [ ] offset 过大时画面 clamp，但用户 signal 不被隐式改写。
- [ ] Down / Up / PageUp / PageDown / Home / End 仍正确。
- [ ] List 动态删除数据后，下一次键盘滚动基于 applied offset。
- [ ] mock e2e 和 real PTY scroll/list 测试通过。

### 阶段 6：文档与示例

目标：对外语义稳定。

任务：

- [ ] 更新 [VNODE.md](./VNODE.md) 的 common props。
- [ ] 更新 [RUNTIME.md](./RUNTIME.md) 的 mount / dispose 语义。
- [ ] 更新 [APP.md](./APP.md) 的 layout dispatch。
- [ ] 更新 [INTERACTION.md](./INTERACTION.md) 的 focus adapter。
- [ ] 新增一个 setup 示例。

验收：

- [ ] 文档与代码一致。
- [ ] 示例可运行。

## 13. 测试清单

runtime 单测：

- [ ] setup mount 时执行。
- [ ] props binding 更新不重复 setup。
- [ ] setup 返回 cleanup 在 dispose 时执行。
- [ ] `ctx.onUnmount()` cleanup 执行。
- [ ] show 切换重新 mount 时重新 setup。
- [ ] for key 保留时 setup 不重复，key 移除后再次出现会重新 setup。

app 单测：

- [ ] `ctx.onLayout()` 初次 render 后触发。
- [ ] layout 尺寸变化后 listener 收到新 rect。
- [ ] listener dispose 后不再触发。
- [ ] `ctx.getLayoutNode()` 返回最新 layout。

interaction 单测：

- [ ] `ctx.isFocused()` 与 controller 状态一致。
- [ ] `ctx.focus()` 成功聚焦可 focus 节点。
- [ ] `ctx.blur()` 清除当前节点 focus。
- [ ] `ctx.onFocusChange()` 收到 true / false。

widget / e2e：

- [ ] ScrollView offset 过大时 signal 不被隐式改写。
- [ ] ScrollView End 后 `onOffsetChange(maxY)`。
- [ ] ScrollView Down 在底部保持 maxY。
- [ ] List 删除 item 后下一次滚动基于 appliedY。
- [ ] real PTY 下方向键滚动仍通过。

## 14. 风险与约束

1. `onSetup` 可能被误用为组件生命周期。
   - 文档必须强调它是 element-level lifecycle。

2. 直接暴露 mounted node 会破坏 runtime 不变量。
   - MVP 只暴露只读 view。

3. layout listener 可能在 render 中触发用户代码，用户代码可能 set signal。
   - MVP 可允许 signal dirty 留到下一轮 flush，不在 dispatchLayout 中递归 render。

4. setup 闭包与 listener 可能泄漏。
   - dispose 必须统一清理。

5. focus 与 onKey 的关系要保持一致。
   - `focus()` 不应让无 onKey 的节点强行进入 focus list，除非后续明确扩展 focusable 模型。

## 15. 推荐结论

`onSetup` 是当前阶段解决节点实例访问问题的合适最小接口。

它不引入完整 hooks，也不改变函数组件消解模型，但能给高阶 widget 一个稳定的 runtime 入口。优先落地后，可以把 scroll clamp 从“layout 反写 signal”迁移为“layout 输出 applied state，widget 在下一次交互中消费 applied state”，从而恢复更清晰的单向数据流。
