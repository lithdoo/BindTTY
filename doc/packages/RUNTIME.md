# @bindtty/runtime 落地设计

本文档描述 `@bindtty/runtime` 的 MVP 实现方案。它承接 `@bindtty/jsx-runtime` 生成的 `ViewTemplate`，把声明树挂载成长期存在的 `MountedNode`，并建立 binding subscription、dirty 标记和 dispose 机制。

相关文档：

- [VNODE.md](./VNODE.md) — Template / MountedNode 类型设计
- [JSX_RUNTIME.md](./JSX_RUNTIME.md) — TSX → ViewTemplate
- [DESIGN.md](../architecture/DESIGN.md) — 视图树总体设计
- [TUI_IMPLEMENTATION_PLAN.md](../architecture/ROADMAP.md) — 实现计划与里程碑

## 1. 阅读路径

本文按阶段组织：

```text
当前已实现:
  mountTemplate
  binding runtime
  dirty
  dispose
  show runtime
  for runtime (含 MountedForNode 完整实现)
  RuntimeRoot
  root-owned scheduler
  flush records → layout → renderer → ANSI (完整链路已打通)
  createApp (已完成)
```

如果只关心当前代码应如何工作，阅读：

```text
2. 当前目标
6. 已实现支持范围
7. 已实现 mount 规则
8. Binding runtime
9. Dirty 模型
10. dispose 机制
15. For runtime 详细语义
```

如果关心下一步如何接 layout / renderer，阅读：

```text
16. RuntimeRoot 与 Scheduler
```

## 2. 当前目标

`@bindtty/runtime` 的第一阶段目标是打通：

```text
ViewTemplate
  ↓ mount
MountedNode
  ↓ binding update
dirty MountedNode
```

最小示例：

```tsx
const title = createSignal("A");
const view = <text value={title} />;
const root = mountTemplate(view);

title.set("B");
```

此时应满足：

```text
root.props.value === "B"
root.dirty === "layout"
```

这一步不负责终端输出，只验证 BindTTY 的核心更新模型：

```text
signal change
  ↓
binding subscription
  ↓
MountedNode props update
  ↓
mark dirty
```

当前已经进一步覆盖 `show` 和 `for` control runtime：

```text
show:
  when binding
  branch switch
  old branch dispose
  structure dirty

for:
  each binding
  keyed reuse
  removed node dispose
  reappearing key remount
  structure dirty

RuntimeRoot:
  root-owned scheduler
  dirty queue
  microtask flush
  flush records
```

## 3. 当前非目标

当前 runtime 仍不做：

```text
1. terminal layout
2. paint / ANSI diff
3. createApp()
4. stdin raw mode
5. focus manager
6. keyboard input
7. widget ElementDefinition
8. app root ownership
9. layout / renderer ownership
```

这些能力后续分阶段实现。当前 runtime 负责可测试的 mount / binding / dirty / dispose / control runtime / scheduler 闭环。

## 4. 包位置

路径：

```text
packages/runtime
```

当前模块：

```text
packages/runtime/
  src/
    index.ts
    mount.ts
    binding.ts
    dirty.ts
    dispose.ts
    scheduler.ts
    root.ts
    types.ts
  test/
    mount.test.ts
    runtime-root.test.ts
    tsx-runtime.test.tsx
  package.json
  tsconfig.json
```

后续可以按复杂度拆分：

```text
src/control-show.ts
src/control-for.ts
src/app.ts
test/binding.test.ts
test/dispose.test.ts
```

当前 show / for 已直接落在 `mount.ts` 内。后续如果 control runtime 继续变复杂，可以再拆到 `control-show.ts` / `control-for.ts`。

## 5. 低层输入与输出

输入：

```ts
Template
```

输出：

```ts
MountedNode | null
```

建议 API：

```ts
export interface MountOptions {
  markInitiallyDirty?: boolean;
  context?: RuntimeContext;
}

export function mountTemplate(
  template: Template,
  options?: MountOptions
): MountedNode | null;
```

`EmptyTemplate` 可以返回 `null`。当调用方需要一个稳定根节点时，可以自行用 Fragment 包起来。

