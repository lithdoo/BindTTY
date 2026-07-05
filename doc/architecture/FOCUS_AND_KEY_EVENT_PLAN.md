# Focus 与 Key Event 传播计划

> 类型：architecture / implementation plan  
> 状态：draft  
> 目标阶段：post-MVP / alpha hardening  
> 相关包：`@bindtty/interaction`、`@bindtty/vnode`、`@bindtty/jsx-runtime`、`@bindtty/runtime`、`@bindtty/renderer-terminal`、`@bindtty/widgets`、`bindtty`

## 1. 背景

当前 `@bindtty/interaction` 的 MVP 模型把 `onKey` 同时作为：

```text
onKey === true / function
  -> 节点进入 focus list
  -> 节点可以获得 focus
  -> 当前 focused node 接收 key event
```

这个模型适合 MVP，但在嵌套组件中会产生组合问题：

```tsx
<Modal onKey={escapeClose}>
  <Form onKey={enterSubmit}>
    <ScrollView onKey={arrowScroll}>
      <TextInput />
    </ScrollView>
  </Form>
</Modal>
```

期望语义是：

```text
TextInput 处理文本编辑键；
TextInput 未处理的方向键可以冒泡给 ScrollView；
TextInput 未处理的 Enter 可以冒泡给 Form；
Escape 可以被 Modal 捕获；
父节点可以感知子孙节点 hasFocusWithin 状态。
```

现有模型无法自然表达这些行为，因为：

1. `onKey` 同时表示“可聚焦”和“监听键盘事件”。
2. 父容器如果想监听子节点事件，就必须也变成 Tab focus target。
3. key event 只派发给当前 focused node，不会冒泡到父节点。
4. 没有 capture 阶段，Modal / Overlay 这类边界组件难以优先处理 Escape。
5. renderer / ref 层缺少 `hasFocusWithin` 语义。

## 2. 目标

新的 interaction 设计采用混合模型：

```text
focus traversal:
  使用 focus list 管理，用于 Tab / Shift+Tab / focusNext / focusPrevious。

key event dispatch:
  使用 focused path 传播，用于 capture / target / bubble。

focus state:
  支持 isFocused 与 hasFocusWithin。
```

一句话：

```text
Focus 导航使用列表；Key 事件沿当前 focused target 的 mounted ancestor path 传播。
```

## 3. 非目标

本阶段不实现：

```text
tabIndex
autoFocus
onFocusWithinChange
focusWithinStyle
focusScope / trapFocus
roving focus
Modal / Overlay 系统
鼠标事件与 hit testing
IME preedit / candidate window
portal / z-index / floating layer
完整 DOM Event API
```

这些能力可以作为 future extension，但不进入本次事件模型改造。

## 4. 设计原则

### 4.1 解耦 focusable 与 key listener

新增明确的 `focusable` prop：

```text
focusable:
  控制节点是否进入 focus list。

onKey / onKeyCapture:
  控制节点是否监听 key event。
```

`onKey` 不应长期承担 focusable marker 的职责。

### 4.2 保留 focus list

Tab 顺序仍由 mounted tree 的 DFS preorder 生成：

```text
focus list:
  [entryA, entryB, entryC]
```

原因：

```text
1. TUI 的 focus traversal 本质上是列表问题。
2. Tab / Shift+Tab / focusNext / focusPrevious 需要稳定顺序。
3. 后续 focusScope 可以把 focus list 分割成 scope-local list。
```

### 4.3 引入 focused path

每个 focus entry 保存从 root 到 target 的 element path：

```text
root
  └─ Modal
      └─ Form
          └─ ScrollView
              └─ TextInput  <- focused target

focusedPath:
  [root, Modal, Form, ScrollView, TextInput]
```

key event 基于这个 path 派发。

### 4.4 Key event 三阶段传播

```text
capture:
  root -> ... -> parent

target:
  focused target

bubble:
  parent -> ... -> root

default action:
  Tab / Shift+Tab focus traversal
```

