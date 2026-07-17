# Textarea 功能规格

> **类型**：widget
> **状态**：implemented
> **最后核对**：2026-07
> **目标入口**：`@bindtty/widgets`
> **代码入口**：`packages/widgets/src/textarea/`
> **相关**：`README.md`、`../../doc/specs/TEXT_INPUT.md`、`../../doc/specs/SCROLL_VIEWPORT.md`

本文档定义 `Textarea` 的功能边界与验收标准。当前目标不是修补某个应用侧 Textarea，而是在 `@bindtty/widgets` 中提供一个可复用、可测试、行为稳定的多行文本输入控件。

## 1. 背景

`TextInput` 已覆盖单行输入，但多行输入不能简单扩展单行模型：

- Enter 需要插入换行，而不是默认提交。
- 光标需要在逻辑行、软换行视觉行之间移动。
- 输入区域高度需要随内容变化，并在达到上限后滚动；禁用编辑时仍应允许上下键查看已有内容。
- 宽字符、emoji、组合字符必须按 grapheme 编辑，不能按 UTF-16 code unit 误删。
- 终端原生光标通常被 TUI 隐藏，控件需要自绘 caret。
- `disabled` 时不能从焦点环消失，`onKey` 仍必须是函数；编辑键返回 `false`，滚动导航键仍可处理。

因此 Textarea 应作为独立 widget 设计，而不是在业务应用里临时堆逻辑。

## 2. 目标

Textarea 提供一个可控的多行文本编辑控件：

1. 渲染多行输入区域；默认不自带边框和内边距，外观 chrome 由调用方容器决定。
2. 支持受控 `value`，通过 `onChange(nextValue)` 通知父组件。
3. 支持多行编辑：插入文本、换行、删除、方向键移动、Home/End。
4. 支持软换行显示，并保持光标按视觉列移动。
5. 支持动态高度：`minRows <= viewportRows <= maxRows`。
6. 内容超过 viewport 时垂直滚动，光标始终保持可见。
7. 聚焦时自绘 caret；未聚焦时不显示 caret。
8. 支持 `disabled`，禁用时不编辑、不提交，但仍可留在焦点系统中，并允许 Up / Down / PageUp / PageDown 滚动查看内容。
9. 支持提交快捷键：默认 `Ctrl+Enter` / `Meta+Enter` / `F2`。
10. 支持 Tab 不消费，让 interaction 焦点遍历继续工作。

## 3. 非目标

首版不做以下能力：

1. 鼠标定位、拖拽选区。
2. 多光标、文本选区、复制粘贴增强。
3. IME preedit 候选态渲染。
4. 语法高亮、markdown 富文本。
5. 自动补全、命令面板。
6. 文本校验、mask、密码输入。
7. 像素级 terminal 渲染断言。

这些能力不能混入首版核心编辑模型，否则测试矩阵会失控。

## 4. Props

```ts
export interface TextareaStyleProps {
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  bold?: BindingValue<boolean>;
  dim?: BindingValue<boolean>;
}

export interface TextareaProps extends TextareaStyleProps {
  id?: BindingValue<string | number>;
  value: BindingValue<string>;
  placeholder?: BindingValue<string>;
  disabled?: BindingValue<boolean>;
  focusable?: BindingValue<boolean>;

  minRows?: BindingValue<number>;       // default: 1
  maxRows?: BindingValue<number>;       // default: 6
  width?: BindingValue<number>;
  height?: BindingValue<number>;
  wrap?: BindingValue<'soft' | 'off'>;  // default: 'soft'

  submitKeys?: BindingValue<readonly TextareaSubmitKey[]>;
  resetCursorToken?: BindingValue<string | number>;

  onChange?: (nextValue: string) => void;
  onSubmit?: (value: string) => void;
  onViewportRowsChange?: (rows: number) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export type TextareaSubmitKey = 'ctrl-enter' | 'meta-enter' | 'f2';
```

### 4.1 受控模型

Textarea 首版只支持受控模式：

```tsx
const body = createSignal("");

<Textarea
  value={body}
  onChange={(next) => body.set(next)}
/>
```

控件内部可以保存 `cursor`、`scrollRow`、`focused` 等 UI 状态，但不能持久化真实文本值。真实内容以 `props.value` 为唯一来源。

如果父组件没有在 `onChange` 中同步更新 `value`，控件显示旧文本。这是受控组件的预期行为。