当前已经在此低层 API 之上提供 `RuntimeRoot`，作为 layout / renderer 对接的稳定接口。

## 6. 已实现支持范围

当前支持：

```text
Template:
  empty
  element
  fragment
  component
  show
  for

BindingValue:
  static value
  ReadableSignal<T>

MountedNode:
  MountedElementNode
  MountedFragmentNode
  MountedShowNode
  MountedForNode

Runtime:
  prop resolve
  signal subscribe
  dirty mark
  dispose
  show branch switch
  for keyed item reuse
```

`ShowTemplate` 在第一阶段实现完整的 true / fallback branch mount、signal 切换、旧 branch dispose 和 structure dirty。

`ForTemplate` 在第一阶段实现 keyed item reuse、removed item dispose、reappearing key remount 和 structure dirty。item 内容变化仍由 item 内部 `ReadableSignal` 驱动。

## 7. 已实现 mount 规则

### 7.1 EmptyTemplate

```ts
{ kind: "empty" }
```

返回：

```ts
null
```

### 7.2 FragmentTemplate

```ts
{
  kind: "fragment",
  children: [...]
}
```

转换为：

```ts
MountedFragmentNode
```

规则：

```text
1. mount 每个 child。
2. 过滤 null child。
3. children 保存 mounted children。
4. dirty 初始为 null 或 "structure"。
5. dispose 时递归 dispose children。
```

### 7.3 ElementTemplate

```tsx
<text value={title} color="green" />
```

转换为：

```ts
MountedElementNode
```

规则：

```text
1. 创建 MountedElementNode。
2. 从 template props 中抽取 lifecycle prop ref。
3. bind ordinary props，保存 resolved value / propSources / bindings。
4. 若 ref 是函数，创建 api 并调用 ref(api)。
5. mount children。
6. children 完成后触发 api.onMounted。
7. state 初始为空对象。
8. dirty 初始为 null 或 mount 阶段指定值。
```

示例：

```ts
{
  kind: "element",
  tag: "text",
  props: {
    value: "A",
    color: "green"
  },
  propSources: {
    value: title,
    color: "green"
  },
  bindings: {
    value: MountedBinding
  },
  children: [],
  state: {},
  dirty: null,
  dispose() {}
}
```

### 7.4 ComponentTemplate

```tsx
<Header title={title} />
```

mount 阶段执行组件函数：

```text
ComponentTemplate
  ↓ execute component(props)
Template
  ↓ mountTemplate
MountedNode
```

规则：

```text
1. Component 不进入 MountedNode。
2. signal 更新不默认重新执行 Component。
3. Component 内如果写 title.get()，那是用户主动丢失 binding。
4. Component 执行结果可以是 empty / fragment / element / control node。
```

Component 只在 mount 阶段展开。signal 更新不重新执行 Component，因此 runtime 不需要 memo 机制。

### 7.5 ShowTemplate

```tsx
<show when={visible} fallback={<text value="Hidden" />}>
  <text value="Visible" />
</show>
```

转换为：

```ts
MountedShowNode
```

规则：

```text
1. 读取 when 的初始值。
2. true 时 mount children branch。
3. false 时 mount fallback branch。
4. false 且无 fallback 时 activeBranch 为 null。
5. when 是 ReadableSignal 时建立 subscription。
6. when 变化导致 branch 改变时，dispose 旧 branch。
7. mount 新 branch。
8. 标记 show node 为 structure dirty。
```

MountedShowNode 保存：

```text
when            原始 BindingValue<boolean>
activeTemplate  当前 branch 对应的 Template，或 null
activeBranch    当前 mounted branch，或 null
binding         when signal 的 subscription
dirty           control node 自身的 dirty state
```

Branch 选择规则：

```ts
function selectShowTemplate(template, value) {
  return value ? template.children : template.fallback ?? null;
}
```

Branch 更新规则：

```text
1. 根据新 when 值选出 nextTemplate。
2. 如果 nextTemplate 与 activeTemplate 相同，不做结构切换。
3. 否则 dispose activeBranch。
4. mount nextTemplate。
5. 更新 activeTemplate / activeBranch。
6. markDirty(showNode, "structure")。
```

