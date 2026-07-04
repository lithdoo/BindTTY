# TextInput 规范（TextInput）

> **类型**：widget
> **状态**：implemented
> **最后核对**：2026-07
> **代码入口**：packages/widgets/src/text-input.ts
> **相关**：[WIDGETS.md](../packages/WIDGETS.md) · [DISPLAY_WIDTH.md](./DISPLAY_WIDTH.md)

本文档描述 `@bindtty/widgets` 中 TextInput 控件的设计。它建立在 Button MVP 已验证的组件模型之上：

```text
widget props → intrinsic element (box + text + hstack)
  → onKey handler 闭包 → signal cursor / focused
  → runtime flush → repaint
```

相关文档：

- [WIDGETS.md](../packages/WIDGETS.md) — widgets 总体设计、包边界、Button 参考实现
- [DISPLAY_WIDTH.md](./DISPLAY_WIDTH.md) — terminal display-width / 宽字符（TextInput 编辑限制见 §8）
- [INTERACTION.md](../packages/INTERACTION.md) — keyboard focus、`onKey` dispatch、focused state
- [APP.md](../packages/APP.md) — createApp 组合 runtime / layout / renderer / terminal
- [VNODE.md](../packages/VNODE.md) — Template / MountedNode 数据结构
- [JSX_RUNTIME.md](../packages/JSX_RUNTIME.md) — TSX → ViewTemplate

## 1. 目标

TextInput 提供一个可控的单行文本编辑控件。

它负责：

```text
1. 渲染带 border 的输入框。
2. 在 focused 时显示光标（使用拆分 text 节点方案）。
3. 把键盘事件转换为编辑语义：字符插入、Backspace、Delete、光标移动。
4. 通过 onChange(nextValue) 通知业务层值变化。
5. 支持受控 value（由父组件 signal 驱动）。
6. placeholder 在 value 为空且未聚焦时显示。
7. disabled 语义与 Button 一致。
```

它不负责：

```text
1. IME preedit / 候选窗。
2. 文本选区（Shift+方向键）。
3. 鼠标定位光标。
4. 多行编辑。
5. 密码遮蔽。
6. 输入校验 / mask。
7. Ctrl+U / Ctrl+W 等高级编辑快捷键。
8. IME / 多行 / 选区等复杂编辑能力。
```

### 1.1 与 display-width 渲染的关系

TextInput 的 **value 仍是普通 JS string**，但编辑语义按 `@bindtty/text` 的 `segmentText()` 分割后的 **grapheme index** 工作：

```text
光标：left / right / home / end 每次移动 ±1 个 grapheme
插入：在 grapheme index 处拼接 event.input
删除：backspace / delete 每次移除一个完整 grapheme
显示：beforeCursor / cursorChar / afterCursor 按 grapheme segment 拆分
```

因此：

- **CJK / emoji / combining mark**：光标不会停在 surrogate 或 combining sequence 中间；backspace / delete 删除完整 grapheme。
- **终端绘制**：TextInput 输出的 `<text>` 经 layout/renderer 按 display width 绘制。
- **固定宽度输入窗口**：TextInput 监听自身 layout `contentRect.width`，并通过外层 box 的 `overflow: "clip"` 与 `scrollX` 实现 display-column 水平窗口。光标移出可视区域时，`scrollX` 会按 cursor display column 跟随。

IME、多行等仍为非目标（上文列表）。

## 2. Props 设计

```ts
export interface TextInputStyleProps {
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  borderColor?: BindingValue<string>;
  bold?: BindingValue<boolean>;
  dim?: BindingValue<boolean>;
  padding?: BindingValue<number>;
  border?: BindingValue<boolean | number>;
}

export interface TextInputProps extends TextInputStyleProps {
  id?: BindingValue<string | number>;
  value: BindingValue<string>;
  placeholder?: BindingValue<string>;
  disabled?: BindingValue<boolean>;
  onChange?: (nextValue: string) => void;
  onSubmit?: (value: string) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}
```

MVP 明确只支持受控模式：`value` 必填，TextInput 不在内部持久化真实文本值。每次编辑只调用 `onChange(nextValue)`，父组件必须在 `onChange` 中同步更新 `value` 对应的 signal，显示内容才会变化：

```tsx
const name = createSignal("");

<TextInput
  value={name}
  onChange={(next) => {
    name.set(next);
  }}
/>
```

如果父组件没有同步更新 `value`，TextInput 会保持旧显示值；这是受控组件的预期行为。

