# @bindtty/terminal 落地设计

本文档描述 BindTTY 的 Terminal Host 设计。它不是 renderer，也不是 widget 系统；它位于 `bindtty` app 与真实 `process.stdout` / `process.stdin` 之间，负责终端会话生命周期和输入事件。

相关文档：

- [APP.md](./APP.md) — `createApp` 组合 runtime / layout / renderer / stdout
- [RENDERER.md](./RENDERER.md) — `LayoutNode` → `Frame` → ANSI Patch
- [LAYOUT.md](./LAYOUT.md) — `MountedNode` → `LayoutNode`
- [RUNTIME.md](./RUNTIME.md) — Template → MountedNode、binding、dirty、scheduler
- [JSX_RUNTIME.md](./JSX_RUNTIME.md) — TSX → ViewTemplate

## 1. 背景

当前 APP MVP 已经打通：

```text
runtime flush
  ↓
layoutRoot
  ↓
renderer.render
  ↓
stdout.write
```

但它还没有接管真实终端会话。

当前 `createApp` 管：

```text
1. 创建 RuntimeRoot。
2. 创建 TerminalRenderer。
3. 读取 stdout.columns / stdout.rows。
4. 首帧 render。
5. runtime flush 后重新 layout / render。
6. stdout resize 后 reset renderer 并重绘。
7. stop / dispose app 监听器。
```

当前 `createApp` 不管：

```text
1. alternate screen。
2. cursor hide / show。
3. stdin raw mode。
4. keypress 解析。
5. Ctrl+C / SIGINT / SIGTERM。
6. process exit 时恢复终端状态。
7. mouse / paste / focus terminal protocol。
```

这些能力属于 Terminal Host。

## 2. 目标

Terminal Host 的目标是回答真实终端 IO 和生命周期问题：

```text
ANSI patch
  ↓ terminal.write
real stdout

real stdin
  ↓ keypress parser
TerminalKeyEvent
```

它负责：

```text
1. 写 stdout。
2. 读取 terminal viewport。
3. 监听 resize。
4. 可选进入 / 退出 alternate screen。
5. 可选隐藏 / 恢复 cursor。
6. 可选进入 / 退出 stdin raw mode。
7. 解析 keypress 事件。
8. 处理 Ctrl+C 和进程退出恢复。
```

它不负责：

```text
1. Template / MountedNode。
2. runtime binding / dirty / scheduler。
3. layout 计算。
4. Frame diff。
5. widget 行为。
6. interaction focus manager。
7. TextInput value / selection / cursor 逻辑。
8. 输入法 IME 候选窗和 preedit。
```

输入法 IME 先交给系统输入法和终端处理。Terminal Host 只接收终端提交后的最终字符。

## 3. 包归属

建议新增独立包：

```text
packages/terminal
name: @bindtty/terminal
```

原因：

```text
1. renderer-terminal 只负责 LayoutNode → ANSI patch。
2. bindtty app 只负责 runtime / layout / renderer 调度。
3. terminal host 负责真实终端状态和 IO。
4. 后续 PTY E2E、mock terminal、Node terminal adapter 都可以独立演进。
```

目标依赖方向：

```text
bindtty
  import @bindtty/terminal
  import @bindtty/runtime
  import @bindtty/layout
  import @bindtty/renderer-terminal

@bindtty/terminal
  不 import runtime / layout / renderer / vnode

@bindtty/renderer-terminal
  不 import terminal / runtime / bindtty
```

## 4. 包结构

建议落地结构：

```text
packages/terminal/
  src/
    index.ts
    ansi.ts
    host.ts
    input.ts
    types.ts
  test/
    terminal.test.ts
    input.test.ts
    tsconfig.json
  package.json
  tsconfig.json
```

模块职责：

```text
types.ts
  TerminalHost、TerminalKeyEvent、TerminalViewport、stream adapter 类型。

ansi.ts
  alternate screen、cursor、reset 等终端控制序列。

host.ts
  createNodeTerminal()，管理 start / stop / dispose / write / resize / key。

input.ts
  stdin keypress 归一化，Node key object → TerminalKeyEvent。

index.ts
  对外导出。
```

## 5. 对外 API

### 5.1 Stream Adapter

Terminal Host 不应该强绑定 `process.stdout` / `process.stdin` 的完整 Node 类型。MVP 使用最小 adapter，方便测试。

```ts
export interface TerminalStdout {
  columns?: number;
  rows?: number;
  write(chunk: string): unknown;
  on?(event: "resize", listener: () => void): unknown;
  off?(event: "resize", listener: () => void): unknown;
}

export interface TerminalStdin {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?(enabled: boolean): unknown;
  resume?(): unknown;
  pause?(): unknown;
  on?(event: "keypress", listener: KeypressListener): unknown;
  off?(event: "keypress", listener: KeypressListener): unknown;
}
```