## 5. 数据模型

Textarea 需要把同一个字符串映射到三层坐标：

```text
raw string
  -> grapheme segments
  -> logical lines, split by "\n"
  -> visual lines, produced by soft wrap and viewport width
```

内部光标位置应使用 **grapheme index**，不是 UTF-16 offset。对外 `value` 仍是普通 JS string。

建议核心纯函数：

```ts
interface TextareaSegment {
  text: string;
  width: number;
  startOffset: number;
  endOffset: number;
}

interface LogicalLine {
  index: number;
  startSegment: number;
  endSegment: number;
  hardBreak: boolean;
}

interface VisualLine {
  logicalLine: number;
  startSegment: number;
  endSegment: number;
  width: number;
}

interface TextareaLayout {
  segments: TextareaSegment[];
  logicalLines: LogicalLine[];
  visualLines: VisualLine[];
}
```

### 5.1 宽字符与列坐标

Textarea 的所有视觉行为必须使用 terminal display column：

| 文本 | grapheme 数 | display width | 光标可停位置 |
|---|---:|---:|---|
| `A` | 1 | 1 | `|A`, `A|` |
| `中` | 1 | 2 | `|中`, `中|`，不能停在宽字符中间 |
| `🙂` | 1 | 2 | `|🙂`, `🙂|`，不能停在 surrogate pair 中间 |
| `é` | 1 | 1 | `|é`, `é|`，不能停在 combining mark 中间 |

规则：

1. `segmentText()` 是唯一允许的 grapheme 分割入口。
2. 每个 segment 记录 `width`，宽度语义与 `@bindtty/text` 一致：`0 | 1 | 2`。
3. 光标位置使用 segment boundary；不能使用 UTF-16 offset 直接加减。
4. display column 是行内列号，按 segment width 累加。
5. 宽字符占两列，但只有一个可编辑 segment；删除、左右移动都以一个 segment 为单位。
6. width 为 0 的 combining segment 若出现，必须附着到前后有效 grapheme 的编辑语义中，不允许形成独立可见列。

### 5.2 光标状态

建议内部光标状态：

```ts
interface TextareaCursor {
  segment: number;        // 0..segments.length, 永远位于 segment boundary
  preferredColumn: number | null;
}
```

`preferredColumn` 用于 Up / Down：

- Left / Right / Home / End / 文本插入 / 删除后，更新为当前 visual column。
- Up / Down 时，如果 `preferredColumn === null`，先记录当前 visual column。
- 连续 Up / Down 使用同一个 `preferredColumn`，这样从长行移动到短行再回到长行时可以回到原列。
- 任何横向移动或编辑操作都会重置 preferred column。

示例：

```text
abcdef|
中
abcdef
```

从第一行末尾 Down 到第二行时，光标落在 `中|`，`preferredColumn` 仍为 6；再 Down 到第三行时，光标应回到第 6 列。

### 5.3 视觉行映射

`VisualLine` 必须能回答两类问题：

```ts
findCursorVisualPosition(layout, cursor): {
  visualRow: number;
  column: number;
};

visualPositionToCursor(layout, visualRow, column): {
  segment: number;
  column: number; // 实际落点 column，可能小于请求 column
};
```

落点规则：

1. 如果请求 column 落在普通宽度 1 segment 前后，选择最近 boundary。
2. 如果请求 column 落在宽字符第二列，不允许停在中间；选择该宽字符前或后，优先选择更接近的 boundary。
3. 如果请求 column 超过视觉行宽，落到该视觉行末尾。
4. 空视觉行只有一个合法落点：行首 column 0。
5. 软换行产生的视觉行末尾不是逻辑换行；End 在当前视觉行还是逻辑行的行为必须由按键语义明确区分，首版 Home / End 使用逻辑行。

## 6. 编辑语义

### 6.1 文本输入

| 输入 | 行为 |
|---|---|
| printable `event.input` | 在光标处插入文本 |
| Enter | 插入 `\n` |
| Ctrl+Enter | 提交 |
| Meta+Enter | 提交 |
| F2 | 提交 |
| Backspace | 删除光标前一个 grapheme |
| Delete | 删除光标后一个 grapheme |
| Left / Right | 按 grapheme 移动 |
| Up / Down | 按视觉行移动，尽量保持目标 display column |
| Home / End | 移动到当前逻辑行首/尾 |
| Ctrl+Home / Ctrl+End | 移动到全文首/尾 |
| Tab | 返回 `false`，交给焦点遍历 |