### 4.5 Tab 是 default action

Tab / Shift+Tab 不应在 dispatch 前硬拦截。

新的顺序是：

```text
1. 先把 Tab 作为普通 key event 派发。
2. 如果没有 preventDefault()，再执行 focusNext / focusPrevious。
```

这样 TextInput、Select、Modal、未来 FocusScope 可以阻止 Tab 默认行为。

### 4.6 兼容旧 API

短期保留旧规则：

```text
如果 focusable 未显式设置：
  onKey === true / function 仍隐式表示 focusable=true。
```

长期目标：

```text
onKey 不再隐式创建 focus target。
组件必须显式声明 focusable。
```

## 5. 用户侧公开接口

### 5.1 Element interaction props

第一阶段只新增必要接口：

```ts
export interface IntrinsicInteractionProps {
  id?: BindingValue<string | number>;

  focusable?: BindingValue<boolean>;

  onKeyCapture?: BindingValue<InteractionKeyBinding>;
  onKey?: BindingValue<InteractionKeyBinding>;

  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}
```

暂不加入：

```ts
// Future only. Do not implement in this phase.
tabIndex?: BindingValue<0 | -1>;
autoFocus?: BindingValue<boolean>;
onFocusWithinChange?: (event: InteractionFocusWithinChangeEvent) => void;
focusWithinStyle?: unknown;
```

### 5.2 ElementHandle

`MountedElementNode` 是 runtime 内部对象，不应作为用户稳定 API 暴露。

用户侧通过受控句柄操作元素：

```ts
export interface ElementHandle<TLayout = unknown> {
  readonly tag: IntrinsicElementTag;
  readonly id: string | number | undefined;

  getProp(name: string): unknown;
  getLayout(): TLayout | null;

  focus(): boolean;
  blur(): boolean;
  isFocused(): boolean;
  hasFocusWithin(): boolean;

  onMounted?: () => void;
  onLayout?: (layout: TLayout) => void;
  onUnmount?: () => void;
}
```

`ElementHandle` 可以继续使用现有 `MountedElementApi` 名称实现，但文档中建议称为 `ElementHandle`，以区别内部的 `MountedElementNode`。

### 5.3 Key event

新事件对象不直接暴露 `MountedElementNode`，而暴露 `ElementHandle`：

```ts
export interface BindTTYKeyEvent {
  input: string;
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence?: string;

  target: ElementHandle;
  currentTarget: ElementHandle;
  phase: "capture" | "target" | "bubble";

  defaultPrevented: boolean;
  propagationStopped: boolean;

  preventDefault(): void;
  stopPropagation(): void;
}
```

handler 类型：

```ts
export type InteractionKeyHandler = (
  event: BindTTYKeyEvent
) => boolean | void;
```

兼容旧 handler 时，runtime 可以继续传第二参数，但文档不再鼓励依赖它：

```ts
// Legacy compatibility only.
handler(event, legacyContext);
```

### 5.4 Handler 返回值兼容

```text
return true:
  legacy shorthand。
  等价于：
    event.preventDefault()
    event.stopPropagation()

return false / undefined:
  不消费事件，继续传播。
```

推荐新代码显式使用：

```ts
event.preventDefault();
event.stopPropagation();
```

## 6. 内部接口与边界

### 6.1 MountedElementNode

`MountedElementNode` 只作为内部实现类型：

```text
@bindtty/runtime
@bindtty/interaction
@bindtty/layout
@bindtty/renderer-terminal
```

用户侧不应直接获得 `MountedElementNode`，因为它包含可变 runtime 状态：

```text
props
propSources
bindings
children
state
dirty
dispose()
api
```

直接暴露会允许用户绕过 binding、dirty marking、scheduler、lifecycle、layout invalidation、interaction refresh 和 renderer diff。

### 6.2 FocusEntry

