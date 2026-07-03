# Element Ref 设计与落地计划

本文档描述 BindTTY 的元素级 `ref` 能力。它的目标是在不引入完整 hooks / component instance 机制的前提下，让高阶 widget 和业务扩展可以拿到一个稳定、受控的 mounted element 外部接口，并通过该接口设置 mounted、layout、unmount 等生命周期回调。

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

因此需要一个更小的元素级能力：

```tsx
<box
  ref={(api) => {
    api.onLayout = (layout) => {
      // read applied layout state
    };
  }}
/>
```

这里的 `ref` 不是组件实例，也不是 hooks。它只是让调用方拿到当前 mounted element 的稳定外部接口。

## 2. 目标

`ref` 的目标是提供一个轻量、受控的 element handle：

```tsx
<box
  ref={(api) => {
    api.onMounted = () => {
      // element has mounted
    };

    api.onLayout = (layout) => {
      // read latest layout result
    };

    api.onUnmount = () => {
      // cleanup
    };
  }}
/>
```

它应满足：

1. 让 intrinsic element 在创建 mounted node 后拿到自己的稳定外部接口。
2. 允许 widget 设置 mounted / layout / unmount 生命周期回调。
3. 允许 widget 查询自己的当前 props 与最新 layout。
4. 允许 widget 基于 layout applied state 计算下一次用户意图。
5. 保持 layout 纯计算，不直接反写用户 signal。
6. 不暴露可变内部 `MountedElementNode`。
7. 不要求立即引入完整 component instance / hooks。

## 3. 非目标

`ref` 第一版不解决：

1. 函数组件实例化模型。
2. React/Vue 风格 hooks。
3. 任意组件级生命周期。
4. 在 ref 中直接修改 mounted tree 结构。
5. 用户直接持有可变内部 `MountedElementNode` 并绕过 runtime。
6. 自动依赖追踪或 effect system。
7. focus / blur / onFocusChange 等交互控制能力。

focus 相关能力可以后续基于同一个 `MountedElementApi` 增量扩展。

## 4. 核心设计

### 4.1 新增 prop

所有 intrinsic element 支持：

```ts
ref?: MountedElementRefHandler;
```

类型：

```ts
export type MountedElementRefHandler<TLayout = unknown> =
  (api: MountedElementApi<TLayout>) => void;
```

`ref` 是拿 mounted element 外部接口的入口，不是动态行为 prop。

规则：

1. `ref` 在创建 `MountedElementNode`、绑定普通 props、创建 `api` 后执行一次。
2. 后续 binding 更新不会重复执行 `ref`。
3. `show` 从 false 切到 true 导致新节点 mount 时，会执行。
4. `for` 中 key 消失后再次出现时，若产生新 mounted node，会重新执行。
5. 节点 dispose 时执行 `api.onUnmount` 回调。
6. `ref` 不支持 `BindingValue<MountedElementRefHandler>`。
7. `ref` 不进入 `node.props` / `node.bindings`，runtime 必须把它作为 lifecycle prop 单独抽取。

### 4.2 MountedElementApi

MVP 接口：

```ts
export interface MountedElementApi<TLayout = unknown> {
  readonly tag: IntrinsicElementTag;
  readonly id: string | number | undefined;

  getProp(name: string): unknown;
  getLayout(): TLayout | null;

  onMounted?: () => void;
  onLayout?: (layout: TLayout) => void;
  onUnmount?: () => void;
}
```

说明：

1. `api` 是稳定对象。
2. `api` 不暴露内部 `MountedElementNode` 引用。
3. `getProp(name)` 返回当前 resolved prop 值。
4. `getLayout()` 返回当前最新 layout 结果；首次 layout 前返回 `null`。
5. `onMounted` 在 element 自身完成 mount 后触发。
6. `onLayout` 在每次该 element 出现在 layout tree 中时触发。
7. `onUnmount` 在 dispose 时触发。
8. `onMounted` / `onLayout` / `onUnmount` 是 callback slot，重复赋值会覆盖旧回调。

### 4.3 为什么叫 ref，而不是 onMounted

`ref` 的含义是“拿到 element handle”。

它不表示 element 已经完成 mounted。