### 6.1.1 键盘事件优先级

`onKey` 必须按固定顺序处理，避免 printable input 与控制键互相误判：

1. `disabled` 分支：只处理滚动导航键，其余返回 `false`。
2. Tab / Shift+Tab：返回 `false`，交给 interaction 焦点遍历。
3. Submit keys：匹配 `submitKeys` 时触发 `onSubmit(value)`。
4. Navigation keys：方向键、Home/End、PageUp/PageDown。
5. Editing keys：Backspace、Delete、Enter。
6. Printable text：`event.input` 非空且不是控制序列时插入。
7. 未识别按键：返回 `false`。

不要只用 `event.input` 判断文本输入。Ctrl/Meta 组合键可能也携带 input；必须先排除提交和导航语义。

### 6.1.2 printable 判定

建议判定：

```ts
function isTextareaTextInput(event: TerminalKeyEvent): boolean {
  return (
    event.input !== "" &&
    !event.ctrl &&
    !event.meta &&
    event.name !== "return" &&
    event.name !== "enter" &&
    event.name !== "tab" &&
    event.name !== "backspace" &&
    event.name !== "delete"
  );
}
```

粘贴文本可能一次带入多个 grapheme，甚至包含 `\n`。首版允许插入整个 `event.input`，但插入后必须重新通过 `segmentText()` 和 layout 计算光标位置。

### 6.1.3 换行语义

Enter 插入 `\n`，并将光标移动到新逻辑行行首。

换行不是 segment，但必须在 logical line 数据中产生边界。实现可以在 layout 阶段按原始字符串拆行，再对每个逻辑行 segment。

Backspace 在行首时删除前一个 `\n`，即合并当前逻辑行与上一逻辑行。Delete 在行尾时删除后一个 `\n`。

### 6.1.4 左右移动

Left / Right 按 segment boundary 移动：

```text
value: A中🙂é
stops: |A|中|🙂|é|
```

移动不能进入：

- CJK 宽字符内部第二列。
- emoji surrogate pair 中间。
- combining mark 与 base 字符之间。

### 6.1.5 上下移动

Up / Down 按视觉行移动，而不是逻辑行。

算法：

1. 用 `findCursorVisualPosition` 找到当前 `visualRow` 与 `column`。
2. 目标 row = `visualRow ± 1`。
3. 目标 column = `preferredColumn ?? column`。
4. 用 `visualPositionToCursor` 找到目标行最接近合法 segment boundary。
5. 更新 `cursor.segment`，保留 `preferredColumn`。
6. 调用 `ensureCursorVisible`。

当目标行不存在时，光标不动，但仍返回 `true`，表示按键已由控件处理。

### 6.1.6 Home / End

首版定义：

- Home：移动到当前逻辑行开头。
- End：移动到当前逻辑行末尾。
- Ctrl+Home：移动到全文开头。
- Ctrl+End：移动到全文末尾。

如果未来要支持视觉行 Home / End，应新增明确快捷键或 prop，不要改变首版默认。

### 6.1.7 PageUp / PageDown

编辑态：

- PageUp / PageDown 优先滚动 viewport。
- 如果滚动后当前光标不在 viewport 内，应将光标移动到新 viewport 中与原 preferred column 最接近的位置。
- 不触发 `onChange`。

disabled 态：

- PageUp / PageDown 只改变 `scrollRow`。
- 不移动编辑光标。
- 不触发 `onChange` / `onSubmit`。

### 6.2 提交

Textarea 默认不把普通 Enter 当作提交。普通 Enter 必须插入换行。

提交只由 `submitKeys` 决定，默认：

```ts
['ctrl-enter', 'meta-enter', 'f2']
```

应用若想让单行斜杠命令用 Enter 提交，应在应用层包装 Textarea，不应写入 Textarea 默认语义。

### 6.3 disabled

`disabled === true` 时：

- 可渲染文本。
- 可保持聚焦状态。
- 不编辑文本。
- 不触发 `onSubmit`。
- Tab 返回 `false`，继续交给焦点遍历。
- Up / Down / PageUp / PageDown / Home / End 可用于滚动 viewport，不移动编辑光标，不触发 `onChange`。
- 其他编辑键返回 `false`。

