# BindTTY 后续推进整理

> 目标：将当前 BindTTY 项目的主要问题、优先级、推进路线和版本目标整理为一份可执行的 Markdown 规划文档。  
> 建议放置位置：`doc/architecture/NEXT_STEPS.md` 或 `doc/plans/ALPHA_HARDENING.md`。

---

## 1. 当前判断

BindTTY 已经不再是“补 MVP 主链路”的阶段，而是进入 **0.1 alpha hardening** 阶段。

当前项目已经具备完整主链路：

```text
TSX
  ↓
ViewTemplate / Template
  ↓ mount
MountedNode
  ↓ layout
LayoutNode
  ↓ paint
Frame
  ↓ diff
ANSI Patch
```

M1–M7 已经基本完成，包括：

- TSX / JSX runtime
- ViewTemplate / MountedNode
- runtime binding / dirty / scheduler
- layout / Yoga backend
- renderer-terminal / Cell Frame / ANSI diff
- terminal lifecycle
- interaction / focus / keyboard dispatch
- Button / TextInput / ScrollView / List
- mock E2E 与 real PTY E2E

因此，下一阶段的核心目标不应是继续堆新组件，而应是：

1. 冻结公共 API。
2. 修正文档与实现之间的偏差。
3. 补齐 CI 与 npm 发布工程。
4. 解决 TextInput 的 display-column 输入窗口。
5. 再扩展 Scroll/List 与组件生态。

---

## 2. 当前优势

### 2.1 架构分层清晰

项目已经拆分为多个边界明确的包：

```text
@bindtty/signal
@bindtty/vnode
@bindtty/jsx-runtime
@bindtty/runtime
@bindtty/text
@bindtty/layout
@bindtty/renderer-terminal
@bindtty/terminal
@bindtty/interaction
@bindtty/widgets
bindtty
```

各层职责较清楚：

- `@bindtty/signal`：响应式内核。
- `@bindtty/vnode`：声明层与 Template 类型。
- `@bindtty/runtime`：mount、binding、dirty、dispose、scheduler。
- `@bindtty/text`：terminal display-width / grapheme / wrapping / truncation。
- `@bindtty/layout`：MountedNode → LayoutNode。
- `@bindtty/renderer-terminal`：LayoutNode → Frame → ANSI patch。
- `@bindtty/terminal`：TTY lifecycle、resize、raw mode、keypress adapter。
- `@bindtty/interaction`：focus、onKey dispatch、focused state。
- `@bindtty/widgets`：高层控件。
- `bindtty`：用户侧统一入口。

### 2.2 核心叙事正确

BindTTY 的核心不是 React VDOM 复刻，而是：

```text
MVVM + binding tree + signal-driven TUI
```

关键差异：

- View 保存 binding，而不是保存 `.get()` 后的快照。
- Runtime 订阅 signal / computed。
- Binding 更新后标记 MountedNode dirty。
- Layout / paint / diff 根据 dirty 状态刷新终端输出。

这个方向应继续坚持。

### 2.3 测试体系已经有基础

当前已经具备：

- Node 内置 `node:test` 单元测试。
- 每个包独立 build / test。
- mock E2E。
- real PTY E2E。
- examples。
- wide text / CJK / emoji / combining mark 回归测试。

这是进入 alpha 的重要基础。

---

## 3. 当前主要问题

## 3.1 文档与实现存在漂移

目前文档中有几处需要统一：

- README 中描述的是当前 11 包模型。
- ROADMAP 中仍保留早期 7 包模型、10 包模型等历史表述。
- 部分“下一步”内容已经部分实现，例如 Yoga `gap`、`flexWrap`、`alignItems`、`justifyContent`、`flexGrow`、`flexShrink` 等。

### 建议

将主文档统一为当前事实：

```text
当前正式模型：11 包模型
历史 7 包 / 10 包模型：移入 archive 或保留为历史说明
```

主 README、`doc/README.md`、`doc/architecture/ROADMAP.md` 应统一表述。

---

## 3.2 TextInput display-column 输入窗口未完成

这是当前最重要的真实体验缺口。

当前 TextInput 已支持：

- 受控 value。
- onChange。
- onSubmit。
- focused cursor。
- placeholder。
- disabled。
- grapheme-aware 编辑。
- CJK / emoji / combining mark 单测。

