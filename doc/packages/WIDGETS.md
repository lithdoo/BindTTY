# @bindtty/widgets 落地设计

本文档描述 `@bindtty/widgets` 的包边界、组件模型与分阶段落地计划。它建立在当前已完成的主链路之上：

```text
TSX
  -> ViewTemplate
  -> runtime MountedNode
  -> layout LayoutNode
  -> renderer ANSI patch
  -> terminal
  -> interaction focus / onKey dispatch
```

相关文档：

- [INTERACTION.md](./INTERACTION.md) — keyboard focus、`onKey` dispatch、focused state
- [APP.md](./APP.md) — createApp 组合 runtime / layout / renderer / terminal / interaction
- [LAYOUT.md](./LAYOUT.md) — MountedNode → LayoutNode
- [RENDERER.md](./RENDERER.md) — LayoutNode → Frame → ANSI Patch
- [JSX_RUNTIME.md](./JSX_RUNTIME.md) — TSX → ViewTemplate
- [VNODE.md](./VNODE.md) — Template / MountedNode 数据结构

## 1. 目标

`@bindtty/widgets` 的目标是把常见 TUI 控件语义封装成可复用组件。

它负责：

```text
1. 提供 Button / TextInput / VScrollView / HScrollView / List 等高层组件，Checkbox / Select 等后续扩展。
2. 把业务 props 转换成 intrinsic element 的 style props / interaction props。
3. 把 keyboard event 转换成控件语义，例如 onPress、onInput、onChange。
4. 通过 signal-friendly props 支持受控组件。
5. 提供一致的 disabled / focused / label / value 行为。
```

它不负责：

```text
1. focus list 和 key dispatch。
2. terminal raw mode / stdin 解析。
3. layout engine。
4. ANSI diff。
5. runtime scheduler。
6. hooks runtime。
7. IME preedit / 复杂输入法候选窗。
```

这些能力分别属于 `@bindtty/interaction`、`@bindtty/terminal`、`@bindtty/layout`、`@bindtty/renderer-terminal` 和 `@bindtty/runtime`。

## 2. 包归属

新增独立包：

```text
packages/widgets
name: @bindtty/widgets
```

原因：

```text
1. widget 是用户可直接使用的高层 API。
2. widget 依赖 interaction，但 interaction 不应该依赖 widget。
3. button/input/select/list 等控件会持续演进，不应塞进 renderer 或 runtime。
4. 业务也可以不使用官方 widgets，直接用 intrinsic element + onKey 自行封装。
```

依赖方向：

```text
@bindtty/widgets
  import @bindtty/jsx-runtime types 或 @bindtty/vnode types
  import @bindtty/interaction types / keyboard helpers
  不 import @bindtty/runtime
  不 import @bindtty/layout
  不 import @bindtty/renderer-terminal
  不 import @bindtty/terminal host lifecycle

@bindtty/interaction
  不 import @bindtty/widgets

bindtty
  可以从统一入口 re-export widgets
```

## 3. 核心模型

Widgets 本质上是普通组件，不新增 MountedNode 类型。

也就是说：

```tsx
<Button label="Save" onPress={save} />
```

会转换成类似：

```tsx
<box
  id={props.id}
  onKey={computed onKey}
  onFocusChange={props.onFocusChange}
  border
  padding={1}
>
  <text value={props.label} />
</box>
```

widget 只负责声明：

```text
1. 渲染成哪些 intrinsic element。
2. 哪些 intrinsic element 接收 onKey。
3. 哪些 key event 触发业务 callback。
4. disabled 时是否移出 focus list。
5. 根据 focused / disabled / pressed 等状态选择 style props。
```

focus 的收集、Tab 切换、事件派发仍然由 `@bindtty/interaction` 完成。

## 4. Props 分类

Widgets 必须遵守 shared prop model。

```text
style props:
  直接转发给 intrinsic element，用于 layout / renderer。
  例如 border、padding、color、background、bold。

paint-only props:
  只影响 renderer paint，不影响 layout。
  例如 focusStyle。

interaction props:
  转发给最终接收键盘的 intrinsic element。
  例如 id、onKey、onFocusChange。

widget custom props:
  只属于 widget 自己。
  例如 label、disabled、onPress、value、onChange、placeholder。
```

