# bindtty createApp 落地设计

本文档描述顶层 `bindtty` 包中的 `createApp` 设计。它不是新的底层能力包，而是把当前已经完成的 runtime、layout、renderer-terminal 组合成一个可运行 TUI 应用的用户入口。

相关文档：

- [VNODE.md](./VNODE.md) — Template / MountedNode 类型设计
- [JSX_RUNTIME.md](./JSX_RUNTIME.md) — TSX → ViewTemplate
- [RUNTIME.md](./RUNTIME.md) — Template → MountedNode、binding、dirty、scheduler
- [LAYOUT.md](./LAYOUT.md) — MountedNode → LayoutNode
- [RENDERER.md](./RENDERER.md) — LayoutNode → Frame → ANSI Patch
- [DESIGN.md](./DESIGN.md) — 视图树总体设计

## 1. 当前基础

当前底层链路已经具备：

```text
TSX
  ↓ @bindtty/jsx-runtime
Template
  ↓ @bindtty/runtime
MountedNode
  ↓ @bindtty/layout
LayoutNode
  ↓ @bindtty/renderer-terminal
ANSI string
```

各包已经完成的职责：

```text
@bindtty/runtime:
  createRuntimeRoot()
  onFlush()
  clearDirty()
  dispose()
  root-owned scheduler

@bindtty/layout:
  layoutRoot(root, { viewport })
  BasicLayoutEngine
  absolute LayoutNode rect contract

@bindtty/renderer-terminal:
  createTerminalRenderer()
  paintLayout()
  diffFrames()
  encodeAnsiPatch()
  render(root, { viewport })
  reset()
```

缺失的是 app layer：

```text
读取 terminal viewport
监听 runtime flush
调用 layout
调用 renderer
写 stdout
处理 resize
处理 dispose
```

当前顶层 `bindtty` 包仍是 placeholder：

```text
packages/bindtty/
  README.md
  package.json
```

因此实现 `createApp` 前，需要先把顶层包改造成真实 TypeScript 包。

## 2. 现有模块适配结论

对照当前实现，底层包基本不需要为了 `createApp` 反向改造。

| 模块 | 当前状态 | 是否需要改造 | 结论 |
| --- | --- | --- | --- |
| `@bindtty/runtime` | 已提供 `createRuntimeRoot()`、`onFlush()`、`clearDirty()`、`dispose()` | 否 | app 直接使用即可 |
| `@bindtty/layout` | 已提供 `layoutRoot(root, { viewport })`，`LayoutNode` 使用绝对坐标 | 否 | app 只负责传 viewport |
| `@bindtty/renderer-terminal` | 已提供 `createTerminalRenderer()`、`render()`、`reset()` | 否 | app 只负责持有 renderer |
| `@bindtty/vnode` | 已提供 `ViewTemplate` / `Template` 类型 | 否 | app 参数使用 `ViewTemplate` |
| `@bindtty/signal` | 已提供响应式 API | 否 | 顶层包后续可 re-export |
| `bindtty` | 仍是 placeholder 包 | 是 | 需要新增 `src`、构建、测试、依赖 |

需要注意的现有行为：

```text
runtime:
  onFlush 返回 unsubscribe。
  dispose 后 onFlush 返回 noop unsubscribe。
  flush listener 抛错会向外冒出。

layout:
  null root 返回 null。
  不读取 terminal。
  不裁剪 viewport，renderer 负责最终裁剪。

renderer-terminal:
  render(null, { viewport }) 会生成空白 frame 并清理 previous frame。
  reset() 只清 previous frame，不写 stdout。
  render() 返回 ANSI string，不直接写 terminal。
```

因此 MVP 的主要实现工作集中在：

```text
packages/bindtty
```

## 3. 包归属

MVP 中 `createApp` 放在顶层 `bindtty` 包：

```text
packages/bindtty
```

不新建 `@bindtty/app`。

原因：

```text
1. createApp 是用户入口，不是底层算法能力。
2. runtime / layout / renderer 已经分包。
3. 放在 bindtty 包中可以先稳定用户 API。
4. 后续 app 生命周期明显复杂后，再拆 @bindtty/app 也不迟。
```