但仍未支持：

- 固定宽度输入视口。
- 水平滚动。
- 光标跟随。
- display-column cursor positioning。

当前 TODO 中也明确要求：该部分应先定 spec，再实现。

### 风险

如果不解决这个问题，真实表单场景会出现明显体验问题：

- 输入超长 ASCII 时无法良好裁剪。
- 输入 CJK / emoji 时 cursor column 与 grapheme index 可能不一致。
- TextInput 在固定宽度表单中的行为不可控。
- 用户很容易认为框架输入控件“不成熟”。

---

## 3.3 npm 发布工程尚未完成

当前根包和子包仍是 `private: true`。如果要发布 alpha，需要补齐发布配置。

### 需要处理

- 去掉可发布包的 `private: true`。
- 配置 `publishConfig.access = "public"`。
- 确认 `files` 字段。
- 确认 `exports`。
- 确认 types 产物。
- 执行 `npm pack --dry-run`。
- 增加 changeset 或手动版本流程。
- 增加 CI。

---

## 3.4 顶层 API 尚未冻结

当前用户通常需要从多个子包导入：

```ts
import { createSignal, computed } from "@bindtty/signal";
import { createApp } from "bindtty";
```

需要决定 `bindtty` 顶层包是否 re-export 常用能力。

### 建议

`bindtty` 顶层包应导出用户应用最常用能力：

```ts
export { createApp } from "./app.js";
export { createSignal, computed, effect } from "@bindtty/signal";
export { Button, TextInput, ScrollView, List } from "@bindtty/widgets";
```

不建议从顶层导出全部 runtime / vnode 内部能力，避免公共 API 面过大。

建议分层：

```text
bindtty:
  用户应用入口

@bindtty/signal:
  可独立使用的响应式包

@bindtty/runtime / @bindtty/vnode / @bindtty/layout:
  高级用户和内部扩展使用
```

---

## 3.5 layout roadmap 需要重新校准

当前 ROADMAP 中写的“高级 layout props”需要重新拆解，因为其中部分能力已经实现。

### 已支持或基本支持

- `gap`
- `flexWrap`
- `justifyContent`
- `alignItems`
- `flexGrow`
- `flexShrink`
- `width`
- `height`
- `overflow`
- `scrollX`
- `scrollY`

### 待补齐

- `minWidth`
- `minHeight`
- `maxWidth`
- `maxHeight`
- `margin`
- `marginX`
- `marginY`
- `marginTop`
- `marginRight`
- `marginBottom`
- `marginLeft`
- `paddingX`
- `paddingY`
- `paddingTop`
- `paddingRight`
- `paddingBottom`
- `paddingLeft`

### 建议

不要笼统描述为“高级 layout props”，而应改为：

```text
补齐 Yoga layout prop matrix，并冻结支持矩阵。
```

---

## 4. 推荐推进路线

# Phase 1：0.1 alpha hardening

目标：让项目具备可发布、可试用、可回归的 alpha 状态。

## 4.1 统一文档

### 任务

- 统一 README、ROADMAP、doc/README 的包结构。
- 删除或归档早期 7 包 / 10 包计划。
- 明确当前是 11 包模型。
- 更新 ROADMAP 的“下一步”描述。
- 明确 `@bindtty/text` 是一等包。
- 明确 BindTTY 的叙事是 MVVM binding tree，不是 React VDOM clone。

### 验收

- 新用户只读 README 能理解项目定位。
- 贡献者只读 doc/README 能找到对应包文档。
- ROADMAP 不再把已实现能力列为下一步。

---

## 4.2 增加 CI

### 建议 workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm run build:examples
```

### real PTY 测试策略

real PTY 测试先不阻塞主 CI，可设置为：

- 手动触发。
- nightly。
- Windows / WSL 专用 job。
- 可失败但报警。

---

## 4.3 冻结顶层 API

### 建议导出

```ts
// bindtty
export { createApp } from "./app.js";

export {
  createSignal,
  computed,
  effect
} from "@bindtty/signal";