规则：

```text
1. custom props 不自动进入 intrinsic element。
2. widget 必须显式把 custom props 转换成 style / interaction props。
3. disabled 不作为 interaction 通用 prop。
4. disabled 由 widget 决定是否让 onKey 变为 false。
5. focusable 不作为单独 prop；是否可聚焦仍由 onKey 决定。
6. focusStyle 是 renderer paint prop；复杂控件可用 focusStyle="none" 关闭默认 focused inverse。
7. TextInput 当前不直接暴露 width；如需固定宽度可在外层布局中组合 `box width`，后续可再评估是否加入 TextInput 自身 props。
```

## 5. Focus 与 Disabled

当前交互模型只有一个入口：

```text
onKey
```

因此 widgets 的 disabled 语义应映射为：

```text
disabled === true:
  onKey = false
  节点不进入 focus list
  如果原本 focused，runtime flush 后 interaction.refresh 会迁移 focus

disabled === false:
  onKey = handler
  节点进入 focus list
```

Button 示例：

```tsx
<box
  onKey={
    props.disabled
      ? false
      : (event) => {
          if (event.name === "return" || event.input === " ") {
            props.onPress?.();
            return true;
          }
          return false;
        }
  }
/>
```

动态 disabled 应支持 `BindingValue<boolean>`。如果 disabled 是 signal / computed，runtime 会更新 mounted props，App 在 flush 后刷新 interaction focus list。

## 6. Focused 样式

MVP 已有 renderer 默认 focused 输出：

```text
focused mounted element rect 内 cell 叠加 inverse: true
```

Button 第一版可以直接依赖默认 focused 样式，不必自己维护 focused signal。

如果 widget 需要自定义 focused 样式，可以使用节点级 `onFocusChange`：

```tsx
<box
  onFocusChange={(event) => {
    focused.set(event.focused);
  }}
  background={computed(() => focused.get() ? "blue" : undefined)}
/>
```

MVP 建议：

```text
1. Button 先使用 renderer 默认 inverse focused 样式。
2. TextInput 不使用默认整块 inverse；它应通过 focusStyle="none" 关闭 renderer 默认 focus paint。
3. TextInput 的 focused 样式由组件内部手动实现：onFocusChange 更新 focused signal，cursor text 根据 focused signal 自己设置样式。
4. 其它复杂控件如果需要局部 focused 样式，也应优先使用 focusStyle="none" 后自行绘制。
5. 不在 widgets 内引入 hooks。
```

## 7. 第一批 Widgets

### 7.1 Button

Button 是第一个落地控件。

目标：

```text
1. 验证 @bindtty/widgets 包边界。
2. 验证 widget custom props -> intrinsic props 转换。
3. 验证 disabled -> onKey=false。
4. 验证 Enter / Space -> onPress。
5. 验证 focused 可见输出。
6. 验证 TSX + e2e 链路。
```

建议 API：

```ts
export interface ButtonProps extends ButtonStyleProps {
  id?: BindingValue<string | number>;
  label?: BindingValue<string | number>;
  disabled?: BindingValue<boolean>;
  onPress?: () => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export interface ButtonStyleProps {
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  borderColor?: BindingValue<string>;
  bold?: BindingValue<boolean>;
  dim?: BindingValue<boolean>;
  padding?: BindingValue<number>;
  border?: BindingValue<boolean | number>;
}
```

TSX 用法：

```tsx
<Button label="Save" onPress={save} />
<Button id="submit" label={vm.submitLabel} disabled={vm.saving} onPress={submit} />
```

渲染策略：

```text
Button
  -> box border padding onKey
       -> text value=label
```

按键策略：

```text
Enter:
  onPress()
  handled=true

Space:
  onPress()
  handled=true

其它 key:
  handled=false
```

disabled 策略：

```text
disabled=true:
  onKey=false
  dim=true 或 color="gray"
  不触发 onPress

disabled=false:
  onKey=handler
```

### 7.2 TextInput

状态：已完成。

TextInput 是第二个落地控件，在 Button 之后实现。

已实现目标：

