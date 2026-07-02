# Milestone 7：Scroll / Viewport / List 计划与设计

本文档汇总 BindTTY **Milestone 7** 的目标、分层设计、API 草案、实现切片与验收标准。M1–M6 主链路已完成；M7 是「从可运行 demo 到可承载真实长内容 UI」的关键一步。

相关文档：

- [TUI_IMPLEMENTATION_PLAN.md](./TUI_IMPLEMENTATION_PLAN.md) — 全项目里程碑与优先级
- [DESIGN.md](./DESIGN.md) — 视图树与 binding 模型
- [LAYOUT.md](./LAYOUT.md) — LayoutNode、overflow 预留
- [RENDERER.md](./RENDERER.md) — Frame、viewport 裁剪、paint 规则
- [VNODE.md](./VNODE.md) — intrinsic tag 扩展点
- [INTERACTION.md](./INTERACTION.md) — focus 与 key dispatch
- [WIDGETS.md](./WIDGETS.md) — 高层控件边界
- [APP.md](./APP.md) — createApp 编排链
- [E2E_TESTING.md](./E2E_TESTING.md) — 测试策略

---

## 1. 背景与目标

### 1.1 为什么需要 M7

当前框架已支持：

- TSX 声明、signal 驱动增量更新
- 终端 lifecycle、focus、Button、TextInput
- 单层 viewport（终端宽高）内的 layout + ANSI diff

尚不支持：

- **内容高度超过可见区域**时的裁剪与滚动
- **长列表 / 日志流**的稳定渲染与更新
- **键盘滚动**与 focus 的协同

没有这些能力，BindTTY 只能做表单、计数器等小界面，难以承载日志面板、菜单列表、聊天记录等典型 TUI 场景。

### 1.2 M7 目标（第一版）

| 目标 | 说明 |
| --- | --- |
| **Clip** | 子内容超出容器时，只绘制可见区域 |
| **Scroll offset** | 用 signal 驱动垂直（优先）滚动偏移 |
| **Scroll 控件** | 用户可声明 `<scroll>` 或等价 widget |
| **List 场景** | 动态 `items` + scroll 的组合用法 |
| **键盘滚动** | ↑/↓（及可选 PgUp/PgDn）改变 offset |
| **测试** | 每层单测 + mock E2E；real PTY 保持 smoke |

### 1.3 非目标（M7 不做）

- 虚拟列表 / 窗口化 mount（留 M7+ 或 M8）
- 水平滚动（可预留 API，实现可后置）
- 鼠标滚轮、触摸
- margin / gap / flex grow 等高级 layout（见 [TUI_IMPLEMENTATION_PLAN.md](./TUI_IMPLEMENTATION_PLAN.md) 后续项）
- Unicode 宽字符 / emoji grapheme 精确测量（单列后续里程碑）
- scrollback buffer / 终端历史回滚（与 alternate screen 策略不同）

---

## 2. 术语

避免与现有「viewport」混淆：

| 术语 | 含义 | 所在层 |
| --- | --- | --- |
| **Terminal viewport** | `stdout.columns` × `stdout.rows`，整屏尺寸 | `@bindtty/terminal`、`createApp` |
| **Layout viewport** | 传给 `layoutRoot(root, { viewport })` 的约束 | `@bindtty/layout` |
| **Clip rect** | 某容器分配给子树的可见矩形（content 区域） | `LayoutNode` |
| **Scroll offset** | 子内容相对 clip 原点的位移 `(offsetX, offsetY)` | scroll 容器 |
| **Content size** | 子树自然测量高度/宽度（可大于 clip） | layout measure 阶段 |

关系：

```text
Terminal viewport（整屏）
  └─ layout 树
       └─ scroll 容器（clip rect = 可见窗口，例如 10 行）
            └─ 子内容（content height 可能 = 100 行）
                 paint 时应用 offset，renderer 按 clip 裁剪
```

---

## 3. 分层职责

M7 改动应**自下而上**，尽量不动 `@bindtty/signal` 与 runtime 核心调度模型。

