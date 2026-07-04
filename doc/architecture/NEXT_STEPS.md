# BindTTY Alpha Hardening 规划

> **类型**：architecture  
> **状态**：active  
> **最后核对**：2026-07  
> **相关**：[ROADMAP.md](./ROADMAP.md) · [../../TODO.md](../../TODO.md) · [../specs/TEXT_INPUT.md](../specs/TEXT_INPUT.md)

开放任务 checklist 见根目录 [TODO.md](../../TODO.md)。本文档记录阶段判断、已完成项、优先级与版本目标。

---

## 1. 当前判断

BindTTY 已完成 M1–M7 主链路，进入 **0.1 alpha hardening** 阶段。核心目标不再是补 MVP，而是：

1. 发布可试用的 npm alpha。
2. 冻结并文档化公共 API。
3. 补齐 CI 与回归基础设施。
4. 扩展 layout prop matrix 与 Scroll/List 产品化。
5. 在 API 稳定后扩展组件生态。

主链路：

```text
TSX → ViewTemplate → MountedNode → LayoutNode → Frame → ANSI Patch
```

已具备：signal binding、Yoga layout、Cell Frame diff、terminal lifecycle、focus/onKey、Button / TextInput / ScrollView / List、mock + real PTY E2E、宽字符回归。

---

## 2. 已完成项（勿再列为阻塞）

| 领域 | 状态 | 参考 |
| --- | --- | --- |
| M1–M7 主链路 | ✅ | [ROADMAP.md](./ROADMAP.md) |
| TextInput display-column 输入窗口 | ✅ | [TEXT_INPUT.md](../specs/TEXT_INPUT.md) §1.1、`packages/widgets/src/text-input.ts` |
| display-width / CJK / emoji | ✅ | [DISPLAY_WIDTH.md](../specs/DISPLAY_WIDTH.md) |
| npm 发布元数据 | ✅ | `LICENSE`、`publishConfig`、`scripts/publish-packages.mjs`，版本 `0.1.0-alpha.1` |
| `bindtty` JSX 转发 | ✅ | `packages/bindtty` 导出 `./jsx-runtime`、`./jsx-dev-runtime` |
| Yoga flex 基础 props | ✅ | `gap`、`flexWrap`、`alignItems`、`justifyContent`、`flexGrow`、`flexShrink` |
| box 尺寸与滚动 | ✅ | `width`、`height`、`overflow`、`scrollX`、`scrollY` |

---

## 3. 当前主要缺口

### 3.1 CI 缺失

仓库尚无 `.github/workflows/`。建议 workflow：

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

real PTY 测试建议：手动触发 / nightly / Windows 专用 job，不阻塞主 CI。

### 3.2 npm 发布待执行

工程配置已完成；待运行：

```bash
npm run pack:dry-run
npm run publish:packages   # 默认 --tag alpha
```

`bindtty@0.1.0-alpha.0` 在 npm 上为占位包，需用 `0.1.0-alpha.1` 覆盖发布全部 `@bindtty/*` 子包。

### 3.3 顶层 API 未完全冻结

当前：

```ts
import { createSignal, computed } from "@bindtty/signal";
import { createApp, Button, TextInput } from "bindtty";
```

`bindtty` 已导出 `createApp` 与 widgets，**尚未** re-export signal。待决定：

```ts
// 可选：bindtty 顶层
export { createSignal, computed, effect } from "@bindtty/signal";
```

不建议从顶层导出 `runtime` / `vnode` / `layout` / `renderer-terminal`（公共面过大）。

### 3.4 Layout prop matrix 待补齐

`packages/layout/src/yoga-engine.ts` 中 `futureLayoutProps` 仍对以下 prop 抛 `Unsupported layout prop`：

**P1：** `minWidth`、`minHeight`、`maxWidth`、`maxHeight`

**P2：** `paddingX`、`paddingY`、`paddingTop`、`paddingRight`、`paddingBottom`、`paddingLeft`

**P3：** `margin`、`marginX`、`marginY`、`marginTop`、`marginRight`、`marginBottom`、`marginLeft`