目标依赖方向：

```text
bindtty
  import @bindtty/runtime
  import @bindtty/layout
  import @bindtty/renderer-terminal
  import @bindtty/signal
  export user-facing API

@bindtty/runtime
  不 import layout / renderer / bindtty

@bindtty/layout
  不 import renderer / bindtty

@bindtty/renderer-terminal
  不 import runtime / bindtty
```

## 4. 包结构

建议落地结构：

```text
packages/bindtty/
  src/
    index.ts
    app.ts
  test/
    app.test.ts
    tsconfig.json
  package.json
  tsconfig.json
```

`app.ts`：

```text
createApp()
AppOptions
BindTTYApp
stdout / viewport adapter 类型
```

`index.ts`：

```text
export createApp
export signal APIs
export commonly used template / runtime APIs if needed
```

MVP 可以先只导出 `createApp`，再逐步整理统一入口导出面。

`package.json` 需要从 placeholder 改为可构建包：

```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "npm run build --workspace @bindtty/runtime && npm run build --workspace @bindtty/layout && npm run build --workspace @bindtty/renderer-terminal && npm run build && tsc -p test/tsconfig.json && node --test test/dist/*.test.js"
  }
}
```

依赖：

```text
dependencies:
  @bindtty/runtime
  @bindtty/layout
  @bindtty/renderer-terminal
  @bindtty/vnode
  @bindtty/signal

devDependencies:
  @types/node
  typescript
```

## 5. 目标

`createApp` 的目标是把当前 root view 真正输出到 terminal-like stdout。

```text
ViewTemplate
  ↓ createApp
BindTTYApp
  ↓ start
stdout.write(ANSI)
```

它负责：

```text
1. 创建 RuntimeRoot。
2. 创建 TerminalRenderer。
3. 读取 stdout.columns / stdout.rows。
4. 首帧 render。
5. runtime flush 后重新 layout / render。
6. resize 后 reset renderer 并重绘。
7. dispose 时释放 runtime 和监听器。
```

它不负责：

```text
1. layout 计算细节。
2. ANSI diff 细节。
3. widget 行为。
4. interaction focus manager。
5. keyboard input。
6. stdin raw mode。
7. alternate screen。
8. cursor hide / show 生命周期。
```

这些能力后续再分阶段加入。

## 6. 对外 API

建议 MVP API：

```ts
export interface AppStdout {
  columns?: number;
  rows?: number;
  write(chunk: string): unknown;
  on?(event: "resize", listener: () => void): unknown;
  off?(event: "resize", listener: () => void): unknown;
}

export interface AppStdin {
  // MVP 暂不读取 stdin，先作为 future 入口保留。
}

export interface CreateAppOptions {
  stdout: AppStdout;
  stdin?: AppStdin;
  fallbackViewport?: {
    width: number;
    height: number;
  };
  autoStart?: boolean;
}

export interface BindTTYApp {
  start(): void;
  render(): string;
  resize(): string;
  stop(): void;
  dispose(): void;
}

export function createApp(
  view: ViewTemplate,
  options: CreateAppOptions
): BindTTYApp;
```

默认 viewport：

```text
stdout.columns ?? fallbackViewport.width ?? 80
stdout.rows ?? fallbackViewport.height ?? 24
```

`render()` 返回本次写入的 ANSI string，方便测试。

`resize()` 返回重绘 ANSI string，方便测试。

## 7. 生命周期

### 7.1 createApp

`createApp()` 只创建对象和内部资源：

```text
createRuntimeRoot(view)
createTerminalRenderer()
create lifecycle state
```

是否立即渲染由 `autoStart` 控制。

MVP 推荐默认：

```text
autoStart = false
```

原因：

```text
1. 测试更可控。
2. 用户可以先配置 terminal。
3. 后续 alternate screen / raw mode 可以在 start() 中进入。
```

如果 `autoStart` 为 `true`，`createApp()` 在返回前调用一次 `start()`。

### 7.2 start

`start()` 做首帧输出：

```text
register runtime.onFlush()
optional register stdout resize listener
read viewport
layoutRoot(runtime.root, { viewport })
renderer.render(layoutTree, { viewport })
stdout.write(patch)
runtime.clearDirty()
```