`TerminalStdin` 的 keypress 来源可以是 Node 的 `readline.emitKeypressEvents(stdin)`，也可以是测试 mock 手动触发。

### 5.2 TerminalHost

建议 MVP API：

```ts
export interface TerminalViewport {
  width: number;
  height: number;
}

export interface TerminalKeyEvent {
  input: string;
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence?: string;
}

export interface CreateNodeTerminalOptions {
  stdout: TerminalStdout;
  stdin?: TerminalStdin;
  fallbackViewport?: TerminalViewport;
  useAltScreen?: boolean;
  hideCursor?: boolean;
  rawMode?: boolean;
  exitOnCtrlC?: boolean;
}

export interface TerminalHost {
  readonly viewport: TerminalViewport;

  start(): void;
  stop(): void;
  dispose(): void;

  write(chunk: string): void;

  onResize(listener: () => void): () => void;
  onKey(listener: (event: TerminalKeyEvent) => void): () => void;
}

export function createNodeTerminal(options: CreateNodeTerminalOptions): TerminalHost;
```

默认值建议：

```text
fallbackViewport = { width: 80, height: 24 }
useAltScreen = false
hideCursor = false
rawMode = false
exitOnCtrlC = true
```

默认不进入 alternate screen / raw mode，是为了保持当前 APP MVP 的温和行为。真实 CLI 可以显式打开。

## 6. ANSI 控制序列

`@bindtty/terminal` 可以提供常量：

```ts
export const ANSI = {
  enterAltScreen: "\x1b[?1049h",
  exitAltScreen: "\x1b[?1049l",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  reset: "\x1b[0m"
};
```

MVP 不默认 clear screen。

原因：

```text
1. renderer 已经只输出 patch，不拥有 terminal 生命周期。
2. createApp 当前也不主动清屏。
3. 用户可能希望退出后保留最后一帧。
4. 后续可以用 clearOnStart / clearOnDispose 显式配置。
```

## 7. 生命周期

Terminal Host 生命周期必须幂等。

### 7.1 createNodeTerminal

`createNodeTerminal()` 只创建对象和内部状态：

```text
store streams
store options
create listener sets
create lifecycle state
```

它不应立即写 stdout，不应立即进入 raw mode。

### 7.2 start

`start()` 做终端接管：

```text
if started or disposed:
  no-op

started = true

if useAltScreen:
  stdout.write(ANSI.enterAltScreen)

if hideCursor:
  stdout.write(ANSI.hideCursor)

if rawMode and stdin.setRawMode:
  stdin.setRawMode(true)
  stdin.resume?.()

register stdout resize listener
register stdin keypress listener
// 注意：process restore hooks (process.on("exit") 等) 当前未实现。
// 如果进程收到 SIGTERM 或以其他方式退出而未调用 dispose()，
// 终端可能留在 unclean state（alternate screen、cursor、raw mode 未恢复）。
```

写入顺序建议：

```text
enterAltScreen
hideCursor
```

### 7.3 stop

`stop()` 恢复终端状态，但不 dispose listener set：

```text
if not started:
  no-op

unregister stdout resize listener
unregister stdin keypress listener

if rawMode and stdin.setRawMode:
  stdin.setRawMode(false)

if hideCursor:
  stdout.write(ANSI.showCursor)

if useAltScreen:
  stdout.write(ANSI.exitAltScreen)

started = false
```

恢复顺序建议：

```text
rawMode off
showCursor
exitAltScreen
```

### 7.4 dispose

`dispose()` 是最终释放：

```text
if disposed:
  no-op

stop()
clear resize listeners
clear key listeners
remove process restore hooks
disposed = true
```

`dispose()` 后：

```text
write() no-op
onResize() 返回 noop unsubscribe
onKey() 返回 noop unsubscribe
start() no-op
stop() no-op
dispose() no-op
```

## 8. Viewport 与 Resize

viewport 读取顺序：

```text
stdout.columns ?? fallbackViewport.width ?? 80
stdout.rows ?? fallbackViewport.height ?? 24
```

`TerminalHost.viewport` 每次读取都应该反映当前 stdout 尺寸：

```ts
get viewport() {
  return readViewport();
}
```

resize 监听：

```ts
stdout.on?.("resize", handleResize);
stdout.off?.("resize", handleResize);
```

`handleResize` 调用所有 `onResize` listeners。

Terminal Host 不直接调用 `app.resize()`。它只发事件，由 app 决定如何响应。

## 9. 输入模型

### 9.1 keypress 归一化

Node 侧可以基于：