TextInput 不暴露独立的 `contentWidth` / `inputWidth` prop。可视内容宽度来自 layout 后的 `contentRect.width`，通常由父级布局、终端宽度、Yoga flex 或外层容器决定。

Props 分类遵循 shared prop model：

| 分类 | Props |
|---|---|
| style props | color, background, borderColor, bold, dim, padding, border |
| paint-only props | focusStyle（TextInput 内部固定使用 `"none"`，不作为公开 TextInput prop） |
| interaction props | id, onFocusChange |
| widget custom props | value, placeholder, disabled, onChange, onSubmit |

## 3. 渲染结构（拆分光标方案）

TextInput 不采用单 `<text>` + 内嵌光标字符的方案。而是将光标之前、光标本身、光标之后拆分为三个独立 `<text>` 节点，放在 `<hstack>` 中：

```tsx
<box
  id={props.id}
  ref={layoutRef}
  onKey={onKeyBinding}
  onFocusChange={onFocusChangeHandler}
  focusStyle="none"
  overflow="clip"
  scrollX={scrollColumn}
  border={props.border ?? true}
  padding={props.padding ?? 1}
  background={props.background}
  borderColor={props.borderColor}
>
  <hstack>
    <text
      value={beforeCursor}
      color={props.color}
      dim={props.dim ?? disabledDim}
    />
    <text
      value={cursorChar}
      color={cursorColor}
      background={cursorBackground}
      bold={props.bold}
    />
    <text
      value={afterCursor}
      color={props.color}
      dim={props.dim ?? disabledDim}
    />
  </hstack>
</box>
```

`focusStyle="none"` 是 TextInput 落地的前置要求。TextInput 不使用 renderer 对 focused 节点的默认整块 inverse 样式；焦点可视状态由 TextInput 自己通过内部 `focused` signal 和 cursor text 的样式手动实现。

原因：

```text
1. TextInput 需要的是局部光标样式，不是整个输入框反显。
2. 默认 focused inverse 会覆盖外层 box 的完整 rect，和内部 cursor 样式叠加后不易控制。
3. Button / Checkbox 可以继续使用默认 focused inverse；TextInput 作为复杂控件主动关闭默认 focus paint。
```

各 text 节点的值由 `computed` 派生。placeholder 只是一种显示状态，不参与编辑，也不作为真实 value：

```ts
const rawValue = computed(() => resolveValue(props.value));
const segments = computed(() => segmentText(rawValue.get()));

const displayValue = computed(() => {
  const raw = resolveValue(props.value) ?? "";
  const placeholder = resolveValue(props.placeholder) ?? "";
  return raw.length === 0 && !focused.get() ? placeholder : raw;
});

const isPlaceholderVisible = computed(() => {
  return rawValue.get().length === 0 && !focused.get();
});

const clampedCursor = computed(() => {
  return Math.min(cursor.get(), segments.get().length);
});

const beforeCursor = computed(() => {
  if (!focused.get()) return displayValue.get();
  return joinSegments(segments.get().slice(0, clampedCursor.get()));
});

const cursorChar = computed(() => {
  if (!focused.get()) return "";
  const currentSegments = segments.get();
  const pos = clampedCursor.get();
  return pos < currentSegments.length ? currentSegments[pos].text : " ";
});

const afterCursor = computed(() => {
  if (!focused.get()) return "";
  return joinSegments(segments.get().slice(clampedCursor.get() + 1));
});

const scrollColumn = computed(() => {
  if (!focused.get()) return 0;
  return computeTextInputScrollColumn({
    segments: segmentText(rawValue.get()),
    cursorIndex: clampedCursor.get(),
    width: latestLayoutContentWidth.get()
  });
});

const cursorColor = computed(() => {
  if (!focused.get()) return undefined;
  return props.background ?? "white";
});

const cursorBackground = computed(() => {
  if (!focused.get()) return undefined;
  return props.color ?? "black";
});
```

当 `isPlaceholderVisible=true` 时，文本应使用 dim 样式；聚焦后即使 value 为空，也隐藏 placeholder，只显示 cursor 空格。

### 1.2 Layout-driven 输入窗口

TextInput 的窗口宽度由 runtime layout callback 提供：

```text
TextInput box ref
  → api.onLayout(layout)
  → read layout.contentRect.width
  → update internal contentWidth signal
  → recompute scrollX
```

窗口不通过额外 prop 指定，避免与 layout 真实宽度产生双数据源。