export {
  Button,
  TextInput,
  ScrollView,
  List
} from "@bindtty/widgets";
```

### 暂不建议导出

```ts
export * from "@bindtty/runtime";
export * from "@bindtty/vnode";
export * from "@bindtty/layout";
export * from "@bindtty/renderer-terminal";
```

原因：

- 公共 API 面过大。
- 内部结构仍可能调整。
- 对普通用户价值不高。

---

## 4.4 npm 发布准备

### package.json 检查项

每个可发布包需要：

```json
{
  "private": false,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "publishConfig": {
    "access": "public"
  }
}
```

### 发布前命令

```bash
npm ci
npm run build
npm test
npm run build:examples
npm pack --dry-run --workspaces
```

---

# Phase 2：TextInput display-column hardening

目标：解决真实输入控件体验。

## 5.1 先写 spec

建议新增或扩展：

```text
doc/specs/TEXT_INPUT_DISPLAY_COLUMN.md
```

或在现有 `TEXT_INPUT.md` 中新增章节：

```text
Display-column input viewport
```

## 5.2 建议 API

```ts
interface TextInputProps {
  id?: BindingValue<string | number>;
  value: BindingValue<string>;
  placeholder?: BindingValue<string>;
  disabled?: BindingValue<boolean>;

  width?: BindingValue<number>;

  onChange?: (nextValue: string) => void;
  onSubmit?: (value: string) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}
```

## 5.3 内部模型

编辑语义继续使用 grapheme index：

```text
cursorIndex: grapheme index
```

显示语义使用 display column：

```text
scrollColumn: display column
cursorColumn: display column
visibleColumnRange: [scrollColumn, scrollColumn + viewportWidth)
```

建议内部状态：

```ts
const cursor = createSignal(0);
const focused = createSignal(false);
const scrollColumn = createSignal(0);
```

派生值：

```ts
const segments = computed(() => segmentText(rawValue.get()));
const cursorColumn = computed(() =>
  measureTextWidth(joinSegments(segments.get().slice(0, clampedCursor.get())))
);
```

## 5.4 光标跟随规则

```text
如果 cursorColumn < scrollColumn:
  scrollColumn = cursorColumn

如果 cursorColumn >= scrollColumn + viewportWidth:
  scrollColumn = cursorColumn - viewportWidth + cursorWidth
```

需要注意：

- CJK / emoji width 通常为 2。
- combining mark width 通常为 1。
- 不画半个 grapheme。
- 如果 grapheme 跨过 viewport 边界，整段跳过或整体滚入可见区。

## 5.5 测试矩阵

必须覆盖：

- ASCII 超长输入。
- CJK 超长输入。
- emoji 超长输入。
- combining mark。
- 光标右移触发 scroll。
- 光标左移触发 scroll 回退。
- backspace 后 scroll clamp。
- delete 后 scroll clamp。
- 外部受控 value 缩短后 cursor / scroll 同时 clamp。
- placeholder 在固定宽度下正确显示。
- disabled 状态下不滚动、不编辑。

---

# Phase 3：layout prop matrix 补齐

目标：冻结 layout prop 支持矩阵。

## 6.1 当前建议补齐顺序

### P1

- `minWidth`
- `minHeight`
- `maxWidth`
- `maxHeight`

### P2

- `paddingX`
- `paddingY`
- `paddingTop`
- `paddingRight`
- `paddingBottom`
- `paddingLeft`

### P3

- `margin`
- `marginX`
- `marginY`
- `marginTop`
- `marginRight`
- `marginBottom`
- `marginLeft`

## 6.2 实现要求

每个 prop 都必须同时补：

- vnode schema。
- JSX intrinsic 类型。
- Yoga engine。
- layout tests。
- docs。
- alias 测试，如 `padding-x` 与 `paddingX`。
- duplicate prop 检查。

## 6.3 原则

不要把 BindTTY 变成完整 CSS 实现。

只承诺终端 UI 需要的有限 layout prop 集合。

---

# Phase 4：Scroll/List 产品化

目标：增强真实 TUI 高频场景。

## 7.1 stickToBottom

优先级最高。

典型场景：

- log viewer
- chat
- streaming output
- task runner
- test runner

建议 API：

```tsx
<ScrollView
  height={10}
  stickToBottom={vm.autoScroll}
>
  <List
    items={vm.logs}
    getKey={(log) => log.id}
    render={(log) => <text value={log.message} />}
  />
