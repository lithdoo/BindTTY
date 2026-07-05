# Focus 与 Key Event 传播计划

> 类型：architecture / implementation plan
> 状态：implemented
> 目标阶段：post-MVP / alpha hardening
> 相关包：`@bindtty/interaction`、`@bindtty/vnode`、`@bindtty/jsx-runtime`、`@bindtty/runtime`、`@bindtty/widgets`、`bindtty`

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
Escape 可以被 Modal 捕获。
```

现有模型无法自然表达这些行为，因为：

1. `onKey` 同时表示“可聚焦”和“监听键盘事件”。
2. 父容器如果想监听子节点事件，就必须也变成 Tab focus target。
3. key event 只派发给当前 focused node，不会冒泡到父节点。
4. 没有 capture 阶段，Modal 这类边界组件难以优先处理 Escape。

## 2. 目标

新的 interaction 设计采用混合模型：

```text
focus traversal:
  使用 focus list 管理，用于 Tab / Shift+Tab / focusNext / focusPrevious。

key event dispatch:
  使用 focused path 传播，用于 capture / target / bubble。
```

一句话：

```text
Focus 导航使用列表；
Key 事件沿当前 focused target 的 mounted ancestor path 传播。
```

本计划只解决：

```text
1. focusable 与 onKey 解耦。
2. onKeyCapture / onKey 三阶段派发。
3. return true 表示 handled。
4. stopPropagation() 停止传播。
5. unhandled key 交给 interaction fallback。
```

## 3. 设计原则

### 3.1 解耦 focusable 与 key listener

新增明确的 `focusable` prop：

```text
focusable:
  控制节点是否进入 focus list。

onKey / onKeyCapture:
  控制节点是否监听 key event。
```

`onKey` 不应长期承担 focusable marker 的职责。

### 3.2 保留 focus list

Tab 顺序仍由 mounted tree 的 DFS preorder 生成：

```text
focus list:
  [entryA, entryB, entryC]
```

原因：

```text
1. TUI 的 focus traversal 本质上是列表问题。
2. Tab / Shift+Tab / focusNext / focusPrevious 需要稳定顺序。
3. 嵌套结构不应该破坏线性的键盘导航顺序。
```

### 3.3 引入 focused path，但不公开

每个 focus entry 内部保存从 root 到 target 的 element path：

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

注意：

```text
focusedPath 是 interaction 内部实现细节；
不公开 getFocusedPath()；
不公开 MountedElementNode[]；
不在 key event 中暴露 target/currentTarget。
```

### 3.4 Key event 三阶段传播

```text
capture:
  root -> ... -> parent

target:
  focused target

bubble:
  parent -> ... -> root

fallback:
  如果没有任何 handler 处理该 key，则由 interaction controller 处理。
```

### 3.5 Tab 是 fallback，不是元素默认行为

BindTTY 当前没有浏览器意义上的元素默认行为。

Tab / Shift+Tab 是 interaction controller 的 fallback 行为：

```text
1. 先把 Tab 作为普通 key event 派发。
2. 如果没有任何 handler return true，则执行 focusNext / focusPrevious。
```

这样 TextInput、Select、Modal 可以通过 `return true` 阻止 Tab fallback。

### 3.6 兼容旧 API

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

## 4. 用户侧公开接口

### 4.1 Element interaction props

只新增必要接口：

```ts
export interface IntrinsicInteractionProps {
  id?: BindingValue<string | number>;

  focusable?: BindingValue<boolean>;

  onKeyCapture?: BindingValue<InteractionKeyListener>;
  onKey?: BindingValue<InteractionKeyBinding>;

  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}
```

`InteractionKeyListener` 为 handler / null / undefined，不含 `boolean` legacy shorthand；`onKey` 仍保留 `boolean`。

### 4.2 Key event

事件对象只暴露键盘信息、传播阶段和传播控制：

```ts
export type KeyEventPhase = "capture" | "target" | "bubble";

export interface BindTTYKeyEvent {
  input: string;
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence?: string;

  phase: KeyEventPhase;

  propagationStopped: boolean;