重要约束：

```ts
function onKey(event: TerminalKeyEvent): boolean {
  if (disabled.get()) return handleDisabledNavigation(event);
  return handleKey(event);
}
```

不要实现成：

```ts
onKey: computed(() => disabled.get() ? false : handleKey)
```

否则 disabled 时控件会从 interaction 焦点项中消失，Tab 焦点行为会不稳定。

## 7. 光标与滚动

### 7.1 自绘 caret

Textarea 应关闭默认整块 focus paint，并自己绘制局部 caret：

```text
before cursor text
cursor cell with inverse style
after cursor text
```

caret 形态定为 **当前字符 cell 反色**，不是在字符之间插入分隔符。

规则：

1. 光标位于某个 grapheme 前时，反色显示该 grapheme。
2. 光标位于行尾、空行或全文末尾时，反色显示一个空格 cell。
3. 宽字符如 `中` / emoji 占两列时，反色必须覆盖整个 grapheme 的显示宽度，不能只覆盖半格。
4. 不使用 `|`、`▏`、`█` 等插入式分隔符作为 caret，因为它们会改变测量、软换行和列坐标。
5. 未聚焦时不显示 caret。
6. disabled 且 focused 时不显示编辑 caret；可通过外层提示文案或样式表达禁用状态。

Textarea 内容区禁止使用整块 focused inverse。整块反色会让局部 caret 与选择态混淆，尤其会放大宽字符半格错觉。Textarea 外层必须使用 `focusStyle="none"`；聚焦状态只由局部 caret 或调用方外层 chrome 表达。

### 7.2 垂直 viewport

`viewportRows` 由内容高度和 props 共同决定：

```ts
viewportRows = clamp(visualLines.length, minRows, maxRows)
```

内容超过 `viewportRows` 时：

- 维护内部 `scrollRow`。
- 光标移动或输入后调用 `ensureCursorVisible`。
- 渲染 `visualLines.slice(scrollRow, scrollRow + viewportRows)`。
- 调用 `onViewportRowsChange(viewportRows)`，让父级布局可重算高度。

### 7.3 水平行为

首版默认 `wrap="soft"`，不做横向滚动。

`wrap="off"` 可作为后续能力。若实现，应参考 TextInput 的 `scrollX` 模型，但不要影响首版 soft wrap 路径。

## 8. 布局

Textarea 外层是 focusable `box`：

```tsx
<box
  id={props.id}
  ref={layoutRef}
  onKey={onKey}
  onFocusChange={onFocusChange}
  focusable={props.focusable ?? true}
  focusStyle="none"
  overflow="clip"
  flexGrow={props.width === undefined ? 1 : undefined}
  flexShrink={props.width === undefined ? 1 : undefined}
  minWidth={props.width === undefined ? 0 : undefined}
  width={props.width}
  height={props.height ?? viewportRows}
>
  ...
</box>
```

规则：

1. `contentRect.width` 来自 layout callback。
2. soft wrap 必须使用 `contentRect.width`。
3. 未显式设置 `width` 时，Textarea 必须横向填充父元素；实现层通过 `flexGrow: 1`、`flexShrink: 1`、`minWidth: 0` 完成（打断 Yoga 内容 min-size 撑破剩余宽）。
4. width 未知（`null`）或异常 `0` 时可以按不换行处理，但首次收到有效正宽 layout 后必须重算 soft wrap、`scrollRow` 与 caret 可见性。
5. 未显式设置 `height` 时，由 `viewportRows` 决定高度；显式设置 `height` 时以调用方指定高度为准，并在内部滚动。
6. Textarea 默认不设置 `border` / `padding`。需要边框、标题、提示文案、prompt 对齐时，由父级 `box` 或应用组件组合。
7. `height` 必须稳定，不允许因 caret 或 placeholder 改变导致布局跳动。
8. placeholder 只在 `value === "" && !focused` 时显示，不参与真实编辑。
9. 渲染行槽位不能使用固定大常量；应按显式 `height` 或 `maxRows` 上限生成，避免 vnode content 高度超过真实 viewport。

### 8.1 Flex 剩余宽度接入

典型写法（推荐，**不要**手算 `viewportWidth - promptWidth`）：