</ScrollView>
```

## 7.2 scrollbar

建议先做视觉 scrollbar，不做鼠标交互。

可能 API：

```tsx
<ScrollView scrollbar />
<ScrollView scrollbar="inline" />
<ScrollView scrollbar="overlay" />
<ScrollView scrollbar={false} />
```

需要明确：

- scrollbar 是否占用内容宽度。
- scrollbar 样式如何配置。
- CJK 内容下是否影响 clip。
- scrollOffset clamp 后 scrollbar thumb 如何计算。

## 7.3 virtualization

暂缓。

建议先补 benchmark，再决定是否实现。

虚拟列表会牵涉：

- item height 估算。
- dynamic height。
- focus item 保持。
- scroll offset 与 item index 映射。
- keyed reuse 与 runtime dispose。

当前阶段不建议过早实现。

---

# Phase 5：组件生态

目标：在公共 API 稳定后，扩展常用控件。

## 8.1 推荐顺序

### 1. Checkbox

优先级最高。

原因：

- 实现简单。
- 能验证 controlled value。
- 能复用 Button/focus/onKey 模型。
- 表单场景常用。

建议 API：

```tsx
<Checkbox
  checked={vm.enabled}
  label="Enable feature"
  onChange={(checked) => vm.enabled.set(checked)}
/>
```

### 2. Select

表单场景高频，但复杂度高于 Checkbox。

建议先做单选：

```tsx
<Select
  value={vm.choice}
  options={vm.options}
  getKey={(item) => item.id}
  renderOption={(item) => item.label}
  onChange={(value) => vm.choice.set(value)}