真实 mounted 生命周期通过 `api.onMounted` 表达：

```tsx
<box
  ref={(api) => {
    // ref 阶段：拿到 api，设置生命周期回调
    api.onMounted = () => {
      // mounted 阶段：element 已完成 mount
    };
  }}
/>
```

这样可以避免把一个很早执行的入口函数误命名为 `onMounted`。

### 4.4 ref 是否支持 BindingValue

MVP 不支持 `BindingValue<MountedElementRefHandler>`。

原因：

1. `ref` 是 mount 生命周期入口，不应随 signal 更新重新绑定。
2. 动态替换 ref handler 会引入复杂语义：旧 callback slot 是否清空、新 handler 是否立即执行。
3. 当前需求是获取 element handle 并设置回调，静态函数足够。

如果用户需要动态行为，应在 `ref` 中设置 callback slot，或等待后续 effect / watch 能力。

## 5. MountedElementNode 结构变化

`MountedElementNode` 可选新增一个公开但受控的 `api` 对象；只有定义了 `ref` 的 element 才会创建该对象：

```ts
export interface MountedElementNode extends MountedNodeBase {
  kind: "element";
  tag: IntrinsicElementTag;
  props: Record<string, unknown>;
  propSources: Record<string, BindingValue<unknown>>;
  bindings: Record<string, MountedBinding>;
  children: MountedNode[];
  state: Record<string, unknown>;

  api?: MountedElementApi;
}
```

`api` 是 element-only 对外接口。`Fragment` / `Show` / `For` 不拥有 `api`。

runtime 内部可以额外维护生命周期状态：

```ts
interface MountedElementLifecycleState<TLayout = unknown> {
  mounted: boolean;
  disposed: boolean;
  latestLayout: TLayout | null;
}
```

内部状态不作为公共 API 暴露。

推荐使用 `WeakMap<MountedElementNode, MountedElementLifecycleState>` 保存 lifecycle state，而不是把所有 runtime 细节都挂到 public node 类型上。

## 6. 生命周期时序

### 6.1 mount

推荐时序：

```text
create MountedElementNode
  ↓
bind props
  ↓
if ref exists: create MountedElementApi
  ↓
if ref exists: call ref(api)
  ↓
mount children
  ↓
fire api.onMounted?.()
```

`ref(api)` 在 props binding 后、children mount 前执行，使 widget 可以读取 resolved props，并在 children mount 前设置 mounted/layout/unmount 回调。

当前 runtime 的 element mount 实现是“构造 `MountedElementNode` 时同步 mount children，然后再 bind props”。落地 `ref` 时需要重排为：

```text
create MountedElementNode with children = []
  ↓
bind ordinary props
  ↓
if ref exists: create/call api
  ↓
mount children and assign node.children
  ↓
fire api.onMounted?.()
```

这里的 ordinary props 不包含 lifecycle prop `ref`。

注意：

1. `ref` 阶段主要用于设置 lifecycle callback。
2. `ref` 阶段不应依赖 layout，因为 layout 尚未发生。
3. `ref` 阶段可以通过 `api.getProp(name)` 读取当前 resolved prop。
4. 首次 layout 后，`api.getLayout()` 才会返回非 null。
5. `onMounted` 是后序语义：child element 的 `onMounted` 先于 parent element 的 `onMounted` 触发。

### 6.2 render

```text
runtime.flush()
  ↓
layoutRoot()
  ↓
renderer.render(layoutTree)
  ↓
dispatchLayout(layoutTree)
  ↓
runtime.clearDirty()
```

`dispatchLayout()` 遍历 layout tree：

```ts
function dispatchLayout(layout: LayoutNode | null): void {
  if (!layout) {
    return;
  }

  if (layout.mounted.kind === "element") {
    notifyElementLayout(layout.mounted, layout);
  }

  for (const child of layout.children) {
    dispatchLayout(child);
  }
}
```

`dispatchLayout()` 不修改用户 signal，只通知 element api 的 layout callback。

推荐在 renderer 后派发 layout，这样本轮 layout 已经用于实际渲染。若 callback 中修改 signal，应进入下一轮 runtime flush，而不是在当前 render 中递归 layout/render。

