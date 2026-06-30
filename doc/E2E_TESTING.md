# E2E 测试计划

本文档描述 BindTTY 的端到端测试边界、分层策略与当前第一版落地方式。

## 目标

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
- 覆盖首屏渲染、signal 更新、resize、stop/restart、dispose、Ctrl+C lifecycle。

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

E2E 独立为私有 workspace：

~~~text
packages/e2e/
  package.json
  tsconfig.json
  test/
    app-terminal.test.tsx
~~~

该包不发布，只用于仓库验证。

## 当前测试场景

`packages/e2e/test/app-terminal.test.tsx` 覆盖两组场景。

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

## 后续阶段

### 阶段 2：更多用户场景

- 多层 box/vstack/hstack 混合布局。
- 文本裁剪、边框、颜色、bold 的端到端快照。
- For keyed reorder、remove、reinsert 的可见输出。
- Show fallback 与 active branch 多次切换。

### 阶段 3：交互 Widget E2E

等 widgets/focus/input 落地后补充：

- focus next/previous。
- button press。
- input text editing。
- keyboard event 到 widget action 的完整链路。

### 阶段 4：真实 PTY Smoke Test

在稳定 fake-stream E2E 之外，可选引入 `node-pty` 做真实伪终端 smoke test。

该测试不应替代默认 E2E，因为它更重、更依赖系统环境。建议单独命名为：

~~~text
npm run test:e2e:pty
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
