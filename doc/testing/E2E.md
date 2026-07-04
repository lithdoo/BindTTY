# E2E 测试规范

> **类型**：testing  
> **状态**：implemented  
> **最后核对**：2026-07  
> **代码入口**：packages/e2e/mock/ · packages/e2e/real/  
> **相关**：[APP.md](../packages/APP.md) · [DISPLAY_WIDTH.md](../specs/DISPLAY_WIDTH.md) · [SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md)

相关文档：[packages/e2e/README.md](../../packages/e2e/README.md) · [SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md) §8 · [DISPLAY_WIDTH.md](../specs/DISPLAY_WIDTH.md) §9

## 1. 目标与范围

E2E 测试验证公开包组合后的真实使用链路，而不是重复各包内部单元测试。

~~~text
TSX
  -> @bindtty/jsx-runtime
  -> @bindtty/vnode
  -> @bindtty/runtime
  -> @bindtty/layout
  -> @bindtty/renderer-terminal
  -> bindtty createApp
  -> @bindtty/terminal
  -> stdout / stdin boundary
~~~

第一版 E2E 的核心目标：

- 使用真实 TSX 写法。
- 只通过公开包名导入，不使用源码相对路径。
- 使用真实 `createApp`。
- 使用真实 `createNodeTerminal`。
- fake `stdout` / `stdin`，避免依赖当前进程是否处于 TTY。
- 覆盖首屏渲染、signal 更新、resize、stop/restart、dispose、Ctrl+C lifecycle、keyboard focus 与 `onKey` dispatch。

## 为什么 fake stdout / stdin

`@bindtty/terminal` 已经完成 MVP，E2E 不需要 mock 掉 terminal 包本身。

但真实 `process.stdout` / `process.stdin` 受运行环境影响：

- CI 中可能不是 TTY。
- `setRawMode` 不一定存在。
- terminal resize 难以稳定触发。
- alternate screen、cursor、ANSI 输出会污染执行环境。

因此第一版 E2E 采用：

~~~ts
const stdout = createFakeStdout(80, 24);
const stdin = createFakeStdin();
const terminal = createNodeTerminal({ stdout, stdin });
const app = createApp(<screen />, { terminal });
~~~

这样可以真实经过 terminal host 实现，同时把不可控的操作系统终端边界换成可断言的 fake stream。

## 包结构

E2E 为单一私有 workspace，按目录区分 mock 与 real PTY：

~~~text
packages/e2e/
  mock/
    test/app-terminal.test.tsx    # fake stdout/stdin
  real/
    harness/                      # PTY 子进程应用
    src/                          # pty-session、marker-log
    test/pty-e2e.test.ts
  scripts/
~~~

默认 `npm test`（workspace `@bindtty/e2e`）会跑 mock 与 real；仅 mock 用 `npm run test:mock`。

## 当前测试场景

`packages/e2e/mock/test/app-terminal.test.tsx` 覆盖三组场景。

### App 到 Terminal 完整链路

验证内容：

- TSX component 能被自动 runtime 编译。
- `<show>`、`<for key={...}>`、signal binding 能进入 runtime。
- `createApp` 能驱动 layout、renderer、terminal。
- `createNodeTerminal` 会进入 alternate screen、隐藏光标、开启 raw mode。
- 首屏 ANSI patch 写入 fake stdout。
- signal 更新后产生增量 patch。
- keyed For 新增、复用和重排能反映到可见输出。
- resize 后产生 repaint。
- `stop()` 关闭监听、恢复 raw mode/cursor/alternate screen。
- stop 期间 signal 更新不写入。
- restart 后渲染最新状态。
- `dispose()` 后 signal 与 resize 不再写入。

### Ctrl+C Terminal Lifecycle

验证内容：

- fake stdin 发出 Ctrl+C。
- 真实 `createNodeTerminal` 执行 dispose。
- raw mode、cursor、alternate screen 被恢复。
- 后续写入被忽略。

### Interaction Key Dispatch

验证内容：