```text
@vnode / @bindtty/jsx-runtime
  扩展 intrinsic tag 或 widget 类型：scroll、（可选）list

@bindtty/layout
  measure：子树自然尺寸
  arrange：scroll 容器 content rect + clip bounds
  输出 LayoutNode 携带 clip / scrollOffset 元数据

@bindtty/renderer-terminal
  paint：绘制时应用 scroll offset
  setCell：按 clip rect 裁剪（在 terminal viewport 裁剪之上）

@bindtty/interaction
  scroll 容器或 ScrollView widget 消费 ↑/↓/PgUp/PgDn
  与 focus 链协同：focus 在内部可编辑控件上时优先交给 TextInput

@bindtty/widgets（推荐）
  ScrollView / List 作为高层 API，内部组合 box + offset + onKey

bindtty createApp
  无结构性变更；仍 layoutRoot → render → write
```

原则（与 [RENDERER.md](./RENDERER.md) §7 一致）：

- **layout 可产生超出 parent 的 rect**；**renderer 负责最终裁剪**
- **Terminal viewport 仍是 Frame 全屏尺寸来源**；scroll 是 layout 树内的子窗口

---

## 4. 数据流

### 4.1 静态 offset（切片 A/B）

```text
scrollY signal 变化
  ↓ binding 更新 scroll 节点 props
  ↓ runtime dirty
  ↓ createApp flush
  ↓ layoutRoot（读取新 offset，排列子节点）
  ↓ renderer.paint（子坐标 - offset，clip 到容器）
  ↓ ANSI diff → terminal.write
```

### 4.2 键盘滚动（切片 C）

```text
stdin key (↑)
  ↓ terminal adapter → TerminalKeyEvent
  ↓ interaction.handleKey
  ↓ ScrollView onKey 或专用 handler
  ↓ scrollY.set(scrollY.get() - 1)  // 或 page scroll
  ↓ 同上 binding dirty 链
```

### 4.3 动态 list（切片 D）

```text
items signal push 新行
  ↓ for 节点 structure dirty
  ↓ layout remeasure content height
  ↓ scroll 容器 content size 增大
  ↓ 若 offset 贴底策略：自动 scrollY 跟随到底（可选行为，文档写清）
```

---

## 5. API 草案

### 5.1 LayoutNode 扩展（内部）

布局引擎向 renderer 传递裁剪与滚动信息，例如：

```ts
export interface LayoutClip {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutScrollState {
  offsetX: number;
  offsetY: number;
}

export interface LayoutNode {
  // ...现有字段
  clip?: LayoutClip;           // 绘制时裁剪边界（可选，默认用 rect）
  scroll?: LayoutScrollState;  // 子树绘制前应用的偏移
}
```

具体字段名以实现时 `@bindtty/layout` 类型为准；renderer 只依赖稳定契约。

### 5.2 Scroll 控件（用户面向）

**方案 A（推荐）**：`@bindtty/widgets` 提供 `ScrollView`，不新增 intrinsic tag。

```tsx
import { createSignal } from "@bindtty/signal";
import { ScrollView } from "@bindtty/widgets";

const offset = createSignal(0);

<ScrollView height={10} offset={offset}>
  <vstack>
    <for each={logs} key={(line) => line.id}>
      {(line) => <text value={line.text} />}
    </for>
  </vstack>
</ScrollView>
```

**方案 B**：vnode intrinsic `<scroll>`，widgets 薄封装。

第一版优先 **方案 A**，减少 jsx-runtime 与 mount 分岔；若 layout 需要专用节点类型，可在内部用 `box` + metadata 实现。

`ScrollView` props 草案：

| Prop | 类型 | 说明 |
| --- | --- | --- |
| `offset` | `BindingValue<number>` | 垂直偏移（行），默认 0 |
| `height` | `BindingValue<number>` | 可见高度（行），必填 |
| `width` | `BindingValue<number>` | 可选，默认撑满父级 |
| `children` | `Template` | 可滚动内容 |
| `scrollOnArrow` | `BindingValue<boolean>` | 是否在 focus 于容器时响应方向键，默认 true |

### 5.3 List 场景（用户面向）

M7 不强制新 `<list>` intrinsic；推荐 **composition**：