```tsx
{/* 场景 A：Textarea 自身 flexGrow */}
<hstack gap={0}>
  <text value={prompt} />
  <Textarea value={value} onChange={onChange} wrap="soft" />
</hstack>

{/* 场景 B：外层 flexGrow box 包住 Textarea（等价） */}
<hstack gap={0}>
  <text value={prompt} />
  <box flexGrow={1} flexShrink={1} minWidth={0}>
    <Textarea value={value} onChange={onChange} wrap="soft" />
  </box>
</hstack>
```

时序：

1. 首帧 `contentWidth === null` 时可能暂时不 soft wrap。
2. Yoga layout 完成后 `ref.onLayout` 写入 `contentRect.width`。
3. 同一次渲染周期后必须按该宽度 soft wrap，并 clamp scroll / caret。

边界：

- **Yoga `flexWrap` ≠ 文本 soft wrap。** flex 只分配盒子宽度；文本折行由 `buildTextareaLayout` 消费 `contentRect.width` 完成。
- `vstack` 父级下横向填充靠 stretch，不靠 `flexGrow`（`flexGrow` 在 column 中吃的是剩余高度）。
- 显式 `width={N}` 关闭上述 flex 硬化 props，作为覆盖手段。

## 9. 渲染策略

首版可以按“每个视觉行一个 hstack”渲染：

```text
vstack
  visual line 0
    hstack before / cursor / after
  visual line 1
    hstack ...
```

注意：

- 只在包含 cursor 的视觉行拆成 before/cursor/after。
- 非 cursor 行可以是单个 text 节点。
- 空文本聚焦时仍渲染一个 cursor 空格。
- 空行也必须占据一行高度。
- cursor 节点渲染的是当前 grapheme 或行尾空格，并使用 inverse style。
- focused 状态不能让整个 Textarea 内容区反色；如果调用方需要焦点提示，应在 Textarea 外层容器上做边框/标题/提示变化，不能覆盖内容区 caret 语义。

## 10. 纯函数边界

重构必须先落纯函数，再接 widget：

```text
layout.ts
  buildTextareaLayout(value, width, options)
  findCursorVisualPosition(layout, cursor)
  visualPositionToCursor(layout, row, column)
  resolveNearestCursorBoundary(layout, row, column)
  clampScrollRow(scrollRow, cursorRow, viewportRows, totalRows)
  ensureCursorVisible(scrollRow, cursorRow, viewportRows)

edit.ts
  insertText(state, text)
  insertNewline(state)
  deleteBackward(state)
  deleteForward(state)
  moveLeft(state)
  moveRight(state)
  moveHome(state, layout)
  moveEnd(state, layout)
  moveVertical(state, layout, direction)
  pageScroll(state, layout, direction)
```

Widget 层只做：

```text
props binding
signal state
layout callback
onKey dispatch
render template
```

不要在 TSX 文件里塞复杂字符串/坐标算法。

## 11. 测试要求

### 11.1 纯函数单测

必须覆盖：

1. ASCII 插入、删除、换行。
2. CJK 宽字符宽度。
3. emoji / combining mark 按 grapheme 删除。
4. 空文本、空行、连续换行。
5. soft wrap 宽度边界。
6. 光标不能落在宽字符第二列、surrogate pair 中间、combining mark 中间。
7. `visualPositionToCursor` 在宽字符第二列选择最近合法 boundary。
8. Up / Down 保持 `preferredColumn`，短行夹在长行之间时能回到原列。
9. Up / Down 跨软换行视觉行，而不是只跨逻辑行。
10. Home / End 当前逻辑行行为。
11. PageUp / PageDown scroll 与光标可见性。
12. disabled navigation 只改变 `scrollRow`，不改变 value。
13. scrollRow clamp。
14. viewportRows clamp。

### 11.2 widget 单测

必须覆盖：

1. `onKey` 始终是函数。
2. disabled 时编辑键返回 `false` 且不触发 `onChange` / `onSubmit`。
3. disabled 时 Up / Down / PageUp / PageDown 可改变 `scrollRow`。
4. Tab 返回 `false`。
5. Enter 插入换行。
6. Ctrl+Enter / Meta+Enter / F2 触发 `onSubmit`。
7. Ctrl/Meta 组合键不会被误当成 printable text 插入。
8. 粘贴多 grapheme 文本后光标位置正确。
9. `resetCursorToken` 改变时光标重置到文末。
10. `onViewportRowsChange` 在视觉行数变化时触发。
11. 未设置 `width` 时横向填充父元素；未设置 `height` 时使用 `viewportRows`。
12. focused 时只有 caret grapheme / 行尾空格反色，整个 Textarea 内容区不反色。