内部 focus entry：

```ts
interface FocusEntry {
  id: string;
  node: MountedElementNode;
  order: number;
  path: MountedElementNode[];
}
```

`path` 仅内部使用，不作为公开 API 暴露。

不公开：

```ts
getFocusedPath(): MountedElementNode[];
```

公开状态查询应使用：

```ts
isFocused(target: string | ElementHandle): boolean;
hasFocusWithin(target: string | ElementHandle): boolean;
```

### 6.3 FocusState

```ts
interface FocusState {
  entry: FocusEntry | null;
  previousOrder: number | null;
  focusedPath: MountedElementNode[];
}
```

`focusedPath` 用于：

```text
1. key event dispatch。
2. hasFocusWithin 查询。
3. focus dirty 计算。
```

## 7. Controller API 调整

内部 controller 可以继续使用 node-oriented API。

用户侧或 ref-facing API 应使用 id / handle：

```ts
interface InteractionController {
  refresh(root: MountedNode | null): InteractionResult;
  handleKey(event: TerminalKeyEvent): InteractionResult;

  focus(target: string | ElementHandle): InteractionResult;
  focusNext(): InteractionResult;
  focusPrevious(): InteractionResult;
  clearFocus(): InteractionResult;

  getFocusedId(): string | null;
  getFocusedElement(): ElementHandle | null;

  isFocused(target: string | ElementHandle): boolean;
  hasFocusWithin(target: string | ElementHandle): boolean;

  onFocusChange(listener: InteractionFocusChangeListener): () => void;
  dispose(): void;
}
```

内部可以保留：

```ts
focusNode(node: MountedElementNode): InteractionResult;
isFocusedNode(node: MountedNode): boolean;
hasFocusWithinNode(node: MountedNode): boolean;
```

但这些不应成为用户文档中的稳定 API。

## 8. Focus 收集规则

### 8.1 DFS 收集

继续使用 mounted tree DFS preorder。

伪代码：

```ts
function collectEntries(root: MountedNode | null): FocusEntry[] {
  const entries: FocusEntry[] = [];
  const path: MountedElementNode[] = [];
  let order = 0;

  function visit(node: MountedNode | null): void {
    if (!node) {
      return;
    }

    if (node.kind === "element") {
      path.push(node);

      if (isFocusable(node)) {
        entries.push({
          id: getEntryId(node),
          node,
          order,
          path: [...path]
        });
      }

      order += 1;

      for (const child of node.children) {
        visit(child);
      }

      path.pop();
      return;
    }

    if (node.kind === "fragment") {
      for (const child of node.children) {
        visit(child);
      }
      return;
    }

    if (node.kind === "show") {
      visit(node.activeBranch);
      return;
    }

    if (node.kind === "for") {
      for (const item of node.items) {
        visit(item.node);
      }
      return;
    }
  }

  visit(root);
  return entries;
}
```

### 8.2 isFocusable

第一阶段兼容旧语义：

```ts
function isFocusable(node: MountedElementNode): boolean {
  const explicit = node.props.focusable;

  if (explicit !== undefined) {
    return explicit === true;
  }

  const onKey = node.props.onKey;
  return onKey === true || typeof onKey === "function";
}
```

第二阶段可切换为严格语义：

```ts
function isFocusable(node: MountedElementNode): boolean {
  return node.props.focusable === true;
}
```

## 9. Key event 派发规则

### 9.1 总流程

```text
TerminalKeyEvent
  -> InteractionController.handleKey()
  -> create BindTTYKeyEvent
  -> dispatch capture
  -> dispatch target
  -> dispatch bubble
  -> run default action if not defaultPrevented
  -> return InteractionResult
```

### 9.2 Capture phase

```text
root -> ... -> parent
```

调用每个节点的：

```ts
node.props.onKeyCapture
```

### 9.3 Target phase

```text
focused target
```

调用：

```ts
target.props.onKey
```