- TSX app 中两个 `onKey` 节点能进入 interaction focus list。
- 首个 focus target 有可见 focused 输出。
- fake stdin 发送 Tab 后 focus 移动到第二个 target。
- Enter 只派发给当前 focused target。
- `onKey` callback 更新 signal 后能渲染可见结果。
- `dispose()` 后 fake stdin key 不再触发输出。

### Display-Width / 宽字符（mock + real）

Mock（`app-terminal.test.tsx`）：

- CJK / emoji 首屏与更新、resize rewrap
- ScrollView 包裹 CJK 行滚动
- focus inverse 覆盖 wide char
- TextInput CJK / emoji 输入（记录当前 JS index 语义）
- `examples/wide-text` 同等 UI  smoke

Real PTY（`packages/e2e/real/harness/`）：

- `wide-text-app.tsx` — CJK + emoji 标题、ScrollView 滚动
- `wide-text-resize-app.tsx` — 终端列宽变化后 hard wrap 高度变化

详见 [DISPLAY_WIDTH.md](../specs/DISPLAY_WIDTH.md) §9 与 [../packages/e2e/README.md](../packages/e2e/README.md)。

## 后续阶段

### 阶段 2：更多用户场景

- 多层 box/vstack/hstack 混合布局。
- 文本裁剪、边框、颜色、bold 的端到端快照。
- For keyed reorder、remove、reinsert 的可见输出。
- Show fallback 与 active branch 多次切换。

### 阶段 3：交互 Widget E2E ✅

已在 `packages/e2e/mock/test/app-terminal.test.tsx` 覆盖：

- Button press（Tab 切换 focus、Enter 触发 onPress）。
- TextInput 文本编辑与 signal 更新。
- keyboard event 到 widget action 的完整链路。

### 阶段 4：真实 PTY E2E（已实现）

`packages/e2e/real/` 使用 `node-pty` 在真实伪终端中运行 harness：

```bash
npm run test:e2e:real:win   # Windows ConPTY
npm run test:e2e:real:wsl   # WSL/Linux PTY（需 Ubuntu 等带 Node 的发行版）
```

详见 [packages/e2e/README.md](../packages/e2e/README.md)。

### 阶段 5：Real PTY Smoke / Regression（已实现）

在稳定 fake-stream E2E 之外，当前已引入 `node-pty` 做真实伪终端 smoke / regression test。

该测试不替代 mock E2E 的细粒度断言，因为它更重、更依赖系统环境。可单独运行：

~~~text
npm run test:e2e:real
npm run test:e2e:real:win
npm run test:e2e:real:wsl
~~~

## 判断标准

E2E 通过不代表所有包内部细节正确；它只证明公开 API 组合后能完成真实用户路径。

单元测试继续负责：

- signal 依赖追踪。
- runtime dirty/scheduler。
- layout 尺寸计算。
- renderer frame diff。
- terminal stream lifecycle。

E2E 负责：

- 包导出是否正确。
- TSX 用户写法是否真实可用。
- 多包组合是否能稳定渲染、更新、停止、释放。

## 5. Scroll / Viewport 场景

mock E2E 已覆盖：

- `box overflow="clip"` 静态裁剪（无 `scrollY`）。
- `scrollY` signal 更新后可见窗口变化。
- `ScrollView` focus 后方向键滚动（含 PageUp/PageDown/Home/End/Up）。
- `scrollOnArrow={false}` 时方向键不改变 offset。
- `TextInput` focused 时方向键优先由输入框消费，不滚动外层 `ScrollView`。
- `List` 动态 push/delete 与 scroll clamp 组合。

real PTY E2E 已补充：

- `scroll-app`：`ScrollView` 在真实 TTY 中响应 `\x1b[B`（Down）滚动。
- `scroll-clamp-app`：受控 `offset` 超界时只 clamp 画面，按键后基于 applied offset 更新。
- `list-app`：`List` 在真实 TTY 中响应 Down 滚动。

方向键在 PTY 子进程经 `RawStdinInput` + `parseRawChunk` CSI/SS3 解析；更细的按键组合仍主要由 mock E2E 覆盖。