Show 本身不绘制内容。后续 layout / paint 读取 `activeBranch` 作为当前实际结构。

### 7.6 ForTemplate

`ForTemplate` 的详细语义见 [15. For runtime 详细语义](#15-for-runtime-详细语义)。

简要规则：

```text
1. 初始读取 each。
2. 为每个 item 执行 renderItem。
3. mount renderItem 返回的 Template。
4. 保存 key / item / mounted node。
5. each 为 ReadableSignal 时建立 subscription。
6. each 更新时执行 keyed update。
7. key 不变复用 node。
8. key 消失 dispose old node。
9. key 再出现 mount new node。
10. list 更新标记 for node 为 structure dirty。
```

## 8. Binding runtime

`BindingValue<T>` 只有两种形态：

```ts
type BindingValue<T> = T | ReadableSignal<T>;
```

runtime 判断是否为 signal：

```ts
isReadableSignal(value)
```

静态值：

```text
直接写入 mounted.props[propName]
不建立 subscription
```

signal：

```text
1. 初始读取 source.get()
2. 写入 mounted.props[propName]
3. 建立 source.subscribe(listener)
4. listener 更新 props、binding.value、dirty
5. dispose 时取消订阅
```

建议 API：

```ts
export function bindProp(
  node: MountedElementNode,
  propName: string,
  source: BindingValue<unknown>
): void;
```

绑定更新伪代码：

```ts
function bindProp(node, propName, source) {
  if (!isReadableSignal(source)) {
    node.props[propName] = source;
    return;
  }

  node.props[propName] = source.get();

  const dispose = source.subscribe((value) => {
    node.props[propName] = value;
    node.bindings[propName].value = value;
    markDirty(node, getPropDirtyKind(node.tag, propName));
  });

  node.bindings[propName] = {
    source,
    value: node.props[propName],
    dispose
  };
}
```

## 9. Dirty 模型

第一阶段 dirty 只保存在 MountedNode 上，不调度 flush。

类型来自 `@bindtty/vnode`：

```ts
type DirtyKind = "structure" | "layout" | "paint";
```

建议 API：

```ts
export function markDirty(node: MountedNode, kind: DirtyKind): void;
export function clearDirty(node: MountedNode): void;
```

dirty 合并规则：

```text
structure > layout > paint > null
```

示例：

```text
paint + layout = layout
layout + structure = structure
```

prop 到 dirty 的映射来自 `@bindtty/vnode`：

```ts
getPropDirtyKind(tag, propName)
```

第一阶段约定：

```text
text.value      -> layout
text.color      -> paint
box.padding     -> layout
box.border      -> paint
spacer.size     -> layout
unknown prop    -> paint
```

## 10. dispose 机制

runtime 必须提供 dispose：

```ts
export function disposeMountedNode(node: MountedNode | null): void;
```

职责：

```text
1. element 节点先执行并清理 lifecycle api（含 api.onUnmount）。
2. 取消当前节点 bindings。
3. 递归 dispose children。
4. 清空 bindings。
5. 调用 node.dispose() 时保持幂等。
```

幂等要求：

```ts
disposeMountedNode(node);
disposeMountedNode(node); // 不应重复 unsubscribe，也不应抛错
```

`api.onUnmount` 抛错时由 runtime 捕获并通过可选 `onLifecycleError` 上报，不阻断 bindings / children 的后续清理。

## 11. MountedNode 类型使用

`@bindtty/vnode` 已提供 MountedNode 类型骨架：

```ts
MountedElementNode
MountedFragmentNode
MountedShowNode
MountedForNode
MountedBinding
```

runtime 第一阶段实际创建：

```text
MountedElementNode
MountedFragmentNode
MountedShowNode
```

`MountedForNode` 已完整实现（含 keyed item reuse、removed item dispose、reappearing key remount、structure dirty）。

如果实现时发现 vnode 的 MountedNode 类型字段不够，可以优先小幅扩展 `@bindtty/vnode` 类型，但不要把 mount 行为移回 vnode 包。

边界保持为：

```text
@bindtty/vnode:
  类型、schema、normalize

@bindtty/runtime:
  mount、binding、dirty、dispose
```

## 12. 错误处理

第一阶段应抛出明确错误：

```text
unknown template kind
Component returned invalid Template.
```

prop schema 校验已经由 vnode `elementTemplate()` 完成。runtime 可以信任 Template，但测试中仍可覆盖异常路径。

## 13. 当前测试计划

MVP 测试应覆盖：

```text
1. mount empty:
   EmptyTemplate -> null

2. mount element with static props:
   props resolved immediately

3. mount element with signal prop:
   props uses signal.get()
   binding stored

4. signal update:
   props updates
   binding.value updates
   dirty is marked from schema

5. dirty merge:
   paint then layout -> layout
   layout then structure -> structure

6. mount fragment:
   children mounted
   empty children filtered

7. mount component:
   component executes once during mount
   returned Template is mounted
   ComponentTemplate not present in MountedNode

8. dispose element:
   subscription removed
   later signal update does not mutate props

9. dispose fragment:
   recursively disposes children

10. show:
   true branch initial mount
   fallback initial mount
   false without fallback mounts null
   when update switches branch
   old branch dispose
   show dispose unsubscribes when

11. for:
   static each initial mount
   ReadableSignal each initial mount
   keyed append / remove / reorder
   removed node dispose
   absent key appearing again mounts new node
   item signal updates nested content
   reused key does not rerender static item fields
   no-key index fallback
   for dispose unsubscribes each and item nodes
```

建议加一个 TSX 集成测试：

```tsx
const title = createSignal("A");

const view = (
  <vstack>
    <text value={title} />
  </vstack>
);

const root = mountTemplate(view);
title.set("B");
```

断言：

```text
mounted text props.value === "B"
mounted text dirty === "layout"
```

## 14. 当前 mount runtime 验收标准

当前 `@bindtty/runtime` 应满足：

```text
1. `npm run build` 通过。
2. mount element / fragment / component 测试通过。
3. static props 能 resolve。
4. ReadableSignal props 能 resolve 并 subscribe。
5. signal update 能直接更新 MountedNode props。
6. dirty kind 来自 element schema。
7. dispose 后 signal update 不再影响 MountedNode。
8. show 支持 branch switch、旧 branch dispose 和 structure dirty。
9. for 支持 keyed reuse、removed node dispose、reappearing key remount 和 structure dirty。
10. 不引入 layout / paint / widgets 依赖。
```

到这里，主链路会推进到：

```text
TSX
  ↓
@bindtty/jsx-runtime
  ↓
ViewTemplate
  ↓
@bindtty/runtime
  ↓
MountedNode
  ↓
signal binding update
  ↓
dirty MountedNode
```

下一步再实现 layout / renderer：

```text
layout tree
paint frame
```

## 15. For runtime 详细语义

`ForTemplate` 负责列表结构变化，不负责 item 内部内容变化。

核心语义：

```text
for.each 控制结构：
  新增
  删除
  排序
  key 复用

item 内部 ReadableSignal 控制内容：
  text value
  style
  input state
  nested binding
```

第一版采用 MVVM keyed reuse，不采用 React-style item rerender。

### 15.1 用户写法

推荐 item 内部动态字段使用 signal：

```tsx
const items = createSignal([
  {
    id: 1,
    title: createSignal("A")
  }
]);

<for each={items} key={(item) => item.id}>
  {(item) => <text value={item.title} />}
</for>
```

当内容变化时：

```ts
items.get()[0].title.set("A2");
```

更新路径：

```text
item.title signal changed
  ↓
text value binding update
  ↓
MountedElementNode dirty
```

当结构变化时：

```ts
items.set([...nextItems]);
```

更新路径：

```text
items signal changed
  ↓
MountedForNode keyed update
  ↓
mount / dispose / reorder item nodes
  ↓
MountedForNode structure dirty
```

### 15.2 key 生命周期语义

`key` 只表示当前列表更新中能否复用上一轮仍存在的 item node，不是永久缓存。

生命周期规则：

```text
present -> present with same key:
  reuse MountedForItemNode.node

present -> absent:
  dispose old node

absent -> present:
  mount new node

present -> present with different key:
  dispose old node
  mount new node
```

示例：

```text
初始:
  key 1 -> node A
  key 2 -> node B

第二次:
  key 2 -> reuse node B
  key 1 disappeared -> dispose node A

第三次:
  key 1 appears again -> mount new node C
  key 2 -> reuse node B
```

不会发生：

```text
key 1 appears again -> restore disposed node A
```

如果未来需要“key 消失后短暂缓存，回来恢复状态”，那应作为 keep-alive / cache / virtualized list state retention 能力单独设计，不进入 For MVP。

### 15.3 key 不变但 item 值变了会怎样

第一版 For 不重新执行 `renderItem`。

因此：

```tsx
<for each={items} key={(item) => item.id}>
  {(item) => <TodoRow item={item} />}
</for>
```

如果第二次 `items` 中某个 item 的 key 不变：

```text
旧 MountedNode 会被复用
TodoRow 不会重新执行
renderItem 不会重新执行
静态 props 不会自动更新
```

所以这种写法不会自动更新普通 string 字段：

```tsx
function TodoRow({ item }) {
  return <text value={item.title} />;
}
```

如果：

```ts
items.set([{ id: 1, title: "B" }]);
```

且 key 仍然是 `1`，已复用 node 里的静态 `props.value` 不会从 `"A"` 自动变成 `"B"`。

正确做法是让内容字段本身是 signal：

```tsx
function TodoRow({ item }) {
  return <text value={item.title} />;
}
```

其中：

```ts
item.title: ReadableSignal<string>
```

这条约束让 For 的职责保持清晰：

```text
For 负责列表结构
Binding 负责内容变化
```

### 15.4 MountedForNode

`@bindtty/vnode` 已有类型骨架：

```ts
interface MountedForItemNode<T = unknown> {
  key: string | number;
  item: T;
  node: MountedNode;
}

interface MountedForNode<T = unknown> {
  kind: "for";
  each: BindingValue<readonly T[]>;
  items: MountedForItemNode<T>[];
  binding?: MountedBinding<readonly T[]>;
  dirty: DirtyKind | null;
  dispose(): void;
}
```

第一版不需要把 `Map` 存入 node。每次 update 时从 `node.items` 临时建立 `Map<key, MountedForItemNode>` 即可。

### 15.5 mountForTemplate

初始 mount：

```ts
function mountForTemplate(template, options) {
  const node = createMountedForNode(template);
  const items = resolveBindingValue(template.each);

  node.items = mountForItems(template, items, options);

  if (isReadableSignal(template.each)) {
    node.binding = createBinding(template.each, (nextItems) => {
      updateForItems(node, template, nextItems, options);
    });
  }

  return node;
}
```

`renderItem` 返回 `EmptyTemplate` 或 mount 后为 `null` 时，第一版直接跳过该 item，不创建 `MountedForItemNode`。

### 15.6 key 计算

```ts
function getItemKey(template, item, index) {
  return template.key ? template.key(item, index) : index;
}
```

无 key 时按 index reuse。文档和测试都应明确：

```text
无 key 适合纯追加或静态顺序
插入 / 删除 / 重排列表推荐提供 key
```

### 15.7 keyed update

更新流程：

```text
1. 从旧 node.items 建 previousByKey。
2. 遍历 next items。
3. key 存在则复用旧 item node。
4. key 不存在则 renderItem + mountTemplate。
5. 遍历旧 items，未复用的 node dispose。
6. node.items = nextMountedItems。
7. markDirty(node, "structure")。
```

伪代码：

```ts
function updateForItems(node, template, nextItems, options) {
  const previousByKey = new Map();

  for (const itemNode of node.items) {
    previousByKey.set(itemNode.key, itemNode);
  }

  const nextMountedItems = [];
  const reusedKeys = new Set();

  for (const [index, item] of nextItems.entries()) {
    const key = getItemKey(template, item, index);
    const previous = previousByKey.get(key);

    if (previous) {
      previous.item = item;
      nextMountedItems.push(previous);
      reusedKeys.add(key);
      continue;
    }

    const childTemplate = template.renderItem(item, index);
    const mounted = mountTemplate(childTemplate, options);

    if (mounted) {
      nextMountedItems.push({ key, item, node: mounted });
    }
  }

  for (const previous of node.items) {
    if (!reusedKeys.has(previous.key)) {
      disposeMountedNode(previous.node);
    }
  }

  node.items = nextMountedItems;
  markDirty(node, "structure");
}
```

第一版可以每次 `each` signal 通知都标记 `structure` dirty。后续若需要优化，可以比较 key 序列是否完全相同再跳过 dirty。

### 15.8 dispose

For dispose 职责：

```text
1. 取消 each binding。
2. dispose 每个 item node。
3. 清空 node.items。
4. 保持幂等。
```

```ts
function disposeForNode(node) {
  node.binding?.dispose();

  for (const item of node.items) {
    disposeMountedNode(item.node);
  }

  node.items = [];
}
```

### 15.9 测试计划

For 测试应覆盖：

```text
1. 初始 mount:
   each static array -> MountedForNode.items

2. signal each:
   each signal 初始读取
   binding stored

3. keyed append:
   old nodes reused
   new node mounted
   structure dirty

4. keyed remove:
   removed node disposed
   remaining node reused

5. keyed reorder:
   same nodes reused
   order changes
   structure dirty

6. absent -> present:
   old node was disposed
   same key later appears mounts new node

7. item content signal:
   key unchanged
   item.title signal update changes nested text
   renderItem not rerun

8. key unchanged with plain static item field:
   node reused
   static prop does not auto-update
   test documents this behavior

9. no key:
   index key fallback works

10. dispose:
   each unsubscribe
   all item nodes disposed
   later each signal update does not mutate For node
```

### 15.10 验收标准

For 第一版完成后应满足：

```text
1. ForTemplate mounts to MountedForNode.
2. each static array and ReadableSignal both work.
3. key unchanged reuses mounted item node.
4. removed key disposes old node.
5. reappearing key mounts new node.
6. item content updates are driven by item-level signals.
7. For node marks structure dirty on list updates.
8. dispose is idempotent and releases each/item subscriptions.
9. renderItem is not rerun for reused keys.
10. npm test passes.
```

## 16. RuntimeRoot 与 Scheduler

当前已经落地 RuntimeRoot / Scheduler。它不是裸 scheduler，而是一层稳定的 runtime 对外接口，方便后续 layout / renderer 对接。

MVP 阶段 scheduler 不单独拆包，仍放在 `@bindtty/runtime` 内：

```text
packages/runtime/src/scheduler.ts
packages/runtime/src/root.ts
```

整体关系：

```text
RuntimeRoot
  owns MountedNode root
  owns RuntimeScheduler
  exposes flush records to layout / renderer
```

Scheduler 是 RuntimeRoot 的内部机制。layout / renderer 不直接关心 binding、show、for 或 scheduler queue 细节，只通过 RuntimeRoot 读取 root 和订阅 flush。

### 16.1 当前目标

第一版已经满足：

```text
1. 提供 RuntimeRoot 作为 layout / renderer 的稳定入口。
2. binding 更新时自动把 dirty node 入队。
3. 同一个 microtask 内多次更新只触发一次 flush。
4. flush 时暴露 root 和本轮 dirty nodes。
5. flush 后清空 dirty queue。
6. dispose 后的 node 不再进入有效 flush。
7. 支持手动 flush，方便测试。
```

非目标：

```text
1. priority scheduling
2. animation frame
3. batch()
4. async task cancellation
5. layout / paint
6. renderer ownership
```

这些能力后续再设计。当前版本只建立 runtime 到 layout / renderer 的连接点。

### 16.2 对外 API：RuntimeRoot

当前对外导出：

```ts
export interface RuntimeRoot {
  readonly root: MountedNode | null;

  onFlush(listener: RuntimeFlushListener): Dispose;
  flushNow(): RuntimeFlushRecord | null;
  clearDirty(): void;
  dispose(): void;
}

export interface RuntimeFlushRecord {
  root: MountedNode | null;
  dirtyNodes: MountedNode[];
}

export type RuntimeFlushListener = (record: RuntimeFlushRecord) => void;

export interface RuntimeRootOptions {
  onLifecycleError?: RuntimeLifecycleErrorHandler;
}

export type RuntimeLifecyclePhase = "mounted" | "layout" | "unmount";

export interface RuntimeLifecycleError {
  phase: RuntimeLifecyclePhase;
  node: MountedElementNode;
  error: unknown;
}

export type RuntimeLifecycleErrorHandler = (
  error: RuntimeLifecycleError
) => void;

export function createRuntimeRoot(
  template: Template,
  options?: RuntimeRootOptions
): RuntimeRoot;
```

使用方式：

```ts
const runtime = createRuntimeRoot(view);

runtime.onFlush(({ root, dirtyNodes }) => {
  const layoutTree = layout(root);
  const frame = paint(layoutTree);
  renderer.render(frame);
  runtime.clearDirty();
});
```

第一版 layout / renderer 可以忽略 `dirtyNodes`，直接全量 layout root。`dirtyNodes` 先作为后续局部优化入口保留。

### 16.3 内部 API：RuntimeScheduler

内部 scheduler 使用实例，不使用模块级 singleton：

```ts
export interface RuntimeScheduler {
  queueDirty(node: MountedNode): void;
  flushNow(): RuntimeFlushRecord | null;
  onFlush(listener: RuntimeFlushListener): Dispose;
  clear(): void;
}

export function createRuntimeScheduler(
  getRoot: () => MountedNode | null
): RuntimeScheduler;
```

为什么用实例：

```text
1. RuntimeRoot 可以拥有自己的 scheduler。
2. 后续支持多个 app roots 更自然。
3. 测试之间不会共享全局 dirty queue。
4. layout / renderer 只订阅对应 root 的 flush。
```

`markDirty()` 仍负责 dirty 合并。`scheduler.queueDirty()` 只负责调度。

绑定更新路径调整为：

```ts
markDirty(node, dirtyKind);
context.scheduler.queueDirty(node);
```

Show / For 结构更新同理：

```ts
markDirty(node, "structure");
context.scheduler.queueDirty(node);
```

### 16.4 RuntimeContext

`mountTemplate()` 接收可选 runtime context：

```ts
export interface RuntimeContext {
  scheduler: RuntimeScheduler;
  onLifecycleError?: RuntimeLifecycleErrorHandler;
}

export interface MountOptions {
  markInitiallyDirty?: boolean;
  context?: RuntimeContext;
}
```

`createRuntimeRoot()` 创建 scheduler，再把 context 传给 mount：

```ts
export function createRuntimeRoot(
  template: Template,
  options: RuntimeRootOptions = {}
): RuntimeRoot {
  let root: MountedNode | null = null;
  const scheduler = createRuntimeScheduler(() => root);

  root = mountTemplate(template, {
    context: {
      scheduler,
      onLifecycleError: options.onLifecycleError
    }
  });

  return runtimeRootFacade;
}
```

如果用户直接调用 `mountTemplate()` 且不传 context，runtime 只做同步 dirty 标记，不触发 flush。这保留了当前测试和低层 API 的简单性。

### 16.5 Dirty queue

内部状态：

```ts
const dirtyNodes = new Set<MountedNode>();
let flushQueued = false;
const listeners = new Set<RuntimeFlushListener>();
```

`Set` 用于合并同一个 node 的多次更新。

```ts
function queueDirty(node) {
  if (isDisposed(node)) {
    return;
  }

  dirtyNodes.add(node);

  if (!flushQueued) {
    flushQueued = true;
    queueMicrotask(flushNow);
  }
}
```

`flushNow()`：

```ts
function flushNow() {
  if (!flushQueued && dirtyNodes.size === 0) {
    return null;
  }

  flushQueued = false;
  const nodes = [...dirtyNodes].filter((node) => !isDisposed(node));
  dirtyNodes.clear();

  if (nodes.length === 0) {
    return null;
  }

  const record = {
    root: getRoot(),
    dirtyNodes: nodes
  };

  for (const listener of [...listeners]) {
    listener(record);
  }

  return record;
}
```

第一版 flush 不自动 `clearDirty(node)`。原因是 layout / paint 何时消费 dirty 还没实现。测试和后续 renderer 可以决定何时清理。

### 16.6 disposed node 处理

当前 `disposeMountedNode()` 使用内部 `WeakSet` 保证幂等。Scheduler 通过 `isDisposed()` 判断 node 是否已 dispose。

当前从 dispose 模块导出：

```ts
export function isDisposed(node: MountedNode): boolean;
```

`scheduler.queueDirty()` 可以跳过已 dispose node：

```ts
if (isDisposed(node)) {
  return;
}
```

`scheduler.flushNow()` 也可以过滤一次：

```ts
const dirtyNodes = [...dirtyNodes].filter((node) => !isDisposed(node));
```

这样可以处理：

```text
node 入队
dispose node
microtask flush
```

这种时序。

### 16.7 clearDirty

`RuntimeRoot.clearDirty()` 负责递归清理 root tree 的 dirty state：

```ts
function clearDirtyTree(node: MountedNode | null) {
  if (!node) {
    return;
  }

  clearDirty(node);

  switch (node.kind) {
    case "element":
    case "fragment":
      for (const child of node.children) {
        clearDirtyTree(child);
      }
      return;
    case "show":
      clearDirtyTree(node.activeBranch);
      return;
    case "for":
      for (const item of node.items) {
        clearDirtyTree(item.node);
      }
      return;
  }
}
```

第一版由 renderer/listener 在完成消费后主动调用：

```ts
runtime.clearDirty();
```

这样 runtime 不需要知道 layout / paint 是否真的处理完了 dirty。

### 16.8 dispose

`RuntimeRoot.dispose()`：

```text
1. dispose mounted root。
2. 取消 flush listeners。
3. 清空 scheduler dirty queue。
4. 后续 signal update 不再产生有效 flush。
5. 保持幂等。
```

### 16.9 测试覆盖

RuntimeRoot / Scheduler 测试已覆盖：

```text
1. createRuntimeRoot:
   root is mounted

2. signal update queues dirty node:
   text value signal set -> onFlush receives text node

3. coalescing:
   same signal set twice in one tick -> one flush

4. multiple nodes:
   two different nodes dirty -> same flush record contains both

5. manual flush:
   root.flushNow() triggers listener synchronously

6. unsubscribe listener:
   dispose returned by onFlush removes listener

7. disposed node:
   queued then disposed node does not appear in flush record

8. show / for:
   branch switch / list update queues control node

9. clearDirty:
   runtime.clearDirty() clears dirty state recursively

10. root dispose:
   runtime.dispose() disposes root and listeners
```

测试 microtask 可以使用：

```ts
await Promise.resolve();
```

或直接用 `runtime.flushNow()` 做确定性测试。

### 16.10 当前验收标准

RuntimeRoot / Scheduler 第一版当前满足：

```text
1. createRuntimeRoot(template) returns RuntimeRoot.
2. RuntimeRoot exposes mounted root.
3. binding updates trigger a microtask flush.
4. flush record includes root and dirtyNodes.
5. 同一 node 多次更新只在 flush record 中出现一次。
6. flush listener 可以订阅和取消订阅。
7. disposed node 不会进入有效 flush record。
8. show / for structure dirty 也进入 scheduler。
9. clearDirty recursively clears dirty state.
10. RuntimeRoot.dispose() disposes root and listeners.
11. 不引入 layout / paint 依赖。
12. npm test passes.
```

到这里 runtime 链路变为：

```text
signal change
  ↓
binding update
  ↓
MountedNode dirty
  ↓
dirty queue
  ↓
microtask flush
```

当前 flush 已驱动完整链路（由 createApp 组合）：

```text
flush dirty nodes
  ↓
layout
  ↓
paint
  ↓
frame diff
```