### 11.3 真实 PTY E2E

至少一个真实 PTY 测试应覆盖：

1. Tab 聚焦 Textarea。
2. 输入多行文本。
3. Backspace 修改文本。
4. Ctrl+Enter、Meta+Enter 或 F2 提交。
5. 提交结果显示在终端输出中。

如果底层 raw input 暂时无法区分 Ctrl+Enter 和 Enter，该限制必须写入测试注释，并在 terminal input 层补能力，而不是改变 Textarea 的默认提交语义。

## 12. 验收标准

Textarea 重构完成需要同时满足：

- `npm test -w @bindtty/widgets` 通过。
- 纯函数测试覆盖核心编辑/布局路径。
- 真实 PTY E2E 覆盖可输入、可编辑、可提交。
- `TextInput` 现有行为不回退。
- disabled 不破坏焦点环。
- focused Textarea 不使用整块反色；caret 是当前 grapheme 或行尾空格的局部反色。
- 宽字符、emoji、combining mark 不出现半字符删除、半字符光标落点或上下键列错位。
- 应用层无需再自研 Textarea。
- `hstack` + 固定宽 prompt + Textarea（场景 A）与外层 `flexGrow` box（场景 B）在首次 layout 后 soft wrap。
- 聚焦且 hideCursor 场景下，caret 落在 `[0, contentRect.width)`；空值聚焦显示行尾空格 caret。
- layout harness（`textarea-flex-layout.test.ts`）覆盖场景 A/B/C/D。

## 13. 具体落地计划

Textarea 按现有 widgets 风格实现：

```text
public props
  -> Textarea(props): Template
  -> elementTemplate("box", ...)
  -> internal createSignal / computed
  -> ref.onLayout 读取 contentRect
  -> onKey handler 调用纯函数
  -> onChange / onSubmit 回调通知应用
```

不要引入 React 状态模型、class widget 或应用层专用逻辑。

### Phase 0 — 文件结构与导出骨架

新增文件：

```text
packages/widgets/src/textarea/
  binding.ts       // readBindingValue / readNumberBindingValue / omitUndefined
  constants.ts     // default min/max rows, submit keys
  layout.ts        // grapheme -> logical lines -> visual lines
  edit.ts          // cursor/value edit reducers
  render.ts        // visual line -> Template fragments
  textarea.ts      // public widget

packages/widgets/test/textarea-layout.test.ts
packages/widgets/test/textarea-edit.test.ts
packages/widgets/test/textarea.test.ts
```

更新：

```text
packages/widgets/src/index.ts
packages/widgets/README.md
```

验收：

- `Textarea` 和 `TextareaProps` 可从 `@bindtty/widgets` 导入。
- `bindtty` 顶层不 re-export widgets；应用需从 `@bindtty/widgets` 导入 `Textarea`。
- 空实现先返回 focusable `box`，不破坏现有 Button / TextInput / ScrollView / List 测试。

### Phase 1 — 纯 layout 模型

实现 `layout.ts`：

```ts
buildTextareaLayout(value, width, options): TextareaLayout
findCursorVisualPosition(layout, cursor): VisualPosition
visualPositionToCursor(layout, visualRow, column): CursorPosition
resolveNearestCursorBoundary(layout, visualRow, column): CursorPosition
clampScrollRow(scrollRow, cursorRow, viewportRows, totalRows): number
ensureCursorVisible(scrollRow, cursorRow, viewportRows): number
```

要求：

- 使用 `segmentText()`。
- 不切断 grapheme。
- 保留逻辑换行信息。
- soft wrap 使用 display width。
- 空文本、空行、连续换行都产生可渲染视觉行。
- width 未知时走 fallback，但 layout callback 后必须可重算。

测试：

- ASCII / CJK / emoji / combining mark。
- 空文本、尾随换行、连续换行。
- 宽字符第二列不能成为光标落点。
- `visualPositionToCursor` 超过行宽时落到行尾。
- soft wrap 后视觉行 row/column 正确。

### Phase 2 — 纯 edit reducers

实现 `edit.ts`：