  stopPropagation(): void;
}
```

事件对象不暴露当前节点、目标节点或内部 mounted node。

原因：

```text
1. key event target 永远是当前 focused node，第一版不需要用户读取它。
2. handler 挂在哪个元素上，可以通过闭包表达业务上下文。
3. 不暴露节点对象可以避免泄漏 runtime 内部结构。
4. 保持事件对象小而稳定。
```

### 4.3 Handler 类型

```ts
export type InteractionKeyHandler = (
  event: BindTTYKeyEvent
) => boolean | void;
```

### 4.4 Handler 返回值语义

```text
return true:
  表示事件已处理。
  停止后续传播。
  interaction 不再执行 fallback key action。

return false / undefined:
  表示当前 handler 未处理。
  如果没有 stopPropagation，则继续传播。
```

### 4.5 stopPropagation 语义

```text
event.stopPropagation():
  停止继续传播。
  不自动表示 handled。
  不自动阻止 fallback。
```

也就是说：

```tsx
<box
  onKey={(event) => {
    event.stopPropagation();
    // 没有 return true
  }}
/>
```

表示：

```text
停止传播给后续节点；
但本事件仍然是 unhandled；
如果没有其他 handler handled，则 interaction 可以执行 fallback。
```

如果既要停止传播又要阻止 fallback：

```tsx
<box
  onKey={(event) => {
    event.stopPropagation();
    return true;
  }}
/>
```

通常可以直接写：

```tsx
<box
  onKey={() => true}
/>
```

因为 `return true` 默认停止传播。

## 5. 内部接口与边界

### 5.1 MountedElementNode

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

### 5.2 FocusEntry

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

### 5.3 FocusState

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
2. focus dirty 计算。
3. 判断父子 focus 关系。
```

## 6. Controller API 调整

内部 controller 可以继续使用 node-oriented API：

```ts
interface InteractionController {
  refresh(root: MountedNode | null): InteractionResult;
  handleKey(event: TerminalKeyEvent): InteractionResult;

  focus(target: string | MountedElementNode): InteractionResult;
  focusNext(): InteractionResult;
  focusPrevious(): InteractionResult;
  clearFocus(): InteractionResult;

  getFocusedId(): string | null;
  getFocusedNode(): MountedElementNode | null;

  isFocused(node: MountedNode): boolean;

  onFocusChange(listener: InteractionFocusChangeListener): () => void;
  dispose(): void;
}
```

这些接口用于内部包协作，不应通过顶层 `bindtty` 作为应用开发者 API 暴露。

## 7. Focus 收集规则

### 7.1 DFS 收集

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

### 7.2 isFocusable

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

第二阶段切换为严格语义：

```ts
function isFocusable(node: MountedElementNode): boolean {
  return node.props.focusable === true;
}
```

## 8. Key event 派发规则

### 8.1 总流程

```text
TerminalKeyEvent
  -> InteractionController.handleKey()
  -> create BindTTYKeyEvent
  -> dispatch capture
  -> dispatch target
  -> dispatch bubble
  -> run fallback action if unhandled
  -> return InteractionResult
```

### 8.2 Capture phase

```text
root -> ... -> parent
```

调用每个节点的：

```ts
node.props.onKeyCapture
```

### 8.3 Target phase

```text
focused target
```

调用：

```ts
target.props.onKey
```

### 8.4 Bubble phase

```text
parent -> ... -> root
```

调用每个父节点的：

```ts
node.props.onKey
```

### 8.5 Fallback action

fallback action：

```text
Tab:
  focusNext()

Shift+Tab:
  focusPrevious()
```

只有在以下条件满足时执行：

```text
handled === false
```

其中 handled 来自：

```text
任一 handler return true。
```

### 8.6 Dispatch 伪代码

```ts
function handleKey(raw: TerminalKeyEvent): InteractionResult {
  const focused = focusState.entry;

  if (!focused) {
    return runFallbackKeyAction(raw);
  }

  const event = createKeyEvent(raw);

  let handled = false;

  for (const node of focused.path.slice(0, -1)) {
    handled = dispatchTo(node, "capture", event) || handled;
    if (event.propagationStopped) {
      break;
    }
  }

  if (!event.propagationStopped) {
    handled = dispatchTo(focused.node, "target", event) || handled;
  }

  if (!event.propagationStopped) {
    for (const node of focused.path.slice(0, -1).reverse()) {
      handled = dispatchTo(node, "bubble", event) || handled;
      if (event.propagationStopped) {
        break;
      }
    }
  }

  if (!handled) {
    return runFallbackKeyAction(raw);
  }

  return {
    handled: true,
    dirtyNodes: []
  };
}
```