```text
1. controlled value（受控模式，value 必填）。
2. onChange(nextValue) 每次编辑通知父组件。
3. printable char 在 cursor 位置插入。
4. Backspace / Delete 编辑。
5. Left / Right / Home / End 光标移动。
6. focused 时拆分三 text 节点（beforeCursor / cursorChar / afterCursor）显示反显光标。
7. blur 时光标隐藏、cursor 重置。
8. placeholder 显示（未聚焦 + 空值）。
9. disabled 映射为 onKey=false + dim。
10. onSubmit(value) 回调。
11. focusStyle="none" 关闭 renderer 默认整块 inverse。
12. 单元测试 + App 集成测试 + E2E 测试全覆盖。
```

不纳入当前版本：

```text
1. IME preedit / 候选窗。
2. 文本选区（Shift+方向键）。
3. 鼠标定位光标。
4. 多行编辑。
5. 密码遮蔽模式。
6. 输入校验 / mask / maxLength。
7. Ctrl+U / Ctrl+W 等高级编辑快捷键。
8. width / 固定宽度 / 横向滚动（等待 layout width 支持）。
```

详细设计见 [TEXT_INPUT.md](../specs/TEXT_INPUT.md)。

### 7.3 Checkbox / Select

这些控件可以在当前 Button / TextInput / VScrollView / List 之后逐步补。

建议顺序：

```text
1. Button
2. TextInput
3. VScrollView
4. HScrollView
5. List
5. Checkbox
6. Select / Menu
```

Checkbox 尚未实现，可用于进一步验证 `onChange` 与 dynamic style。

## 8. 与 Intrinsic button / input 的关系

当前 `vnode` / `jsx-runtime` 已有 intrinsic tag：

```text
button
input
```

但 layout / renderer 仍把它们视为未完成控件：

```text
Unsupported layout element: button
Unsupported paint element: input
```

MVP 不建议立刻让 intrinsic `button` / `input` 具备完整行为。

原因：

```text
1. intrinsic element 一旦开放，就暗示 layout、paint、interaction 行为稳定。
2. Button 作为组件可以先复用 box/text，不需要扩展 layout/renderer。
3. TextInput 行为复杂，先用组件实验 API 更稳。
4. 未来如果组件模型稳定，再决定是否让 intrinsic button/input 成为内建基础元素。
```

因此第一阶段：

```text
@bindtty/widgets/Button
  使用 box/text 组合实现。

intrinsic <button>
  保持占位，不推荐用户直接使用。
```

## 9. 包结构

实际结构：

```text
packages/widgets/
  package.json
  tsconfig.json
  src/
    index.ts
    button.ts
    text-input.ts
  test/
    widgets.test.ts
    text-input.test.ts
    tsconfig.json
```

ButtonProps / TextInputProps 等类型定义直接内联在各组件文件中（button.ts / text-input.ts），不使用独立的 types.ts。

## 10. JSX 与导出方式

用户导入：

```tsx
import { Button } from "@bindtty/widgets";

<Button label="Save" onPress={save} />
```

顶层 `bindtty` 可以 re-export：

```tsx
import { createApp, Button } from "bindtty";
```

建议先支持直接从 `@bindtty/widgets` 导入。等 Button 稳定后，再从 `bindtty` 统一入口 re-export。

## 11. 测试计划

### 11.1 Button 单元测试

```text
Button renders to Template/component output
Button forwards id to focus target
Button renders label as text value
Button Enter triggers onPress
Button Space triggers onPress
Button other keys return handled=false
Button disabled maps onKey=false
Button disabled does not call onPress
Button accepts dynamic disabled
Button forwards onFocusChange
Button preserves style props
```

### 11.2 App 集成测试

```text
createApp renders Button
terminal Enter triggers Button onPress
terminal Space triggers Button onPress
disabled Button is skipped by focus traversal
dynamic disabled removes Button from focus list after runtime flush
Button focus is visible through renderer inverse style
```

### 11.3 E2E 测试

```text
TSX app imports Button from @bindtty/widgets
two Buttons render
Tab switches focused Button
Enter triggers second Button onPress
onPress updates signal
fake stdout shows updated label
dispose prevents further Button press
```

## 12. 分阶段落地

### 阶段 1：文档与包骨架

状态：已完成。