```tsx
<ScrollView height={12} offset={scrollY}>
  <for each={items} key={(item) => item.id}>
    {(item) => <Row item={item} />}
  </for>
</ScrollView>
```

若需要语义化 API，可在 widgets 增加薄包装：

```tsx
<List
  height={12}
  offset={scrollY}
  items={items}
  key={(item) => item.id}
  render={(item) => <text value={item.label} />}
/>
```

内部仍是 `ScrollView` + `<for>`；**第一版 List 可以是语法糖，不做虚拟化**。

---

## 6. Layout 设计要点

### 6.1 Measure

scroll 容器：

1. 用 `height`（及可选 `width`）约束 **可见区域**（clip rect）
2. 对 children 做 **无高度上限**（或极大上限）的 measure，得到 **content height**
3. `contentHeight` 记录于节点，供 clamp offset 与滚动条逻辑使用

### 6.2 Arrange

1. 容器 `rect` = 父级分配到的区域（或固定 height）
2. `clip` = 容器 content 区域（扣除 border/padding 后）
3. 子节点按正常 flow 排列，**不因 clip 而截断 measure 结果**
4. `scroll.offsetY` clamp 到 `[0, max(0, contentHeight - clip.height)]`

### 6.3 与现有 BasicLayoutEngine 的关系

- 在 `box` / `vstack` 上增加可选 `maxHeight` + `clip` 路径，或新增 `ScrollLayoutContext`
- 不改变 `screen` 占满 terminal viewport 的语义
- 参考 [LAYOUT.md](./LAYOUT.md) §10.4：children 可超出 parent，overflow 由 renderer/scroll 处理

---

## 7. Renderer 设计要点

在 [RENDERER.md](./RENDERER.md) 已有规则上扩展：

### 7.1 绘制顺序

```text
paint(node):
  if node.scroll:
    save origin
    translate(-offsetX, -offsetY)
  paint children with clip = node.clip ?? node.rect
  restore
```

### 7.2 裁剪

- `setCell(x, y)` 前检查：cell 是否在 **clip rect** 与 **terminal viewport** 交集内
- 负坐标、部分可见字符按现有 §7.3 防御性处理

### 7.3 Diff 行为

- offset 变化 → 内容在 clip 内移动 → 应产生 **增量 patch**（非强制全屏重绘）
- resize clip 区域 → 按现有 resize 路径整帧重算

### 7.4 测试重点

- clip 外 cell 不写入
- offset 增加 1 行后，可见行内容下移一行
- content 少于 clip height 时，offset clamp 为 0

---

## 8. Interaction 设计要点

### 8.1 键盘绑定

| 键 | 行为（ScrollView focused 或 scrollOnArrow） |
| --- | --- |
| ↑ | `offset -= 1`（clamp） |
| ↓ | `offset += 1` |
| PgUp | `offset -= clip.height`（可选，切片 C） |
| PgDn | `offset += clip.height` |
| Home / End | `offset = 0` / `offset = max`（可选） |

### 8.2 与 focus 的优先级

```text
1. 若 focus 在 TextInput 内：方向键优先移动光标（现有行为）
2. 若 focus 在 ScrollView 或可滚动容器上：方向键改 offset
3. 若 focus 在 scroll 内非输入子节点：按容器策略消费或冒泡
```

实现上：`ScrollView` 提供 `onKey`，在 `interaction` 中与 TextInput 相同模式；focus 进入 scroll 区域时由 Tab 顺序决定。

### 8.3 Real PTY 限制

`@bindtty/terminal` 的 raw stdin 路径不解析方向键序列；**箭头键 E2E 以 mock 为准**，real PTY 不阻塞 M7 交付。

---

## 9. 实现切片与验收

建议分 **4 个切片**顺序交付，每片独立可测、可合并。

### 切片 A：Clip 基础设施

**范围**：layout 输出 `clip`；renderer paint 按 clip 裁剪。

**验收**：

- [ ] 固定 `height=3` 的 box 内放 10 行 text，屏幕只显示 3 行
- [ ] layout 单测：子 rect 可大于 parent
- [ ] renderer 单测：clip 外无 cell
- [ ] mock E2E：可见文本匹配前 3 行