实现规则：

```text
1. TextInput 仍渲染完整 before / cursor / after 文本，供 layout 测量完整 contentSize。
2. 外层 box 设置 overflow="clip"。
3. scrollX 根据 cursor display column 与 layout.contentRect.width 计算。
4. layout width 改变时，onLayout 再次触发，scrollX 重新计算。
5. 未聚焦时 scrollX = 0。
```

这种设计避免“窗口切片参与 layout 测量”导致的自然宽度反馈问题。

### 3.1 为什么用拆分方案

| 维度 | 单 text + 内嵌光标符 | 拆分三 text 方案 |
|---|---|---|
| 光标样式 | 受限，只能与内容同色 | 独立 color/background 控制，反显效果 |
| 光标可见性 | 通过插入/移除特殊字符 | 通过空串/字符切换，不改变 layout |
| 宽度计算 | 光标符号多占 1 列 | cursor 占用原字符位置，不改变总宽度 |
| layout 兼容性 | 宽度"膨胀" | 三个 text 自然拼接，总宽 = value 宽（无焦点）或 value 宽（有焦点） |
| 未来扩展 | 难扩展 selection | 按 selection 范围拆分 text 即可 |

### 3.2 各状态下的渲染表现

**未聚焦，有值：**

```text
┌──────────┐
│ Hello    │
└──────────┘
```
- beforeCursor = "Hello"
- cursorChar = ""
- afterCursor = ""

**聚焦，光标在末尾（value = "Hello"，cursor = 5）：**

```text
┌──────────┐
│ Hello    │  ← 第 6 列是反显空格（光标）
└──────────┘
```
- beforeCursor = "Hello"
- cursorChar = " "（反显背景色）
- afterCursor = ""

**聚焦，光标在中间（value = "Hello"，cursor = 2，即 'l' 位置）：**

```text
┌──────────┐
│ He llo   │  ← 'l' 字符反显为光标
└──────────┘
```
- beforeCursor = "He"
- cursorChar = "l"（反显）
- afterCursor = "lo"

**未聚焦，空值，有 placeholder：**

```text
┌──────────┐
│ Type...  │  ← dim 样式显示 placeholder
└──────────┘
```
- beforeCursor = "Type..."（placeholder 文本，dim）
- cursorChar = ""
- afterCursor = ""

**聚焦，空值：**

```text
┌──────────┐
│          │  ← 第一个字符位置是反显空格（光标）
└──────────┘
```
- beforeCursor = ""
- cursorChar = " "（反显）
- afterCursor = ""

## 4. 内部状态管理

TextInput 需要两个内部 signal：

```ts
export function TextInput(props: TextInputProps): Template {
  const cursor = createSignal(0);
  const focused = createSignal(false);
  // ...
}
```

原理：
- 组件函数在 App 启动时调用一次，返回的 Template 常驻。
- `onKey` handler 闭包捕获 `cursor` 和 `focused`。
- 修改 signal → runtime 检测依赖变化 → flush → computed 派生新 displayText → repaint。
- 这与 Button 的 `createDisabledDim` 使用 `computed` 的模式一致，只是引入了内部可变状态。

`node.state`（`MountedElementNode.state: Record<string, unknown>`）可供未来迁移 cursor 等内部运行时状态，但 MVP 不依赖它。

cursor 是内部 UI 状态，不是真实 value。每次读取或渲染 cursor 时都必须 clamp 到当前 `value.length`；外部 value 变短时，cursor 不能越界。实现可以通过 `clampedCursor` computed 读取，也可以在处理外部 value 变化时显式 `cursor.set(Math.min(cursor.get(), value.length))`。

## 5. 按键处理

`onKey` handler 行为：

```text
isTextInputKey (可打印字符，无 ctrl/meta，无 name):
  → 在 cursor 位置插入字符
  → cursor += 1
  → onChange(newValue)
  → handled = true

Backspace (name === "backspace"):
  → 如果 cursor > 0: 删除 cursor 前一个字符
  → cursor -= 1
  → onChange(newValue)
  → handled = true

Delete (name === "delete"):
  → 如果 cursor < value.length: 删除 cursor 后一个字符
  → onChange(newValue)
  → handled = true

Left Arrow (name === "left"):
  → cursor = max(0, cursor - 1)
  → handled = true (不触发 onChange)

Right Arrow (name === "right"):
  → cursor = min(value.length, cursor + 1)
  → handled = true (不触发 onChange)

Home (name === "home"):
  → cursor = 0
  → handled = true

End (name === "end"):
  → cursor = value.length
  → handled = true

Enter (name === "return"):
  → onSubmit?.(value)
  → handled = true

其他 key:
  → handled = false
```