`notifyElementLayout(node, layout)` 对没有 `api` 的 element 必须是 no-op。只有定义了 `ref` 并创建了 `node.api` 的 element 才会保存 latest layout 并调用 `api.onLayout?.(layout)`。

### 6.3 unmount

```text
dispose element
  ↓
fire api.onUnmount?.()
  ↓
clear api callback slots
  ↓
dispose bindings
  ↓
dispose children
```

要求：

1. `api.onUnmount` 最多执行一次。
2. dispose 后 `api.onLayout` 不再触发。
3. dispose 后清空 `api.onMounted` / `api.onLayout` / `api.onUnmount`，帮助释放闭包引用。
4. dispose 后 `api.getLayout()` 可以返回 `null` 或最后一次 layout；MVP 推荐返回 `null`，避免用户误用已失效 layout。
5. `onUnmount` 是前序语义：parent element 的 `onUnmount` 先于 child element 的 `onUnmount` 触发。

## 7. Layout Callback 语义

`api.onLayout`：

1. 每次该 element 出现在 layout tree 中时调用。
2. 参数是该 element 对应的 layout result。
3. 同一轮 layout 中，同一 mounted element 最多调用一次。
4. 节点被 unmount 后不再调用。
5. callback 抛错时由 app 向外抛出；MVP 不做错误边界。
6. `api.onLayout` 是可赋值 callback slot，重复赋值会覆盖旧回调。

示例：

```tsx
<box
  ref={(api) => {
    api.onLayout = (layout) => {
      // read layout.scrollOffset / layout.contentSize / layout.rect
    };

    api.onUnmount = () => {
      // cleanup external resources if needed
    };
  }}
/>
```

如果只需要 layout 回调，可以简写为：

```tsx
<box
  ref={(api) => {
    api.onLayout = (layout) => {
      // read layout
    };
  }}
/>
```

## 8. ScrollView 数据流

引入 `ref` 后，`ScrollView` 可以把 layout applied state 存在 widget 闭包中：

```tsx
function ScrollView(props: ScrollViewProps): Template {
  let appliedY = 0;
  let maxY = 0;
  let pageY = 1;

  return (
    <box
      height={props.height}
      width={props.width}
      overflow="clip"
      scrollX={0}
      scrollY={props.offset ?? 0}
      ref={(api) => {
        api.onLayout = (layout) => {
          const viewportHeight =
            layout.clip?.height ??
            layout.contentRect.height ??
            layout.rect.height;

          const contentHeight =
            layout.contentSize?.height ??
            layout.rect.height;

          appliedY = layout.scrollOffset?.y ?? 0;
          maxY = Math.max(0, contentHeight - viewportHeight);
          pageY = Math.max(1, viewportHeight);
        };

        api.onUnmount = () => {
          appliedY = 0;
          maxY = 0;
          pageY = 1;
        };
      }}
      onKey={(event) => {
        if (event.name === "up") {
          props.onOffsetChange?.(Math.max(0, appliedY - 1));
          return true;
        }

        if (event.name === "down") {
          props.onOffsetChange?.(Math.min(maxY, appliedY + 1));
          return true;
        }

        if (event.name === "pageup") {
          props.onOffsetChange?.(Math.max(0, appliedY - pageY));
          return true;
        }

        if (event.name === "pagedown") {
          props.onOffsetChange?.(Math.min(maxY, appliedY + pageY));
          return true;
        }

        if (event.name === "home") {
          props.onOffsetChange?.(0);
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
api.onLayout callback consumes applied state
  ↓
next key event uses applied state
  ↓
onOffsetChange(next intent)
  ↓
user updates signal
```

layout 不再需要反写用户 signal。

## 9. 与现有模块的关系

### 9.1 @bindtty/vnode

需要新增公共类型：

```ts
MountedElementApi
MountedElementRefHandler
```

需要在 `MountedElementNode` 上可选新增：

```ts
api?: MountedElementApi;
```

需要在 common intrinsic props 中加入：

```ts
ref
```

`ref` 是 lifecycle prop，不是 dirty prop；它不会参与普通 prop binding，也不应触发 paint/layout dirty。schema 只需要允许该 prop，layout validator 应把它视为 non-layout prop。

