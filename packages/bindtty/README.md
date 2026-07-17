# bindtty

BindTTY 的用户入口包。它组合 runtime、layout、renderer、terminal、interaction，提供 alpha 阶段稳定的公共 API：`createApp`、signal 原语、JSX runtime 转发，以及 App 级焦点控制。

高层控件（Button、TextInput、Textarea、Select 等）请单独安装 [`@bindtty/widgets`](../widgets/README.md)。`bindtty` 顶层不 re-export widgets。

## 安装

```bash
npm install bindtty
```

使用官方 widgets 时：

```bash
npm install bindtty @bindtty/widgets
```

真实终端应用另需 `@bindtty/terminal`（`createNodeTerminal`）。JSX runtime 随 `bindtty` 依赖一并安装。

当前公开版本为 `0.1.0-alpha.10`；`bindtty`、`@bindtty/widgets`、`@bindtty/terminal` 等官方包建议保持同版本安装。

## tsconfig

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "bindtty"
  }
}
```

`bindtty` 通过 `./jsx-runtime` 和 `./jsx-dev-runtime` 子路径转发 `@bindtty/jsx-runtime`。

## 公共 API（alpha）

### `bindtty` 导出

| 类别 | 符号 |
| --- | --- |
| 应用 | `createApp` |
| Signal | `createSignal`、`computed`、`effect` |
| 类型 | `CreateAppOptions`、`BindTTYApp`、`ReadableSignal`、`Signal` 等 |

```ts
import { computed, createApp, createSignal } from "bindtty";
import { Button, TextInput, Textarea } from "@bindtty/widgets";
```

### App 方法

| 方法 | 说明 |
| --- | --- |
| `start()` | 注册 flush / resize / key 监听，输出首帧 |
| `render()` | 同步 layout、paint、diff，返回 ANSI patch |
| `resize()` | `renderer.reset()` 后全量重绘 |
| `focus(target)` | 通过 element id 或 mounted node 移动焦点 |
| `getFocusedId()` | 返回当前 focused element id；无焦点时为 `null` |
| `stop()` | 暂停监听与输出，不释放 runtime root |
| `dispose()` | 释放 runtime、interaction、terminal 与 renderer 状态 |

`focus(target)` 接受 `string | MountedElementNode`，返回 `@bindtty/interaction` 的 `InteractionResult`。当目标不存在或 app 已 dispose 时返回未处理结果，不抛错。

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
| `@bindtty/signal` | 与 `bindtty` 相同 signal API；可独立用于非 TUI signal 逻辑 |
| `@bindtty/runtime`、`@bindtty/vnode`、`@bindtty/layout` 等 | 高级扩展、测试、框架内部 |

`bindtty` 不导出 runtime / vnode / layout / renderer-terminal / widgets，避免公共面过大。

### Peer dependencies

`@bindtty/signal` 是 peer dependency（同时保留在 `dependencies` 中，以便 `npm install bindtty` 自动安装）。全应用应只有一份 `@bindtty/signal` 实例，否则可能出现 computed 不更新、订阅链断裂等问题。

推荐统一从 `bindtty` 导入 signal，勿单独安装另一版本的 `@bindtty/signal`。使用 widgets 时，`bindtty` 与 `@bindtty/widgets` 请保持同版本号发布（如均为 `0.1.0-alpha.10`）。

排障：

```text
症状：computed 不更新、控件状态异常
检查：npm ls @bindtty/signal
修复：
  1. 只从 bindtty 导入 createSignal / computed / effect
  2. npm uninstall @bindtty/signal（若单独装了冲突版本）
  3. npm dedupe && npm install
  4. 应用 package.json overrides: { "@bindtty/signal": "0.1.0-alpha.10" }
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

## 文档

- [doc/packages/APP.md](../../doc/packages/APP.md) - createApp 设计
- [doc/specs/ELEMENT_REF.md](../../doc/specs/ELEMENT_REF.md) - element ref 与节点级 API
- [doc/README.md](../../doc/README.md) - 文档索引
- [@bindtty/widgets README](../widgets/README.md) - 控件 API
