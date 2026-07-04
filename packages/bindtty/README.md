# bindtty

BindTTY 的用户入口包。组合 runtime、layout、renderer、terminal、interaction，提供 `createApp`、JSX runtime 转发与高层控件 re-export。

## 安装

```bash
npm install bindtty @bindtty/signal
```

ViewModel 中的 signal 来自 `@bindtty/signal`；`createApp` 与控件来自 `bindtty`。JSX runtime 已作为 `bindtty` 的依赖一并安装，无需单独安装 `@bindtty/jsx-runtime`（除非你想显式引用该包）。

## tsconfig

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "bindtty"
  }
}
```

`bindtty` 通过 `./jsx-runtime` 与 `./jsx-dev-runtime` 子路径转发 `@bindtty/jsx-runtime`。也可直接使用 `jsxImportSource: "@bindtty/jsx-runtime"`。

## 导出

```ts
import { createApp, Button, TextInput, ScrollView, List } from "bindtty";
import { createSignal, computed } from "@bindtty/signal";
```

- `createApp(view, options)` — 创建可运行的 TUI 应用
- `Button` / `TextInput` / `ScrollView` / `List` — 来自 `@bindtty/widgets`

类型：`AppStdout`、`AppViewport`、`BindTTYApp`、`CreateAppOptions`、`ButtonProps`、`TextInputProps` 等。

底层包（`@bindtty/runtime`、`@bindtty/layout` 等）需按需单独引用，顶层包暂不 re-export。

## 用法

### stdout 模式（测试 / 非 TTY）

```ts
import { createApp } from "bindtty";

const app = createApp(view, {
  stdout: process.stdout,
  fallbackViewport: { width: 80, height: 24 }
});

app.start();
```

### terminal 模式（真实终端）

```ts
import { createApp } from "bindtty";
import { createNodeTerminal } from "@bindtty/terminal";

const terminal = createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin
});

const app = createApp(view, { terminal });
app.start();
```

`terminal` 模式由 `TerminalHost` 管理 alternate screen、光标、raw mode、resize 与 keypress。

## 生命周期

| 方法 | 说明 |
| --- | --- |
| `start()` | 注册 flush / resize / key 监听，输出首帧 |
| `render()` | 同步 layout → paint → diff，返回 ANSI patch |
| `resize()` | `renderer.reset()` 后全量重绘 |
| `stop()` | 暂停监听与输出，不释放 runtime root |
| `dispose()` | 释放 runtime、interaction、terminal 与 renderer 状态 |

默认 `autoStart: false`；设为 `true` 时 `createApp` 返回前自动 `start()`。

## 文档

- [doc/APP.md](../../doc/packages/APP.md) — createApp 设计
- [doc/README.md](../../doc/README.md) — 文档索引