重复调用 `start()` 应该幂等：

```text
未 started:
  执行首帧 render

已 started:
  不重复注册监听
  no-op
```

MVP 建议已 started 时 no-op。

`stop()` 后再次调用 `start()` 应恢复监听并重新 render 当前 runtime root。

### 7.3 render

`render()` 是 app 内部和测试共用的同步渲染入口。

伪代码：

```ts
function render() {
  if (disposed) {
    return "";
  }

  const viewport = readViewport();
  const layoutTree = layoutRoot(runtime.root, { viewport });
  const patch = renderer.render(layoutTree, { viewport });

  if (patch !== "") {
    stdout.write(patch);
  }

  runtime.clearDirty();
  return patch;
}
```

`render()` 不主动调用 `renderer.reset()`。

### 7.4 runtime flush

runtime flush listener 中调用 `render()`：

```ts
flushUnsubscribe = runtime.onFlush(() => {
  render();
});
```

`runtime.clearDirty()` 应在 layout / render 完成后调用。

如果 `render()` 过程中抛错，MVP 允许错误冒出；后续再设计 error boundary。

### 7.5 resize

resize 由 app layer 监听。

```ts
function resize() {
  if (disposed) {
    return "";
  }

  renderer.reset();
  return render();
}
```

监听逻辑：

```ts
stdout.on?.("resize", resize);
```

释放逻辑：

```ts
stdout.off?.("resize", resize);
```

renderer 不监听 resize，layout 不监听 resize。

### 7.6 stop

MVP 中 `stop()` 表示停止响应 terminal resize 和 runtime flush，但不 dispose root。

建议行为：

```text
1. 标记 started = false。
2. 取消 runtime flush listener。
3. 取消 stdout resize listener。
4. 不调用 runtime.dispose()。
5. 不清屏。
```

`stop()` 后 signal 仍可能更新 mounted tree，但 app 不写 stdout。再次 `start()` 时应对当前 runtime root 做一次 render。

MVP 暴露 `stop()`，但它只表示暂停 app layer 监听和输出，不释放 runtime root。

### 7.7 dispose

`dispose()` 是最终释放：

```text
1. 幂等。
2. 取消 runtime flush listener。
3. 取消 stdout resize listener。
4. runtime.dispose()。
5. renderer.reset()。
6. 不主动 clear screen。
```

不主动 clear screen 的原因：

```text
1. renderer 当前也不拥有 terminal 生命周期。
2. 用户可能不希望 dispose 清除输出。
3. 后续可以通过 options 增加 clearOnDispose。
```

## 8. Flush 调用链

首帧：

```text
app.start()
  ↓
register listeners
  ↓
readViewport(stdout)
  ↓
layoutRoot(runtime.root, { viewport })
  ↓
renderer.render(layoutTree, { viewport })
  ↓
stdout.write(patch)
  ↓
runtime.clearDirty()
```

signal 更新：

```text
signal.set()
  ↓
runtime binding update
  ↓
runtime scheduler microtask
  ↓
runtime.onFlush(listener)
  ↓
app.render()
  ↓
layoutRoot(runtime.root, { viewport })
  ↓
renderer.render(layoutTree, { viewport })
  ↓
stdout.write(patch)
  ↓
runtime.clearDirty()
```

resize：

```text
stdout resize
  ↓
app.resize()
  ↓
renderer.reset()
  ↓
app.render()
  ↓
full patch
```

## 9. stdout 适配

MVP 只要求 stdout-like 对象：

```ts
interface AppStdout {
  columns?: number;
  rows?: number;
  write(chunk: string): unknown;
  on?(event: "resize", listener: () => void): unknown;
  off?(event: "resize", listener: () => void): unknown;
}
```

测试可以使用：

```ts
function createMockStdout() {
  const writes: string[] = [];
  const listeners = new Set<() => void>();

  return {
    columns: 10,
    rows: 3,
    writes,
    write(chunk: string) {
      writes.push(chunk);
    },
    on(event: "resize", listener: () => void) {
      if (event === "resize") {
        listeners.add(listener);
      }
    },
    off(event: "resize", listener: () => void) {
      if (event === "resize") {
        listeners.delete(listener);
      }
    },
    emitResize() {
      for (const listener of listeners) {
        listener();
      }
    }
  };
}
```

