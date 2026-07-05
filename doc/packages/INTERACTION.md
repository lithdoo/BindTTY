# @bindtty/interaction 落地设计

本文档描述 `@bindtty/interaction` 的独立包设计。它位于 `@bindtty/terminal`、`bindtty createApp` 与 mounted tree 之间，负责把终端键盘事件派发给当前可接收键盘事件的节点。

相关文档：

- [TERMINAL.md](./TERMINAL.md) — terminal lifecycle、viewport、keypress adapter
- [APP.md](./APP.md) — createApp 组合 runtime / layout / renderer / terminal
- [RUNTIME.md](./RUNTIME.md) — MountedNode、dirty、scheduler
- [VNODE.md](./VNODE.md) — Template / MountedNode 数据结构
- [E2E_TESTING.md](../testing/E2E.md) — 端到端测试策略

::: info 本章导航

- **背景与目标**：[§1 背景](#_1-背景) · [§2 核心决定](#_2-核心决定) · [§3 目标](#_3-目标) · [§4 包归属](#_4-包归属)
- **onKey 与类型**：[§5 包结构](#_5-包结构) · [§6 onKey 模型](#_6-onkey-模型) · [§7 核心类型](#_7-核心类型) · [§8 事件流](#_8-事件流)
- **Focus 与事件**：[§9 Focus 语义](#_9-focus-语义) · [§10 嵌套 onKey](#_10-嵌套-onkey-元素) · [§11 Key Event](#_11-key-event-语义)
- **包边界与接口**：[§12 Widget 边界](#_12-与具体-widget-的边界) · [§13 包适配](#_13-与现有包的适配点) · [§14 App 接口](#_14-与-app-的接口) · [§15 Renderer](#_15-与-renderer-的接口) · [§16 错误处理](#_16-错误处理)
- **落地与展望**：[§17 测试计划](#_17-测试计划) · [§18 分阶段落地](#_18-分阶段落地) · [§19 MVP 标准](#_19-mvp-判断标准) · [§20 Hooks](#_20-与-hooks-的关系)

:::

## 1. 背景

当前主链路已经打通：

```text
TSX
  -> Template
  -> runtime MountedNode
  -> layout LayoutNode
  -> renderer ANSI patch
  -> app
  -> TerminalHost.write()
```

`@bindtty/terminal` 已能把真实 stdin keypress 归一化为：

```text
TerminalKeyEvent
```

但系统还缺少键盘事件到 mounted node 的派发层：

```text
Tab 应该移动到哪个节点？
当前哪个节点接收 Enter / Escape / 字符输入？
业务组件如何声明自己要接收键盘？
结构更新后当前 focus 如何保留或迁移？
嵌套可交互节点如何排序？
```

这些问题不属于 terminal，也不属于 renderer。它们属于 interaction。

## 2. 核心决定

Alpha interaction 模型（2026-07 起）：

```text
focusable:
  控制节点是否进入 Tab focus list。

onKeyCapture / onKey:
  控制节点是否监听 key event（capture / target / bubble）。

legacy:
  未显式设置 focusable 时，onKey === true | function 仍隐式 focusable。
```

Key event 沿当前 focused target 的 mounted ancestor path 传播：

```text
capture: root -> ... -> parent
target:  focused node
bubble:  parent -> ... -> root
fallback: Tab / Shift+Tab focus traversal（无 handler return true 时）
```

仍不引入：

```text
onFocus / onBlur（公开 API）
autoFocus
tabIndex
mouse / paste / selection
```

详细设计见 [FOCUS_AND_KEY_EVENT_PLAN.md](../architecture/FOCUS_AND_KEY_EVENT_PLAN.md)。

`onKey` handler 签名：

```ts
onKey?: (event: BindTTYKeyEvent) => boolean | void
```

`return true` 表示 handled 并阻止 fallback；`event.stopPropagation()` 仅停止传播。

`onKey` 可以是静态值，也可以是动态 BindingValue。

## 3. 目标

`@bindtty/interaction` 负责：

```text
1. 从 MountedNode tree 收集 key-focus targets。
2. 维护当前 focused node。
3. 处理 Tab / Shift+Tab focus traversal。
4. 把非导航键派发给当前 focused node 的 onKey handler。
5. 在 focus 变化时返回 dirty nodes，驱动 repaint。
6. 在 runtime flush 后刷新 focus list。
```

它不负责：

```text
1. 解析真实 stdin。
2. 管理 raw mode / alternate screen / cursor。
3. layout 尺寸计算。
4. ANSI frame diff。
5. signal 依赖追踪。
6. TSX 转换。
7. 具体 button / input / select 语义。
8. IME preedit / 候选窗。
```

具体控件语义由 `@bindtty/widgets` 或业务组件自己转换成 `onKey`。

例如未来 button 可以实现为：

```tsx
<box
  onKey={(event) => {
    if (event.name === "return" || event.input === " ") {
      props.onPress?.();
      return true;
    }
  }}
/>
```

## 4. 包归属

新增独立包：

```text
packages/interaction
name: @bindtty/interaction
```

原因：

```text
1. keyboard focus 和 key dispatch 是独立运行时能力。
2. 它不属于 terminal lifecycle。
3. 它不属于 renderer。
4. 它不应该知道 button / input / select 等具体控件。
5. 后续支持 mouse、paste、selection、focus scope 时有独立演进空间。
```

目标依赖方向：

```text
bindtty
  import @bindtty/interaction
  import @bindtty/terminal
  import @bindtty/runtime
  import @bindtty/layout
  import @bindtty/renderer-terminal

@bindtty/interaction
  import @bindtty/vnode
  import @bindtty/terminal types

@bindtty/terminal
  不 import interaction / runtime / renderer

@bindtty/renderer-terminal
  不 import interaction / terminal / runtime
```

MVP 推荐 App 负责 repaint，不让 interaction 直接访问 runtime scheduler。

## 5. 包结构

实际结构：

```text
packages/interaction/
  src/
    index.ts
    controller.ts      # focus list、key dispatch、controller 全部逻辑
    keyboard.ts        # isTabKey / isEnterKey / isTextInputKey 等
    types.ts           # InteractionController、InteractionResult 等类型
  test/
    interaction.test.ts  # 所有测试（30+）在一个文件中
    tsconfig.json
  package.json
  tsconfig.json
```

模块职责：

```text
types.ts
  InteractionController、InteractionResult、InteractionKeyHandler、KeyFocusEntry、focus change types。

controller.ts
  收集 key-focus targets、focus traversal、focus restore、key dispatch、InteractionController 实现。

keyboard.ts
  判断 Tab / Shift+Tab / Enter / printable char / special key。
```

注意：设计文档中原计划拆出独立的 `focus.ts` 模块，但实际实现将 focus 逻辑全部内联在 `controller.ts` 中。测试也合并为单一的 `interaction.test.ts` 文件。

## 6. onKey 模型

`onKey` 是 interaction MVP 的唯一交互入口。

建议类型：

```ts
export type InteractionKeyHandler = (
  event: TerminalKeyEvent,
  context: InteractionKeyContext
) => boolean | void;

export type InteractionKeyBinding =
  | boolean
  | InteractionKeyHandler
  | null
  | undefined;

export interface InteractionKeyContext {
  node: MountedElementNode;
  isFocused: true;
}
```

在 vnode / JSX props 中，`onKey` 应支持 BindingValue：

```ts
onKey?: BindingValue<InteractionKeyBinding>
onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void
```

因此以下写法都成立：

```tsx
<box onKey={true} />
<box onKey={false} />
<box onKey={vm.canFocus} />
<box onKey={handleKey} />
<box onKey={vm.dynamicKeyHandler} />
```

如果组件需要根据自身 focus 状态更新样式，可以同时提供节点级 `onFocusChange`：

```tsx
<box
  onKey={true}
  onFocusChange={(event) => {
    vm.boxFocused.set(event.focused);
  }}
/>
```

`onFocusChange` 不让节点进入 focus list。节点是否可聚焦仍然只由 `onKey` 决定。

语义：

```text
onKey === true:
  节点进入 focus list。
  节点可以获得 focus。
  非导航键到达时视为未处理。

typeof onKey === "function":
  节点进入 focus list。
  非导航键到达时调用该函数。
  函数返回 true 表示 handled。
  函数返回 false / undefined 表示 unhandled。

onKey === false / null / undefined:
  节点不进入 focus list。
  如果它原本 focused，refresh 后需要迁移 focus。
```

动态值：

```text
onKey 是 ReadableSignal / computed 时：
  runtime 负责更新 mounted node props。
  app 在 runtime flush 后调用 interaction.refresh(root)。
  interaction 使用刷新后的 onKey 值重建 focus list。
```

这意味着：

```text
onKey: true -> false
  节点从 focus list 移除。

onKey: false -> true
  节点进入 focus list。

onKey: handlerA -> handlerB
  节点仍可聚焦，后续键盘事件调用最新 handler。
```

## 7. 核心类型

### 7.1 InteractionController

```ts
export interface InteractionController {
  refresh(root: MountedNode | null): InteractionResult;
  handleKey(event: TerminalKeyEvent): InteractionResult;
  onFocusChange(listener: InteractionFocusChangeListener): () => void;
  focus(target: string | MountedElementNode): InteractionResult;
  focusNext(): InteractionResult;
  focusPrevious(): InteractionResult;
  clearFocus(): InteractionResult;
  getFocusedId(): string | null;
  getFocusedNode(): MountedElementNode | null;
  isFocused(node: MountedNode): boolean;
  dispose(): void;
}
```

语义：

- `refresh(root)` 在 start、runtime flush、resize repaint 前后调用。
- `handleKey(event)` 处理 terminal key event。
- `onFocusChange(listener)` 订阅 controller 级别的 focus change event。
- `focus(target)` 编程式聚焦指定 id 或 mounted node。
- `focusNext()` / `focusPrevious()` 可供 App 或未来用户 API 调用。
- `clearFocus()` 清空当前 focus。
- `getFocusedId()` 返回当前 focused entry id。
- `getFocusedNode()` 返回当前 focused node。
- `isFocused(node)` 给 renderer 查询 focused 状态。
- `dispose()` 清理 focus state 和内部引用。

### 7.2 FocusChange

```ts
export type InteractionFocusChangeReason =
  | "initial"
  | "next"
  | "previous"
  | "programmatic"
  | "clear"
  | "refresh";

export interface InteractionFocusSnapshot {
  id: string;
  node: MountedElementNode;
}

export interface InteractionFocusChangeEvent {
  previous: InteractionFocusSnapshot | null;
  current: InteractionFocusSnapshot | null;
  reason: InteractionFocusChangeReason;
}

export interface InteractionNodeFocusChangeEvent {
  id: string;
  node: MountedElementNode;
  focused: boolean;
  reason: InteractionFocusChangeReason;
}

export type InteractionFocusChangeListener = (
  event: InteractionFocusChangeEvent
) => void;
```

语义：

```text
previous:
  focus change 前的 focused entry。

current:
  focus change 后的 focused entry。

reason:
  focus 变化来源。
```

触发时机：

```text
initial:
  refresh 后首次选中第一个 key-focus target。

next:
  Tab / focusNext() 导致 focus 前进。

previous:
  Shift+Tab / focusPrevious() 导致 focus 后退。

programmatic:
  focus(id) / focus(node) 成功切换 focus。

clear:
  clearFocus() 清空已有 focus。

refresh:
  当前 focused node 消失或 onKey 变为不可用，refresh 迁移或清空 focus。
```

不触发：

```text
1. refresh 后 focused node 不变。
2. focus(id) 找不到目标。
3. focus(node) 目标不在 focus list。
4. clearFocus() 时当前本来没有 focus。
5. Tab 时只有一个 focus target 且 focus 不变。
```

MVP 提供两层 focus change 通知：

```text
controller.onFocusChange(listener):
  订阅全局 focus 变化。

node.props.onFocusChange:
  只通知该节点自己获得或失去 focus。
```

业务如果要让某个组件根据自身 focus 状态改样式，推荐用节点级 `onFocusChange` 更新组件 ViewModel signal。需要调试、统计或全局状态同步时，再使用 controller 级 `onFocusChange`。

触发顺序：

```text
1. 构造 InteractionFocusChangeEvent。
2. 对 previous node 调用 node.props.onFocusChange({ focused: false, ... })。
3. 对 current node 调用 node.props.onFocusChange({ focused: true, ... })。
4. 通知 controller.onFocusChange listeners。
5. 返回 InteractionResult.focusChange。
```

节点级 `onFocusChange` 抛错时，错误向外冒出；MVP 不吞异常。

### 7.3 InteractionResult

```ts
export interface InteractionResult {
  handled: boolean;
  dirtyNodes: MountedNode[];
  focusChange?: InteractionFocusChangeEvent;
}
```

语义：

- `handled` 表示事件是否被 interaction 消费。
- `dirtyNodes` 包含 focus 变化或 key handler 需要 repaint 的节点。
- `focusChange` 在本次操作改变 focus 时返回，同一事件也会通知 `onFocusChange` listeners。
- 第一版 App 可以收到 dirty nodes 后直接 repaint。

### 7.4 KeyFocusEntry

```ts
export interface KeyFocusEntry {
  id: string;
  node: MountedElementNode;
  order: number;
  handler: InteractionKeyHandler | null;
}
```

`handler` 的来源：

```text
onKey === true:
  handler = null

typeof onKey === "function":
  handler = onKey
```

`id` 的来源：

```text
1. 如果 mounted element props.id 是 string / number，使用 String(props.id)。
2. 否则 interaction 为该 mounted node 分配内部临时 id。
3. 内部 id 只保证当前 InteractionController 生命周期内稳定。
4. 业务若需要 controller.focus(id)，必须显式提供稳定 id。
```

重复 id：

```text
1. 不建议重复。
2. MVP 可以按树序选择第一个匹配项。
3. dev 模式后续可以增加重复 id 警告。
```

## 8. 事件流

### 8.1 启动

```text
createApp(view, { terminal })
  -> createRuntimeRoot(view)
  -> createInteractionController()
  -> terminal.start()
  -> interaction.refresh(runtime.root)
  -> terminal.onKey(handleKey)
  -> render()
```

### 8.2 Key Event

```text
TerminalHost.onKey(event)
  -> app.handleKey(event)
  -> interaction.handleKey(event)
  -> Tab / Shift+Tab?
       yes: focus traversal
       no:  dispatch to focused entry handler
  -> dirtyNodes
  -> app repaint if needed
```

派发规则：

```text
1. Tab / Shift+Tab 由 interaction 用于移动 focus。
2. Tab / Shift+Tab MVP 不派发给 onKey handler。
3. 非导航键只派发给当前 focused node。
4. 当前 focused node 的 handler 为 null 时，返回 handled=false。
5. handler 返回 true 时，返回 handled=true。
6. handler 返回 false / undefined 时，返回 handled=false。
7. 不做 bubbling。
8. 不做 capture。
9. 不自动向父节点回退。
```

### 8.3 Runtime Flush 后

```text
signal update
  -> runtime flush
  -> app render path
  -> interaction.refresh(runtime.root)
```

`refresh` 需要处理：

```text
1. 重新收集 key-focus targets。
2. 如果当前 focused node 仍存在且 onKey 仍可用，保留 focus。
3. 如果当前 focused node 消失，移动到下一个可用节点。
4. 如果当前 focused node 的 onKey 变为 false / null / undefined，移动到下一个可用节点。
5. 如果没有 key-focus targets，focused = null。
```

## 9. Focus 语义

### 9.1 初始 Focus

MVP 规则：

```text
1. refresh 后如果当前 focused node 仍有效，保留当前 focus。
2. 只有当前没有有效 focus 时，才选择新 focus。
3. 选择树序第一个 key-focus target。
4. 没有 key-focus target 则 focused = null。
```

`autoFocus` 不进入 MVP。它依赖 mounted lifecycle hook、组件首次挂载语义和业务组件扩展方式，后续应由 widgets 或业务组件自行实现。

### 9.2 Tab

```text
Tab:
  focus next

Shift+Tab:
  focus previous
```

如果 focus list 为空：

```text
handled = false
dirtyNodes = []
```

如果只有一个 focus target：

```text
handled = true
dirtyNodes = []
```

如果 focus 发生变化：

```text
dirtyNodes = [previousFocused, nextFocused]
focusChange.reason = "next" 或 "previous"
notify onFocusChange listeners
```

### 9.3 Programmatic Focus

controller 支持编程式 focus：

```ts
interaction.focus("submit");
interaction.focus(mountedNode);
interaction.clearFocus();
```

规则：

```text
focus(id):
  找到当前 focus list 中 id 匹配的 entry。
  找到则切换 focus。
  focusChange.reason = "programmatic"。
  找不到则 handled=false，focus 不变。

focus(node):
  node 必须在当前 focus list 中。
  找到则切换 focus。
  focusChange.reason = "programmatic"。
  找不到则 handled=false，focus 不变。

clearFocus():
  当前有 focus 时清空 focused node。
  dirtyNodes 包含 previous focused node。
  focusChange.reason = "clear"。
  当前无 focus 时 dirtyNodes=[]。
```

`clearFocus()` 后：

```text
Tab:
  从第一个 focus target 开始。

Shift+Tab:
  从最后一个 focus target 开始。

普通 key:
  没有 focused node，handled=false。
```

### 9.4 结构更新

结构更新后，不使用永久 focus 缓存。focus 只在当前 MountedNode tree 中有效。

```text
focused node still present and onKey still enabled:
  keep focus

focused node removed:
  move to nearest next focus target by previous order
  focusChange.reason = "refresh"

focused node onKey becomes false / null / undefined:
  move to nearest next focus target
  focusChange.reason = "refresh"

no focus target:
  focused = null
  如果之前有 focused node，focusChange.reason = "refresh"
```

这和 For key 语义一致：消失的 node 不保留交互状态。

如果当前 focus 是通过 `focus(id)` 设置的，后续结构更新仍按 mounted node 生命周期处理，不保留“想要聚焦某 id”的长期意图：

```text
focused id remains on same mounted node:
  keep focus

focused id removed:
  move to nearest next focus target

same id later appears as new mounted node:
  不自动恢复 focus
```

## 10. 嵌套 onKey 元素

MVP 允许 key-focus target 嵌套。

示例：

```tsx
<box onKey={true}>
  <text value="Panel" />
  <custom-input onKey={handleInputKey} />
</box>
```

收集规则：

```text
1. 按 MountedNode tree 的深度优先先序遍历收集。
2. 父节点 onKey=true 或 onKey=function 时，父节点进入 focus list。
3. 子节点 onKey=true 或 onKey=function 时，子节点也进入同一个 focus list。
4. 父子都可聚焦时，两者是两个独立 focus target。
5. interaction MVP 不因为父节点可聚焦而屏蔽子节点。
```

事件派发规则：

```text
1. key event 只派发给当前 focused node。
2. 不做 DOM 风格 bubbling。
3. 不做 capture。
4. 不自动向父 key-focus target 回退。
5. 如果当前 focused node 的 handler 不处理，事件返回 handled=false。
```

Tab 顺序示例：

```text
<parent onKey={true}>
  <child-a onKey={handlerA} />
  <child-b onKey={handlerB} />
</parent>

focus order:
  parent -> child-a -> child-b
```

为什么 MVP 不做 bubbling：

```text
1. 终端 UI 的控件组合可能很自由，冒泡语义容易过早绑定 DOM 模型。
2. focus target 与 key owner 保持一一对应，行为更容易测试。
3. 组合控件可以在 widgets 层自行管理内部子控件。
```

后续如需复杂组合控件，可以再设计：

```text
focus scope
roving focus
event bubbling / capture
composite widget controller
```

这些不进入 interaction MVP。

## 11. Key Event 语义

interaction 直接复用 `@bindtty/terminal` 的 `TerminalKeyEvent`：

```ts
export interface TerminalKeyEvent {
  input: string;
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence?: string;
}
```

常见特殊键通过 `name` 判断：

```text
return / enter:
  event.name === "return"

escape:
  event.name === "escape"

backspace:
  event.name === "backspace"

delete:
  event.name === "delete"

tab:
  event.name === "tab" 或 event.input === "\t"

left / right / up / down:
  event.name === "left" / "right" / "up" / "down"
```

`keyboard.ts` 应提供小工具函数，避免各模块重复写判断：

```ts
isTabKey(event)
isShiftTabKey(event)
isEnterKey(event)
isEscapeKey(event)
isArrowKey(event)
isTextInputKey(event)
```

MVP 中 Tab / Shift+Tab 是 interaction 的 focus traversal 键，不派发给 `onKey`。方向键、Enter、Escape、Backspace、普通字符都属于非 focus traversal key，会派发给当前 focused node 的 handler。

## 12. 与具体 Widget 的边界

`@bindtty/interaction` 不实现具体控件。

它只提供：

```text
1. onKey focus/key 协议。
2. key-focus list。
3. focus traversal。
4. key event dispatch。
5. focus state 查询。
```

具体控件行为属于 `@bindtty/widgets` 或用户扩展包：

```text
button:
  widgets 决定 Enter / Space 是否触发 onPress。
  widgets 决定 disabled 是否让 onKey 变为 false。

input:
  widgets 决定字符输入、Backspace、光标和 onInput 语义。
  input 是否可交互可以通过动态 onKey 控制。

select / checkbox / radio / list:
  widgets 或业务组件把语义行为转换成 onKey handler。
```

interaction 不应该 import `@bindtty/widgets`，也不应该在源码里出现 `button.ts` / `input.ts` 这类具体控件文件。

## 13. 与现有包的适配点

当前代码库已完成 `@bindtty/interaction` 的 shared prop model、包骨架、focus list、key dispatch、App 接入、renderer focused state 可见输出和 interaction e2e。

### 13.1 Shared Prop Model

interaction 落地前，需要先明确 element / component props 的分类。否则样式、焦点控制和业务自定义字段都会混在 `props` 中，后续 layout / renderer / interaction 容易互相误读。

MVP 将 props 分为三类：

```text
style props:
  layout / paint 使用的字段。
  例如 padding、border、color、background、bold。

interaction props:
  interaction 使用的字段。
  例如 id、onKey、onFocusChange。

component custom props:
  自定义组件自己消费的业务字段。
  例如 label、disabled、onPress、placeholder、items。
```

规则：

```text
intrinsic element:
  可以接收 style props + interaction props。
  style props 由 layout / renderer 读取。
  interaction props 由 interaction 读取。

custom component:
  可以定义任意业务 props。
  component custom props 不会自动进入底层 intrinsic element。
  如果需要影响布局、绘制或交互，组件必须显式转发对应 props。
```

示例：

```tsx
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
```

这里：

```text
label / disabled / onPress:
  Button 组件的 custom props。

border / padding:
  转发给 box 的 style props。

id / onKey:
  转发给 box 的 interaction props。
```

跨包消费边界：

```text
@bindtty/jsx-runtime:
  只保留 props，不分类执行逻辑。

@bindtty/runtime:
  解析 BindingValue，维护 mounted.props。

@bindtty/layout:
  只读取 layout props。
  必须忽略 interaction props 和 component custom props。

@bindtty/renderer-terminal:
  只读取 paint props。
  必须忽略 interaction props 和 component custom props。

@bindtty/interaction:
  只读取 interaction props。
  必须忽略 style props 和 component custom props。

@bindtty/widgets / 用户组件:
  负责把 custom props 转换成 intrinsic element 的 style / interaction props。
```

第一版不新增 `style={...}` 对象。样式仍保持扁平 props：

```tsx
<box border padding={1} background="blue" />
<text value="Hi" color="green" bold />
```

原因：

```text
1. 当前 layout / renderer 已按扁平 props 实现。
2. TSX 写法更短，更贴近 TUI 常见 API。
3. 后续如果 style props 增多，可以再引入 style object 或 normalize helper。
```

实现时建议新增共享类型，而不是让每个包各写一份：

```ts
export interface IntrinsicInteractionProps {
  id?: BindingValue<string | number>;
  onKey?: BindingValue<InteractionKeyBinding>;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export interface IntrinsicStyleProps {
  padding?: BindingValue<number>;
  border?: BindingValue<boolean | number>;
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  bold?: BindingValue<boolean>;
}
```

这些类型可以先放在 `@bindtty/vnode` 或 `@bindtty/jsx-runtime` 内部类型中。若后续多个包都需要公开复用，再考虑独立 `@bindtty/props` 或从 `@bindtty/vnode` 导出。

### 13.2 vnode

`@bindtty/vnode` 需要让 element props 能承载 interaction 字段：

```ts
id?: BindingValue<string | number>
onKey?: BindingValue<InteractionKeyBinding>
onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void
```

这些字段应作为通用 element props，而不是某个具体 tag 独有的 widget 行为。

dirty 语义：

```text
id:
  interaction dirty。影响 focus(id) 和 focus restore，不影响 layout / paint。

onKey:
  interaction dirty。动态值变化后需要 refresh focus list。

onFocusChange:
  interaction dirty 或 paint dirty 均可。MVP 可以沿用未知 prop 默认 paint dirty，但 App 必须在 flush 后调用 interaction.refresh。
```

现有 runtime 对未知 prop 的动态变化会默认标记 `paint`，所以第一版不用先扩展 `DirtyKind`。如果后续要避免无意义 repaint，可以再增加 `"interaction"` dirty kind。

### 13.3 jsx-runtime

`@bindtty/jsx-runtime` 的 `JSX.IntrinsicElements` 需要通过共享 base props 暴露：

```ts
interface InteractionElementProps {
  id?: BindingValue<string | number>;
  onKey?: BindingValue<InteractionKeyBinding>;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}
```

然后让 `screen`、`box`、`vstack`、`hstack`、`text`、`button`、`input`、`spacer` 等元素都能接收这些字段。

注意：

```text
1. TSX 的特殊 key 仍只给 <for> 使用。
2. interaction 使用的是普通 prop id，不使用 JSX special key。
3. onKey 是普通 prop，可以是 boolean、function 或 signal。
```

### 13.4 runtime

runtime 需要继续把 `id`、`onKey`、`onFocusChange` 保存在 `MountedElementNode.props` 中。

当动态 `onKey` / `id` 变化：

```text
signal update
  -> mounted.props 更新
  -> runtime flush
  -> App 调用 interaction.refresh(runtime.root)
```

interaction 不直接订阅 signal，也不直接依赖 runtime scheduler。

### 13.5 layout

`@bindtty/layout` 已经会校验 future layout props。实现 interaction 时必须明确把这些字段视为非 layout props：

```text
id
onKey
onFocusChange
```

它们不参与 intrinsic measure、不参与 flow、不参与 rect 计算，也不应该触发 `Unsupported layout prop`。

### 13.6 renderer-terminal

renderer 不应解析 `onKey` 或维护 focus 状态。focus 可见样式通过 option 注入：

```ts
renderer.render(layoutTree, {
  viewport,
  isFocused: (mounted) => interaction.isFocused(mounted)
});
```

`isFocused` 是可选项。未提供时按全部未 focused 处理。

MVP 默认 focused 样式为：renderer 对 focused mounted element 的 layout rect 内 cell 叠加 `inverse: true`。已有 foreground / background / bold 等 paint style 保留，只增加反显。这样 text、box、hstack、vstack 等可接收 `onKey` 的节点都有可见 focus 输出。

### 13.7 app

`bindtty createApp` 已是 runtime / terminal / interaction / renderer 的组合层（`packages/bindtty/src/app.ts`）：

```text
start:
  terminal.start()
  terminal.onResize(handleResize)
  terminal.onKey(handleKey)
  interaction.refresh(runtime.root)
  render()

runtime flush:
  interaction.refresh(runtime.root)
  render()

key:
  interaction.handleKey(event)
  如果 focus 变化或 handler handled，触发 render()

stop/dispose:
  解绑 terminal key listener
  dispose interaction
```

refresh 必须发生在 render 前，这样 renderer 查询 `isFocused` 时读到的是最新 focus 状态。

### 13.8 terminal

terminal 已经提供 `TerminalKeyEvent` 和 `TerminalHost.onKey()`，interaction 只消费这些类型，不反向依赖 terminal lifecycle。

## 14. 与 App 的接口

`bindtty createApp` 已接入 interaction（`packages/bindtty/src/app.ts`）。

App 内部流程：

```ts
const runtime = createRuntimeRoot(view);
const renderer = createTerminalRenderer();
const interaction = createInteractionController();
```

启动：

```text
app.start()
  terminal.start()
  terminal.onResize(handleResize)
  terminal.onKey(handleKey)
  interaction.refresh(runtime.root)
  render()
```

runtime flush：

```text
runtime.onFlush(() => {
  interaction.refresh(runtime.root)
  render()
})
```

key：

```text
function handleKey(event) {
  const result = interaction.handleKey(event);
  if (result.dirtyNodes.length > 0) {
    render();
  }
}
```

focus change：

```text
const unsubscribeFocusChange = interaction.onFocusChange((event) => {
  // App 可以转发给 devtools，业务也可以用 listener 更新 signal。
});
```

第一版可以不让 interaction 直接访问 scheduler。App 收到 dirty result 后直接 repaint 即可。业务如果要响应 focus 状态变化，推荐通过 `onFocusChange` listener 更新自己的 signal，再走 runtime flush。

## 15. 与 Renderer 的接口

renderer 需要知道某个 layout node 是否 focused。

推荐方案：RendererOptions 注入状态查询。

```ts
renderer.render(root, {
  viewport,
  isFocused: (mounted) => interaction.isFocused(mounted)
});
```

优点：

```text
1. 不污染 MountedNode。
2. focused 是 interaction 状态，不写入 vnode/runtime。
3. renderer 只读取查询函数。
4. focus 变化会改变 Frame cell style，因此自然通过 renderer diff 产生 repaint patch。
```

`node.state` 留给 widget 内部状态，例如编辑器光标。

## 16. 错误处理

用户 key handler 异常：

```text
onKey throws
  -> interaction.handleKey throws
  -> app key handler throws
```

第一版不吞异常，保持和 runtime component errors 一致。

无 focused node：

```text
handleKey(non-focus-navigation key)
  -> handled = false
```

focused node 没有 handler：

```text
onKey === true
  -> non-navigation key handled=false
```

## 17. 测试计划

### 17.1 interaction 单元测试

```text
createInteractionController exports expected API
onFocusChange subscribes and unsubscribes listeners
node onFocusChange fires with focused=true when node gains focus
node onFocusChange fires with focused=false when node loses focus
node onFocusChange does not make a node focusable without onKey
refresh collects nodes with onKey=true
refresh collects nodes with onKey=function
refresh ignores nodes with onKey=false/null/undefined
static onKey boolean controls focus membership
dynamic onKey boolean controls focus membership after refresh
dynamic onKey handler is used after refresh
entry id uses explicit props.id when present
entry id falls back to internal stable id when props.id is missing
duplicate ids focus the first matching entry in tree order
initial focus chooses first key-focus target
initial focus emits focusChange reason initial
parent and child onKey nodes are both collected
nested onKey nodes follow preorder traversal
Tab moves focus next
Tab emits focusChange reason next
Shift+Tab moves focus previous
Shift+Tab emits focusChange reason previous
Tab is not delivered to focused node onKey in MVP
focus wraps around
focus(id) moves focus to matching entry
focus(id) emits focusChange reason programmatic
focus(node) moves focus to matching mounted node
focus(id) returns unhandled when id is missing
clearFocus clears focused node
clearFocus emits focusChange reason clear
getFocusedId returns current focused entry id
removed focused node moves focus to next available
removed focused node emits focusChange reason refresh
focused node with onKey changing to false moves focus to next available
onKey changing to false emits focusChange reason refresh
programmatic focus does not persist as a long-term id intent after removal
no key-focus targets keeps focus null
focused node onKey receives non-navigation key events
onKey returning true marks handled
onKey returning false or undefined marks unhandled
onKey=true receives focus but has no handler
unhandled child onKey does not bubble to parent
dispose clears references and ignores later key events
```

### 17.2 App 集成测试

```text
terminal key events reach interaction
Tab changes focused state and repaints
Enter reaches focused node onKey
dynamic onKey=false removes node from focus list after runtime flush
stop unsubscribes terminal key listener
restart restores key listener and focus refresh
dispose removes key listener and interaction state
```

### 17.3 E2E 测试

```text
TSX app has at least two nodes with onKey
Tab switches focus
Enter reaches second focused node onKey
onKey callback updates signal
signal update renders visible result
dispose prevents further key dispatch
```

## 18. 分阶段落地

### 阶段 1：Shared Prop Model

```text
1. 明确 style props / interaction props / component custom props 三类边界。
2. 在 JSX intrinsic element 类型中引入共享 base props。
3. vnode schema 接受通用 interaction props。
4. layout 明确忽略 id / onKey / onFocusChange。
5. renderer 明确忽略 id / onKey / onFocusChange，并为 isFocused option 预留类型。
6. 补充 TSX 类型测试和 layout / renderer 忽略 interaction props 的测试。
```

验收：

```text
<box id="x" onKey={true} border padding={1} /> 类型通过。
layoutRoot 遇到 id / onKey / onFocusChange 不报 Unsupported layout prop。
renderer 遇到 id / onKey / onFocusChange 不改变 paint 结果。
custom component props 不会自动进入 intrinsic element，必须显式转发。
```

### 阶段 2：空包与类型

状态：已完成。

```text
1. 新建 packages/interaction。
2. 导出 InteractionController / InteractionResult / InteractionKeyHandler / InteractionFocusChangeEvent / InteractionNodeFocusChangeEvent 类型。
3. 实现 createInteractionController。
4. 添加基础构建和导出测试。
```

验收：

```text
npm test --workspace @bindtty/interaction
```

### 阶段 3：Focus List

状态：已完成。

```text
1. 从 MountedNode tree 收集 onKey=true / onKey=function entries。
2. 支持静态 onKey boolean。
3. 支持静态 onKey function。
4. 支持动态 BindingValue onKey。
5. 支持 initial focus。
6. 支持嵌套 onKey 元素，并按树序收集父子 focus target。
7. 支持 explicit id 和内部临时 id。
8. refresh 后保留仍存在且仍可聚焦的 focus。
9. 支持 focusNext / focusPrevious。
10. 支持 focus(id)、focus(node)、getFocusedId 和 clearFocus。
11. 支持 onFocusChange 订阅和 focusChange reason。
12. 支持节点级 onFocusChange。
```

验收：

```text
focus traversal 单元测试通过。
```

### 阶段 4：Key Dispatch

状态：已完成。

```text
1. Tab / Shift+Tab 移动 focus。
2. 非导航键派发给当前 focused node handler。
3. onKey=true 无 handler，返回 handled=false。
4. handler 返回 true 时 handled=true。
5. handler 返回 false / undefined 时 handled=false。
6. 不做 bubbling / capture。
```

验收：

```text
key dispatch 单元测试通过。
```

### 阶段 5：App 接入

状态：已完成。

```text
1. createApp 创建 interaction controller。
2. terminal.onKey 接入 interaction.handleKey。
3. runtime flush 后 interaction.refresh。
4. key dispatch 或 focus 变化后 repaint。
5. stop / dispose 清理 key listener 和 interaction。
```

验收：

```text
bindtty app key integration tests 通过。
```

### 阶段 6：Renderer focused state

状态：已完成。

```text
1. renderer render options 支持 isFocused。
2. focused 状态有可见输出。
3. focus 变化产生 repaint。
```

验收：

```text
renderer focused paint tests 通过。
```

### 阶段 7：E2E 交互测试

状态：已完成。

```text
1. e2e TSX app 使用两个 onKey 节点。
2. fake stdin 发送 Tab / Enter。
3. onKey callback 更新 signal。
4. fake stdout 可见输出变化。
```

验收：

```text
npm test --workspace @bindtty/e2e
npm test
```

## 19. MVP 判断标准

`@bindtty/interaction` MVP 完成标准：

```text
1. 独立包可构建、可测试。
2. App 能把 TerminalKeyEvent 交给 interaction。
3. onKey=true / onKey=function 节点可进入 focus list。
4. onKey 支持静态值和动态 BindingValue。
5. Tab / Shift+Tab 可切换 focus。
6. controller 支持 focus id、focus node、getFocusedId 和 clearFocus。
7. controller 支持 onFocusChange 和 focusChange reason。
8. 节点级 onFocusChange 可用于组件根据自身 focus 状态更新样式。
9. 非导航键可派发给当前 focused node 的 onKey function。
10. focus 变化能触发 repaint。
11. stop / dispose 不泄漏 key listener。
12. e2e 覆盖真实 TSX + createApp + createNodeTerminal + key dispatch。
```

不纳入 MVP：

```text
1. 具体 button / input / select 控件实现。
2. 独立的 onFocus / onBlur。
3. autoFocus。
4. mounted lifecycle hook。
5. mouse。
6. paste。
7. IME preedit。
8. selection。
9. nested focus scopes。
10. roving focus。
11. event bubbling / capture。
12. command mode / global shortcuts。
13. React-style hooks。
```

## 20. 与 Hooks 的关系

BindTTY 当前不采用 hooks 作为主模型。

Ink 中 `useInput / useFocus / useApp` 承担的职责，在 BindTTY 中拆分为：

| Ink hooks | BindTTY 对应 |
| --- | --- |
| `useInput` | focused node 的 `onKey` |
| `useFocus` | interaction focused state + renderer isFocused 查询 |
| `useFocusManager` | InteractionController |
| `useApp` | createApp 返回的 lifecycle controller |
| `useWindowSize` | TerminalHost.viewport + app resize |
| `useState` | `createSignal` |
| `useMemo` | `computed` |

未来可以在上层补 hooks 风格适配层，但它不应该阻塞 interaction MVP。