### 9.4 Bubble phase

```text
parent -> ... -> root
```

调用每个父节点的：

```ts
node.props.onKey
```

### 9.5 Default action

第一阶段 default action：

```text
Tab:
  focusNext()

Shift+Tab:
  focusPrevious()
```

只有在以下条件满足时执行：

```text
event.defaultPrevented === false
```

## 10. Focus 状态查询

Controller / ElementHandle 支持：

```ts
isFocused(): boolean;
hasFocusWithin(): boolean;
```

语义：

```text
isFocused:
  当前节点就是 focused target。

hasFocusWithin:
  当前节点在 focusedPath 中。
```

## 11. Dirty 规则

当前 focus change dirty 只包含 previous focused node 与 current focused node。

新模型需要包含：

```text
previousPath ∪ nextPath
```

原因：

```text
1. 父节点的 hasFocusWithin 状态可能变化。
2. ref / renderer / widgets 可能查询 hasFocusWithin。
3. 后续 focusWithinStyle 或 onFocusWithinChange 可以复用该 dirty 规则。
```

算法：

```ts
function collectFocusDirtyNodes(
  previousPath: MountedElementNode[],
  nextPath: MountedElementNode[]
): MountedNode[] {
  return unique([...previousPath, ...nextPath]);
}
```

## 12. Ref API 用于 programmatic focus

不提供 `autoFocus` prop。

用户通过 ref 显式控制 focus：

```tsx
<TextInput
  id="name"
  focusable
  ref={(api) => {
    api.onMounted = () => {
      api.focus();
    };
  }}
/>
```

也可以用于 submit 后跳转：

```tsx
<TextInput
  id="name"
  focusable
  onKey={(event) => {
    if (event.name === "return") {
      passwordRef?.focus();
      return true;
    }
  }}
/>
```

## 13. Renderer 适配

第一阶段只新增查询能力，不新增 `focusWithinStyle`。

renderer options 可扩展：

```ts
interface PaintOptions {
  viewport: LayoutViewport;
  isFocused?: (mounted: LayoutNode["mounted"]) => boolean;
  hasFocusWithin?: (mounted: LayoutNode["mounted"]) => boolean;
}
```

但 paint 行为第一阶段可以保持不变：

```text
focusStyle:
  只在 isFocused=true 时应用。

focusWithinStyle:
  future extension。
```

## 14. Layout / schema / JSX 适配

### 14.1 `@bindtty/vnode`

在 `commonElementProps` 中加入：

```ts
focusable: { dirty: "paint" },
onKeyCapture: { dirty: "paint" }
```

暂不加入：

```ts
tabIndex
autoFocus
onFocusWithinChange
focusWithinStyle
```

### 14.2 `@bindtty/jsx-runtime`

在 `IntrinsicInteractionProps` 中加入：

```ts
focusable?: BindingValue<boolean>;
onKeyCapture?: BindingValue<InteractionKeyBinding>;
```

### 14.3 `@bindtty/layout`

interaction props 不应被 layout 消费。

将以下 prop 加入 non-layout props：

```text
focusable
onKeyCapture
```

保留已有：

```text
id
focusStyle
onKey
onFocusChange
```

## 15. Widgets 迁移

### 15.1 Button

Button 是 leaf interactive widget，默认进入 Tab 顺序：

```ts
elementTemplate("box", {
  focusable: props.focusable ?? true,
  onKey: createButtonOnKey(props),
  ...
});
```

Enter / Space 后 `return true`，兼容语义下表示 `preventDefault + stopPropagation`。

### 15.2 Checkbox

与 Button 相同：

```ts
focusable: props.focusable ?? true
onKey: createCheckboxOnKey(props)
```

### 15.3 TextInput

TextInput 外层 `box` 显式声明：

```ts
focusable: props.focusable ?? true
onKey: createTextInputOnKey(props, cursor)
```

建议调整 Enter 行为：

