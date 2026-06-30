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

## 2. 包归属

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

## 3. 包结构

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

## 4. 目标

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
4. focus manager。
5. keyboard input。
6. stdin raw mode。
7. alternate screen。
8. cursor hide / show 生命周期。
```

这些能力后续再分阶段加入。

## 5. 对外 API

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

## 6. 生命周期

### 6.1 createApp

`createApp()` 只创建对象和内部资源：

```text
createRuntimeRoot(view)
createTerminalRenderer()
register runtime.onFlush()
optional register stdout resize listener
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

### 6.2 start

`start()` 做首帧输出：

```text
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
  可以选择 no-op
```

MVP 建议已 started 时 no-op。

### 6.3 render

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

### 6.4 runtime flush

runtime flush listener 中调用 `render()`：

```ts
const unsubscribe = runtime.onFlush(() => {
  render();
});
```

`runtime.clearDirty()` 应在 layout / render 完成后调用。

如果 `render()` 过程中抛错，MVP 允许错误冒出；后续再设计 error boundary。

### 6.5 resize

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

### 6.6 stop

MVP 中 `stop()` 表示停止响应 terminal resize 和 runtime flush，但不 dispose root。

建议行为：

```text
1. 标记 started = false。
2. 取消 runtime flush listener。
3. 取消 stdout resize listener。
4. 不调用 runtime.dispose()。
5. 不清屏。
```

后续如果需要 pause/resume，可以在 `start()` 中重新注册监听并 render。

如果不想引入 pause 语义，MVP 也可以先不暴露 `stop()`。但文档保留它，方便未来 app lifecycle。

### 6.7 dispose

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

## 7. Flush 调用链

首帧：

```text
app.start()
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

## 8. stdout 适配

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

## 9. 错误处理

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

## 10. MVP 落地阶段

### 阶段 1：包骨架

目标：

```text
1. packages/bindtty/src/index.ts
2. packages/bindtty/src/app.ts
3. packages/bindtty/tsconfig.json
4. packages/bindtty/test/tsconfig.json
5. package.json build / test 脚本
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

目标：

```text
1. createApp(view, { stdout })
2. app.start()
3. app.render()
4. readViewport()
5. stdout.write(patch)
```

测试：

```text
start 写首帧
fallback viewport 生效
空 patch 不写 stdout
```

### 阶段 3：runtime flush 对接

目标：

```text
1. runtime.onFlush 调用 app.render()
2. signal update 后写最小 patch
3. render 后 runtime.clearDirty()
```

测试：

```text
signal update 写 patch
同 tick 多次更新由 runtime coalesce
dispose 后 signal update 不再写
```

### 阶段 4：resize 对接

目标：

```text
1. stdout.on("resize", listener)
2. resize 调 renderer.reset()
3. resize 后 full patch
4. dispose / stop 取消 resize listener
```

测试：

```text
columns / rows 改变后 full patch
resize 后 previous frame 不复用旧尺寸
dispose 后 emitResize 不写 stdout
```

### 阶段 5：生命周期收口

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

## 11. 测试计划

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

## 12. 当前结论

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
focus manager
widgets
```