/>
```

### 3. ProgressBar

适合展示型场景：

```tsx
<ProgressBar value={vm.progress} max={100} />
```

### 4. Tabs

稍后实现。

Tabs 会涉及：

- focus scope
- keyboard navigation
- selected state
- layout constraints

### 暂缓：Modal / Overlay

暂不建议做 Modal / Overlay。

原因：

- 需要 overlay layer。
- 需要 z-index。
- 需要 focus trap。
- 需要 event capture。
- 可能污染 renderer / interaction 分层。

---

## 9. Issue 拆分建议

## P0：alpha 发布前必须完成

### Issue 1：Add GitHub Actions CI

内容：

- 添加 `.github/workflows/ci.yml`
- 跑 `npm ci`
- 跑 `npm run build`
- 跑 `npm test`
- 跑 `npm run build:examples`

验收：

- push / PR 自动触发。
- main 分支 CI 绿。

---

### Issue 2：Normalize docs to current 11-package architecture

内容：

- README、ROADMAP、doc/README 统一为 11 包模型。
- 历史 7 包 / 10 包模型移入 archive 或标明为历史。
- 更新“下一步”列表，移除已完成项。

验收：

- 主文档中不再出现互相矛盾的包数量。
- `@bindtty/text` 被明确列为一等包。

---

### Issue 3：Define public API surface for bindtty alpha

内容：

- 明确 `bindtty` 顶层导出。
- 补 API 文档。
- 补类型测试。
- 更新 quick start。

验收：

- 用户只安装 `bindtty` 即可写 Counter / Form 示例。
- 不需要直接 import runtime / vnode。

---

### Issue 4：Prepare npm publish metadata

内容：

- 去除可发布包的 `private: true`。
- 添加 `publishConfig.access = "public"`。
- 检查 `exports` / `types` / `files`。
- 增加 dry-run 脚本。

验收：

```bash
npm pack --dry-run --workspaces
```

结果正确。

---

## P1：真实体验 hardening

### Issue 5：Spec TextInput display-column viewport

内容：

- 定义 fixed width。
- 定义 horizontal scroll。
- 定义 cursor follow。
- 定义 CJK / emoji / combining mark 行为。
- 定义 placeholder / disabled / controlled value 下的行为。

验收：

- spec 合并后再实现代码。
- TODO 中对应项关闭或迁移。

---

### Issue 6：Implement TextInput fixed-width horizontal scroll

内容：

- 增加 `width` prop。
- 增加内部 `scrollColumn`。
- 使用 display-width slice。
- 保证 cursor visible。
- 增加单测。

验收：

- ASCII / CJK / emoji 超长输入行为正确。
- cursor 不停在半个 grapheme 上。
- 受控 value 缩短后 cursor / scroll clamp。

---

### Issue 7：Reconcile layout roadmap with existing Yoga props

内容：

- 更新 ROADMAP。
- 明确已支持 props。
- 明确待补齐 props。
- 增加 layout prop matrix。

验收：

- 文档与 `yoga-engine.ts` 支持矩阵一致。

---

## P2：增强能力

### Issue 8：Implement min/max layout props

内容：

- `minWidth`
- `minHeight`
- `maxWidth`
- `maxHeight`

验收：

- Yoga engine 支持。
- schema 支持。
- alias 支持。
- tests 覆盖。

---

### Issue 9：Implement edge padding and margin props

内容：

- paddingX/Y/Top/Right/Bottom/Left
- marginX/Y/Top/Right/Bottom/Left

验收：

- layout tests 覆盖。
- duplicate alias 检查。
- docs 更新。

---

### Issue 10：Add ScrollView stickToBottom

内容：

- 新增 prop。
- 动态内容追加时自动滚到底部。
- 用户手动上滚后是否保持 stick，需要明确策略。

验收：

- log-viewer example 使用该能力。
- mock E2E 覆盖追加日志。

---

### Issue 11：Add Checkbox widget

内容：

- controlled checked。
- onChange。
- disabled。
- focus style。
- Space / Enter toggle。

验收：

- widgets 单测。
- app 集成测试。
- form example 使用 Checkbox。

---

## 10. 版本目标

## 0.1.0-alpha.0

目标：可安装、可运行、可试用。

必须包含：

- CI。
- 文档统一。
- 顶层 API 初步冻结。
- npm publish metadata。
- Counter / Form / Log Viewer / Wide Text examples 可构建。
- TextInput 已知限制写清楚。

不要求：

- API 完全稳定。
- TextInput horizontal scroll 完成。
- Select / Checkbox 完成。

---

## 0.1.0-alpha.1

目标：输入体验 hardening。

必须包含：

- TextInput fixed width。
- TextInput horizontal scroll。
- display-column cursor。
- CJK / emoji / combining mark 输入窗口测试。
- docs 更新。

---

## 0.1.0-beta.0

目标：公共 API 基本稳定。

建议包含：

- layout prop matrix 稳定。
- ScrollView stickToBottom。
- Checkbox。
- 至少一个更完整的 form example。
- changelog。
- npm 发布流程稳定。

---

## 11. 长期原则

## 11.1 不要把 BindTTY 讲成 React for terminal

BindTTY 的核心价值应继续表述为：

```text
MVVM + signal-driven binding tree for terminal UI
```

不是：

```text
React VDOM clone for terminal
```

## 11.2 widgets 不应反向依赖 runtime/layout/renderer

widgets 应保持轻量：

```text
@bindtty/widgets
  → @bindtty/signal
  → @bindtty/vnode
  → @bindtty/interaction
```

不应依赖：

```text
@bindtty/runtime
@bindtty/layout
@bindtty/renderer-terminal
@bindtty/terminal
```

## 11.3 examples 应作为产品验收

每个核心能力都应有对应 example：

- Counter：signal + Button。
- Form：TextInput / Checkbox / Select。
- Log Viewer：ScrollView / List / stickToBottom。
- Wide Text：CJK / emoji / combining mark。
- Dashboard：Yoga layout / runtime stats。

## 11.4 先稳定，再扩展

推荐顺序：

```text
API freeze
  ↓
CI / release
  ↓
TextInput hardening
  ↓
layout prop matrix
  ↓
Scroll/List productization
  ↓
widgets ecosystem
```

不要反过来先做复杂组件生态。

---

## 12. 总结

BindTTY 当前已经完成了最难的主链路搭建。下一阶段的关键不是“再做更多功能”，而是把现有框架整理成一个可信的 alpha：

```text
稳定 API
修正文档
补齐 CI
准备 npm 发布
解决 TextInput 输入窗口
再扩 Scroll/List 与组件生态
```

最建议立即建立一个 milestone：

```text
Milestone: 0.1 alpha hardening
```

并将 P0 / P1 Issue 按上述清单拆入该 milestone。