```ts
if (isEnterKey(event)) {
  if (props.onSubmit) {
    props.onSubmit(value);
    return true;
  }

  return false;
}
```

这样 TextInput 未声明 `onSubmit` 时，Enter 可以冒泡给 Form。

### 15.4 Select

Select 继续作为单一 focus target 管理内部选中状态：

```ts
focusable: props.focusable ?? true
onKey: createSelectOnKey(...)
```

内部 option rows 不进入 focus list。

### 15.5 ScrollView / List

ScrollView 支持两种模式。

模式 A：自身是 focus target：

```tsx
<ScrollView
  focusable
  height={10}
  offsetY={offset}
  onOffsetYChange={setOffset}
/>
```

模式 B：只是 bubble container：

```tsx
<ScrollView
  focusable={false}
  height={10}
  offsetY={offset}
  onOffsetYChange={setOffset}
>
  <TextInput />
</ScrollView>
```

当 TextInput focused 时：

```text
TextInput 不处理 Up/Down
  -> 事件冒泡到 ScrollView
  -> ScrollView 滚动
```

兼容建议：

```text
ScrollView 默认 focusable=true。
用户需要纯容器时显式 focusable=false。
```

List 基于 VScrollView，可沿用同样策略。

## 16. 父容器组件模式

### 16.1 Form

Form 不进入 focus list，只接收 bubble：

```tsx
<box
  focusable={false}
  onKey={(event) => {
    if (event.name === "return") {
      submit();
      event.preventDefault();
      event.stopPropagation();
    }
  }}
>
  {children}
</box>
```

### 16.2 Modal

Modal 不进入 focus list，通常使用 capture：

```tsx
<box
  focusable={false}
  onKeyCapture={(event) => {
    if (event.name === "escape") {
      close();
      event.preventDefault();
      event.stopPropagation();
    }
  }}
>
  {children}
</box>
```

### 16.3 Panel

Panel 有两种模式：

```tsx
<Panel focusable>
  自己可聚焦，可处理方向键或快捷键
</Panel>
```

```tsx
<Panel focusable={false} onKey={handleBubble}>
  不进入 Tab 顺序，只处理子节点未消费事件
</Panel>
```

## 17. 分阶段落地

### Phase 1：类型与 schema 准备

目标：新增必要 props，但保持旧行为不变。

任务：

```text
1. 更新 @bindtty/interaction/types.ts。
2. 更新 @bindtty/jsx-runtime IntrinsicInteractionProps。
3. 更新 @bindtty/vnode commonElementProps。
4. 更新 @bindtty/layout nonLayoutProps。
5. 补类型测试。
```

验收：

```tsx
<box focusable />
<box focusable={false} onKey={handler} />
<box onKeyCapture={handler} />
```

均可类型通过，layout 不报 unsupported prop。

### Phase 2：ElementHandle focus API

目标：让 ref 能承载 programmatic focus。

任务：

```text
1. 扩展 MountedElementApi / ElementHandle。
2. 增加 focus()。
3. 增加 blur()。
4. 增加 isFocused()。
5. 增加 hasFocusWithin()。
6. 建立 ElementHandle -> MountedElementNode 的内部映射。
```

验收：

```text
1. ref api.focus() 可以聚焦当前元素。
2. ref api.blur() 可以清除当前元素 focus。
3. api.isFocused() 与 controller 状态一致。
4. api.hasFocusWithin() 与 focusedPath 状态一致。
```

### Phase 3：FocusEntry path

目标：保持 focus list 行为不变，但内部 entry 增加 path。

任务：

```text
1. collectEntries 维护 elementPath stack。
2. FocusEntry 增加 path。
3. FocusState 增加 focusedPath。
4. setFocusedEntry 更新 focusedPath。
5. 保持当前 Tab / focusNext / focusPrevious 测试通过。
```

验收：