```ts
insertText(state, text)
insertNewline(state)
deleteBackward(state)
deleteForward(state)
moveLeft(state)
moveRight(state)
moveHome(state, layout)
moveEnd(state, layout)
moveVertical(state, layout, "up" | "down")
pageScroll(state, layout, "pageup" | "pagedown")
```

`EditState` 至少包含：

```ts
interface TextareaEditState {
  value: string;
  cursor: TextareaCursor;
  scrollRow: number;
  viewportRows: number;
}
```

要求：

- reducers 不读 props，不触碰 signal，不创建 Template。
- 每个 reducer 返回新 state，不原地修改。
- 所有 reducer 都维护合法 cursor boundary。
- 文本编辑后重算 layout，再 `ensureCursorVisible`。

测试：

- Backspace 在行首合并行。
- Delete 在行尾合并行。
- 粘贴多 grapheme 文本后 cursor 正确。
- Up / Down 使用 `preferredColumn`。
- PageUp / PageDown 不改 value。
- disabled navigation 可以复用 page/scroll reducer，但不能调用编辑 reducer。

### Phase 3 — Widget shell

实现 `textarea.ts` 的外壳：

```ts
export function Textarea(props: TextareaProps): Template
```

内部 signals：

```ts
const focused = createSignal(false);
const cursor = createSignal<TextareaCursor>({ segment: 0, preferredColumn: null });
const scrollRow = createSignal(0);
const contentWidth = createSignal<number | null>(null);
const resetToken = createSignal(readBindingValue(props.resetCursorToken));
```

渲染外层：

```ts
elementTemplate("box", omitUndefined({
  id: props.id,
  ref: createTextareaRef(...),
  onKey: createTextareaOnKey(...),
  onFocusChange: createFocusChangeHandler(...),
  focusStyle: "none",
  overflow: "clip",
  flexGrow: props.width === undefined ? 1 : undefined,
  flexShrink: props.width === undefined ? 1 : undefined,
  minWidth: props.width === undefined ? 0 : undefined,
  width: props.width,
  height: computed(() => readHeightOrViewportRows(...)),
  background: props.background
}), ...)
```

注意：

- 不设置默认 border。
- 不设置默认 padding。
- `onKey` 必须始终是函数。
- disabled 不把 `onKey` 变成 `false`。
- Tab 返回 `false`。

测试：

- Template root 是 `box`。
- `focusStyle === "none"`。
- 默认无 `border` / `padding`。
- 未传 width 时有横向填充语义（`flexGrow` / `flexShrink` / `minWidth: 0`）。
- 显式 width 时关闭上述 flex 硬化 props。
- disabled 时 `onKey` 仍是函数。
- `onFocusChange` 转发给调用方。

### Phase 4 — 渲染 caret 与 viewport

实现 `render.ts`：

```ts
renderTextareaViewport(input): Template
renderVisualLine(input): Template
renderCursorLine(input): Template
```

要求：

- 只渲染 `scrollRow .. scrollRow + viewportRows`。
- 当前 cursor 所在视觉行拆分 before / cursor / after。
- cursor 是当前 grapheme 或行尾空格的局部 inverse。
- 宽字符 cursor 反色覆盖完整 grapheme。
- 整个内容区不使用 focused inverse。
- placeholder 只在空值且未聚焦时显示。

测试：

- 未聚焦空值显示 placeholder。
- 聚焦空值显示反色空格 caret。
- 聚焦 `中` 时 cursor 节点 value 是 `中`，不是半字符或分隔符。
- 非 cursor 行不被拆成 cursor 三段。
- focused 时整个 root 不反色。

### Phase 5 — 键盘交互接入

实现 `createTextareaOnKey`：

```text
disabled navigation
Tab passthrough
submit keys
navigation keys
editing keys
printable text
fallback false
```

要求：

- Ctrl/Meta 组合键先走 submit/navigation 判断，不进入 printable。
- Enter 插入换行。
- Ctrl+Enter / Meta+Enter / F2 调用 `onSubmit(value)`。
- Up / Down 使用视觉行。
- Home / End 使用逻辑行。
- PageUp / PageDown 滚动。
- disabled 时 Up / Down / PageUp / PageDown 可滚动，其它编辑键 false。

测试：

- 每个按键返回值明确。
- `onChange` 调用次数与 next value。
- disabled navigation 改 `scrollRow` 但不触发 `onChange`。
- Tab 不消费。
- Ctrl+Enter 不插入换行。
- Ctrl + printable 不插入字符。