**不涉及**：offset、键盘。

---

### 切片 B：ScrollView + offset signal

**范围**：`@bindtty/widgets` 的 `ScrollView`；offset 驱动重绘。

**验收**：

- [ ] `offset` 从 0 改为 5，可见内容变为第 6 行起
- [ ] offset 超过 `contentHeight - clip.height` 时被 clamp
- [ ] mock E2E：改 signal 后断言可见输出
- [ ] 与 `createApp` + terminal 模式联调通过

---

### 切片 C：键盘滚动

**范围**：ScrollView `onKey` + interaction；可选 PgUp/PgDn。

**验收**：

- [ ] mock E2E：↑/↓ 改变可见行
- [ ] TextInput 获得 focus 时 ↑ 不滚动外层 ScrollView
- [ ] focus Tab 进 ScrollView 后方向键生效

---

### 切片 D：动态 List 组合

**范围**：`<for>` + `ScrollView` + 动态 `items`；可选 `List` 语法糖。

**验收**：

- [ ] `items.push()` 后 content 变长，clamp 行为正确
- [ ] （可选）`stickToBottom`：新日志追加时 offset 跟随到底
- [ ] mock E2E：For 增删与滚动组合场景

---

## 10. 测试策略

| 层级 | 内容 |
| --- | --- |
| `@bindtty/layout` | measure content height、clip rect、offset clamp |
| `@bindtty/renderer-terminal` | clip paint、offset translate、diff |
| `@bindtty/widgets` | ScrollView props、onKey |
| `packages/e2e/mock` | 可见输出断言（strip ANSI 后） |
| `packages/e2e/real` | 不新增方向键 PTY 用例；可选 smoke「长输出不崩溃」 |

遵循 [E2E_TESTING.md](./E2E_TESTING.md)：**细节在 mock，真实性在 PTY smoke**。

---

## 11. 示例应用（M7 完成后）

建议在 `examples/log-viewer` 或文档内嵌示例：

```tsx
const logs = createSignal<LogLine[]>([]);
const scrollY = createSignal(0);

const app = createApp(
  <screen>
    <vstack>
      <text value="Log Viewer" bold />
      <ScrollView height={20} offset={scrollY}>
        <for each={logs} key={(line) => line.id}>
          {(line) => <text value={line.message} />}
        </for>
      </ScrollView>
    </vstack>
  </screen>,
  { terminal }
);
```

用于验证 M7 端到端体验，并作为 Quick Start 素材。

---

## 12. 风险与对策

| 风险 | 对策 |
| --- | --- |
| clip + diff 产生大量 ANSI 抖动 | 先正确性后优化；必要时 scroll 区域短时整段重绘 |
| measure 性能（超长列表） | M7 全量 mount；文档注明行数建议；M8 虚拟化 |
| offset 与 TextInput 焦点冲突 | 明确 interaction 优先级；E2E 覆盖 |
| 水平滚动与边框 padding 交互复杂 | M7 仅垂直；水平 API 预留 |

---

## 13. 完成后的文档更新清单

M7 落地时同步更新：

- [ ] [TUI_IMPLEMENTATION_PLAN.md](./TUI_IMPLEMENTATION_PLAN.md) — M7 勾选子项
- [ ] [LAYOUT.md](./LAYOUT.md) — overflow/scroll 从「后续」改为已实现
- [ ] [RENDERER.md](./RENDERER.md) — clip/scroll paint 规则
- [ ] [WIDGETS.md](./WIDGETS.md) — ScrollView / List API
- [ ] [VNODE.md](./VNODE.md) — 若采用 intrinsic scroll tag
- [ ] [E2E_TESTING.md](./E2E_TESTING.md) — 新增场景列表
- [ ] 根 [README.md](../README.md) — 当前完成状态

---

## 14. 一句话方向

**M7 不是新造一条渲染管线，而是在现有 layout → frame → diff 链上增加 clip、scroll offset 与 ScrollView 语义**，使 binding-level 更新能作用于「可滚动的可见窗口」，从而让 BindTTY 从控件 demo 迈向可用的长内容 TUI 应用。