注意：当前 `elementTemplate()` 只校验 children 与 required props，并不拒绝未知 props。因此“schema 允许 `ref`”主要服务于公共类型、dirty 语义与后续一致性；真正关键的是 runtime 特殊抽取 `ref`，避免它进入普通 binding 流程。

### 9.2 @bindtty/jsx-runtime

需要补充 JSX intrinsic 类型，使下面代码可以通过类型检查：

```tsx
<box
  ref={(api) => {
    api.onMounted = () => {};
    api.onLayout = (layout) => {};
    api.onUnmount = () => {};
  }}
/>
```

`ref` 在 BindTTY 中是普通 intrinsic prop，不是 React ref，也不使用 React ref 语义。

### 9.3 @bindtty/runtime

runtime 在 mount element 时：

1. 创建 `MountedElementNode`。
2. 从 `template.props` 中抽取静态 `ref`，并验证它不是 readable signal。
3. 绑定普通 props（不包含 `ref`）。
4. 如果存在静态 `ref`，创建 `MountedElementApi` 并保存到 `node.api`。
5. 执行静态 `ref(api)`。
6. mount children。
7. 触发 `api.onMounted?.()`。

dispose element 时：

1. 执行 `api.onUnmount?.()`。
2. 清空 `api.onMounted` / `api.onLayout` / `api.onUnmount`。
3. dispose bindings。
4. dispose children。

runtime 可以提供：

```ts
notifyElementLayout(node: MountedElementNode, layout: unknown): void;
```

该函数由 app 在 layout 后调用。若 `node.api` 不存在，该函数直接返回。

### 9.4 bindtty createApp

app 层在每次 `layoutRoot()` 后，需要把 layout tree 派发给对应 mounted element 的 api：

```text
layoutRoot(runtime.root)
  ↓
renderer.render(layoutTree)
  ↓
dispatchLayout(layoutTree)
```

这一步不修改用户 signal，只通知节点实例。

迁移后应移除或停止调用 `syncClampedScrollBindings()`。

### 9.5 @bindtty/layout

layout 不需要知道 `ref`。

layout 只继续输出 layout result：

```ts
scrollOffset
contentSize
clip
rect
contentRect
children
```

### 9.6 @bindtty/interaction

MVP 不接入 interaction。

后续如果需要，可以在 `MountedElementApi` 上扩展：

```ts
isFocused(): boolean;
focus(): boolean;
blur(): boolean;
onFocusChange(listener: (focused: boolean) => void): Dispose;
```

但第一版不做，避免 ref 方案过度膨胀。

### 9.7 @bindtty/widgets

第一批迁移目标：

1. `ScrollView` 使用 `ref + api.onLayout` 记录 applied scroll state。
2. `List` 继续组合 `ScrollView`。
3. 后续 `TextInput` 可以基于同一个 `api` 扩展 focus 或布局能力，但 MVP 不强制改造。

## 10. ref 与组件生命周期边界

`ref` 是 element-level lifecycle，不是 component-level lifecycle。

示例：

```tsx
function Panel() {
  return (
    <box ref={...}>
      <text value="A" />
    </box>
  );
}
```

这里 `ref` 绑定的是内部 `box` 节点，不是 `Panel` 组件实例。

这点需要明确，因为当前 `ComponentTemplate` 在 mount 阶段会消解，不保留组件实例。

## 11. 对 scroll-sync 的影响

当前 `scroll-sync` 修复通过 layout 后回写 `scrollY` signal 保持状态一致。

引入 `ref` 后，推荐目标是：

1. 保留 layout clamp。
2. 移除 app 对用户 signal 的隐式反写。
3. `ScrollView` 用 `api.onLayout` 记录 applied scroll state。
4. 键盘滚动基于 applied state 调用 `onOffsetChange(next)`。

迁移后数据流更清晰：

```text
state -> layout -> element api cache -> input handler -> user callback -> state
```

而不是：

```text
state -> layout -> state
```

## 12. 落地阶段

### 阶段 1：类型与 schema

目标：让 `ref` 成为合法 intrinsic prop。

任务：

