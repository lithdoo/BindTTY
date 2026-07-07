# bindtty

BindTTY 的用户入口包。组合 runtime、layout、renderer、terminal、interaction，提供 **alpha 冻结的公共 API**：`createApp`、signal 原语与 JSX runtime 转发。

高层控件（Button、TextInput、Textarea、Select 等）请单独安装 [`@bindtty/widgets`](../widgets/README.md)。

## 安装

```bash
npm install bindtty
```

使用官方 widgets 时：

```bash
npm install bindtty @bindtty/widgets
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
| 类型 | `CreateAppOptions`、`BindTTYApp`、`ReadableSignal`、`Signal`、… |

```ts
import { computed, createApp, createSignal } from "bindtty";
import { Button, TextInput, Textarea } from "@bindtty/widgets";
```

### 子路径

| 路径 | 用途 |
| --- | --- |
| `bindtty/jsx-runtime` | TSX 编译（`jsxImportSource: "bindtty"` 时自动解析） |
| `bindtty/jsx-dev-runtime` | 开发模式 JSX |

### 按需单独引用（非顶层 re-export）

| 包 | 典型用途 |
| --- | --- |
| `@bindtty/widgets` | Button、TextInput、Textarea、Select、ScrollView、List 等控件 |
| `@bindtty/terminal` | `createNodeTerminal`、真实 TTY lifecycle |
| `@bindtty/input` | raw keyboard input parser；一般由 terminal 使用，应用通常无需直接引用 |
| `@bindtty/signal` | 与 `bindtty` 相同 API；可独立用于无 TUI 的 signal 逻辑 |
| `@bindtty/runtime`、`@bindtty/vnode`、`@bindtty/layout` 等 | 高级扩展、测试、框架内部 |

**不**从 `bindtty` 导出 `runtime` / `vnode` / `layout` / `renderer-terminal` / widgets，避免公共面过大。

### Peer dependencies

`@bindtty/signal` 为 **peer dependency**（同时保留在 `dependencies` 中，以便 `npm install bindtty` 自动安装）。全应用应只有**一份** `@bindtty/signal` 实例——应用与 widgets 内部 `createSignal` / `computed` 须解析到同一模块，否则可能出现 computed 不更新、订阅链断裂。

推荐统一从 `bindtty` 导入 signal，勿单独安装另一版本的 `@bindtty/signal`。使用 widgets 时，`bindtty` 与 `@bindtty/widgets` 请保持**同版本号**发布（如均为 `0.1.0-alpha.3`）。

**排障：**

```text
症状：computed 不更新、控件状态异常
检查：npm ls @bindtty/signal
修复：
  1. 只从 bindtty 导入 createSignal / computed / effect
  2. npm uninstall @bindtty/signal（若单独装了冲突版本）
  3. npm dedupe && npm install
  4. 应用 package.json overrides: { "@bindtty/signal": "0.1.0-alpha.3" }
```

## 快速开始

```ts
import { computed, createApp, createSignal } from "bindtty";
import { Button } from "@bindtty/widgets";

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
- [@bindtty/widgets README](../widgets/README.md) — 控件 API