```ts
import readline from "node:readline";

readline.emitKeypressEvents(stdin as NodeJS.ReadStream);
```

然后监听：

```ts
stdin.on("keypress", (input, key) => {
  emitKey({
    input: input ?? "",
    name: key?.name,
    ctrl: Boolean(key?.ctrl),
    meta: Boolean(key?.meta),
    shift: Boolean(key?.shift),
    sequence: key?.sequence
  });
});
```

MVP key event 示例：

```ts
{ input: "a", name: "a", ctrl: false, meta: false, shift: false, sequence: "a" }
{ input: "", name: "return", ctrl: false, meta: false, shift: false }
{ input: "", name: "backspace", ctrl: false, meta: false, shift: false }
{ input: "", name: "left", ctrl: false, meta: false, shift: false }
{ input: "", name: "right", ctrl: false, meta: false, shift: false }
{ input: "c", name: "c", ctrl: true, meta: false, shift: false, sequence: "\x03" }
```

### 9.2 Ctrl+C

`exitOnCtrlC = true` 时：

```text
if event.ctrl && event.name === "c":
  dispose()
```

是否调用 `process.exit(0)` 不放在 Terminal Host MVP 内。

原因：

```text
1. 测试更安全。
2. App / CLI 可以决定退出策略。
3. 后续可以增加 onExitRequest。
```

更推荐后续扩展：

```ts
onExitRequest?: (reason: "ctrl-c" | "sigint" | "sigterm") => void;
```

### 9.3 IME

Terminal Host 不自己实现输入法。

它只处理：

```text
1. 终端提交后的 Unicode 字符。
2. 特殊键。
3. modifier key。
4. paste 后收到的字符序列。
```

它不处理：

```text
1. 拼音 / 假名等 preedit 文本。
2. 候选窗。
3. compositionstart / compositionupdate / compositionend。
```

这些能力一般由系统输入法和终端处理。TextInput widget 后续只消费最终字符。

## 10. 与 createApp 的关系

当前 APP API：

```ts
createApp(view, {
  stdout: process.stdout
});
```

后续可以新增：

```ts
createApp(view, {
  terminal: createNodeTerminal({
    stdout: process.stdout,
    stdin: process.stdin,
    useAltScreen: true,
    hideCursor: true,
    rawMode: true
  })
});
```

兼容策略：

```text
1. 保留 stdout 模式。
2. 新增 terminal 模式。
3. options 中 stdout 与 terminal 互斥。
4. terminal 模式优先使用 terminal.viewport 和 terminal.write。
```

app 接入伪代码：

```ts
function start() {
  terminal?.start();
  terminalResizeUnsubscribe = terminal?.onResize(() => resize()) ?? null;
  runtimeFlushUnsubscribe = runtime.onFlush(() => render());
  render();
}

function render() {
  const viewport = terminal?.viewport ?? readStdoutViewport();
  const layoutTree = layoutRoot(runtime.root, { viewport });
  const patch = renderer.render(layoutTree, { viewport });

  if (patch !== "") {
    if (terminal) {
      terminal.write(patch);
    } else {
      stdout.write(patch);
    }
  }

  runtime.clearDirty();
  return patch;
}

function stop() {
  runtimeFlushUnsubscribe?.();
  terminalResizeUnsubscribe?.();
  terminal?.stop();
}

function dispose() {
  stop();
  runtime.dispose();
  renderer.reset();
  terminal?.dispose();
}
```

`renderer-terminal` 不感知 Terminal Host。

## 11. 与未来 Widget / Input 的关系

建议分层：

```text
TerminalHost:
  stdin bytes / keypress
  ↓
TerminalKeyEvent
  ↓
InteractionController
  ↓
focused MountedElementNode
  ↓
TextInput / Button / custom widget
```

Terminal Host 只发布 key event。

后续 `@bindtty/interaction` 负责：

```text
1. focus tree。
2. tab / shift-tab。
3. focused node 的 onKey 派发。
4. focus change 通知。
```

后续 `@bindtty/widgets` 或 `@bindtty/input` 负责：

```text
1. enter / space 激活 button。
2. TextInput value / cursor / selection。
3. disabled / readonly 这类控件语义。
```

## 12. 错误处理

MVP 错误策略：

```text
stdout.write 抛错:
  冒出

stdin.setRawMode 抛错:
  冒出

listener 抛错:
  冒出
```

暂不实现：

```text
1. onError。
2. recoverable terminal restore error。
3. error boundary。
```

但 `stop()` / `dispose()` 的 restore 顺序要尽量简单，后续可以扩展 best-effort restore。

## 13. 测试策略

MVP 不依赖真实 TTY。优先 mock stream。

Mock stdout：