`dispatchTo`：

```ts
function dispatchTo(
  node: MountedElementNode,
  phase: KeyEventPhase,
  event: BindTTYKeyEvent
): boolean {
  event.phase = phase;

  const binding =
    phase === "capture"
      ? node.props.onKeyCapture
      : node.props.onKey;

  if (typeof binding !== "function") {
    return false;
  }

  const handled = binding(event) === true;

  if (handled) {
    event.stopPropagation();
    return true;
  }

  return false;
}
```

## 9. Focus 状态与 dirty 规则

当前 focus change dirty 只包含 previous focused node 与 current focused node。

引入 focusedPath 后，dirty nodes 应扩大为：

```text
previousPath ∪ nextPath
```

原因：

```text
1. 父节点可能依赖子孙 focus 状态重绘。
2. 嵌套交互组件需要根据父子 focus 关系更新样式或状态。
3. 后续内部实现可复用同一条 focusedPath。
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

## 10. Layout / schema / JSX 适配

### 10.1 `@bindtty/vnode`

在 `commonElementProps` 中加入：

```ts
focusable: { dirty: "paint" },
onKeyCapture: { dirty: "paint" }
```

### 10.2 `@bindtty/jsx-runtime`

在 `IntrinsicInteractionProps` 中加入：

```ts
focusable?: BindingValue<boolean>;
onKeyCapture?: BindingValue<InteractionKeyBinding>;
```

### 10.3 `@bindtty/layout`

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

## 11. Widgets 迁移

### 11.1 Button

Button 是 leaf interactive widget，默认进入 Tab 顺序：

```ts
elementTemplate("box", {
  focusable: props.focusable ?? true,
  onKey: createButtonOnKey(props),
  ...
});
```

Enter / Space 后 `return true`，表示 handled，停止传播，并阻止 fallback。

### 11.2 Checkbox

与 Button 相同：

```ts
focusable: props.focusable ?? true
onKey: createCheckboxOnKey(props)
```

### 11.3 TextInput

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

### 11.4 Select

Select 继续作为单一 focus target 管理内部选中状态：

```ts
focusable: props.focusable ?? true
onKey: createSelectOnKey(...)
```

内部 option rows 不进入 focus list。

### 11.5 ScrollView / List

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

## 12. 父容器组件模式

### 12.1 Form

Form 不进入 focus list，只接收 bubble：

```tsx
<box
  focusable={false}
  onKey={(event) => {
    if (event.name === "return") {
      submit();
      return true;
    }
  }}
>
  {children}
</box>
```

### 12.2 Modal

Modal 不进入 focus list，通常使用 capture：

```tsx
<box
  focusable={false}
  onKeyCapture={(event) => {
    if (event.name === "escape") {
      close();
      return true;
    }
  }}
>
  {children}
</box>
```

### 12.3 Panel

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

## 13. 分阶段落地

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

### Phase 2：FocusEntry path

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
4. key event 不暴露 target/currentTarget。
```

### Phase 3：Key bubbling / capture

目标：实现三阶段 key event dispatch。

任务：

```text
1. 新增 BindTTYKeyEvent。
2. handleKey 不再提前拦截 Tab。
3. dispatch capture。
4. dispatch target。
5. dispatch bubble。
6. 未 handled 时执行 fallback action。
7. return true 映射为 handled + stopPropagation。
```

验收：

```text
1. TextInput 未处理 Enter 时，Form onKey 可收到。
2. TextInput 处理 Backspace 后，Form 不收到。
3. Modal onKeyCapture 可优先处理 Escape。
4. ScrollView focusable=false 时可接收子节点未消费方向键。
5. Tab 默认仍能切换 focus。
6. 子节点 return true 后 Tab 不切 focus。
```

### Phase 4：Widgets 迁移

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

### Phase 5：文档更新

目标：替换 MVP onKey-only 叙述。

任务：

```text
1. 更新 doc/packages/INTERACTION.md。
2. 将本文加入 architecture 文档索引。
3. 更新 widgets 文档中的 focusable 说明。
4. 更新 examples：Form / Modal / nested ScrollView 示例。
```