编辑类按键基于当前受控 `value` 计算 `nextValue`。TextInput 先根据 `nextValue` 更新 cursor，再调用 `onChange(nextValue)`；真实显示仍取决于父组件是否同步更新 `value` signal。

`onKey` 绑定需要支持 disabled 动态值（与 Button 一致）：

```ts
const onKeyBinding = computed(() => {
  if (resolveValue(props.disabled)) return false;
  return handleKey;
});
```

## 6. Focus 与 Disabled

与 Button 完全一致的模型：

```text
disabled === true:
  → onKey = false (通过 computed 返回)
  → 节点退出 focus list
  → 如果原本 focused，interaction.refresh 后 focus 迁移
  → dim = true

disabled === false:
  → onKey = handler
  → 节点进入 focus list

focused 变化:
  → onFocusChange handler 更新内部 focused signal
  → 外层 box 使用 focusStyle="none"，关闭 renderer 默认整块 inverse
  → focused=true 时显示光标（cursorChar 非空，带反显）
  → focused=false 时光标隐藏（cursorChar = ""）
  → blur 时 cursor 重置为 0（可选择保留或重置）
```

焦点变化通过 `onFocusChange` 追踪：

```ts
const onFocusChangeHandler = (event: InteractionNodeFocusChangeEvent) => {
  focused.set(event.focused);
  if (!event.focused) {
    cursor.set(0);  // blur 时重置光标
  }
  props.onFocusChange?.(event);
};
```

## 7. 文件结构

```text
packages/widgets/src/
  index.ts              # export { TextInput } + types
  button.ts             # 不变
  text-input.ts         # 新增：TextInput 组件实现
```

```text
packages/widgets/test/
  widgets.test.ts       # Button 测试不变
  text-input.test.ts    # 新增：TextInput 单元测试
```

## 8. 测试计划

### 8.1 单元测试（widgets 层）

```text
渲染结构:
  TextInput renders as bordered box with hstack containing three text nodes
  TextInput forwards id to box
  TextInput forwards onFocusChange
  TextInput preserves style props (color, background, borderColor, bold, padding, border)
  TextInput sets focusStyle="none" on the focus target box

光标渲染 - 聚焦:
  cursor shows on the correct character when focused
  cursor char uses inverted colors (background ↔ foreground)
  cursor at end renders as inverted space
  cursor at position 0 on empty value renders as inverted space

光标渲染 - 未聚焦:
  beforeCursor contains full value when not focused
  cursorChar is empty when not focused
  afterCursor is empty when not focused

Placeholder:
  placeholder shown (dimmed) when value empty and not focused
  placeholder hidden when focused
  placeholder hidden when value non-empty even if not focused
  placeholder is not inserted into the editable value

按键 - 字符输入:
  printable char inserts at cursor position
  printable char increments cursor
  printable char triggers onChange with new value
  printable char at cursor=0 prepends
  printable char at cursor=length appends
  printable char at cursor middle inserts

按键 - Backspace:
  Backspace at cursor>0 deletes char before cursor
  Backspace decrements cursor
  Backspace triggers onChange
  Backspace at cursor=0 does nothing (handled=true, no onChange)

按键 - Delete:
  Delete at cursor<length deletes char after cursor
  Delete triggers onChange
  Delete at cursor=length does nothing (handled=true, no onChange)

按键 - 光标移动:
  Left arrow decrements cursor (clamped to 0)
  Right arrow increments cursor (clamped to value.length)
  Home sets cursor to 0
  End sets cursor to value.length
  光标移动不触发 onChange

按键 - Enter:
  Enter triggers onSubmit with current value
  Enter returns handled=true

按键 - 无关键:
  unrelated keys return handled=false

Disabled:
  disabled → onKey=false
  disabled → dim=true on all three text nodes
  disabled → cursor not shown even if focused

Dynamic values:
  dynamic disabled via signal
  dynamic value via signal (controlled component)
  cursor clamped when value shrinks externally
  value does not change unless parent updates the controlled signal in onChange

Focus 生命周期:
  focused signal set to true on onFocusChange(focused=true)
  focused signal set to false on onFocusChange(focused=false)
  cursor resets to 0 on blur
```