```ts
function createMockStdout() {
  const writes: string[] = [];
  const resizeListeners = new Set<() => void>();

  return {
    columns: 10,
    rows: 3,
    writes,
    write(chunk: string) {
      writes.push(chunk);
    },
    on(event: "resize", listener: () => void) {
      if (event === "resize") {
        resizeListeners.add(listener);
      }
    },
    off(event: "resize", listener: () => void) {
      if (event === "resize") {
        resizeListeners.delete(listener);
      }
    },
    emitResize() {
      for (const listener of [...resizeListeners]) {
        listener();
      }
    }
  };
}
```

Mock stdin：

```ts
function createMockStdin() {
  const keyListeners = new Set<KeypressListener>();

  return {
    isTTY: true,
    isRaw: false,
    rawModeCalls: [] as boolean[],
    setRawMode(enabled: boolean) {
      this.isRaw = enabled;
      this.rawModeCalls.push(enabled);
    },
    on(event: "keypress", listener: KeypressListener) {
      if (event === "keypress") {
        keyListeners.add(listener);
      }
    },
    off(event: "keypress", listener: KeypressListener) {
      if (event === "keypress") {
        keyListeners.delete(listener);
      }
    },
    emitKey(input: string, key: KeypressKey) {
      for (const listener of [...keyListeners]) {
        listener(input, key);
      }
    }
  };
}
```

测试用例：

```text
createNodeTerminal:
  不立即写 stdout
  不立即 setRawMode

start:
  useAltScreen 写 enterAltScreen
  hideCursor 写 hideCursor
  rawMode true 调 setRawMode(true)
  注册 resize / keypress listener
  幂等，不重复写 enter / hide / raw

stop:
  rawMode false
  showCursor
  exitAltScreen
  解绑 resize / keypress listener
  幂等

dispose:
  调 stop
  清空 listeners
  write no-op
  onResize / onKey 返回 noop unsubscribe
  幂等

viewport:
  stdout columns / rows
  fallback viewport
  default 80x24

resize:
  emitResize 调 onResize listener
  unsubscribe 后不再调用

input:
  keypress 归一化
  Ctrl+C 在 exitOnCtrlC true 时触发 dispose
  exitOnCtrlC false 时只分发 key event
```

## 14. E2E 策略

第一阶段 E2E 仍然不使用真实 TTY。

建议使用进程级 mock terminal：

```text
parent test process
  ↓ spawn node
child demo app process
  ↓ createNodeTerminal(mock stdout/stdin)
  ↓ createApp(view, { terminal })
JSON lines 输出 writes / events
```

覆盖：

```text
1. start 进入 terminal lifecycle。
2. TSX app 首帧输出。
3. signal update 后输出 patch。
4. resize 后 full repaint。
5. Ctrl+C / dispose 后恢复 terminal。
```

后续 terminal lifecycle 稳定后，再增加 PTY E2E：

```text
node-pty / 系统 pty
  验证 alternate screen
  验证 raw mode keypress
  验证 cursor restore
  验证异常退出 restore
```

## 15. 落地阶段

### 阶段 1：包骨架

状态：已完成。

目标：

```text
1. packages/terminal/src/index.ts
2. packages/terminal/src/types.ts
3. packages/terminal/src/ansi.ts
4. packages/terminal/tsconfig.json
5. packages/terminal/test/tsconfig.json
6. package.json build / test 脚本
```

### 阶段 2：输出生命周期

状态：已完成。

目标：

```text
1. createNodeTerminal()
2. write()
3. start / stop / dispose
4. useAltScreen
5. hideCursor
6. 幂等生命周期
```

### 阶段 3：viewport 与 resize

状态：已完成。

目标：

```text
1. viewport getter
2. fallback viewport
3. stdout resize listener
4. onResize / unsubscribe
```

### 阶段 4：input

状态：已完成。

目标：

```text
1. rawMode
2. keypress listener
3. normalize key event
4. onKey / unsubscribe
5. exitOnCtrlC
```

### 阶段 5：app 接入

状态：已完成。

目标：

```text
1. createApp 支持 terminal option
2. terminal.start / stop / dispose
3. terminal.onResize 接 app.resize
4. terminal.write 替代 stdout.write
5. 保留 stdout 模式兼容
```

## 16. 当前结论

`@bindtty/terminal` 应作为独立包落地。

它的边界是：

```text
TerminalHost = real terminal lifecycle + IO event adapter
```

它不进入 renderer，也不直接处理 widget 行为。

推荐下一步：

```text
1. 新建 @bindtty/terminal 空包。
2. 先实现输出生命周期。
3. 再实现 resize。
4. 再实现 input。
5. 最后接入 createApp。
```