## 14. 测试计划

### 14.1 Unit tests：interaction

新增测试：

```text
1. focusable=true 进入 focus list。
2. focusable=false + onKey 不进入 focus list。
3. 旧行为兼容：未设置 focusable 时 onKey=function 仍进入 focus list。
4. focusedPath 内部状态正确。
5. capture 顺序 root -> parent。
6. bubble 顺序 parent -> root。
7. target handler 先于 bubble。
8. stopPropagation 阻止后续传播。
9. stopPropagation 不自动 handled。
10. return true 兼容为 handled 并停止传播。
11. onKeyCapture 可以处理 Tab。
12. refresh 后保留 focusedPath。
13. focused node unmount 后迁移 focus。
14. focus dirty 包含 ancestors。
```

### 14.2 Unit tests：widgets

新增测试：

```text
1. Button 默认 focusable。
2. TextInput 默认 focusable。
3. TextInput 无 onSubmit 时 Enter 冒泡。
4. TextInput 有 onSubmit 时 Enter 不冒泡。
5. ScrollView focusable=false 时不进入 Tab 顺序。
6. ScrollView 可以接收子节点未消费方向键。
```

### 14.3 E2E tests

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

4. Tab handled：
   focused node onKey 处理 Tab 并 return true；
   focus 不移动。

5. stopPropagation unhandled：
   handler 调用 stopPropagation 但不 return true；
   不继续传播；
   若是 Tab，仍执行 fallback focus traversal。
```

## 15. 兼容策略

### 15.1 短期兼容

保持：

```text
未显式设置 focusable 时：
  onKey=true/function 仍表示 focusable=true。
```

这保证现有代码继续工作。

### 15.2 文档提示

文档中标注：

```text
onKey 隐式 focusable 是 legacy compatibility。
新代码应显式写 focusable。
```

### 15.3 长期切换

未来 beta 前可考虑 breaking change：

```text
onKey 不再隐式 focusable。
所有官方 widgets 显式设置 focusable。
用户代码如需 Tab stop，必须写 focusable。
```

也可以保留 legacy 行为直到 1.0，避免过早破坏应用代码。

## 16. 风险

### 16.1 冒泡可能引入重复处理

例如 Button 在 Form 内：

```text
Button Enter
  -> Button onPress
  -> Form submit
```

解决：

```text
return true = handled + stopPropagation
```

### 16.2 Tab 行为变化

当前 Tab 不派发给 handler。新模型中 Tab 会先派发，再作为 fallback action。

解决：

```text
1. 增加测试。
2. 文档说明。
3. 对旧 handler return true 做兼容。
```

### 16.3 dirty 范围扩大

focus change dirty 从两个节点扩大到 path union。

影响：

```text
轻微增加 repaint 范围。
```

可接受，因为 terminal frame diff 仍会控制实际输出 patch。

## 17. 最终目标语义

```text
focusable:
  决定节点是否进入 focus list。

focusedPath:
  当前 focused target 到 root 的 mounted element path。
  仅内部使用，不公开 MountedElementNode[]。

onKeyCapture:
  root -> parent 捕获。
  类型为 InteractionKeyListener（handler / null / undefined），不接受 boolean。

onKey:
  target + parent -> root 冒泡。

return true:
  handled。
  停止传播。
  阻止 interaction fallback。

stopPropagation:
  停止继续传播。
  不自动 handled。
  不自动阻止 fallback。

fallback:
  没有 handler handled 时，interaction controller 执行的行为。
  包括 Tab / Shift+Tab focus traversal。

MountedElementNode:
  runtime internal，不作为用户稳定 API。

onFocusChange / InteractionFocusChangeEvent:
  不暴露 MountedElementNode；用户事件仅含 id、focused、reason。
```

## 18. 一句话总结

BindTTY 应从 MVP 的 `onKey-only focus model` 升级为：

```text
Focus list for traversal,
focused path for key event propagation,
small key event API for alpha.
```

这能保留 TUI 中简单直接的 Tab 顺序，同时让 Form、Modal、ScrollView、TextInput 等嵌套组件具备自然组合能力，并避免在 alpha 阶段过早冻结不必要的 API。