每个 prop 须同时补：vnode schema、JSX intrinsic 类型、Yoga engine、layout tests、文档、alias 测试。

### 3.5 文档漂移

- ROADMAP 仍保留早期 7 包 / 10 包历史叙述（应移入 archive 或加「历史」标注）。
- 部分 archive 文档描述落地前状态；以根 README「当前完成状态」与各包 README 为准。

---

## 4. 推荐推进路线

### Phase A：发布与基础设施（P0）

1. GitHub Actions CI
2. `npm run publish:packages`
3. 冻结 `bindtty` 顶层导出并更新 quick start
4. 文档统一为 11 包模型

### Phase B：Layout 与 Scroll（P1）

1. min/max layout props
2. edge padding / margin props
3. ScrollView `stickToBottom`
4. layout 支持矩阵文档

### Phase C：组件生态（P2）

推荐顺序：Checkbox → Select（单选）→ ProgressBar → Tabs（稍后）

暂缓：Modal / Overlay（需 overlay layer、z-index、focus trap）

### Phase D：暂缓项

见 [TODO.md](../../TODO.md)「暂缓」与各 spec 非目标章节。

---

## 5. Scroll/List 产品化要点

### stickToBottom（P1）

```tsx
<ScrollView height={10} stickToBottom={vm.autoScroll}>
  <List items={vm.logs} getKey={(log) => log.id} render={(log) => <text value={log.message} />} />
</ScrollView>
```

需明确：用户手动上滚后是否保持 stick、动态追加时的 offset 策略。

### scrollbar（P2）

先做视觉指示，不做鼠标交互。需明确是否占用内容宽度、thumb 计算与 CJK clip 关系。

### virtualization

暂缓。先 benchmark，再决定是否实现。

---

## 6. 版本目标（修订）

### 0.1.0-alpha.1（当前）

**已完成：**

- npm 发布元数据、LICENSE、publish 脚本
- TextInput display-column 输入窗口
- `bindtty` JSX runtime 转发

**待完成：**

- CI
- 实际 `npm publish`
- 顶层 API 文档冻结

### 0.1.0-alpha.2（建议下一版）

- GitHub Actions CI 绿
- 全部包发布到 npm
- `bindtty` 顶层 API 决策落地（含是否 re-export signal）
- ROADMAP / 文档去漂移

### 0.1.0-beta.0

- layout prop matrix 稳定（min/max、margin、edge padding）
- ScrollView `stickToBottom`
- Checkbox widget
- changelog、稳定发布流程

---

## 7. 长期原则

### MVVM 叙事

核心价值：**MVVM + signal-driven binding tree for terminal UI**，不是 React VDOM clone。

### widgets 依赖边界

```text
@bindtty/widgets → @bindtty/signal, @bindtty/vnode, @bindtty/interaction, @bindtty/text
```

不应依赖 `runtime` / `layout` / `renderer-terminal` / `terminal`。

### examples 作为产品验收

| 示例 | 验证能力 |
| --- | --- |
| counter | signal + Button |
| form | TextInput |
| log-viewer | ScrollView / List |
| wide-text | CJK / emoji / combining mark |
| yoga-dashboard | Yoga layout + runtime stats |

### 推进顺序

```text
API freeze → CI / release → layout prop matrix → Scroll/List → widgets ecosystem
```

---

## 8. Issue 对照（供 milestone 拆分）

| Issue | 内容 | 状态 |
| --- | --- | --- |
| 1 | GitHub Actions CI | ⏳ open |
| 2 | 文档统一为 11 包模型 | 🔶 partial |
| 3 | `bindtty` 顶层 API 冻结 | 🔶 partial（widgets + jsx 已做，signal 待定） |
| 4 | npm 发布元数据 | ✅ done |
| 5 | TextInput display-column spec | ✅ done |
| 6 | TextInput 水平滚动实现 | ✅ done |
| 7 | layout roadmap 与 Yoga 对齐 | ⏳ open |
| 8 | min/max layout props | ⏳ open |
| 9 | edge padding / margin props | ⏳ open |
| 10 | ScrollView stickToBottom | ⏳ open |
| 11 | Checkbox widget | ⏳ open |