- [ ] 在 vnode 类型中新增 `MountedElementApi`。
- [ ] 在 vnode 类型中新增 `MountedElementRefHandler`。
- [ ] 在 `MountedElementNode` 上新增可选 `api`。
- [ ] 在 common element props 中加入 lifecycle prop `ref`。
- [ ] 补充 TSX intrinsic 类型，使 `<box ref={...} />` 可通过类型检查。
- [ ] 单测：`ref` 不进入 `node.props` / `node.bindings`。

验收：

- [ ] 现有测试通过。
- [ ] TSX 可编译 `ref` prop。
- [ ] `ref` 不被当成 React ref 特殊处理。

### 阶段 2：runtime ref 执行与 unmount callback

目标：节点创建后执行一次 `ref(api)`，dispose 时清理。

任务：

- [ ] 创建 `MountedElementApi`。
- [ ] 如果 element 定义了 `ref`，在 mounted element 上保存稳定 `api`。
- [ ] 从 `template.props` 中抽取 `ref`，普通 props binding 不处理 `ref`。
- [ ] mount element 时调用静态 `ref(api)`。
- [ ] 支持用户给 `api.onUnmount` 赋值。
- [ ] dispose 时执行 `api.onUnmount?.()`。
- [ ] dispose 时清空 api callback slots。
- [ ] 显式禁止 `BindingValue<MountedElementRefHandler>`。

验收：

- [ ] ref mount 时只执行一次。
- [ ] binding 更新不重复执行 ref。
- [ ] `ref` 不进入 `node.props` / `node.bindings`。
- [ ] signal ref 抛错。
- [ ] `api.onUnmount` 在 dispose 时执行一次。
- [ ] show / for 重新 mount 时 ref 重新执行。

### 阶段 3：api.onMounted

目标：element 完成 mount 后触发 mounted callback。

任务：

- [ ] 支持用户给 `api.onMounted` 赋值。
- [ ] element children mount 完成后触发 `api.onMounted?.()`。
- [ ] mounted 后再给 `api.onMounted` 赋值不会自动触发。
- [ ] 明确并测试 mounted 顺序：child `onMounted` 先于 parent `onMounted`。

验收：

- [ ] ref 阶段设置的 `api.onMounted` 会在 children mount 后触发。
- [ ] mounted 后修改 `api.onMounted` 不会补触发。
- [ ] unmount 后 `api.onMounted` 被清空。
- [ ] child mounted callback 先于 parent mounted callback。

### 阶段 4：app layout 派发

目标：`api.onLayout` 能收到当前节点的 layout result。

任务：

- [ ] runtime 保存 latest layout。
- [ ] runtime 实现 `notifyElementLayout(node, layout)`。
- [ ] app 每次 layoutRoot 后遍历 layout tree 派发 layout。
- [ ] `api.getLayout()` 返回最新 layout。
- [ ] 没有 `api` 的 element 在 layout 派发时 no-op。
- [ ] unmount 后 `api.onLayout` 不再触发。
- [ ] dispose 后 layout callback 被清空。

验收：

- [ ] 初次 render 后收到 layout。
- [ ] signal 更新触发 relayout 后收到新 layout。
- [ ] 没有定义 `ref` 的 element 不会创建 `api`，layout 派发也不报错。
- [ ] unmount 后不再收到 layout。
- [ ] `api.getLayout()` 返回最新 layout。

### 阶段 5：ScrollView 迁移

目标：移除 scroll clamp 反写 signal，改为基于 element api 的 applied state。

任务：

- [ ] `ScrollView` 内部设置 `ref`。
- [ ] `api.onLayout` 记录 `appliedY` / `maxY` / `pageY`。
- [ ] 键盘滚动基于 `appliedY` / `maxY` / `pageY` 计算 next offset。
- [ ] `End` 改为 `onOffsetChange(maxY)`。
- [ ] 移除或废弃 `syncClampedScrollBindings()`。
- [ ] 更新 M7 scroll 文档中的受控规则。

验收：

- [ ] offset 过大时画面 clamp，但用户 signal 不被隐式改写。
- [ ] Down / Up / PageUp / PageDown / Home / End 正确。
- [ ] List 动态删除数据后，下一次键盘滚动基于 applied offset。
- [ ] mock e2e 和 real PTY scroll/list 测试通过。

