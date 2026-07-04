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
| `@bindtty/signal` peer 单实例 | ✅ | `bindtty` / `widgets`：`peerDependencies` + `dependencies` |
| Yoga flex 基础 props | ✅ | `gap`、`flexWrap`、`alignItems`、`justifyContent`、`flexGrow`、`flexShrink` |
| box 尺寸与滚动 | ✅ | `width`、`height`、`overflow`、`scrollX`、`scrollY` |

---

## 3. 当前主要缺口

### 3.1 CI

主 CI：GitHub Actions [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)（`ubuntu-latest`、Node 22）

```yaml
npm ci
npm run build
npm test
npm run build:examples
```

push / PR 到 `main` 自动触发。`npm test` 含 workspace 单测与 `@bindtty/e2e`（mock + real PTY；Linux 上 node-pty 可用）。

real PTY 专项 job（Windows / WSL）可后续单独添加，不阻塞主 CI。

### 3.2 npm 发布

**已完成（2026-07）**：11 包 `0.1.0-alpha.1` 已发布，tag `alpha`。

```bash
npm install bindtty@alpha
# 真实终端另需：npm install @bindtty/terminal@alpha
```

后续版本：`npm run publish:packages`（或 bump 版本后重跑）。`latest` 仍指向旧占位 `0.1.0-alpha.0` 时，请显式安装 `@alpha`。

### 3.3 顶层 API（alpha 冻结）

`bindtty` 导出：

```ts
import {
  Button,
  List,
  ScrollView,
  TextInput,
  computed,
  createApp,
  createSignal,
  effect
} from "bindtty";
```

真实终端另引 `@bindtty/terminal` 的 `createNodeTerminal`。不导出 `runtime` / `vnode` / `layout` / `renderer-terminal`。

### 3.4 Layout prop matrix

**支持矩阵文档**：[LAYOUT_PROPS.md](../specs/LAYOUT_PROPS.md)（§2–§3 由 `npm run gen:layout-props` 从 `packages/layout/src/layout-props.ts` 生成；CI 运行 `check:layout-props`）。

**已落地（Phase 1–3）：** min/max size、edge `padding*`、margin shorthand。

**仍保留在 `futureLayoutProps`（会抛 `Unsupported layout prop`）：** 主要为 `flexDirection`，以及 BasicLayoutEngine 未实现的 Yoga props（`gap`、`flexGrow` 等）。完整列表见 [LAYOUT_PROPS.md](../specs/LAYOUT_PROPS.md) §3.1。

新增 layout prop 须同步：vnode schema、JSX 类型、`layout-props.ts`、Yoga engine、layout 测试，然后 `npm run gen:layout-props`。

### 3.5 文档漂移

- ~~ROADMAP 早期 7 包 / 10 包叙述~~ → 已移入 [archive/plans/PACKAGE_MODEL_HISTORY.md](../archive/plans/PACKAGE_MODEL_HISTORY.md)；ROADMAP 仅描述现行 11 包模型。
- 部分 archive 文档描述落地前状态；以根 README「当前完成状态」与各包 README 为准。

---

## 4. 推荐推进路线

### Phase A：发布与基础设施（P0）

1. ~~GitHub Actions CI~~（已完成）
2. `npm run publish:packages`
3. 冻结 `bindtty` 顶层导出并更新 quick start（已完成）
4. 文档统一为 11 包模型（ROADMAP 已完成；见 [archive/plans/PACKAGE_MODEL_HISTORY.md](../archive/plans/PACKAGE_MODEL_HISTORY.md)）

### Phase B：Layout 与 Scroll（P1）

1. ~~min/max layout props~~（Phase 1 已完成）
2. ~~edge padding / margin props~~（Phase 2–3 已完成）
3. ~~ScrollView `stickToBottom`~~（已完成）
4. ~~layout 支持矩阵文档 + CI 同步~~（Phase 4 已完成）

### Phase C：组件生态（P2）

推荐顺序：Checkbox → Select（单选）→ ProgressBar → Tabs（稍后）

暂缓：Modal / Overlay（需 overlay layer、z-index、focus trap）

### Phase D：暂缓项

见 [TODO.md](../../TODO.md)「暂缓」与各 spec 非目标章节。

---

## 5. Scroll/List 产品化要点

### stickToBottom（P1）— 已实现

```tsx
<ScrollView height={10} stickToBottom offset={scrollY} onOffsetChange={scrollY.set}>
  <List items={vm.logs} getKey={(log) => log.id} render={(log) => <text value={log.message} />} />
</ScrollView>
```

语义见 [SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md) §5.3.1：用户 `up`/`pageup`/`home` 后 detach；`end` 或滚到底 re-attach；内容追加时 auto stick。

### scrollbar（P2）— 已实现（纯视觉 MVP）

`showScrollbar={true}` 在 clip 区域右侧占 1 列，thumb 随 offset 移动。语义见 [SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md) §5.3.2。

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
- 顶层 API 文档冻结（[packages/bindtty/README.md](../../packages/bindtty/README.md)）

### 0.1.0-alpha.2（建议下一版）

- GitHub Actions CI 绿
- 全部包发布到 npm
- `bindtty` 顶层 API 决策落地（signal re-export 已完成）
- ROADMAP / 文档去漂移

### 0.1.0-beta.0

- layout prop matrix 稳定（min/max、margin、edge padding）；文档 CI 同步（`check:layout-props`）
- ~~ScrollView `stickToBottom`~~（已完成）
- ~~ScrollView scrollbar~~（已完成）
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
| 1 | GitHub Actions CI | ✅ done |
| 2 | 文档统一为 11 包模型 | 🔶 partial（ROADMAP 包模型已统一；其余 doc 漂移待清理） |
| 3 | `bindtty` 顶层 API 冻结 | ✅ done |
| 4 | npm 发布元数据 | ✅ done |
| 5 | TextInput display-column spec | ✅ done |
| 6 | TextInput 水平滚动实现 | ✅ done |
| 7 | layout roadmap 与 Yoga 对齐 | ⏳ open |
| 8 | min/max layout props | ⏳ open |
| 9 | edge padding / margin props | ⏳ open |
| 10 | ScrollView stickToBottom | ✅ done |
| 10b | ScrollView scrollbar | ✅ done |
| 11 | Checkbox widget | ⏳ open |