```text
1. 新建 doc/WIDGETS.md。
2. 新建 packages/widgets。
3. package name 为 @bindtty/widgets。
4. 导出空 index。
5. 配置 build / test。
```

验收：

```text
npm run build --workspace @bindtty/widgets
```

### 阶段 2：Button MVP

状态：已完成。

```text
1. 实现 Button 组件。
2. Button 渲染为 box + text。
3. Enter / Space 调用 onPress。
4. disabled 映射为 onKey=false。
5. 补单元测试。
```

验收：

```text
npm test --workspace @bindtty/widgets
```

### 阶段 3：App 集成

状态：已完成。

```text
1. bindtty package 添加 @bindtty/widgets 依赖。
2. 可选从 bindtty re-export Button。
3. 补 bindtty app integration tests。
```

验收：

```text
npm test --workspace bindtty
```

### 阶段 4：E2E

状态：已完成。

```text
1. e2e TSX app 使用 Button。
2. fake stdin 发送 Tab / Enter / Space。
3. onPress 更新 signal。
4. fake stdout 可见输出变化。
```

验收：

```text
npm test --workspace @bindtty/e2e
npm test
```

### 阶段 5：TextInput 设计

状态：已完成。

```text
1. 单独补 TextInput 设计。
2. 明确 controlled value / onInput / cursor / key map。
3. 明确 TextInput 使用 focusStyle="none"，focused 样式由组件内部手动实现。
4. 暂不支持 IME preedit。
```

### 阶段 6：TextInput MVP

状态：已完成。

```text
1. renderer / layout 支持 focusStyle="none" 前置改造。
2. @bindtty/widgets 导出 TextInput。
3. TextInput 支持受控 value、onChange(nextValue)、onSubmit(value)。
4. TextInput 支持 printable char、Backspace、Delete、Left / Right、Home / End。
5. TextInput 使用 focusStyle="none"，cursor 样式由组件内部手动实现。
6. bindtty 顶层 re-export TextInput。
7. 补 widgets 单元测试、bindtty app 集成测试、e2e 测试。
```

验收：

```text
npm test --workspace @bindtty/widgets
npm test --workspace bindtty
npm test --workspace @bindtty/e2e
npm test
```

## 13. 完成标准

`@bindtty/widgets` 当前完成标准：

```text
1. @bindtty/widgets 独立包可构建、可测试。
2. Button 可从 @bindtty/widgets 导入。
3. Button 使用现有 box/text/layout/renderer，不需要扩展 intrinsic button。
4. Button 可进入 interaction focus list。
5. Button focused 状态可见。
6. Enter / Space 触发 onPress。
7. disabled Button 不进入 focus list。
8. dynamic disabled 在 runtime flush 后生效。
9. App 集成测试覆盖 terminal key。
10. E2E 覆盖 TSX + createApp + createNodeTerminal + Button press。
11. TextInput 受控模式：value + onChange + onSubmit。
12. TextInput 拆分光标渲染（focusStyle="none" + 三个 text 节点）。
13. TextInput 键盘编辑：字符插入、Backspace、Delete、方向键、Home、End。
14. TextInput placeholder / disabled / focus 生命周期。
15. TextInput 单元测试 + App 集成 + E2E 全覆盖。
16. bindtty 顶层 re-export Button、TextInput、VScrollView、HScrollView 和 List。
17. VScrollView 受控 offset、clip、键盘滚动已覆盖。
18. List 作为 VScrollView + forTemplate 语法糖已覆盖。
19. VScrollView `stickToBottom` 与 `showScrollbar`、HScrollView 已覆盖（见 [SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md) §5.3–§5.4）。
```

## 14. 后续方向

Button、TextInput、VScrollView 和 List 跑通后，下一步建议：

```text
如果目标是验证更多交互组件模式：
  先做 Checkbox。

如果目标是增强长内容体验：
  增强 Scroll/List（virtualization、selected row）。

如果目标是丰富表单输入能力：
  增强 TextInput（width、selection、多行）。
```

Checkbox 尚未实现，可用于进一步验证 `onChange` 与 dynamic style。

VScrollView / List API 与行为见 [SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md) §4.3–§4.4；TextInput 见 [TEXT_INPUT.md](../specs/TEXT_INPUT.md)。