### 阶段 6：文档与示例

目标：对外语义稳定。

任务：

- [ ] 更新 [VNODE.md](./VNODE.md) 的 common props。
- [ ] 更新 [RUNTIME.md](./RUNTIME.md) 的 mount / dispose 语义。
- [ ] 更新 [APP.md](./APP.md) 的 layout dispatch。
- [ ] 更新 [M7_SCROLL_VIEWPORT.md](./M7_SCROLL_VIEWPORT.md) 的 scroll 数据流。
- [ ] 新增一个 ref 示例。

验收：

- [ ] 文档与代码一致。
- [ ] 示例可运行。

## 13. 测试清单

runtime 单测：

- [ ] ref mount 时执行。
- [ ] props binding 更新不重复 ref。
- [ ] ref 是 signal 时抛错。
- [ ] `api.onUnmount` 在 dispose 时执行。
- [ ] `api.onMounted` 在 children mount 后触发。
- [ ] mounted 后修改 `api.onMounted` 不会补触发。
- [ ] show 切换重新 mount 时重新 ref。
- [ ] for key 保留时 ref 不重复，key 移除后再次出现会重新 ref。

app 单测：

- [ ] `api.onLayout` 初次 render 后触发。
- [ ] layout 尺寸变化后 callback 收到新 rect。
- [ ] unmount 后 `api.onLayout` 不再触发。
- [ ] `api.getLayout()` 返回最新 layout。
- [ ] unmount 后 `api.getLayout()` 返回 null。
- [ ] `onLayout` 中 set signal 不递归 render，而是进入下一轮 flush。

widget / e2e：

- [ ] ScrollView offset 过大时 signal 不被隐式改写。
- [ ] ScrollView End 后 `onOffsetChange(maxY)`。
- [ ] ScrollView Down 在底部保持 maxY。
- [ ] ScrollView Up 在顶部保持 0。
- [ ] PageUp / PageDown 使用实际 viewport height。
- [ ] List 删除 item 后下一次滚动基于 appliedY。
- [ ] real PTY 下方向键滚动仍通过。

## 14. 风险与约束

1. `ref` 可能被误用为组件实例。
   - 文档必须强调它绑定的是 intrinsic element，不是 function component。

2. 直接暴露 mounted node 会破坏 runtime 不变量。
   - MVP 只暴露 `MountedElementApi`。

3. `ref` 执行时机早于 children mount 与 layout。
   - `ref` 阶段可读取 resolved props，但不应读取 children layout。
   - layout 信息必须通过 `api.onLayout` 或 `api.getLayout()` 在 layout 后读取。

4. layout callback 可能在 render 中触发用户代码，用户代码可能 set signal。
   - MVP 允许 dirty 留到下一轮 flush，不在 dispatchLayout 中递归 render。

5. ref 闭包与 callback slot 可能泄漏。
   - dispose 必须统一清理。

6. `ref` 名称可能与 React ref 产生联想。
   - 文档需要明确 BindTTY 的 `ref` 是 intrinsic prop，接收 `MountedElementApi`，不支持 React ref object / forwardRef 语义。

7. callback slot 是单槽语义。
   - 重复赋值会覆盖旧回调；MVP 不提供多 listener 注册机制。

## 15. 推荐结论

`ref(api)` 是当前阶段解决 mounted element 访问问题的合适最小接口。

它比 `onSetup(ctx)` 更收窄：

1. 只表达 element handle 获取。
2. 生命周期通过 `api.onMounted` / `api.onLayout` / `api.onUnmount` callback slot 表达。
3. 不引入 hooks。
4. 不引入 component instance。
5. 不暴露 mutable mounted node。
6. 足够支撑 ScrollView / List 从 layout 反写 signal 迁移到 applied layout state 消费。

推荐优先落地：

```tsx
<box
  ref={(api) => {
    api.onLayout = (layout) => {
      // consume applied layout state
    };
  }}
/>
```

然后迁移 `ScrollView`，移除 `syncClampedScrollBindings()`，恢复更清晰的单向数据流：

```text
state -> runtime -> layout -> element api -> user interaction -> state
```