### Phase 6 — Layout callback 与动态高度

实现 `createTextareaRef`：

```ts
api.onLayout = (layout) => {
  contentWidth.set(readContentWidth(layout));
}
api.onUnmount = () => {
  contentWidth.set(null);
}
```

要求：

- `contentRect.width` 变化后重算 layout。
- `viewportRows = clamp(visualLines.length, minRows, maxRows)`。
- 传入 `height` 时以 height 为 viewport rows 上限/实际值，内部滚动。
- `onViewportRowsChange` 只在 rows 变化时触发。
- resize rewrap 后光标仍可见。

测试：

- width 从 10 变 4 后 soft wrap 行数增加。
- maxRows 限制 viewport。
- height prop 覆盖动态 viewport。
- onUnmount 清理 width fallback。
- Flex 场景 A/B：剩余宽度 layout harness 断言 `contentRect.width` 与 soft wrap。
- 聚焦空值与 soft wrap 后 caret 落在 clip 内。

### Phase 7 — 真实 PTY E2E

在 e2e 包或 widgets 测试体系中加入真实终端 harness，参考 `packages/e2e/real`。

覆盖：

- Tab 聚焦 Textarea。
- 输入 `A中🙂`。
- Enter 插入第二行。
- Backspace 删除一个完整 grapheme。
- Up / Down 跨视觉行移动。
- PageUp / PageDown 滚动长文本。
- 提交后结果显示在屏幕中。

如果当前 terminal raw input 不能区分 Ctrl+Enter 和 Enter：

- 测试中明确 skip 该部分。
- 另开 terminal input 层任务补齐。
- 不允许为了测试把 Textarea 默认 Enter 改成提交。

### Phase 8 — 文档与迁移

更新：

```text
packages/widgets/README.md
packages/bindtty/README.md
doc/packages/WIDGETS.md
doc/specs/TEXT_INPUT.md 或新增 doc/specs/TEXTAREA.md
```

迁移建议：

- 应用层自研 Textarea 只保留 prompt / confirm / command hint 组合逻辑。
- 多行编辑、caret、宽字符、滚动全部迁到 widgets Textarea。
- 不在 Textarea 内实现业务快捷键，例如单行 `/quit` Enter 提交。

### Phase 9 — 发布前回归清单

必须全部通过：

- `npm test -w @bindtty/text`
- `npm test -w @bindtty/widgets`
- `npm test -w bindtty`
- mock E2E
- real PTY E2E

人工检查仅作为补充，不作为唯一验收：

- 宽字符 caret 不半格。
- focused Textarea 不整块反色。
- disabled 可滚动但不可编辑。
- 不设置宽度时填满父容器。
- 不设置高度时随内容在 min/max rows 内增长。

## 14. 与现有 widgets 的实现约定

Textarea 必须遵循当前 widgets 包的实现习惯：

1. 使用 `elementTemplate` / `forTemplate` / `fragmentTemplate`，不直接依赖 JSX。
2. 使用 `@bindtty/signal` 的 `createSignal` / `computed`。
3. 通过 `BindingValue<T>` 支持静态值与 signal。
4. 通过 `isReadableSignal` 读取动态 props。
5. 本包内可复制小型 `omitUndefined` / `readBindingValue` helper；若重复明显，再抽 shared helper。
6. `ref.onLayout` 只读取 layout 状态，不触发业务回调之外的副作用。
7. `onKey` 返回值必须严格：处理了返回 `true`，交给外层返回 `false`。
8. disabled 行为按控件自身语义决定，不照搬 Button 的 `onKey=false` 模型。
9. `viewportRows` 变化可以通知 `onViewportRowsChange`，但不应在订阅回调中写编辑 state；渲染与按键处理各自读取最新布局并夹紧 viewport。

## 15. 与 TextInput 的关系

`TextInput` 继续负责单行输入。`Textarea` 不应替换 TextInput，也不应把 TextInput 内部实现强行抽象成复杂公共基类。

可共享的是纯函数或小工具：

- binding value reader
- grapheme segment helpers
- cursor inverse rendering helper
- style props 类型

不要共享：

- 单行 `scrollX` 状态机
- TextInput 的 submit-on-Enter 默认语义
- TextInput 的 placeholder 聚焦行为，除非经过 Textarea 测试确认

Textarea 是一个独立控件，优先追求正确性和可测试性。
