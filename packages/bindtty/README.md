# bindtty

BindTTY 的用户入口包。组合 runtime、layout、renderer、terminal、interaction，提供 **alpha 冻结的公共 API**：`createApp`、signal 原语、widgets re-export 与 JSX runtime 转发。

## 安装

```bash
npm install bindtty
```

真实终端应用另需 `@bindtty/terminal`（`createNodeTerminal`）。JSX runtime 随 `bindtty` 依赖一并安装。

## tsconfig

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "bindtty"
  }
}
```

`bindtty` 通过 `./jsx-runtime` 与 `./jsx-dev-runtime` 子路径转发 `@bindtty/jsx-runtime`。

## 公共 API（alpha 冻结）

### 自 `bindtty` 导出

| 类别 | 符号 |
| --- | --- |
| 应用 | `createApp` |
| Signal | `createSignal`、`computed`、`effect` |
| Widgets | `Button`、`TextInput`、`ScrollView`、`List` |
| 类型 | `CreateAppOptions`、`BindTTYApp`、`ButtonProps`、`TextInputProps`、`ScrollViewProps`、`ListProps`、`Signal`、`ReadableSignal`、`Dispose` 等 |

```ts
import {
  Button,
  computed,
  createApp,
  createSignal,
  TextInput
} from "bindtty";
```

### 子路径

| 路径 | 用途 |
| --- | --- |
| `bindtty/jsx-runtime` | TSX 编译（`jsxImportSource: "bindtty"` 时自动解析） |
| `bindtty/jsx-dev-runtime` | 开发模式 JSX |

### 按需单独引用（非顶层 re-export）

| 包 | 典型用途 |
| --- | --- |
| `@bindtty/terminal` | `createNodeTerminal`、真实 TTY lifecycle |
| `@bindtty/signal` | 与 `bindtty` 相同 API；可独立用于无 TUI 的 signal 逻辑 |
| `@bindtty/runtime`、`@bindtty/vnode`、`@bindtty/layout` 等 | 高级扩展、测试、框架内部 |

**不**从 `bindtty` 导出 `runtime` / `vnode` / `layout` / `renderer-terminal`，避免公共面过大。

## 快速开始

```ts
import { Button, computed, createApp, createSignal } from "bindtty";

const count = createSignal(0);
const label = computed(() => `Count: ${count.get()}`);

const app = createApp(
  <vstack>
    <text value={label} />
    <Button label="+" onPress={() => count.set(count.get() + 1)} />
  </vstack>,
  { stdout: process.stdout, fallbackViewport: { width: 80, height: 24 } }
);

app.start();
```

### terminal 模式

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