### 8.2 App 集成测试

```text
createApp renders TextInput
terminal text keys reach TextInput onKey handler
terminal Enter triggers TextInput onSubmit with current value
disabled TextInput is skipped by focus traversal
Tab moves focus between Button and TextInput
dynamic disabled removes TextInput from focus list after runtime flush
type "hello" and verify onChange sequence
```

### 8.3 E2E 测试

```text
TSX app imports TextInput from @bindtty/widgets
TextInput visible in fake stdout
typing updates visible text content in fake stdout
cursor is visible when focused
Enter triggers onSubmit with current value
onSubmit(value) updates signal → visible output changes
Tab switches focus between TextInput and Button
dispose prevents further key dispatch
```

## 9. 依赖方向

```text
@bindtty/widgets
  import @bindtty/signal       (createSignal, computed)
  import @bindtty/vnode        (elementTemplate, isReadableSignal, BindingValue, Template)
  import @bindtty/interaction  (isEnterKey, isTextInputKey, InteractionKeyHandler, InteractionNodeFocusChangeEvent)
  不 import @bindtty/runtime
  不 import @bindtty/layout
  不 import @bindtty/renderer-terminal
  不 import @bindtty/terminal
```

与 Button 完全一致，不引入新的包依赖。

## 10. MVP 边界

纳入 MVP：

```text
1. 受控 value（父组件 signal 驱动）。
2. onChange(nextValue) 每次编辑通知。
3. 可打印字符插入。
4. Backspace / Delete 编辑。
5. Left / Right / Home / End 光标移动。
6. focused 时拆分三 text 节点显示反显光标。
7. blur 时光标隐藏，cursor 重置。
8. placeholder 显示（未聚焦 + 空值）。
9. disabled 映射为 onKey=false + dim。
10. onSubmit(value) 回调。
11. 单元测试 + App 集成测试 + E2E 测试。
```

不纳入 MVP：

```text
1. IME preedit / 候选窗。
2. 文本选区（Shift+方向键）。
3. 鼠标定位光标。
4. 多行编辑。
5. 密码遮蔽模式。
6. 输入校验 / mask / maxLength。
7. Ctrl+U / Ctrl+W 等高级编辑快捷键。
8. Ctrl+Left/Right 按词跳转。
9. undo / redo。
10. node.state 迁移（先用 signal 闭包）。
11. width / fixed size / horizontal scroll。
```

## 11. 实现步骤

### 步骤 0：Focus paint override 前置改造

状态：已完成。

```text
1. 在 renderer paint props 中增加 focusStyle。
2. focusStyle 支持 "inverse" | "none"。
3. 未设置 focusStyle 时保持现有默认行为："inverse"。
4. focusStyle="none" 时，focused 节点不再由 renderer 自动叠加整块 inverse。
5. layout 将 focusStyle 视为非 layout prop 或 paint-only prop，不参与尺寸计算。
6. renderer 增加测试：默认 focused inverse 保持不变；focusStyle="none" 时 focused rect 不自动反显。
```

TextInput 必须建立在该前置改造之后：

```text
TextInput 外层 box:
  onKey = handler
  onFocusChange = handler
  focusStyle = "none"

TextInput 内部 cursor text:
  根据 focused signal 自己设置 color / background 等 cursor 样式
  MVP 不强依赖新增 inverse prop；如果 renderer 已支持 inverse，可作为后续增强
```

### 步骤 1：TextInput 组件骨架

状态：已完成。

```text
1. 在 packages/widgets/src/text-input.ts 新建文件。
2. 实现 TextInput 函数，返回 box(focusStyle="none") > hstack > 三个 text 的渲染结构。
3. 实现 beforeCursor / cursorChar / afterCursor / cursorColor / cursorBackground 的 computed 派生。
4. 实现 onKey handler（字符插入、Backspace、Delete、方向键、Home、End、Enter）。
5. 实现 disabled dim。
6. 从 packages/widgets/src/index.ts 导出 TextInput 和 TextInputProps。
```

### 步骤 2：单元测试

状态：已完成。

```text
1. 新建 packages/widgets/test/text-input.test.ts。
2. 覆盖渲染结构、光标行为、按键处理、disabled、placeholder。
```

### 步骤 3：App 集成 + E2E

状态：已完成。

```text
1. 在 bindtty package test 中补 TextInput 集成测试。
2. 在 packages/e2e/test 中补 TSX + TextInput E2E 测试。
```