MVP 不直接 import `process.stdout`。用户或外层 CLI 传入 stdout。

## 10. 错误处理

MVP 错误策略：

```text
layoutRoot 抛错:
  冒出

renderer.render 抛错:
  冒出

stdout.write 抛错:
  冒出

runtime flush listener 抛错:
  由当前 runtime scheduler 行为决定
```

暂不实现：

```text
error boundary
onError callback
fallback UI
recoverable render
```

后续可以扩展：

```ts
createApp(view, {
  stdout,
  onError(error) {
    // log / render fallback / dispose
  }
});
```

## 11. MVP 落地阶段

### 阶段 1：包骨架

状态：已完成。

目标：

```text
1. packages/bindtty/src/index.ts
2. packages/bindtty/src/app.ts
3. packages/bindtty/tsconfig.json
4. packages/bindtty/test/tsconfig.json
5. package.json build / test 脚本
6. package.json dependencies / devDependencies
```

依赖：

```text
@bindtty/runtime
@bindtty/layout
@bindtty/renderer-terminal
@bindtty/signal
@bindtty/vnode
```

### 阶段 2：createApp 基础输出

状态：已完成。

目标：

```text
1. createApp(view, { stdout })
2. app.start()
3. app.render()
4. readViewport()
5. stdout.write(patch)
6. autoStart true 调用 start()
```

测试：

```text
start 写首帧
fallback viewport 生效
空 patch 不写 stdout
autoStart false 默认不写 stdout
autoStart true 创建后写首帧
```

### 阶段 3：runtime flush 对接

状态：已完成。

目标：

```text
1. runtime.onFlush 调用 app.render()
2. signal update 后写最小 patch
3. render 后 runtime.clearDirty()
4. stop 后取消 runtime flush listener
5. stop 后 start 可恢复监听并重绘
```

测试：

```text
signal update 写 patch
同 tick 多次更新由 runtime coalesce
dispose 后 signal update 不再写
stop 后 signal update 不写
stop 后 start 写当前 root
```

### 阶段 4：resize 对接

状态：已完成。

目标：

```text
1. stdout.on("resize", listener)
2. resize 调 renderer.reset()
3. resize 后 full patch
4. dispose / stop 取消 resize listener
5. start 时注册 resize listener
```

测试：

```text
columns / rows 改变后 full patch
resize 后 previous frame 不复用旧尺寸
dispose 后 emitResize 不写 stdout
stop 后 emitResize 不写 stdout
stop 后 start 重新监听 resize
```

### 阶段 5：生命周期收口

状态：已完成。

目标：

```text
1. start 幂等
2. dispose 幂等
3. stop 行为明确
4. 不主动 clear screen
5. 不进入 stdin raw mode
```

测试：

```text
start 多次不重复首帧
dispose 多次不抛错
dispose 调 runtime.dispose
stop 后不响应 flush / resize
```

## 12. 测试计划

单元测试：

```text
readViewport:
  stdout columns / rows
  fallback viewport
  default 80x24

createApp:
  returns lifecycle methods
  autoStart false by default
  autoStart true writes first frame
```

集成测试：

```text
start:
  TSX / Template 首帧写 stdout

signal:
  signal update 写最小 ANSI patch

show:
  branch switch 写新 branch patch

for:
  item reorder / insert 后写 patch

resize:
  renderer.reset 后 full patch

dispose:
  unsubscribe runtime flush
  remove resize listener
  later signal update no write
```

## 13. 当前结论

`createApp` 应先放在顶层 `bindtty` 包中。

MVP 完成后，用户能写：

```ts
import { createApp } from "bindtty";

const app = createApp(view, {
  stdout: process.stdout,
  stdin: process.stdin
});

app.start();
```

这会打通：

```text
runtime flush
  ↓
layoutRoot
  ↓
renderer.render
  ↓
stdout.write
```

后续再继续推进：

```text
alternate screen
stdin raw mode
keyboard input
interaction focus manager
widgets
```