```text
1. 原有 interaction 测试通过。
2. 嵌套节点 focused 时，内部 path 正确包含 ancestors。
3. 不公开 getFocusedPath()。
```

### Phase 4：hasFocusWithin

目标：支持父节点 focusWithin 状态查询。

任务：

```text
1. InteractionController 增加内部 hasFocusWithinNode(node)。
2. ElementHandle 增加 hasFocusWithin()。
3. focus change dirtyNodes 改为 previousPath ∪ nextPath。
4. createApp 可将 hasFocusWithin 传给 renderer。
```

验收：

```text
1. 子节点 focus 时，父节点 hasFocusWithin=true。
2. focus 离开子树时，父节点 hasFocusWithin=false。
3. dirtyNodes 包含相关 ancestors。
```

### Phase 5：Key bubbling / capture

目标：实现三阶段 key event dispatch。

任务：

```text
1. 新增 BindTTYKeyEvent。
2. handleKey 不再提前拦截 Tab。
3. dispatch capture。
4. dispatch target。
5. dispatch bubble。
6. 未 preventDefault 时执行 Tab default action。
7. legacy return true 映射为 preventDefault + stopPropagation。
```

验收：

```text
1. TextInput 未处理 Enter 时，Form onKey 可收到。
2. TextInput 处理 Backspace 后，Form 不收到。
3. Modal onKeyCapture 可优先处理 Escape。
4. ScrollView focusable=false 时可接收子节点未消费方向键。
5. Tab 默认仍能切换 focus。
6. 子节点 preventDefault 后 Tab 不切 focus。
```

### Phase 6：Widgets 迁移

目标：官方 widgets 显式声明 focusability。

任务：

```text
1. Button 增加 focusable prop，默认 true。
2. Checkbox 增加 focusable prop，默认 true。
3. TextInput 增加 focusable prop，默认 true。
4. Select 增加 focusable prop，默认 true。
5. ScrollView / VScrollView / HScrollView / List 增加 focusable prop。
6. TextInput Enter 无 onSubmit 时返回 false。
```

验收：

```text
1. 现有 Button / TextInput / ScrollView / List E2E 继续通过。
2. 新增 Form + TextInput Enter bubbling E2E。
3. 新增 ScrollView containing TextInput arrow bubbling E2E。
```

### Phase 7：文档更新

目标：替换 MVP onKey-only 叙述。

任务：

```text
1. 更新 doc/packages/INTERACTION.md。
2. 将本文加入 architecture 文档索引。
3. 更新 widgets 文档中的 focusable 说明。
4. 更新 examples：Form / Modal / nested ScrollView 示例。
```

## 18. 测试计划

### 18.1 Unit tests：interaction

新增测试：

```text
1. focusable=true 进入 focus list。
2. focusable=false + onKey 不进入 focus list。
3. 旧行为兼容：未设置 focusable 时 onKey=function 仍进入 focus list。
4. focusedPath 内部状态正确。
5. hasFocusWithin 正确。
6. capture 顺序 root -> parent。
7. bubble 顺序 parent -> root。
8. target handler 先于 bubble。
9. stopPropagation 阻止后续传播。
10. preventDefault 阻止 Tab 默认 focus traversal。
11. return true 兼容为消费并停止传播。
12. onKeyCapture 可以处理 Tab。
13. refresh 后保留 focusedPath。
14. focused node unmount 后迁移 focus。
15. focus dirty 包含 ancestors。
```

### 18.2 Unit tests：ref / ElementHandle

新增测试：

```text
1. ref.focus() 可以聚焦当前元素。
2. ref.blur() 可以清除 focus。
3. ref.isFocused() 返回正确状态。
4. ref.hasFocusWithin() 返回正确状态。
5. unmounted handle 调用 focus() 返回 false。
```

### 18.3 Unit tests：widgets

新增测试：

```text
1. Button 默认 focusable。
2. TextInput 默认 focusable。
3. TextInput 无 onSubmit 时 Enter 冒泡。
4. TextInput 有 onSubmit 时 Enter 不冒泡。
5. ScrollView focusable=false 时不进入 Tab 顺序。
6. ScrollView 可以接收子节点未消费方向键。
```

### 18.4 E2E tests

新增 mock E2E：

```text
1. Form + TextInput：
   输入文本后按 Enter，Form submit marker 更新。

2. Modal + TextInput：
   TextInput focused 时按 Escape，Modal close marker 更新。

3. ScrollView + TextInput：
   TextInput focused 时按 Down；
   TextInput 不处理 Down；
   ScrollView offset 增加。

4. Tab preventDefault：
   focused node onKey 处理 Tab 并 preventDefault；
   focus 不移动。

5. hasFocusWithin：
   子节点 focus 时，父 handle hasFocusWithin() 为 true。
```

## 19. 兼容策略

### 19.1 短期兼容

保持：

```text
未显式设置 focusable 时：
  onKey=true/function 仍表示 focusable=true。
```

这保证现有代码继续工作。

### 19.2 文档提示

文档中标注：

```text
onKey 隐式 focusable 是 legacy compatibility。
新代码应显式写 focusable。
```

### 19.3 长期切换

未来 beta 前可考虑 breaking change：

```text
onKey 不再隐式 focusable。
所有官方 widgets 显式设置 focusable。
用户代码如需 Tab stop，必须写 focusable。
```

也可以保留 legacy 行为直到 1.0，避免过早破坏应用代码。

## 20. 风险

### 20.1 冒泡可能引入重复处理

例如 Button 在 Form 内：

```text
Button Enter
  -> Button onPress
  -> Form submit
```

解决：

```text
legacy return true = preventDefault + stopPropagation
```

### 20.2 Tab 行为变化

当前 Tab 不派发给 handler。新模型中 Tab 会先派发，再作为 default action。

解决：

```text
1. 增加测试。
2. 文档说明。
3. 对旧 handler return true 做兼容。
```

### 20.3 dirty 范围扩大

focus change dirty 从两个节点扩大到 path union。

影响：

```text
轻微增加 repaint 范围。
```

可接受，因为 terminal frame diff 仍会控制实际输出 patch。

### 20.4 API 面积扩大

本计划刻意不加入 `tabIndex`、`autoFocus`、`onFocusWithinChange`、`focusWithinStyle`、`focusScope`、`trapFocus`，以控制 alpha 阶段 API 面积。

## 21. Future extensions

本计划完成后，可以继续设计：

```text
tabIndex
autoFocus sugar
onFocusWithinChange
focusWithinStyle
focusScope
trapFocus
roving focus
Modal / Overlay
Select popup
global shortcut layer
mouse event target + bubbling
paste event
```

## 22. 最终目标语义

```text
focusable:
  决定节点是否进入 focus list。

focusedPath:
  当前 focused target 到 root 的 mounted element path。
  仅内部使用，不公开 MountedElementNode[]。

onKeyCapture:
  root -> parent 捕获。

onKey:
  target + parent -> root 冒泡。

preventDefault:
  阻止默认行为，例如 Tab focus traversal。

stopPropagation:
  阻止继续传播给后续节点。

ElementHandle:
  用户侧 ref / event target / focus handle。

MountedElementNode:
  runtime internal，不作为用户稳定 API。

isFocused:
  当前元素就是 focused target。

hasFocusWithin:
  当前元素在 focusedPath 中。
```

## 23. 一句话总结

BindTTY 应从 MVP 的 `onKey-only focus model` 升级为：

```text
Focus list for traversal,
focused path for key event propagation,
ElementHandle for user-facing imperative control.
```

这能保留 TUI 中简单直接的 Tab 顺序，同时让 Form、Modal、ScrollView、TextInput 等嵌套组件具备自然组合能力，并避免把 `MountedElementNode` 这类 runtime 内部对象暴露给用户。
